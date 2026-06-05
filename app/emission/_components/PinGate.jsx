"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { useAuth } from "./AuthProvider";
import { Eyebrow, Title, Wordmark } from "./ui";

// One PIN pad. Role is inferred from PIN length: 4 digits -> staff, 6 -> admin.
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

export default function PinGate() {
  const { login } = useAuth();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = useCallback(
    async (value) => {
      const role = value.length === 6 ? "admin" : value.length === 4 ? "staff" : null;
      if (!role) { setErr("Enter a 4-digit staff or 6-digit admin PIN."); return; }
      setBusy(true);
      setErr("");
      const res = await login(role, value);
      setBusy(false);
      if (!res.ok) {
        setErr(res.message || "Incorrect PIN.");
        setPin("");
      }
      // success -> AuthProvider re-renders; gate unmounts.
    },
    [login],
  );

  const press = useCallback(
    (k) => {
      if (busy) return;
      setErr("");
      if (k === "del") return setPin((p) => p.slice(0, -1));
      if (k === "") return;
      setPin((p) => {
        const next = (p + k).slice(0, 6);
        return next;
      });
    },
    [busy],
  );

  // Physical-keyboard support: digits type, Backspace deletes, Enter submits.
  const pinRef = useRef(pin);
  pinRef.current = pin;
  useEffect(() => {
    function onKey(e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key >= "0" && e.key <= "9" && e.key.length === 1) { e.preventDefault(); press(e.key); }
      else if (e.key === "Backspace") { e.preventDefault(); press("del"); }
      else if (e.key === "Enter") { e.preventDefault(); submit(pinRef.current); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, submit]);

  const dots = Array.from({ length: 6 });

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <div className="em-topbar" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 16px", height: 56, display: "flex", alignItems: "center" }}>
          <Wordmark />
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 320 }}>
          <Eyebrow>ENTER PIN</Eyebrow>
          <Title lead="Service" tail="OS" style={{ fontSize: 30, marginTop: 6, marginBottom: 22 }} />

          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 8 }}>
            {dots.map((_, i) => (
              <span key={i} className={`em-pin-dot ${i < pin.length ? "em-pin-dot--on" : ""}`} />
            ))}
          </div>
          <div className="em-label" style={{ textAlign: "center", minHeight: 16, color: err ? "var(--em-ink)" : "var(--em-muted)", letterSpacing: "0.04em", textTransform: "none" }}>
            {err || "4-digit staff · 6-digit admin"}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 18 }}>
            {KEYS.map((k, i) =>
              k === "" ? (
                <div key={i} />
              ) : (
                <button key={i} className="em-key" onClick={() => press(k)} disabled={busy} aria-label={k === "del" ? "delete" : k}>
                  {k === "del" ? "⌫" : k}
                </button>
              ),
            )}
          </div>

          <button
            className="em-btn em-btn--primary em-btn--block"
            style={{ marginTop: 16 }}
            disabled={busy || (pin.length !== 4 && pin.length !== 6)}
            onClick={() => submit(pin)}
          >
            {busy ? "CHECKING…" : "UNLOCK"}
          </button>

          <div style={{ textAlign: "center", marginTop: 18 }}>
            <a href="/emission/status" className="em-label" style={{ letterSpacing: "0.04em", textTransform: "none", textDecoration: "underline", textUnderlineOffset: 3 }}>
              Customer? Check job status →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
