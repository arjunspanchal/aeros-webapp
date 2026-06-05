"use client";
import { useState, useCallback } from "react";
import { useAuth } from "./AuthProvider";
import { Eyebrow, Title, Wordmark, Divider, ServiceCentreInfo } from "./ui";

// Normal text input (not a numpad). Role is inferred from PIN length:
// 4 digits -> staff, 6 -> admin.
export default function PinGate() {
  const { login } = useAuth();
  const [pin, setPin] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = useCallback(
    async (e) => {
      if (e) e.preventDefault();
      const role = pin.length === 6 ? "admin" : pin.length === 4 ? "staff" : null;
      if (!role) { setErr("Enter a 4-digit staff or 6-digit admin PIN."); return; }
      setBusy(true);
      setErr("");
      const res = await login(role, pin);
      setBusy(false);
      if (!res.ok) {
        setErr(res.message || "Incorrect PIN.");
        setPin("");
      }
      // success -> AuthProvider re-renders; gate unmounts.
    },
    [login, pin],
  );

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <div className="em-topbar" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 16px", height: 56, display: "flex", alignItems: "center" }}>
          <Wordmark />
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <form onSubmit={submit} style={{ width: "100%", maxWidth: 360 }}>
          <Eyebrow>Yamaha · Pioneer Authorised Service Centre</Eyebrow>
          <Title lead="Emission" tail="Service OS" style={{ fontSize: 30, marginTop: 8 }} />
          <div className="em-label" style={{ marginTop: 8, textTransform: "none", letterSpacing: "0.04em" }}>
            Goregaon, Mumbai — internal service desk
          </div>

          <Divider style={{ margin: "22px 0 18px" }} />

          <Eyebrow>Enter PIN</Eyebrow>

          <div style={{ position: "relative", marginTop: 12 }}>
            <input
              className="em-input em-mono"
              type={show ? "text" : "password"}
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              maxLength={6}
              value={pin}
              onChange={(e) => { setErr(""); setPin(e.target.value.replace(/\D/g, "").slice(0, 6)); }}
              placeholder="Type your PIN"
              aria-label="PIN"
              style={{ textAlign: "center", letterSpacing: "0.35em", fontSize: 20, paddingRight: 60 }}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="em-label"
              style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: 0, cursor: "pointer", textTransform: "none", letterSpacing: "0.04em" }}
            >
              {show ? "Hide" : "Show"}
            </button>
          </div>

          <div className="em-label" style={{ textAlign: "center", minHeight: 16, marginTop: 8, color: err ? "var(--em-ink)" : "var(--em-muted)", letterSpacing: "0.04em", textTransform: "none" }}>
            {err || "4-digit staff · 6-digit admin"}
          </div>

          <button
            type="submit"
            className="em-btn em-btn--primary em-btn--block"
            style={{ marginTop: 14 }}
            disabled={busy || (pin.length !== 4 && pin.length !== 6)}
          >
            {busy ? "CHECKING…" : "UNLOCK"}
          </button>

          <div style={{ textAlign: "center", marginTop: 18 }}>
            <a href="/emission/status" className="em-label" style={{ letterSpacing: "0.04em", textTransform: "none", textDecoration: "underline", textUnderlineOffset: 3 }}>
              Customer? Check job status →
            </a>
          </div>

          <Divider style={{ margin: "22px 0 16px" }} />
          <ServiceCentreInfo showName={false} />
        </form>
      </div>
    </div>
  );
}
