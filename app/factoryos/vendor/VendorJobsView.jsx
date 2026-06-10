"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { StageBadge, formatDate, inputCls } from "@/app/factoryos/_components/ui";

// A printing vendor's part is done once they've dispatched it back, or the team
// has moved the job past the print stages.
const VENDOR_OPEN_STAGES = new Set(["RM Pending", "Under Printing"]);
const VENDOR_STATUS_LABEL = {
  accepted: "Accepted",
  printing_started: "Printing started",
  printing_completed: "Printing done",
  dispatched: "Dispatched",
};

function isDone(j) {
  if (j.vendorStatus === "dispatched") return true;
  return !VENDOR_OPEN_STAGES.has(j.stage);
}

export default function VendorJobsView({ jobs, vendorName, linked, unreadIds = [] }) {
  const [filter, setFilter] = useState("open");
  const [q, setQ] = useState("");
  // Compute "today" after mount so SSR/client hydration can't mismatch on the
  // overdue highlight (first paint shows none, then it fills in).
  const [today, setToday] = useState(null);
  useEffect(() => setToday(new Date().toISOString().slice(0, 10)), []);

  const unread = useMemo(() => new Set(unreadIds), [unreadIds]);

  const counts = useMemo(() => {
    let open = 0;
    let done = 0;
    for (const j of jobs) (isDone(j) ? done++ : open++);
    return { open, done, all: jobs.length };
  }, [jobs]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return jobs.filter((j) => {
      const done = isDone(j);
      if (filter === "open" && done) return false;
      if (filter === "done" && !done) return false;
      if (!term) return true;
      const hay = `${j.jNumber} ${j.brand} ${j.item} ${j.printingType} ${j.poNumber}`.toLowerCase();
      return hay.includes(term);
    });
  }, [jobs, filter, q]);

  function overdue(j) {
    return (
      today &&
      j.printingDueDate &&
      String(j.printingDueDate).slice(0, 10) < today &&
      j.vendorStatus !== "dispatched"
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Your jobs</h1>
          {vendorName && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{vendorName}</p>}
        </div>
        <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1 text-xs dark:bg-gray-900 dark:border-gray-800">
          {[
            ["open", "To do", counts.open],
            ["done", "Completed", counts.done],
            ["all", "All", counts.all],
          ].map(([k, label, n]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-md font-medium ${
                filter === k
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              }`}
            >
              {label} <span className={filter === k ? "text-blue-100" : "text-gray-400"}>{n}</span>
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
          {q ? "Nothing matches your search." : "No jobs to show here."}
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((j) => {
          const hasUnread = unread.has(j.id);
          const isLate = overdue(j);
          return (
            <Link
              key={j.id}
              href={`/factoryos/vendor/${j.id}`}
              className={`block bg-white border rounded-xl px-4 py-3 hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800/40 ${
                hasUnread ? "border-blue-300 dark:border-blue-800" : "border-gray-200 dark:border-gray-800"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-1.5">
                    {hasUnread && (
                      <span className="h-2 w-2 rounded-full bg-blue-600 shrink-0" title="New activity from Aeros" />
                    )}
                    {j.urgent && (
                      <span className="inline-flex items-center text-[10px] font-semibold bg-red-100 text-red-800 px-1.5 py-0.5 rounded dark:bg-red-900/40 dark:text-red-200">
                        URGENT
                      </span>
                    )}
                    <span className="truncate">{j.item}</span>
                    {j.brand && <span className="text-gray-500 dark:text-gray-400 shrink-0"> · {j.brand}</span>}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 dark:text-gray-400">
                    J# {j.jNumber}
                    {j.printingType && <> · {j.printingType}</>}
                    {j.qty != null && <> · {j.qty.toLocaleString("en-IN")} pcs</>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {j.vendorStatus ? (
                    <span className="text-[10px] font-semibold bg-green-100 text-green-800 px-1.5 py-0.5 rounded dark:bg-green-900/40 dark:text-green-200">
                      {VENDOR_STATUS_LABEL[j.vendorStatus]}
                    </span>
                  ) : (
                    <StageBadge stage={j.stage} />
                  )}
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-gray-500 dark:text-gray-400">Your delivery date</span>
                <span
                  className={`font-medium ${
                    isLate
                      ? "text-red-600 dark:text-red-400"
                      : j.printingDueDate
                        ? "text-gray-900 dark:text-white"
                        : "text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {j.printingDueDate ? (
                    <>
                      {formatDate(j.printingDueDate)}
                      {isLate && " · Overdue"}
                    </>
                  ) : (
                    "Not set — tap to add"
                  )}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
