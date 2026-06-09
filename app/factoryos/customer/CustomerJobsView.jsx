"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { StageBadge, StageTimeline, formatDate, inputCls } from "@/app/factoryos/_components/ui";
import StatusChart from "@/app/factoryos/_components/StatusChart";

export default function CustomerJobsView({ jobs, clientMap }) {
  const [filter, setFilter] = useState("open");
  const [q, setQ] = useState("");

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

      <StatusChart jobs={jobs} title="Your order status overview" />

      <input
        className={inputCls}
        placeholder="Search by PO number, item, J#, city…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {/* Empty state shape: split "over-filtered" (search returned nothing
          but jobs exist) from "genuinely empty" (no jobs in scope at all).
          The genuine-empty version offers reach-out paths so customers know
          how to start a conversation; the over-filtered version offers a
          "clear search" reset so they can recover with one click. */}
      {grouped.length === 0 && jobs.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center dark:bg-gray-900 dark:border-gray-800">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Nothing matches your search.
          </p>
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              className="mt-2 text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              Clear search
            </button>
          )}
        </div>
      )}
      {grouped.length === 0 && jobs.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center dark:bg-gray-900 dark:border-gray-800">
          <p className="text-sm text-gray-700 font-medium dark:text-gray-200">
            You don&apos;t have any orders yet.
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            When Aeros confirms an order, it&apos;ll show up here.
          </p>
          <div className="mt-3 flex items-center justify-center gap-4 text-xs">
            <a
              href="mailto:hello@aeros-x.com"
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              ✉ Email Aeros
            </a>
            <a
              href="https://wa.me/917977007497?text=Hi%20Aeros%2C%20I'd%20like%20to%20discuss%20a%20new%20order."
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-700 hover:underline dark:text-green-400"
            >
              💬 WhatsApp
            </a>
          </div>
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
