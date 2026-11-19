"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import StepCard from "./[id]/StepCard";

// "Next step" for one job, opened from the jobs list: the same step card as
// on the job page, in a sheet, so a job can be moved without opening its full
// page (Arjun, 19-Nov-2026). On a phone it fills the screen.
export default function QuickStepSheet({ jobId, role, title, subtitle, onClose, onMoved }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    setData(null); setErr("");
    fetch(`/api/factoryos/jobs/${jobId}/step`)
      .then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) }))
      .then(({ ok, d }) => { if (!alive) return; if (ok) setData(d); else setErr(d.error || "Couldn't load this job"); })
      .catch(() => { if (alive) setErr("Couldn't load this job"); });
    return () => { alive = false; };
  }, [jobId]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <div role="dialog" aria-label="Next step for this job" className="relative flex max-h-full w-full flex-col bg-gray-50 shadow-xl sm:max-h-[90vh] sm:max-w-2xl sm:rounded-2xl dark:bg-gray-950">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 sm:rounded-t-2xl dark:border-gray-800 dark:bg-gray-900">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-gray-900 dark:text-white">{title}</div>
            {subtitle && <div className="truncate text-xs text-gray-500 dark:text-gray-400">{subtitle}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Link href={`/factoryos/manager/${jobId}`} className="text-xs text-blue-700 hover:underline dark:text-blue-400">Open full job</Link>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-md px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">✕</button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          {err && <p className="rounded-lg bg-white p-4 text-sm text-red-600 dark:bg-gray-900">{err}</p>}
          {!err && !data && <p className="rounded-lg bg-white p-4 text-sm text-gray-500 dark:bg-gray-900">Loading…</p>}
          {data && (
            <StepCard
              key={data.job.id + data.job.stage}
              job={data.job}
              role={role}
              ctx={data.ctx}
              outsourcers={data.outsourcers}
              printingVendors={data.printingVendors}
              onDone={onMoved}
            />
          )}
        </div>
      </div>
    </div>
  );
}
