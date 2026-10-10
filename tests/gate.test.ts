// Gate logic tests — pure functions, no network. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapProduct, mapStore, scoreToVerdict, GATE_SPEC, gateSpecVersion } from "../lib/gate.ts";

test("GATE_SPEC is pinned with version and sha256", () => {
  assert.equal(GATE_SPEC.spec, "gpv-1");
  assert.equal(GATE_SPEC.version, "1.0");
  assert.match(GATE_SPEC.sha256, /^[a-f0-9]{64}$/);
  assert.match(gateSpecVersion(), /^gpv-1 v1\.0 \(sha256:[a-f0-9]{12}…\)$/);
});

test("R3 thresholds: >=55 PASS, 35-54 FLAG, <35 BLOCK", () => {
  assert.equal(scoreToVerdict(100, "Evidence Score").verdict, "PASS");
  assert.equal(scoreToVerdict(55, "Evidence Score").verdict, "PASS");
  assert.equal(scoreToVerdict(54, "Evidence Score").verdict, "FLAG");
  assert.equal(scoreToVerdict(35, "Evidence Score").verdict, "FLAG");
  assert.equal(scoreToVerdict(34, "Evidence Score").verdict, "BLOCK");
  assert.equal(scoreToVerdict(0, "Evidence Score").verdict, "BLOCK");
});

test("every verdict carries specVersion (R8 pinning)", () => {
  for (const v of [scoreToVerdict(80, "x"), scoreToVerdict(45, "x"), scoreToVerdict(10, "x")]) {
    assert.match(v.specVersion, /sha256:[a-f0-9]{12}/);
  }
});

test("R1: not_indexed or missing score is BLOCK, never a guess", () => {
  assert.equal(mapProduct(JSON.stringify({ state: "not_indexed" })).verdict, "BLOCK");
  assert.equal(mapProduct(JSON.stringify({ verdict: "unverified" })).verdict, "BLOCK");
  assert.equal(mapProduct(JSON.stringify({ state: "stale" })).verdict, "BLOCK"); // no evidence_score
});

test("product JSON with score maps to verdict tiers", () => {
  const p = mapProduct(JSON.stringify({ evidence_score: 82, state: "indexed", verdict: "verified" }));
  assert.equal(p.verdict, "PASS");
  const f = mapProduct(JSON.stringify({ evidence_score: 41, state: "indexed" }));
  assert.equal(f.verdict, "FLAG");
});

test("plain-text score is still parsed", () => {
  assert.equal(mapProduct('Evidence Score: 62/100 — "evidence_score": 62').verdict, "PASS");
  assert.equal(mapProduct("no numbers here at all").verdict, "ERROR");
});

test("R6: store tier D is BLOCK regardless of score", () => {
  assert.equal(mapStore(JSON.stringify({ score: 58, tier: "D" })).verdict, "BLOCK");
  assert.equal(mapStore(JSON.stringify({ score: 71, tier: "B" })).verdict, "PASS");
  assert.equal(mapStore("Store trust 44/100").verdict, "FLAG");
  assert.equal(mapStore("nothing parseable").verdict, "ERROR");
});
