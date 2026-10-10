// GPV-1 pre-purchase verification gate.
// Spec: https://docs.gobuy.ai/standard  (machine-readable: /standard/v1.json)
// Reference implementation of the gate pattern: the agent MUST obtain a PASS
// verdict from check_product_trust() before the checkout tool will execute.
//
// Live contract (verified against mcp.gobuy.ai, Oct 2026):
//   tools: check_product_trust, compare_products, analyze_reviews,
//          check_store_score, scan_store
//   check_product_trust({ retailer, product_id }) → evidence_score,
//          state, verdict ("verified" | "unverified" | ...)
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const GOBUY_MCP = "https://mcp.gobuy.ai/mcp";

// GPV-1 spec pin. sha256 of the canonical ruleset at docs.gobuy.ai/standard/v1.json.
// If the upstream hash drifts, verifyGateSpec() warns — re-pin deliberately, never silently.
export const GATE_SPEC = {
  spec: "gpv-1",
  version: "1.0",
  canonical: "https://docs.gobuy.ai/standard/v1.json",
  sha256: "c00f175f40a08ec011ecb564724e67090ea99131543704b8f3fedca0d7695606",
} as const;

export async function verifyGateSpec(): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(GATE_SPEC.canonical);
    if (!res.ok) return { ok: false, detail: `canonical spec HTTP ${res.status}` };
    const body = await res.text();
    const j = JSON.parse(body);
    if (j.spec !== GATE_SPEC.spec || String(j.version) !== GATE_SPEC.version)
      return { ok: false, detail: `spec identity drifted: got ${j.spec} v${j.version}, pinned ${GATE_SPEC.spec} v${GATE_SPEC.version}` };
    // Hash the exact published bytes.
    const sha = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
    const hex = [...new Uint8Array(sha)].map(b => b.toString(16).padStart(2, "0")).join("");
    if (hex !== GATE_SPEC.sha256) return { ok: false, detail: `ruleset hash drifted: upstream ${hex} != pinned ${GATE_SPEC.sha256} — thresholds may be stale, re-pin deliberately` };
    return { ok: true, detail: `GPV-1 v${GATE_SPEC.version} pinned (${hex.slice(0, 12)}…)` };
  } catch (e) {
    return { ok: false, detail: `spec check unreachable: ${(e as Error).message}` };
  }
}

export type GateResult = {
  verdict: "PASS" | "FLAG" | "BLOCK" | "ERROR";
  summary: string;
  specVersion: string;
  raw?: unknown;
};

export function gateSpecVersion(): string {
  return `${GATE_SPEC.spec} v${GATE_SPEC.version} (sha256:${GATE_SPEC.sha256.slice(0, 12)}…)`;
}

export async function checkProductTrust(input: { url?: string; asin?: string; query?: string }): Promise<GateResult> {
  const client = new Client({ name: "verify-then-checkout", version: "1.0.0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(GOBUY_MCP)));

    let retailer: string | undefined;
    let productId: string | undefined;
    let storeDomain: string | undefined;

    const asinRe = /\b([A-Z0-9]{10})\b/i;
    if (input.asin) {
      productId = input.asin; retailer = "amazon";
    } else if (input.url) {
      const u = new URL(input.url);
      const m = input.url.match(/\/(?:dp|product)\/([A-Z0-9]{10})/i);
      if (m) { productId = m[1]; retailer = u.hostname.replace(/^www\./, "").split(".")[0]; }
      else storeDomain = u.hostname.replace(/^www\./, "");
    } else if (input.query) {
      const asin = input.query.match(asinRe);
      if (asin && input.query.replace(asinRe, "").trim().length < 3) {
        productId = asin[1]; retailer = "amazon";
      } else {
        // Free-text: try store domain, else ask for a product URL/ASIN
        // (the gate never guesses — GPV-1 R1 requires stable identity).
        const domain = input.query.match(/\b([a-z0-9-]+\.(?:com|net|org|io|ai|co|shop|store))\b/i);
        if (domain) storeDomain = domain[1];
        else {
          await client.close();
          return { verdict: "ERROR", specVersion: gateSpecVersion(), summary: "Give me a product URL or ASIN — the gate evaluates a specific listing, not a category (GPV-1 R1)." };
        }
      }
    }

    if (storeDomain) {
      // GPV-1 R6: storefront evaluation for merchant-direct purchases.
      const res = await client.callTool({ name: "check_store_score", arguments: { domain: storeDomain } });
      await client.close();
      return mapStore(textOf(res));
    }

    const res = await client.callTool({ name: "check_product_trust", arguments: { retailer, product_id: productId } });
    const text = textOf(res);
    await client.close();
    return mapProduct(text);
  } catch (e) {
    return { verdict: "ERROR", specVersion: gateSpecVersion(), summary: `Gate unreachable: ${(e as Error).message}` };
  }
}

function textOf(res: unknown): string {
  const r = res as { content?: Array<{ type: string; text?: string }> };
  return (r.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
}

export function mapProduct(text: string): GateResult {
  let j: any = null;
  try { j = JSON.parse(text); } catch { /* not JSON */ }
  if (j) {
    if (j.state === "not_indexed" || j.verdict === "unverified" || j.evidence_score == null) {
      return { verdict: "BLOCK", specVersion: gateSpecVersion(), summary: `Not in the evidence corpus (state: ${j.state ?? "?"}). GPV-1 R1 fails without verified evidence — checkout refused.`, raw: text };
    }
    return scoreToVerdict(Number(j.evidence_score), "Evidence Score");
  }
  const m = text.match(/"?(?:evidence_?score|smart_?score|score)"?\D{0,8}(\d{1,3})/i);
  if (m) return scoreToVerdict(parseInt(m[1], 10), "Evidence Score");
  return { verdict: "ERROR", specVersion: gateSpecVersion(), summary: "Could not parse the gate response.", raw: text };
}

export function mapStore(text: string): GateResult {
  let j: any = null;
  try { j = JSON.parse(text); } catch { /* not JSON */ }
  const m100 = text.match(/(\d{1,3})\s*\/\s*100/);
  const score = j?.score ?? j?.trust_score ?? (m100 ? parseInt(m100[1], 10) : NaN);
  const tier = j?.tier ?? "";
  if (tier === "D") return { verdict: "BLOCK", specVersion: gateSpecVersion(), summary: `Store tier D (score ${score}). GPV-1 R6 fails — checkout refused.`, raw: text };
  if (!isNaN(score)) return scoreToVerdict(score, "Store Score");
  return { verdict: "ERROR", specVersion: gateSpecVersion(), summary: "Could not parse the store score.", raw: text };
}

// GPV-1 default thresholds (R3): floor 55, hard block below 35.
export function scoreToVerdict(score: number, label: string): GateResult {
  if (score >= 55) return { verdict: "PASS", specVersion: gateSpecVersion(), summary: `GoBuy ${label} ${score}/100 — GPV-1 R3 satisfied (floor 55).`, };
  if (score >= 35) return { verdict: "FLAG", specVersion: gateSpecVersion(), summary: `${label} ${score}/100 is between 35 and 54 — GPV-1 requires the principal's explicit confirmation before checkout.` };
  return { verdict: "BLOCK", specVersion: gateSpecVersion(), summary: `${label} ${score}/100 is below the GPV-1 hard floor (35). Checkout refused.` };
}
