"use client";
// Small shared primitives for the Emission module. Kept in one file to stay
// self-contained. All visual tokens come from emission.css (.em-*).
import { statusLabel } from "../_lib/format";

// Country dial codes. India first (default) — it's a Mumbai shop — then Gulf
// (export/Yamaha customers) and a few common others.
export const DIAL_CODES = [
  { c: "+91", n: "IN" }, { c: "+971", n: "AE" }, { c: "+966", n: "SA" },
  { c: "+974", n: "QA" }, { c: "+968", n: "OM" }, { c: "+965", n: "KW" },
  { c: "+973", n: "BH" }, { c: "+1", n: "US" }, { c: "+44", n: "GB" },
  { c: "+65", n: "SG" }, { c: "+61", n: "AU" }, { c: "+60", n: "MY" },
  { c: "+49", n: "DE" }, { c: "+33", n: "FR" }, { c: "+81", n: "JP" },
];
export const DEFAULT_DIAL = "+91";

// Split a stored phone ("+91 9876543210") into { code, number }. Falls back to
// the default code when no recognised prefix is present (e.g. legacy rows).
export function splitPhone(value) {
  const v = String(value || "").trim();
  if (v.startsWith("+")) {
    const match = [...DIAL_CODES].sort((a, b) => b.c.length - a.c.length).find((d) => v.startsWith(d.c));
    if (match) return { code: match.c, number: v.slice(match.c.length).replace(/\D/g, "") };
  }
  return { code: DEFAULT_DIAL, number: v.replace(/\D/g, "") };
}

/**
 * Country-code select + national number, emitting a single canonical string
 * "+<code> <digits>" via onChange (or "" when empty so `required` still trips).
 * Used in intake, the detail editor, and the public status lookup so capture +
 * lookup share one exact format.
 */
export function PhoneInput({ value, onChange, placeholder = "Mobile number", autoFocus = false }) {
  const { code, number } = splitPhone(value);
  const emit = (c, n) => {
    const digits = String(n).replace(/\D/g, "");
    onChange(digits ? `${c} ${digits}` : "");
  };
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <select
        className="em-select"
        aria-label="Country code"
        style={{ width: "auto", flex: "0 0 auto", minWidth: 92 }}
        value={code}
        onChange={(e) => emit(e.target.value, number)}
      >
        {DIAL_CODES.map((d) => (
          <option key={d.c} value={d.c}>{d.n} {d.c}</option>
        ))}
      </select>
      <input
        className="em-input"
        type="tel"
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        value={number}
        placeholder={placeholder}
        onChange={(e) => emit(code, e.target.value)}
      />
    </div>
  );
}

// Service-centre identity — single source of truth for the public address block.
export const SERVICE_CENTRE = {
  name: "Emission Electronics Pvt Ltd",
  line1: "76/612, Motilal Nagar No. 1, Kala Galli",
  line2: "Goregaon West, Mumbai 400104, Maharashtra",
  landmark: "Near Siddharth Hospital",
  credential: "Yamaha · Pioneer Authorised Service Centre",
  phone: "+91 90290 65590",
  phoneHref: "tel:+919029065590",
  mapUrl: "https://share.google/fja9W3oY6Ya6PBtIt",
};

/** Address + map/call links. Used on the public status page and the PIN gate. */
export function ServiceCentreInfo({ onDark = false, align = "center", showName = true }) {
  const sc = SERVICE_CENTRE;
  const muted = onDark ? "rgba(255,255,255,0.6)" : "var(--em-muted)";
  const link = {
    textTransform: "none",
    letterSpacing: "0.04em",
    textDecoration: "underline",
    textUnderlineOffset: 3,
    color: onDark ? "rgba(255,255,255,0.88)" : "var(--em-ink)",
  };
  return (
    <div style={{ textAlign: align }}>
      <div className="em-label" style={{ textTransform: "none", letterSpacing: "0.04em", lineHeight: 1.65, color: muted }}>
        {showName ? (
          <>
            <span style={{ color: onDark ? "#fff" : "var(--em-ink)", fontWeight: 600 }}>{sc.name}</span>
            <br />
          </>
        ) : null}
        {sc.line1}
        <br />
        {sc.line2} · {sc.landmark}
      </div>
      <div style={{ marginTop: 10, display: "flex", gap: 16, justifyContent: align === "center" ? "center" : "flex-start", flexWrap: "wrap" }}>
        <a href={sc.mapUrl} target="_blank" rel="noreferrer" className="em-label" style={link}>View on Google Maps →</a>
        <a href={sc.phoneHref} className="em-label" style={link}>Call {sc.phone}</a>
      </div>
    </div>
  );
}

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
