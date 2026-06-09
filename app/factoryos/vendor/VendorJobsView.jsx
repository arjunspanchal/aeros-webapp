"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { StageBadge, formatDate, inputCls } from "@/app/factoryos/_components/ui";

// A printing vendor's part is done once the job moves past the print stages.
const VENDOR_OPEN_STAGES = new Set(["RM Pending", "Under Printing"]);

export default function VendorJobsView({ jobs, vendorName, linked }) {
  const [filter, setFilter] = useState("open");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return jobs.filter((j) => {
      const isOpen = VENDOR_OPEN_STAGES.has(j.stage);
      if (filter === "open" && !isOpen) return false;
      if (filter === "done" && isOpen) return false;
      if (!term) return true;
      const hay = `${j.jNumber} ${j.brand} ${j.item} ${j.printingType} ${j.poNumber}`.toLowerCase();
      return hay.includes(term);
    });
  }, [jobs, filter, q]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Your jobs</h1>
          {vendorName && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{vendorName}</p>
          )}
        </div>
        <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1 text-xs dark:bg-gray-900 dark:border-gray-800">
          {[
            ["open", "To do"],
            ["done", "Completed"],
            ["all", "All"],
          ].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-md font-medium ${
                filter === k
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!linked && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-200">
          Your login isn&apos;t linked to a vendor record yet. Ask the Aeros team to
          connect your account so your assigned jobs appear here.
        </div>
      )}

      <input
        className={inputCls}
        placeholder="Search by J#, item, PO number, print type…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {filtered.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-500 dark:bg-gray-900 dark:border-gray-800 dark:text-gray-400">
          {q ? "Nothing matches your search." : "No jobs assigned to you right now."}
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((j) => (
          <Link
            key={j.id}
            href={`/factoryos/vendor/${j.id}`}
            className="block bg-white border border-gray-200 rounded-xl px-4 py-3 hover:bg-gray-50 dark:bg-gray-900 dark:border-gray-800 dark:hover:bg-gray-800/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  {j.urgent && (
                    <span className="inline-flex items-center text-[10px] font-semibold bg-red-100 text-red-800 px-1.5 py-0.5 rounded mr-1.5 align-middle dark:bg-red-900/40 dark:text-red-200">
                      URGENT
                    </span>
                  )}
                  {j.item}
                  {j.brand && <span className="text-gray-500 dark:text-gray-400"> · {j.brand}</span>}
                </div>
                <div className="text-xs text-gray-500 mt-0.5 dark:text-gray-400">
                  J# {j.jNumber}
                  {j.printingType && <> · {j.printingType}</>}
                  {j.qty != null && <> · {j.qty.toLocaleString("en-IN")} pcs</>}
                </div>
              </div>
              <StageBadge stage={j.stage} />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-gray-500 dark:text-gray-400">Your delivery date</span>
              {/* Audit L4: copy used to say "tap to add" but the whole row
                  is a Link to the detail page — no inline editor. Honest
                  wording: tap row to set. */}
              <span
                className={`font-medium ${
                  j.printingDueDate ? "text-gray-900 dark:text-white" : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {j.printingDueDate ? formatDate(j.printingDueDate) : "Not set — open job to set"}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
