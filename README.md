# Verify, then checkout

A secured AI shopping agent you can stand up in five minutes — with a **pre-purchase verification gate** that no checkout is allowed to skip.

Built on [GoBuy GPV-1](https://docs.gobuy.ai/standard), the open pre-purchase verification specification: eight conditions that must *all* be true before an autonomous agent proceeds to checkout. Identity, consent, and execution have been standardized (Web Bot Auth, UCP, Checkout WebMCP, the personal agent protocol). This repo standardizes the part they left out: **should this purchase proceed?**

```
user asks for a product
        │
        ▼
  VERIFY GATE  (GPV-1)          PASS  → checkout permitted
  mcp.gobuy.ai/mcp              FLAG  → ask the principal
  check_product_trust()         BLOCK → checkout refused
```

## Quick start

```bash
npm install
npm run dev
# open http://localhost:3000
```

**No API keys.** The GoBuy MCP server ([mcp.gobuy.ai/mcp](https://mcp.gobuy.ai/mcp)) is keyless and read-only. Add your own `OPENAI_API_KEY` only if you extend the agent with an LLM.

Paste an Amazon product URL, an ASIN, or a store domain. The gate calls the GoBuy trust corpus (30,000+ products, review-authenticity filtered) and returns a GPV-1 verdict:

- **PASS** — Smart Score ≥ 55. Checkout permitted.
- **FLAG** — score 35–54, or a price/review anomaly. The agent must surface the flag and get explicit confirmation. *Consent does not skip evidence.*
- **BLOCK** — score < 35, seller flags, revocation in force. Checkout refused.

## How the gate works

`lib/gate.ts` is the whole pattern (~70 lines): an MCP client calls `check_product_trust` on the public GoBuy server and maps the response to GPV-1 verdicts using the spec's default thresholds. Steal it. Port it to LangChain, CrewAI, or your own runtime — the spec is machine-readable at [docs.gobuy.ai/standard/v1.json](https://docs.gobuy.ai/standard/v1.json) so you can pin the ruleset version and log it with every decision (GPV-1 rule R8: decisions are recorded before execution).

## Why this exists

Review fraud is industrial now: brushing campaigns, velocity bursts, AI-generated reviews carrying Verified Purchase badges. An agent that can prove who it is and execute payment can still be steered by a 4.6-star rating that was never earned. The transactional rails got standardized in September–October 2026; the evidence layer didn't. GPV-1 is that layer, published as an open spec with this repo as the reference implementation.

- **Spec (human):** https://docs.gobuy.ai/standard
- **Spec (JSON):** https://docs.gobuy.ai/standard/v1.json
- **Position paper:** [The Verification Gap](https://docs.gobuy.ai/verification-gap)
- **Trust corpus / API:** https://gobuy.ai

## License

MIT. The spec is CC-BY-4.0. Use it, fork it, ship safer agents.
