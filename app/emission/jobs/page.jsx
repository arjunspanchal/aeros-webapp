"use client";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "../_components/AuthProvider";
import { Eyebrow, Title, StatusLabel, Divider } from "../_components/ui";
import { listJobs } from "../_lib/data";
import { fmtDate, daysSince, todayISO } from "../_lib/format";
import { TERMINAL_STATUSES, STATUS_LABEL } from "../_lib/schemas";

const FILTERS = [
  { key: "open", label: "OPEN" },
  { key: "all", label: "ALL" },
  { key: "ready", label: "READY" },
  { key: "awaiting_parts", label: "AWAITING PARTS" },
  { key: "delivered", label: "DELIVERED" },
];

export default function JobListPage() {
  const { session } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("open");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!session) return;
    let live = true;
    setLoading(true);
    listJobs(session, { status: filter })
      .then((rows) => { if (live) { setJobs(rows); setErr(""); } })
      .catch((e) => live && setErr(e.message))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [session, filter]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return jobs;
    return jobs.filter((j) =>
      String(j.job_no).includes(needle) ||
      (j.phone || "").toLowerCase().includes(needle) ||
      (j.customer_name || "").toLowerCase().includes(needle),
    );
  }, [jobs, q]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <Eyebrow>JOB LIST</Eyebrow>
          <Title lead="Jobs" tail="in the book" style={{ fontSize: 28, marginTop: 6 }} />
        </div>
        <Link href="/emission/intake" className="em-btn em-btn--primary" style={{ textDecoration: "none" }}>+ NEW INTAKE</Link>
      </div>

      <div style={{ display: "flex", gap: 8, overflowX: "auto", margin: "18px 0 12px" }} className="no-scrollbar">
        {FILTERS.map((f) => (
          <button key={f.key} className={`em-chip ${filter === f.key ? "em-chip--on" : ""}`} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      <input className="em-input" placeholder="Search job no · phone · name" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 14 }} />

      {loading ? (
        <div className="em-label" style={{ padding: 24, textAlign: "center" }}>LOADING…</div>
      ) : err ? (
        <div className="em-card" style={{ padding: 16, color: "var(--em-ink)" }}>{err}</div>
      ) : shown.length === 0 ? (
        <div className="em-label" style={{ padding: 24, textAlign: "center" }}>NO JOBS</div>
      ) : (
        <div className="em-card">
          {shown.map((j, i) => {
            const open = !TERMINAL_STATUSES.includes(j.status);
            const age = daysSince(j.date_received);
            const aged = open && age != null && age > 15;
            const overdue = j.promised_date && open && j.status !== "ready" && j.promised_date < todayISO();
            const flag = aged || overdue;
            return (
              <div key={j.id}>
                {i > 0 ? <Divider /> : null}
                <Link href={`/emission/jobs/${j.job_no}`} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
                  <div className={flag ? "em-flag" : ""} style={{ display: "flex", alignItems: "center", gap: 12, padding: flag ? "14px 14px 14px 12px" : "14px" }}>
                    <div style={{ minWidth: 56 }}>
                      <div className="em-mono" style={{ fontSize: 15, fontWeight: 600 }}>#{j.job_no}</div>
                      <div className="em-meta-k">{fmtDate(j.date_received)}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: flag ? 800 : 600, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {j.customer_name}
                      </div>
                      <div className="em-meta-k" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {[j.brand, j.model].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", minWidth: 96 }}>
                      <StatusLabel status={j.status} muted={!open} />
                      <div className="em-meta-k" style={{ marginTop: 2, fontWeight: overdue ? 800 : 400, color: overdue ? "var(--em-ink)" : undefined }}>
                        {overdue ? `OVERDUE · ${age}d` : open ? `${age}d open` : ""}
                      </div>
                    </div>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
