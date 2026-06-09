"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { inputCls } from "@/app/factoryos/_components/ui";
import { ATTENDANCE_WEIGHT } from "@/lib/factoryos/constants";
import { daysInMonth, pad2 } from "@/lib/factoryos/hr";

function prevMonth(mk) {
  const [y, m] = mk.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}
function nextMonth(mk) {
  const [y, m] = mk.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

const STATUS_STYLE = {
  P: "bg-emerald-500 text-white",
  A: "bg-red-500 text-white",
  H: "bg-amber-500 text-white",
};

export default function CalendarView({
  monthKey,
  employees,
  attendanceByEmployee,
  managerMap,
  canToggleScope,
  showingAll,
}) {
  const router = useRouter();
  const [q, setQ] = useState("");

  const days = daysInMonth(monthKey);
  const [y, m] = monthKey.split("-").map(Number);
  const monthLabel = new Date(y, m - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return employees;
    return employees.filter((e) => {
      return (
        e.name.toLowerCase().includes(term) ||
        (managerMap[e.managerId]?.name || "").toLowerCase().includes(term)
      );
    });
  }, [employees, q, managerMap]);

  function go(monthNext) {
    const url = new URL(window.location.href);
    url.searchParams.set("month", monthNext);
    if (showingAll) url.searchParams.set("scope", "all");
    router.push(url.pathname + "?" + url.searchParams.toString());
  }

  function toggleScope() {
    const url = new URL(window.location.href);
    if (showingAll) url.searchParams.delete("scope");
    else url.searchParams.set("scope", "all");
    router.push(url.pathname + "?" + url.searchParams.toString());
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-gray-200 rounded-xl p-3 dark:bg-gray-900 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => go(prevMonth(monthKey))} className="px-2 py-1 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-800">←</button>
          <div className="font-semibold text-gray-900 dark:text-white min-w-[160px] text-center">{monthLabel}</div>
          <button type="button" onClick={() => go(nextMonth(monthKey))} className="px-2 py-1 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-800">→</button>
          <input
            className={`${inputCls} ml-2 w-48`}
            placeholder="Search employee…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {canToggleScope && (
          <button
            type="button"
            onClick={toggleScope}
            className="text-xs px-3 py-1.5 rounded-md border border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            {showingAll ? "View: all employees" : "View: my reports only"}
          </button>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden dark:bg-gray-900 dark:border-gray-800">
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-800/80 text-left px-3 py-2 font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">
                  Employee
                </th>
                {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
                  const dow = new Date(y, m - 1, d).getDay();
                  const isSun = dow === 0;
                  return (
                    <th
                      key={d}
                      className={`px-1 py-2 font-medium text-center min-w-[26px] ${
                        isSun ? "bg-gray-100 dark:bg-gray-800 text-gray-400" : "text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      {d}
                    </th>
                  );
                })}
                <th className="px-3 py-2 font-medium text-right text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">P</th>
                <th className="px-3 py-2 font-medium text-right text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">A</th>
                <th className="px-3 py-2 font-medium text-right text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">OT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map((e) => {
                const rows = attendanceByEmployee[e.id] || [];
                const byDate = Object.fromEntries(rows.map((r) => [r.date, r]));
                let present = 0;
                let absent = 0;
                let ot = 0;
                rows.forEach((r) => {
                  const w = ATTENDANCE_WEIGHT[r.status] ?? 0;
                  present += w;
                  if (r.status === "A") absent += 1;
                  ot += Number(r.otHours) || 0;
                });
                return (
                  <tr key={e.id}>
                    <td className="sticky left-0 z-10 bg-white dark:bg-gray-900 px-3 py-1.5 whitespace-nowrap">
                      <div className="font-medium text-gray-900 dark:text-white">{e.name}</div>
                      <div className="text-[10px] text-gray-500 dark:text-gray-400">
                        {managerMap[e.managerId]?.name || "—"}
                      </div>
                    </td>
                    {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
                      const iso = `${monthKey}-${pad2(d)}`;
                      const r = byDate[iso];
                      const cls = r ? STATUS_STYLE[r.status] || "bg-gray-200" : "bg-gray-100 dark:bg-gray-800/60";
                      const hasOt = r && Number(r.otHours) > 0;
                      return (
                        <td key={d} className="p-0.5 text-center">
                          <Link
                            href={`/hr/attendance?date=${iso}${showingAll ? "&scope=all" : ""}`}
                            className={`block w-6 h-6 leading-6 rounded text-[10px] font-bold mx-auto ${cls} ${
                              hasOt ? "ring-2 ring-emerald-300 dark:ring-emerald-600" : ""
                            }`}
                            title={
                              r
                                ? `${iso} · ${r.status}${r.inTime ? ` · ${r.inTime}` : ""}${r.outTime ? `–${r.outTime}` : ""}${hasOt ? ` · ${r.otHours}h OT` : ""}`
                                : `${iso} · not marked`
                            }
                          >
                            {r ? r.status : ""}
                          </Link>
                        </td>
                      );
                    })}
                    <td className="px-3 py-1.5 text-right font-mono text-sm text-emerald-700 dark:text-emerald-300 whitespace-nowrap">
                      {Number(present.toFixed(2))}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-sm text-red-600 dark:text-red-400 whitespace-nowrap">
                      {absent}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-sm text-gray-900 dark:text-white whitespace-nowrap">
                      {Number(ot.toFixed(2))}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={days + 4} className="text-center text-sm text-gray-500 py-8 dark:text-gray-400">
                    No employees to show.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
