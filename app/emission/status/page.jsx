"use client";
import { useState, useCallback } from "react";
import { Eyebrow, Title, StatusLabel, Meta, Wordmark, PhoneInput, ServiceCentreInfo, Divider } from "../_components/ui";
import { publicJob, respondEstimate, submitFeedback } from "../_lib/client";
import { fmtDate, inr, statusLabel } from "../_lib/format";

// Customer-facing repair flow (friendly labels). Terminal branches handled below.
const FLOW = [
  ["received", "Received"],
  ["diagnosing", "Diagnosing"],
  ["quoted", "Estimate ready"],
  ["approved", "Approved"],
  ["awaiting_parts", "Awaiting parts"],
  ["in_repair", "In repair"],
  ["ready", "Ready for pickup"],
  ["delivered", "Delivered"],
];
const TERMINAL = { declined: "Estimate declined", not_repairable: "Not repairable", returned: "Returned" };

export default function StatusPage() {
  const [jobNo, setJobNo] = useState("");
  const [phone, setPhone] = useState("");
  const [job, setJob] = useState(undefined); // undefined=initial, null=not found, obj=found
  const [busy, setBusy] = useState(false);
  const [approving, setApproving] = useState(null);
  const [err, setErr] = useState("");

  const fetchJob = useCallback(async () => {
    const j = await publicJob(jobNo.trim(), phone.trim());
    setJob(j || null);
  }, [jobNo, phone]);

  async function lookup(e) {
    e.preventDefault();
    setErr(""); setJob(undefined); setBusy(true);
    try { await fetchJob(); } catch { setErr("Lookup failed. Please try again."); }
    setBusy(false);
  }

  async function respond(decision) {
    setApproving(decision); setErr("");
    try {
      const r = await respondEstimate(jobNo.trim(), phone.trim(), decision);
      if (r?.ok) await fetchJob();
      else setErr(r?.error === "not_quoted" ? "This estimate is no longer pending — please call the centre." : "Could not submit. Please call the centre.");
    } catch { setErr("Could not submit. Please try again."); }
    setApproving(null);
  }

  const isTerminal = job && TERMINAL[job.status];
  const curIdx = job ? FLOW.findIndex(([s]) => s === job.status) : -1;
  const hasEstimate = job && Array.isArray(job.line_items) && (job.line_items.length > 0 || Number(job.inspection_charge) > 0);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <div className="em-topbar">
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 16px", height: 56, display: "flex", alignItems: "center" }}>
          <Wordmark />
        </div>
      </div>

      <div style={{ flex: 1, padding: 24 }}>
        <div style={{ maxWidth: 440, margin: "0 auto" }}>
          <Eyebrow>JOB STATUS</Eyebrow>
          <Title lead="Track your" tail="repair" style={{ fontSize: 28, marginTop: 6, marginBottom: 6 }} />
          <div className="em-label" style={{ marginBottom: 18, textTransform: "none", letterSpacing: "0.04em" }}>Yamaha · Pioneer Authorised Service Centre</div>

          <form onSubmit={lookup} style={{ display: "grid", gap: 12 }}>
            <input className="em-input em-mono" inputMode="numeric" placeholder="Job number" value={jobNo} onChange={(e) => setJobNo(e.target.value)} />
            <PhoneInput value={phone} onChange={setPhone} placeholder="Phone on the job" />
            <button className="em-btn em-btn--primary em-btn--block" disabled={busy || !jobNo || !phone}>{busy ? "CHECKING…" : "CHECK STATUS"}</button>
          </form>

          {err ? <div className="em-card" style={{ padding: 14, marginTop: 16, borderColor: "var(--em-ink)" }}>{err}</div> : null}

          {job === null ? (
            <div className="em-card" style={{ padding: 16, marginTop: 16 }}>
              <span className="em-label" style={{ textTransform: "none", letterSpacing: "0.03em" }}>No job matches that number and phone. Check both and try again.</span>
            </div>
          ) : null}

          {job ? (
            <div className="em-card" style={{ padding: 18, marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="em-mono" style={{ fontSize: 18, fontWeight: 700 }}>#{job.job_no}</span>
                <StatusLabel status={job.status} />
              </div>
              <div className="em-meta-k" style={{ marginTop: 4 }}>{[job.brand, job.model].filter(Boolean).join(" · ") || "—"}{job.complaint ? ` · ${job.complaint}` : ""}</div>

              {/* timeline */}
              {isTerminal ? (
                <div style={{ marginTop: 16, padding: "12px 14px", border: "1px solid var(--em-ink)", borderRadius: 4 }}>
                  <div className="em-eyebrow">OUTCOME</div>
                  <div style={{ fontWeight: 700, marginTop: 4 }}>{TERMINAL[job.status]}</div>
                </div>
              ) : (
                <div style={{ marginTop: 18 }}>
                  {FLOW.map(([s, lbl], i) => {
                    const done = curIdx >= 0 && i < curIdx;
                    const active = i === curIdx;
                    return (
                      <div key={s} style={{ display: "flex", gap: 12, alignItems: "center", padding: "5px 0" }}>
                        <div style={{ width: 14, height: 14, borderRadius: 99, flex: "0 0 auto", border: "2px solid " + (done || active ? "var(--em-ink)" : "var(--em-g300)"), background: done ? "var(--em-ink)" : active ? "var(--em-ink)" : "transparent", boxShadow: active ? "0 0 0 3px rgba(10,10,10,0.12)" : "none" }} />
                        <span style={{ fontSize: 14, fontWeight: active ? 700 : 400, color: done || active ? "var(--em-ink)" : "var(--em-g300)" }}>{lbl}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* estimate */}
              {hasEstimate ? (
                <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--em-g200)" }}>
                  <div className="em-eyebrow">ESTIMATE</div>
                  <div style={{ marginTop: 8 }}>
                    {job.line_items.map((li, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "3px 0" }}>
                        <span style={{ fontSize: 13 }}>{li.description}{li.qty > 1 ? ` ×${li.qty}` : ""}</span>
                        <span className="em-mono" style={{ fontSize: 13 }}>{li.amount == null ? "—" : inr(li.amount)}</span>
                      </div>
                    ))}
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                      <span className="em-meta-k">Inspection charge</span>
                      <span className="em-mono" style={{ fontSize: 13 }}>{inr(job.inspection_charge)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: "1px solid var(--em-g200)", marginTop: 4 }}>
                      <span style={{ fontWeight: 700 }}>Estimated total</span>
                      <span className="em-mono" style={{ fontWeight: 700, fontSize: 15 }}>{inr(job.total)}</span>
                    </div>
                  </div>
                  <div className="em-label" style={{ textTransform: "none", letterSpacing: "0.03em", marginTop: 6 }}>Indicative; final GST invoice issued on delivery.</div>

                  {job.status === "quoted" ? (
                    <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                      <button className="em-btn em-btn--primary" style={{ flex: 1 }} disabled={approving} onClick={() => respond("approve")}>{approving === "approve" ? "…" : "APPROVE REPAIR"}</button>
                      <button className="em-btn em-btn--ghost" disabled={approving} onClick={() => respond("decline")}>{approving === "decline" ? "…" : "DECLINE"}</button>
                    </div>
                  ) : job.status === "approved" ? (
                    <div className="em-label" style={{ textTransform: "none", letterSpacing: "0.03em", marginTop: 10, color: "var(--em-ink)" }}>✓ You approved this estimate. Repair is in progress.</div>
                  ) : null}
                </div>
              ) : null}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--em-g200)" }}>
                <Meta k="Received" v={fmtDate(job.date_received)} />
                <Meta k="Delivered" v={job.date_delivered ? fmtDate(job.date_delivered) : "—"} />
              </div>

              {job.status === "delivered" ? <FeedbackBox job={job} jobNo={jobNo} phone={phone} onDone={fetchJob} /> : null}
            </div>
          ) : null}

          <Divider style={{ margin: "26px 0 18px" }} />
          <ServiceCentreInfo />
        </div>
      </div>
    </div>
  );
}

function FeedbackBox({ job, jobNo, phone, onDone }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (job.feedback) {
    return (
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--em-g200)" }}>
        <div className="em-eyebrow">YOUR FEEDBACK</div>
        <div style={{ marginTop: 6, fontSize: 18, letterSpacing: 2 }}>
          <span style={{ color: "var(--em-ink)" }}>{"★".repeat(job.feedback.rating)}</span>
          <span style={{ color: "var(--em-g300)" }}>{"★".repeat(5 - job.feedback.rating)}</span>
        </div>
        {job.feedback.comment ? <div className="em-label" style={{ textTransform: "none", letterSpacing: "0.03em", marginTop: 4 }}>“{job.feedback.comment}”</div> : null}
        <div className="em-label" style={{ textTransform: "none", letterSpacing: "0.03em", marginTop: 6 }}>Thank you for your feedback.</div>
      </div>
    );
  }

  async function submit() {
    if (!rating) { setErr("Tap a star to rate."); return; }
    setBusy(true); setErr("");
    try {
      const r = await submitFeedback(jobNo.trim(), phone.trim(), rating, comment);
      if (r?.ok) await onDone();
      else setErr("Could not submit. Please try again.");
    } catch { setErr("Could not submit. Please try again."); }
    setBusy(false);
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--em-g200)" }}>
      <div className="em-eyebrow">RATE YOUR EXPERIENCE</div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} star`}
            style={{ background: "none", border: 0, cursor: "pointer", fontSize: 28, lineHeight: 1, padding: 0, color: n <= rating ? "var(--em-ink)" : "var(--em-g300)" }}>★</button>
        ))}
      </div>
      <textarea className="em-textarea" placeholder="Anything you’d like to share? (optional)" value={comment} onChange={(e) => setComment(e.target.value)} style={{ marginTop: 10 }} />
      {err ? <div className="em-label" style={{ marginTop: 6, textTransform: "none", letterSpacing: "0.03em" }}>{err}</div> : null}
      <button className="em-btn em-btn--primary em-btn--block" style={{ marginTop: 10 }} disabled={busy} onClick={submit}>{busy ? "SENDING…" : "SUBMIT FEEDBACK"}</button>
    </div>
  );
}
