"use client";
import { useState } from "react";
import { Eyebrow, Title, StatusLabel, Meta, Wordmark } from "../_components/ui";
import { publicLookup } from "../_lib/client";
import { fmtDate } from "../_lib/format";

// Public, anon. Calls the locked-down RPC which returns ONLY job_no, status,
// date_received, date_delivered on an exact job_no + phone match.
export default function StatusPage() {
  const [jobNo, setJobNo] = useState("");
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState(undefined); // undefined=initial, null=not found, obj=found
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function lookup(e) {
    e.preventDefault();
    setErr(""); setResult(undefined); setBusy(true);
    try {
      const rows = await publicLookup(jobNo.trim(), phone.trim());
      setResult(Array.isArray(rows) && rows.length ? rows[0] : null);
    } catch (e2) {
      setErr("Lookup failed. Please try again.");
    }
    setBusy(false);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <div className="em-topbar">
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 16px", height: 56, display: "flex", alignItems: "center" }}>
          <Wordmark />
        </div>
      </div>

      <div style={{ flex: 1, padding: 24 }}>
        <div style={{ maxWidth: 420, margin: "0 auto" }}>
          <Eyebrow>JOB STATUS</Eyebrow>
          <Title lead="Track your" tail="repair" style={{ fontSize: 28, marginTop: 6, marginBottom: 18 }} />

          <form onSubmit={lookup} style={{ display: "grid", gap: 12 }}>
            <input className="em-input em-mono" inputMode="numeric" placeholder="Job number" value={jobNo} onChange={(e) => setJobNo(e.target.value)} />
            <input className="em-input" type="tel" inputMode="numeric" placeholder="Phone number on the job" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <button className="em-btn em-btn--primary em-btn--block" disabled={busy || !jobNo || !phone}>{busy ? "CHECKING…" : "CHECK STATUS"}</button>
          </form>

          {err ? <div className="em-card" style={{ padding: 14, marginTop: 16 }}>{err}</div> : null}

          {result === null ? (
            <div className="em-card" style={{ padding: 16, marginTop: 16 }}>
              <span className="em-label" style={{ textTransform: "none", letterSpacing: "0.03em" }}>
                No job matches that number and phone. Check both and try again.
              </span>
            </div>
          ) : null}

          {result ? (
            <div className="em-card" style={{ padding: 18, marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="em-mono" style={{ fontSize: 18, fontWeight: 700 }}>#{result.job_no}</span>
                <StatusLabel status={result.status} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 16 }}>
                <Meta k="Received" v={fmtDate(result.date_received)} />
                <Meta k="Delivered" v={result.date_delivered ? fmtDate(result.date_delivered) : "—"} />
              </div>
            </div>
          ) : null}

          <p className="em-label" style={{ textTransform: "none", letterSpacing: "0.03em", marginTop: 22, textAlign: "center" }}>
            Emission Electronics · Goregaon, Mumbai · authorised Yamaha service centre
          </p>
        </div>
      </div>
    </div>
  );
}
