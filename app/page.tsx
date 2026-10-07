"use client";
// Minimal chat UI: an agent that shops, but cannot checkout without
// passing the GPV-1 verify gate.
import { useState } from "react";
type GateResult = { verdict: "PASS" | "FLAG" | "BLOCK" | "ERROR"; summary: string };

type Msg = { role: "user" | "agent" | "gate"; text: string; verdict?: string };

export default function Home() {
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "agent", text: "Secured shopping agent online. Name a product (or paste an Amazon URL) — I'll evaluate it against GPV-1 before any checkout. Try: 'noise cancelling headphones under $200'." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    const q = input.trim(); if (!q || busy) return;
    setInput(""); setBusy(true);
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setMsgs((m) => [...m, { role: "agent", text: "Running the pre-purchase verification gate (GPV-1)…" }]);
    const isUrl = /^https?:\/\//.test(q);
    const res = await fetch("/api/gate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(isUrl ? { url: q } : { query: q }),
    });
    const result: GateResult = await res.json();
    setMsgs((m) => [...m, {
      role: "gate", verdict: result.verdict,
      text: result.verdict === "PASS"
        ? `${result.summary}\n→ CHECKOUT PERMITTED.`
        : result.verdict === "FLAG"
        ? `${result.summary}\n→ ASK PRINCIPAL: proceed despite the flag?`
        : `${result.summary}\n→ CHECKOUT REFUSED (GPV-1).`,
    }]);
    setBusy(false);
  }

  const color = (r: Msg["role"], v?: string) =>
    r === "user" ? "#e6edf3" : r === "agent" ? "#9ecbff" : v === "PASS" ? "#3fb950" : v === "FLAG" ? "#d29922" : "#f85149";

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 32 }}>
      <h1 style={{ fontSize: 22 }}>Verify, then checkout</h1>
      <p style={{ color: "#8b949e", fontSize: 14 }}>
        AI shopping agent with a <a style={{ color: "#9ecbff" }} href="https://docs.gobuy.ai/standard">GPV-1 pre-purchase verification gate</a>.
        Consent does not skip evidence.
      </p>
      <div style={{ border: "1px solid #30363d", borderRadius: 8, padding: 16, minHeight: 300 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "#8b949e", letterSpacing: 1 }}>
              {m.role === "gate" ? `VERIFY GATE · ${m.verdict}` : m.role.toUpperCase()}
            </div>
            <div style={{ whiteSpace: "pre-wrap", color: color(m.role, m.verdict) }}>{m.text}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input
          style={{ flex: 1, background: "#161b22", color: "#e6edf3", border: "1px solid #30363d", borderRadius: 6, padding: 10 }}
          value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Product, ASIN, or Amazon URL…"
        />
        <button style={{ background: "#238636", color: "#fff", border: 0, borderRadius: 6, padding: "10px 16px", cursor: "pointer" }} onClick={send} disabled={busy}>
          {busy ? "…" : "Send"}
        </button>
      </div>
    </main>
  );
}
