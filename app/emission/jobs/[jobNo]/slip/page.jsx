"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../_components/AuthProvider";
import { SERVICE_CENTRE } from "../../../_components/ui";
import { getJobByNo } from "../../../_lib/data";
import { fmtDate, inr } from "../../../_lib/format";

// Counter slip / claim ticket handed to the customer at drop-off. Print-styled
// (everything but .em-slip is hidden via @media print in emission.css).
export default function JobSlipPage({ params }) {
  const { session } = useAuth();
  const jobNo = params.jobNo;
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusUrl, setStatusUrl] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") setStatusUrl(`${window.location.origin}/emission/status`);
  }, []);

  useEffect(() => {
    if (!session) return;
    getJobByNo(session, jobNo).then(setJob).catch(() => {}).finally(() => setLoading(false));
  }, [session, jobNo]);

  if (loading) return <div className="em-label" style={{ padding: 24 }}>LOADING…</div>;
  if (!job) return <div className="em-label" style={{ padding: 24 }}>JOB #{jobNo} NOT FOUND</div>;

  const item = [job.category, job.brand, job.model].filter(Boolean).join(" · ") || "—";
  const charge = job.inspection_charge != null ? inr(job.inspection_charge) : "₹600 (standard)";

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      {/* toolbar — hidden when printing */}
      <div className="em-no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Link href={`/emission/jobs/${job.job_no}`} className="em-label" style={{ textDecoration: "none" }}>← BACK TO JOB</Link>
        <button className="em-btn em-btn--primary em-btn--sm" onClick={() => window.print()}>🖨 PRINT SLIP</button>
      </div>

      <div className="em-slip em-card" style={{ padding: 28 }}>
        {/* header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.01em" }}>{SERVICE_CENTRE.name}</div>
            <div className="em-eyebrow" style={{ marginTop: 4 }}>{SERVICE_CENTRE.credential}</div>
            <div className="em-label" style={{ textTransform: "none", letterSpacing: "0.02em", marginTop: 6, lineHeight: 1.5 }}>
              {SERVICE_CENTRE.line1}<br />{SERVICE_CENTRE.line2}<br />{SERVICE_CENTRE.phone}
            </div>
          </div>
          <div style={{ textAlign: "right", flex: "0 0 auto" }}>
            <div className="em-eyebrow">JOB NO</div>
            <div className="em-mono" style={{ fontSize: 34, fontWeight: 800, lineHeight: 1 }}>{job.job_no}</div>
            <div className="em-meta-k" style={{ marginTop: 6 }}>{fmtDate(job.date_received)}</div>
          </div>
        </div>

        <hr className="em-divider" style={{ margin: "18px 0" }} />

        {/* customer + item */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Pair k="Customer" v={job.customer_name} />
          <Pair k="Phone" v={job.phone} />
          <Pair k="Item" v={item} />
          <Pair k="Serial no" v={job.serial_no || "—"} />
          <Pair k="Reported fault" v={job.complaint || "—"} wide />
          <Pair k="Accessories taken in" v={job.accessories || "—"} wide />
          <Pair k="Inspection charge" v={charge} />
        </div>

        <hr className="em-divider" style={{ margin: "18px 0" }} />

        {/* track online */}
        <div style={{ background: "var(--em-g100)", border: "1px solid var(--em-g200)", borderRadius: 4, padding: 14 }}>
          <div className="em-eyebrow">TRACK YOUR REPAIR ONLINE</div>
          <div className="em-label" style={{ textTransform: "none", letterSpacing: "0.02em", marginTop: 6, lineHeight: 1.6 }}>
            Visit <b className="em-mono">{statusUrl || "/emission/status"}</b><br />
            Enter <b>Job No {job.job_no}</b> and the phone number on this slip to see live status.
          </div>
        </div>

        {/* terms + signature */}
        <div className="em-label" style={{ textTransform: "none", letterSpacing: "0.02em", marginTop: 16, lineHeight: 1.55 }}>
          Goods are accepted for inspection/repair at the customer’s risk. An estimate will be shared before any chargeable repair.
          The inspection charge applies even if the unit is found not repairable or the estimate is declined. Please collect within
          90 days of intimation. Produce this slip at the time of collection.
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 28 }}>
          <SignLine label="Customer signature" />
          <SignLine label="Received by (Emission)" />
        </div>
      </div>
    </div>
  );
}

function Pair({ k, v, wide }) {
  return (
    <div style={wide ? { gridColumn: "1 / -1" } : null}>
      <div className="em-meta-k">{k}</div>
      <div style={{ fontSize: 14, marginTop: 2 }}>{v}</div>
    </div>
  );
}
function SignLine({ label }) {
  return (
    <div style={{ width: "44%" }}>
      <div style={{ borderTop: "1px solid var(--em-ink)", marginTop: 22 }} />
      <div className="em-meta-k" style={{ marginTop: 4 }}>{label}</div>
    </div>
  );
}
