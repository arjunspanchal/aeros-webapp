"use client";
// Small shared primitives for the Emission module. Kept in one file to stay
// self-contained. All visual tokens come from emission.css (.em-*).
import { statusLabel } from "../_lib/format";

/** Slash-prefix mono eyebrow above every title, e.g. /JOB INTAKE */
export function Eyebrow({ children, onDark = false, className = "" }) {
  return (
    <div className={`em-eyebrow ${onDark ? "em-eyebrow--ondark" : ""} ${className}`}>
      /{String(children).toUpperCase()}
    </div>
  );
}

/** Two-tone dimmed header: solid ink lead word + ~45% continuation. */
export function Title({ lead, tail, onDark = false, style }) {
  return (
    <h1 className={`em-title ${onDark ? "em-title--ondark" : ""}`} style={style}>
      {lead}
      {tail ? <span className="em-title--dim"> {tail}</span> : null}
    </h1>
  );
}

export function StatusLabel({ status, onDark = false, muted = false }) {
  return (
    <span className={`em-status ${onDark ? "em-status--ondark" : ""} ${muted ? "em-status--muted" : ""}`}>
      {statusLabel(status)}
    </span>
  );
}

/** Mono metadata pair (serial / job_no / dates / amounts). */
export function Meta({ k, v, onDark = false, mono = true }) {
  return (
    <div>
      <div className="em-meta-k">{k}</div>
      <div className={`${mono ? "em-meta-v" : ""} ${onDark ? "em-meta-v--ondark" : ""}`} style={mono ? null : { fontSize: 14 }}>
        {v ?? "—"}
      </div>
    </div>
  );
}

export function Field({ label, required, children, hint }) {
  return (
    <label style={{ display: "block" }}>
      <div className="em-label" style={{ marginBottom: 6 }}>
        {label}{required ? <span style={{ color: "var(--em-ink)" }}> *</span> : null}
      </div>
      {children}
      {hint ? <div className="em-label" style={{ marginTop: 5, letterSpacing: "0.04em", textTransform: "none" }}>{hint}</div> : null}
    </label>
  );
}

export function Divider({ style }) {
  return <hr className="em-divider" style={style} />;
}

/** Aeros family mark + product name, used in the dark top bar. */
export function Wordmark({ onDark = true }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
      <span
        className="font-logo"
        style={{
          fontFamily: '"Nunito Sans", system-ui, sans-serif',
          fontWeight: 800,
          fontSize: 15,
          letterSpacing: "-0.01em",
          color: onDark ? "#fff" : "var(--em-ink)",
        }}
      >
        Aeros
      </span>
      <span style={{ width: 1, height: 14, background: onDark ? "rgba(255,255,255,0.2)" : "var(--em-g200)" }} />
      <span style={{ fontWeight: 700, fontSize: 14, color: onDark ? "rgba(255,255,255,0.85)" : "var(--em-ink)" }}>
        Emission <span className="em-topbar__accent">·</span> Service OS
      </span>
    </div>
  );
}
