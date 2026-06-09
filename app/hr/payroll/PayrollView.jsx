"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { inputCls } from "@/app/factoryos/_components/ui";
import { formatINR, pad2 } from "@/lib/factoryos/hr";

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

export default function PayrollView({ monthKey, rows, managerMap, canToggleScope, showingAll }) {
  const router = useRouter();
  const [q, setQ] = useState("");

  const [y, m] = monthKey.split("-").map(Number);
  const monthLabel = new Date(y, m - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(({ employee }) =>
      employee.name.toLowerCase().includes(term) ||
      (managerMap[employee.managerId]?.name || "").toLowerCase().includes(term),
    );
  }, [rows, q, managerMap]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, r) => ({
        basePay: acc.basePay + r.payroll.basePay,
        otPay: acc.otPay + r.payroll.otPay,
        total: acc.total + r.payroll.total,
        otHours: acc.otHours + r.payroll.otHours,
      }),
      { basePay: 0, otPay: 0, total: 0, otHours: 0 },
    );
  }, [filtered]);

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

  function exportCsv() {
    const cols = ["Employee", "Designation", "Manager", "Monthly Salary", "Present Days", "OT Hours", "OT Rate/hr", "Base Pay", "OT Pay", "Total"];
    const escape = (v) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [cols.join(",")];
    for (const { employee, payroll } of filtered) {
      lines.push([
        employee.name,
        employee.designation,
        managerMap[employee.managerId]?.name || "",
        employee.monthlySalary,
        payroll.presentDays,
        payroll.otHours,
        payroll.otRate,
        payroll.basePay,
        payroll.otPay,
        payroll.total,
      ].map(escape).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll-${monthKey}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between bg-white border border-gray-200 rounded-xl p-3 dark:bg-gray-900 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => go(prevMonth(monthKey))} className="px-2 py-1 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-800">←</button>
          <div className="font-semibold text-gray-900 dark:text-white min-w-[160px] text-center">{monthLabel}</div>
          <button type="button" onClick={() => go(nextMonth(monthKey))} className="px-2 py-1 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-800">→</button>
          <input className={`${inputCls} ml-2 w-48`} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          {canToggleScope && (
            <button
              type="button"
              onClick={toggleScope}
              className="text-xs px-3 py-1.5 rounded-md border border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              {showingAll ? "View: all" : "View: mine"}
            </button>
          )}
          <button
            type="button"
            onClick={exportCsv}
            className="text-xs px-3 py-1.5 rounded-md bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Employees" value={filtered.length} />
        <SummaryCard label="OT hours" value={Number(totals.otHours.toFixed(2))} />
        <SummaryCard label="OT pay" value={formatINR(totals.otPay)} />
        <SummaryCard label="Total payroll" value={formatINR(totals.total)} strong />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden dark:bg-gray-900 dark:border-gray-800">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase dark:bg-gray-800/50 dark:text-gray-400">
              <tr>
                <th className="text-left px-4 py-2 font-medium whitespace-nowrap">Employee</th>
                <th className="text-left px-4 py-2 font-medium whitespace-nowrap">Manager</th>
                <th className="text-right px-4 py-2 font-medium whitespace-nowrap">Salary</th>
                <th className="text-right px-4 py-2 font-medium whitespace-nowrap">Days (P)</th>
                <th className="text-right px-4 py-2 font-medium whitespace-nowrap">OT hrs</th>
                <th className="text-right px-4 py-2 font-medium whitespace-nowrap">Base pay</th>
                <th className="text-right px-4 py-2 font-medium whitespace-nowrap">OT pay</th>
                <th className="text-right px-4 py-2 font-medium whitespace-nowrap">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map(({ employee, payroll }) => (
                <tr key={employee.id}>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <div className="font-medium text-gray-900 dark:text-white">{employee.name}</div>
                    {employee.designation && <div className="text-xs text-gray-500 dark:text-gray-400">{employee.designation}</div>}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">
                    {managerMap[employee.managerId]?.name || "—"}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-sm whitespace-nowrap">{formatINR(employee.monthlySalary)}</td>
                  <td className="px-4 py-2 text-right font-mono text-sm text-emerald-700 dark:text-emerald-300 whitespace-nowrap">
                    {payroll.presentDays}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-sm whitespace-nowrap">
                    {payroll.otHours > 0 ? (
                      <span>
                        {payroll.otHours}
                        <span className="ml-1 text-[10px] text-gray-400">@ ₹{payroll.otRate.toFixed(0)}</span>
                      </span>
                    ) : employee.otEligible ? (
                      <span className="text-gray-400">0</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-sm whitespace-nowrap">{formatINR(payroll.basePay)}</td>
                  <td className="px-4 py-2 text-right font-mono text-sm whitespace-nowrap">
                    {payroll.otPay > 0 ? formatINR(payroll.otPay) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                    {formatINR(payroll.total)}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-sm text-gray-500 py-8 dark:text-gray-400">
                    No employees for this view.
                  </td>
                </tr>
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="bg-gray-50 dark:bg-gray-800/50 text-sm font-semibold">
                <tr>
                  <td colSpan={5} className="px-4 py-2 text-right text-gray-600 dark:text-gray-300">Totals</td>
                  <td className="px-4 py-2 text-right font-mono text-gray-900 dark:text-white">{formatINR(totals.basePay)}</td>
                  <td className="px-4 py-2 text-right font-mono text-gray-900 dark:text-white">{formatINR(totals.otPay)}</td>
                  <td className="px-4 py-2 text-right font-mono text-gray-900 dark:text-white">{formatINR(totals.total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, strong }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 dark:bg-gray-900 dark:border-gray-800">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`mt-1 ${strong ? "text-xl font-bold text-gray-900 dark:text-white" : "text-lg text-gray-900 dark:text-white"}`}>
        {value}
      </div>
    </div>
  );
}
