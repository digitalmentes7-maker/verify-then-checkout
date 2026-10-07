// POST /api/gate — GPV-1 pre-purchase verification (server-side).
// The MCP client runs on the server; the browser never sees the corpus.
import { NextRequest, NextResponse } from "next/server";
import { checkProductTrust } from "../../../lib/gate";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const input: { url?: string; asin?: string; query?: string } = {};
  if (typeof body.url === "string") input.url = body.url;
  if (typeof body.asin === "string") input.asin = body.asin;
  if (typeof body.query === "string") input.query = body.query;
  if (!input.url && !input.asin && !input.query) {
    return NextResponse.json({ verdict: "ERROR", summary: "Provide url, asin, or query." }, { status: 400 });
  }
  const result = await checkProductTrust(input);
  // GPV-1 R8: record the decision (verdict + spec version) before returning.
  console.log(JSON.stringify({ spec: "gpv-1", specVersion: "1.0", ...result, at: new Date().toISOString() }));
  return NextResponse.json(result);
}
