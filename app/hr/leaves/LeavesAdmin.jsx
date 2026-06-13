"use client";
import { useMemo, useState } from "react";

function prettyDate(ymd) {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const TYPE_LABEL = { PL: "Paid leave", UL: "Unpaid leave" };
const STATUS_STYLE = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

export default function LeavesAdmin({ initialRequests }) {
  const [requests, setRequests] = useState(initialRequests);
  const [busyId, setBusyId] = useState(null);
  const [tab, setTab] = useState("pending");

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0 };
    for (const r of requests) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [requests]);

  const shown = useMemo(() => requests.filter((r) => r.status === tab), [requests, tab]);

  async function decide(r, decision) {
    if (decision === "rejected" && !confirm(`Reject ${r.employeeName}'s ${TYPE_LABEL[r.type]}?`)) return;
    setBusyId(r.id);
    const res = await fetch(`/api/hr/leaves/${r.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    setBusyId(null);
    if (!res.ok) { alert((await res.json().catch(() => ({}))).error || "Failed"); return; }
    const { request } = await res.json();
    setRequests((prev) => prev.map((x) => (x.id === r.id ? request : x)));
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex gap-2">
        {["pending", "approved", "rejected"].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`text-sm px-3 py-1.5 rounded-md font-medium capitalize ${
              tab === t
                ? "bg-blue-600 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300 dark:bg-gray-900 dark:border-gray-800 dark:text-gray-300"
            }`}
          >
            {t} {counts[t] ? `(${counts[t]})` : ""}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-500 dark:bg-gray-900 dark:border-gray-800 dark:text-gray-400">
          No {tab} requests.
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((r) => (
            <div key={r.id} className="bg-white border border-gray-200 rounded-xl p-3 sm:p-4 dark:bg-gray-900 dark:border-gray-800">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900 dark:text-white">{r.employeeName || "—"}</span>
                    {r.employeeCode && <span className="text-[11px] text-gray-400 font-mono">{r.employeeCode}</span>}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${r.type === "PL" ? "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300" : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"}`}>
                      {TYPE_LABEL[r.type]}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded capitalize ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                    {prettyDate(r.fromDate)}{r.toDate !== r.fromDate ? ` → ${prettyDate(r.toDate)}` : ""} · <strong>{r.days}</strong> working day{r.days === 1 ? "" : "s"}
                  </div>
                  {r.reason && <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 italic">“{r.reason}”</div>}
                  {r.status !== "pending" && r.decidedByName && (
                    <div className="text-[11px] text-gray-400 mt-0.5">{r.status} by {r.decidedByName}</div>
                  )}
                </div>
                {r.status === "pending" && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => decide(r, "approved")}
                      className="text-xs font-medium px-3 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
                    >
                      {busyId === r.id ? "…" : "Approve"}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => decide(r, "rejected")}
                      className="text-xs font-medium px-3 py-2 rounded-md bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300 disabled:opacity-40"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
