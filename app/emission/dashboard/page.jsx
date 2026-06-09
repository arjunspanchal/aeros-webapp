"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "../_components/AuthProvider";
import { Eyebrow, Title, StatusLabel } from "../_components/ui";
import {
  dashOpenJobs, dashAgedJobs, dashClaimsPending, dashRevenueByChannel, dashRevenueByType, dashService,
} from "../_lib/data";
import { inr, fmtDate, PAYMENT_LABEL, REVENUE_CATEGORY_LABEL, CLAIM_LABEL } from "../_lib/format";

function monthStartISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function DashboardPage() {
  const { session, ready } = useAuth();
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const isAdmin = session?.role === "admin";

  useEffect(() => {
    if (!ready || !isAdmin) return;
    let live = true;
    setLoading(true);
    Promise.all([
      dashOpenJobs(session),
      dashAgedJobs(session, 15),
      dashClaimsPending(session),
      dashRevenueByChannel(session, from, to),
      dashRevenueByType(session, from, to),
      dashService(session).catch(() => null),
    ])
      .then(([open, aged, claims, byChannel, byType, service]) => {
        if (live) { setData({ open, aged, claims, byChannel, byType, service }); setErr(""); }
      })
      .catch((e) => live && setErr(e.message))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [ready, isAdmin, session, from, to]);

  const channel = useMemo(() => {
    const m = Object.fromEntries((data?.byChannel || []).map((r) => [r.payment_method, Number(r.total)]));
    const cash = m.cash || 0;
    const digital = (m.business_upi || 0) + (m.hdfc_bank || 0);
    const pending = m.pending || 0;
    return { rows: data?.byChannel || [], cash, digital, pending, total: cash + digital + pending };
  }, [data]);

  const claimsOutstanding = useMemo(
    () => (data?.claims || []).reduce((s, c) => s + Number(c.claim_amount || 0), 0),
    [data],
  );

  if (ready && !isAdmin) {
    return (
      <div className="em-dark" style={{ margin: "-20px -16px -80px", padding: "40px 16px" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <Eyebrow onDark>OWNER DASHBOARD</Eyebrow>
          <Title lead="Admin" tail="PIN required" onDark style={{ fontSize: 26, marginTop: 8 }} />
          <p style={{ color: "rgba(255,255,255,0.6)", marginTop: 12 }}>This dashboard is owner-only. Lock and re-enter with the 6-digit admin PIN.</p>
          <Link href="/emission/jobs" className="em-btn em-btn--gold em-btn--sm" style={{ marginTop: 16, textDecoration: "none" }}>← BACK TO JOBS</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="em-dark" style={{ margin: "-20px -16px -80px", padding: "24px 16px 80px" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
          <div>
            <Eyebrow onDark>OWNER DASHBOARD</Eyebrow>
            <Title lead="The" tail="money view" onDark style={{ fontSize: 28, marginTop: 6 }} />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input className="em-input em-mono" type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150, padding: "8px 10px", fontSize: 13 }} />
            <span style={{ color: "rgba(255,255,255,0.4)" }}>→</span>
            <input className="em-input em-mono" type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150, padding: "8px 10px", fontSize: 13 }} />
          </div>
        </div>

        {err ? <div className="em-card em-card--dark" style={{ padding: 16, marginTop: 16, color: "#fff" }}>{err}</div> : null}
        {loading || !data ? (
          <div className="em-eyebrow em-eyebrow--ondark" style={{ padding: 28 }}>LOADING…</div>
        ) : (
          <>
            {/* HERO — single most important number, in gold */}
            <div className="em-card em-card--dark" style={{ padding: "24px 22px", marginTop: 18 }}>
              <span className="em-eyebrow em-eyebrow--ondark">REVENUE · {fmtDate(from)} – {fmtDate(to)}</span>
              <div className="em-hero-number em-mono" style={{ fontSize: 56, marginTop: 6 }}>{inr(channel.total)}</div>
              <div style={{ display: "flex", gap: 18, marginTop: 14, flexWrap: "wrap" }}>
                <Split label="CASH" value={channel.cash} total={channel.total} emphasise />
                <Split label="DIGITAL" value={channel.digital} total={channel.total} />
                <Split label="PENDING" value={channel.pending} total={channel.total} />
              </div>
              <div className="em-eyebrow em-eyebrow--ondark" style={{ marginTop: 12, letterSpacing: "0.04em", textTransform: "none" }}>
                Cash-vs-digital split — watch the cash share.
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginTop: 14 }}>
              {/* Open jobs */}
              <Block title="OPEN JOBS">
                <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
                  <span className="em-mono" style={{ fontSize: 40, fontWeight: 800, color: "#fff" }}>{data.open.length}</span>
                  <span className="em-eyebrow em-eyebrow--ondark">{data.aged.length} aged &gt;15d</span>
                </div>
              </Block>

              {/* Claims pending — prominent, leak tracker */}
              <Block title="CLAIMS PENDING PAYMENT" accent>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                  <span className="em-hero-number em-mono" style={{ fontSize: 30 }}>{inr(claimsOutstanding)}</span>
                  <span className="em-eyebrow em-eyebrow--ondark">{data.claims.length} unpaid</span>
                </div>
              </Block>

              {/* Service metrics */}
              {data.service ? (
                <Block title="SERVICE">
                  <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "baseline" }}>
                    <div>
                      <span className="em-mono" style={{ fontSize: 30, fontWeight: 800, color: "var(--em-gold)" }}>{data.service.avg_rating ?? "—"}</span>
                      <span className="em-eyebrow em-eyebrow--ondark"> ★ ({data.service.rating_count})</span>
                    </div>
                    <div><span className="em-mono" style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>{data.service.ready_count}</span> <span className="em-eyebrow em-eyebrow--ondark">ready</span></div>
                    <div><span className="em-mono" style={{ fontSize: 22, fontWeight: 700, color: data.service.overdue_count ? "#fff" : "rgba(255,255,255,0.4)" }}>{data.service.overdue_count}</span> <span className="em-eyebrow em-eyebrow--ondark">overdue</span></div>
                  </div>
                </Block>
              ) : null}
            </div>

            {/* Ready for pickup */}
            {data.service?.ready?.length ? (
              <Block title="READY FOR PICKUP — CALL THE CUSTOMER" style={{ marginTop: 14 }}>
                {data.service.ready.map((j) => (
                  <Link key={j.job_no} href={`/emission/jobs/${j.job_no}`} style={{ textDecoration: "none", color: "inherit" }}>
                    <DarkRow left={`#${j.job_no} · ${j.customer}`} mid={j.model || ""} right={`${j.days}d`} />
                  </Link>
                ))}
              </Block>
            ) : null}

            {/* Recent feedback */}
            {data.service?.recent_feedback?.length ? (
              <Block title="RECENT CUSTOMER FEEDBACK" style={{ marginTop: 14 }}>
                {data.service.recent_feedback.map((f, i) => (
                  <DarkRow key={i} left={`#${f.job_no} · ${f.customer}`} mid={f.comment || ""} right={"★".repeat(f.rating)} />
                ))}
              </Block>
            ) : null}

            {/* Claims list */}
            {data.claims.length ? (
              <Block title="CLAIMS — OLDEST FILED FIRST" style={{ marginTop: 14 }}>
                {data.claims.map((c) => (
                  <DarkRow key={c.id}
                    left={`#${c.job_no} · ${c.customer_name}`}
                    mid={`${CLAIM_LABEL[c.claim_status]} · ${c.yamaha_ref_no || "no ref"}`}
                    right={`${inr(c.claim_amount)} · ${c.days_outstanding ?? "—"}d`}
                  />
                ))}
              </Block>
            ) : null}

            {/* Aged jobs */}
            {data.aged.length ? (
              <Block title="JOBS > 15 DAYS — OLDEST FIRST" style={{ marginTop: 14 }}>
                {data.aged.map((j) => (
                  <Link key={j.id} href={`/emission/jobs/${j.job_no}`} style={{ textDecoration: "none", color: "inherit" }}>
                    <DarkRow
                      left={`#${j.job_no} · ${j.customer_name}`}
                      mid={[j.brand, j.model].filter(Boolean).join(" ")}
                      right={<><StatusLabel status={j.status} onDark /> · {j.days_open}d</>}
                    />
                  </Link>
                ))}
              </Block>
            ) : null}

            {/* Revenue by channel + by type */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginTop: 14 }}>
              <Block title="REVENUE BY CHANNEL">
                {channel.rows.length ? channel.rows.map((r) => (
                  <DarkRow key={r.payment_method} left={PAYMENT_LABEL[r.payment_method]} mid={`${r.job_count} jobs`} right={inr(r.total)} />
                )) : <Empty />}
              </Block>
              <Block title="REVENUE BY TYPE">
                {data.byType.length ? data.byType.map((r) => (
                  <DarkRow key={r.category} left={REVENUE_CATEGORY_LABEL[r.category] || r.category} right={inr(r.total)} />
                )) : <Empty />}
              </Block>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Block({ title, children, accent, style }) {
  return (
    <div className="em-card em-card--dark" style={{ padding: 18, ...style, ...(accent ? { borderColor: "rgba(201,168,76,0.5)" } : null) }}>
      <span className="em-eyebrow em-eyebrow--ondark">{title}</span>
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );
}
function DarkRow({ left, mid, right }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", padding: "8px 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <span style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>{left}</span>
      {mid ? <span className="em-eyebrow em-eyebrow--ondark" style={{ flex: 1, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mid}</span> : null}
      <span className="em-mono" style={{ color: "#fff", fontSize: 13, whiteSpace: "nowrap" }}>{right}</span>
    </div>
  );
}
function Split({ label, value, total, emphasise }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="em-eyebrow em-eyebrow--ondark">{label} · {pct}%</div>
      <div className="em-mono" style={{ fontSize: 18, color: emphasise ? "var(--em-gold)" : "#fff", fontWeight: 700, marginTop: 2 }}>{inr(value)}</div>
    </div>
  );
}
function Empty() {
  return <div className="em-eyebrow em-eyebrow--ondark" style={{ padding: "6px 0" }}>NO DATA IN RANGE</div>;
}
