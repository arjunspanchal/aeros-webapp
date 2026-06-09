"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { StageBadge, StageTimeline, formatDate, inputCls } from "@/app/factoryos/_components/ui";
import StatusChart from "@/app/factoryos/_components/StatusChart";

export default function CustomerJobsView({ jobs, clientMap }) {
  const [filter, setFilter] = useState("open");
  const [q, setQ] = useState("");

  // Layout audit W4: customers had to click through every open job to find
  // the one waiting on them. The most reliable "needs your input" signal in
  // the current data model is `stage === "Dispatched"` — that's the only
  // stage the customer is authorised to advance (Dispatched → Delivered, per
  // the PATCH route's isCustomerDeliver gate). The banner counts those, plus
  // surfaces any urgent-flagged jobs as a secondary signal.
  const dispatchedAwaitingDelivery = useMemo(
    () => jobs.filter((j) => j.stage === "Dispatched").length,
    [jobs],
  );
  const urgentOpen = useMemo(
    () => jobs.filter((j) => j.urgent && j.stage !== "Delivered").length,
    [jobs],
  );
  const needsInputTotal = dispatchedAwaitingDelivery + urgentOpen;

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return jobs.filter((j) => {
      if (filter === "open" && (j.stage === "Dispatched" || j.stage === "Delivered")) return false;
      if (filter === "dispatched" && j.stage !== "Dispatched") return false;
      if (filter === "delivered" && j.stage !== "Delivered") return false;
      if (!term) return true;
      const hay = `${j.jNumber} ${j.brand} ${j.item} ${j.city} ${j.poNumber}`.toLowerCase();
      return hay.includes(term);
    });
  }, [jobs, filter, q]);

  // Group by PO Number so multi-item POs show together.
  const grouped = useMemo(() => {
    const map = new Map();
    for (const j of filtered) {
      const key = j.poNumber || `__J${j.jNumber}`;
      if (!map.has(key)) map.set(key, { poNumber: j.poNumber, jobs: [] });
      map.get(key).jobs.push(j);
    }
    return Array.from(map.values()).sort((a, b) =>
      (b.jobs[0]?.orderDate || "").localeCompare(a.jobs[0]?.orderDate || ""),
    );
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Your orders</h1>
        <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1 text-xs dark:bg-gray-900 dark:border-gray-800">
          {[
            ["open", "In progress"],
            ["dispatched", "Dispatched"],
            ["delivered", "Delivered"],
            ["all", "All"],
          ].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-md font-medium ${
                filter === k ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* "Needs your input" banner — replaces the customer-side gap where
          pending actions only surfaced inside each job's detail page. A
          dispatched job is awaiting "Mark delivered" confirmation from the
          buyer; urgent-flagged jobs are surfaced as a secondary signal. */}
      {needsInputTotal > 0 && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-700 dark:bg-amber-900/20">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                {needsInputTotal} order{needsInputTotal === 1 ? "" : "s"} need{needsInputTotal === 1 ? "s" : ""} your input
              </p>
              <p className="text-xs text-amber-800 mt-0.5 dark:text-amber-300">
                {dispatchedAwaitingDelivery > 0 && (
                  <>
                    {dispatchedAwaitingDelivery} dispatched —
                    {" "}
                    <button
                      type="button"
                      onClick={() => setFilter("dispatched")}
                      className="underline hover:no-underline"
                    >
                      mark delivered when received
                    </button>
                  </>
                )}
                {dispatchedAwaitingDelivery > 0 && urgentOpen > 0 && " · "}
                {urgentOpen > 0 && (
                  <>{urgentOpen} urgent open order{urgentOpen === 1 ? "" : "s"}</>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      <StatusChart jobs={jobs} title="Your order status overview" />

      <input
        className={inputCls}
        placeholder="Search by PO number, item, J#, city…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {grouped.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-500 dark:bg-gray-900 dark:border-gray-800 dark:text-gray-400">
          {q ? "Nothing matches your search." : "No orders to show."}
        </div>
      )}

      <div className="space-y-4">
        {grouped.map((g) => (
          <div key={g.poNumber || g.jobs[0].id} className="bg-white border border-gray-200 rounded-xl overflow-hidden dark:bg-gray-900 dark:border-gray-800">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between dark:bg-gray-800/50 dark:border-gray-800">
              <div>
                <div className="text-sm font-semibold text-gray-900 dark:text-white">
                  {g.poNumber ? `PO ${g.poNumber}` : `Job ${g.jobs[0].jNumber}`}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {g.jobs.length} {g.jobs.length === 1 ? "item" : "items"} · Placed {formatDate(g.jobs[0].orderDate)}
                </div>
              </div>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {g.jobs.map((j) => (
                <Link
                  key={j.id}
                  href={`/factoryos/customer/${j.id}`}
                  className="block px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {j.urgent && <span className="inline-flex items-center text-[10px] font-semibold bg-red-100 text-red-800 px-1.5 py-0.5 rounded mr-1.5 align-middle dark:bg-red-900/40 dark:text-red-200">URGENT</span>}
                        {j.item}
                        {j.brand && <span className="text-gray-500 dark:text-gray-400"> · {j.brand}</span>}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5 dark:text-gray-400">
                        J# {j.jNumber}
                        {j.city && <> · {j.city}</>}
                        {j.qty != null && <> · {j.qty.toLocaleString("en-IN")} pcs</>}
                      </div>
                    </div>
                    <StageBadge stage={j.stage} />
                  </div>
                  <div className="mt-3">
                    <StageTimeline stage={j.stage} />
                    <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span>Current: {j.stage}</span>
                      {j.estimatedDeliveryDate && <span>ETA {formatDate(j.estimatedDeliveryDate)}</span>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
