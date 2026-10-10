// CI guard: canonical GPV-1 ruleset must still hash to the pinned value.
import { verifyGateSpec } from "../lib/gate.ts";

const r = await verifyGateSpec();
console.log(r.detail);
process.exit(r.ok ? 0 : 1);
