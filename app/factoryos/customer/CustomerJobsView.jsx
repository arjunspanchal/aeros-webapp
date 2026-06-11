"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatDate, inputCls } from "@/app/factoryos/_components/ui";
import {
  classifyForKpi,
  derivedEta,
  friendlyStage,
  milestoneIndex,
  MILESTONES,
  needsCustomerAttention,
  nextStep,
} from "./_lib/customerView";

const TONE_CHIP = {
  action: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  info:   "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  soon:   "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200",
  good:   "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
};

function MilestoneStrip({ stage }) {
  const current = milestoneIndex(stage);
  return (
    <div className="flex items-center gap-1.5">
      {MILESTONES.map((m, i) => {
        const done = i <= current;
        const isCurrent = i === current;
        return (
          <div key={m.key} className="flex-1 flex items-center gap-1.5 min-w-0">
            <div
              className={`h-1.5 rounded-full flex-1 transition-colors ${
                done ? (isCurrent ? "bg-blue-600" : "bg-blue-400") : "bg-gray-200 dark:bg-gray-700"
              }`}
            />
          </div>
        );
      })}
    </div>
  );
}

function NextStepChip({ job }) {
  const ns = nextStep(job);
  if (!ns) return null;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${TONE_CHIP[ns.tone] || TONE_CHIP.info}`}>
      {ns.text}
    </span>
  );
}

function EtaLine({ job }) {
  const eta = derivedEta(job);
  if (eta?.date) {
    return (
      <span className="text-xs text-gray-500 dark:text-gray-400">
        {eta.isExplicit ? "ETA " : "Expected by "}{formatDate(eta.date)}
      </span>
    );
  }
  if (eta?.isPending) {
    return <span className="text-xs text-gray-400 dark:text-gray-500">ETA confirmed soon</span>;
  }
  return null;
}

function isOverdueLocal(job, today) {
  if (!today) return false;
  if (job.stage === "Delivered" || job.stage === "Dispatched") return false;
  const eta = derivedEta(job);
  if (!eta?.date) return false;
  return String(eta.date).slice(0, 10) < today;
}

const ACTIVE = (j) => j.stage !== "Dispatched" && j.stage !== "Delivered";

export default function CustomerJobsView({
  jobs,
  clientMap,
  unreadIds = [],
  artworkPendingIds = [],
  activeClient = null,
}) {
  const [q, setQ] = useState("");
  const [showPast, setShowPast] = useState(false);
  const [today, setToday] = useState(null);
  useEffect(() => setToday(new Date().toISOString().slice(0, 10)), []);

  const unread = useMemo(() => new Set(unreadIds), [unreadIds]);

  // Stamp the thread-derived artwork flag onto each job before anything
  // downstream (nextStep, needsCustomerAttention, KPIs) reads it — the
  // server computed which jobs actually have unapproved team artwork.
  const scopedJobs = useMemo(() => {
    const pending = new Set(artworkPendingIds);
    if (pending.size === 0) return jobs;
    return jobs.map((j) =>
      pending.has(j.id) ? { ...j, artworkAwaitingApproval: true } : j,
    );
  }, [jobs, artworkPendingIds]);

  const kpi = useMemo(() => classifyForKpi(scopedJobs), [scopedJobs]);
  const overdueCount = useMemo(
    () => scopedJobs.filter((j) => isOverdueLocal(j, today)).length,
    [scopedJobs, today],
  );

  // Bucket once — active / past — and apply search across both. Sorting:
  //   active: needs-attention → unread → overdue → soonest ETA → newest
  //   past:   most recently dispatched first (orderDate proxy)
  const { active, past } = useMemo(() => {
    const term = q.trim().toLowerCase();
    const match = (j) => {
      if (!term) return true;
      const hay = `${j.jNumber} ${j.brand} ${j.item} ${j.city} ${j.poNumber || ""}`.toLowerCase();
      return hay.includes(term);
    };
    const a = scopedJobs.filter((j) => ACTIVE(j) && match(j));
    const p = scopedJobs.filter((j) => !ACTIVE(j) && match(j));
    const rank = (j) => {
      if (needsCustomerAttention(j)) return 4;
      if (unread.has(j.id)) return 3;
      if (isOverdueLocal(j, today)) return 2;
      if (j.urgent) return 1;
      return 0;
    };
    a.sort((x, y) => {
      const ra = rank(x); const rb = rank(y);
      if (ra !== rb) return rb - ra;
      const ea = derivedEta(x)?.date || "9999-12-31";
      const eb = derivedEta(y)?.date || "9999-12-31";
      if (ea !== eb) return ea < eb ? -1 : 1;
      return (y.orderDate || "").localeCompare(x.orderDate || "");
    });
    p.sort((x, y) => (y.orderDate || "").localeCompare(x.orderDate || ""));
    return { active: a, past: p };
  }, [scopedJobs, q, unread, today]);

  const attention = useMemo(
    () => scopedJobs.filter((j) => ACTIVE(j) && (needsCustomerAttention(j) || unread.has(j.id) || isOverdueLocal(j, today))),
    [scopedJobs, unread, today],
  );

  return (
    <div className="space-y-6">
      {/* KPI strip — at-a-glance numbers, no clicking required. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="In progress" value={kpi.inProgress} />
        <Kpi label="Needs your input" value={kpi.needsYou} tone={kpi.needsYou ? "amber" : null} />
        <Kpi label="Overdue" value={overdueCount} tone={overdueCount ? "red" : null} />
        <Kpi label="Dispatched (30d)" value={kpi.dispatchedThisMonth} />
      </div>

      {/* Needs your attention — only when there is something. Surfaces the most
          actionable jobs ahead of the full list. */}
      {attention.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 dark:bg-amber-950/30 dark:border-amber-900">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-100">Needs your attention</h2>
            <span className="text-xs text-amber-700 dark:text-amber-200">{attention.length}</span>
          </div>
          <ul className="mt-2 space-y-1.5">
            {attention.slice(0, 5).map((j) => {
              const reasons = [];
              if (needsCustomerAttention(j)) reasons.push("Artwork to approve");
              if (unread.has(j.id)) reasons.push("New message");
              if (isOverdueLocal(j, today)) reasons.push("Past ETA");
              return (
                <li key={j.id}>
                  <Link
                    href={`/factoryos/customer/${j.id}`}
                    className="flex items-start justify-between gap-3 rounded-lg px-2 py-1.5 -mx-2 hover:bg-amber-100/60 dark:hover:bg-amber-900/30"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-amber-950 dark:text-amber-50 truncate">
                        {j.item}{j.brand && <span className="opacity-70"> · {j.brand}</span>}
                      </div>
                      <div className="text-xs text-amber-800 dark:text-amber-200 mt-0.5">
                        J# {j.jNumber} · {reasons.join(" · ")}
                      </div>
                    </div>
                    <span className="text-xs text-amber-700 dark:text-amber-200 shrink-0">Open →</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <input
        className={inputCls}
        placeholder="Search by J#, item, PO, city…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {/* Active orders */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Active orders</h2>
          <span className="text-xs text-gray-500 dark:text-gray-400">{active.length} in progress</span>
        </div>

        {active.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center dark:bg-gray-900 dark:border-gray-800">
            {q ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No active orders match.</p>
            ) : (
              <>
                <div className="text-3xl">🍵</div>
                <p className="mt-2 text-sm text-gray-700 dark:text-gray-200">
                  Nothing in production right now.
                </p>
                <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">
                  Want to start an order? Reach out to the Aeros team and they'll share a quote.
                </p>
                <a
                  href="mailto:hello@aeros.in?subject=New%20order%20request"
                  className="inline-flex items-center mt-3 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
                >
                  Email Aeros
                </a>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {active.map((j) => (
              <JobCard key={j.id} job={j} unread={unread.has(j.id)} overdue={isOverdueLocal(j, today)} />
            ))}
          </div>
        )}
      </section>

      {/* Past orders — collapsed by default so the active list isn't drowned. */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Past orders</h2>
          <button
            onClick={() => setShowPast((v) => !v)}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            {showPast ? "Hide" : "Show"} ({past.length})
          </button>
        </div>
        {showPast && past.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 dark:bg-gray-900 dark:border-gray-800 dark:divide-gray-800">
            {past.map((j) => (
              <Link
                key={j.id}
                href={`/factoryos/customer/${j.id}`}
                className="block px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/40"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {j.item}{j.brand && <span className="text-gray-500"> · {j.brand}</span>}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 dark:text-gray-400">
                      J# {j.jNumber}
                      {j.qty != null && <> · {j.qty.toLocaleString("en-IN")} pcs</>}
                      {j.orderDate && <> · Placed {formatDate(j.orderDate)}</>}
                    </div>
                  </div>
                  <span className="text-xs text-emerald-700 dark:text-emerald-300 shrink-0">
                    {j.stage === "Delivered" ? "Delivered" : "Dispatched"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi({ label, value, tone }) {
  const cls =
    tone === "red"
      ? "text-red-600 dark:text-red-400"
      : tone === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : "text-gray-900 dark:text-white";
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 dark:bg-gray-900 dark:border-gray-800">
      <div className={`text-2xl font-bold tabular-nums ${cls}`}>{value}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
    </div>
  );
}

function JobCard({ job, unread, overdue }) {
  return (
    <Link
      href={`/factoryos/customer/${job.id}`}
      className={`block bg-white border rounded-xl px-4 py-3 hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800/40 ${
        unread ? "border-blue-300 dark:border-blue-800 bg-blue-50/40" : "border-gray-200 dark:border-gray-800"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-1.5 flex-wrap">
            {unread && <span className="h-2 w-2 rounded-full bg-blue-600 shrink-0" title="New message from Aeros" />}
            {job.urgent && (
              <span className="inline-flex items-center text-[10px] font-semibold bg-red-100 text-red-800 px-1.5 py-0.5 rounded dark:bg-red-900/40 dark:text-red-200">
                URGENT
              </span>
            )}
            <span className="truncate">{job.item}</span>
            {job.brand && <span className="text-gray-500 shrink-0"> · {job.brand}</span>}
          </div>
          <div className="text-xs text-gray-500 mt-0.5 dark:text-gray-400">
            J# {job.jNumber}
            {job.poNumber && <> · PO {job.poNumber}</>}
            {job.qty != null && <> · {job.qty.toLocaleString("en-IN")} pcs</>}
          </div>
        </div>
        <NextStepChip job={job} />
      </div>
      <div className="mt-3">
        <MilestoneStrip stage={job.stage} />
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="text-gray-600 dark:text-gray-300">{friendlyStage(job.stage)}</span>
          <span className={overdue ? "text-red-600 dark:text-red-400 font-medium" : ""}>
            <EtaLine job={job} />
            {overdue && " · Past ETA"}
          </span>
        </div>
      </div>
    </Link>
  );
}
