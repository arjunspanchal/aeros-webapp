"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { inputCls } from "@/app/factoryos/_components/ui";
import { ATTENDANCE_WEIGHT, ATTENDANCE_LOP } from "@/lib/factoryos/constants";
import { daysInMonth, pad2 } from "@/lib/factoryos/hr";

const csvEscape = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const htmlEscape = (v) =>
  String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

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
  P:  "bg-emerald-500 text-white",
  A:  "bg-red-500 text-white",
  H:  "bg-amber-500 text-white",
  PL: "bg-sky-500 text-white",
  UL: "bg-orange-500 text-white",
  WO: "bg-gray-300 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
  HO: "bg-blue-200 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
};

export default function CalendarView({
  monthKey,
  employees,
  attendanceByEmployee,
  managerMap,
  holidayMap = {},
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

  // Download the monthly attendance register (muster) — per-employee day-by-day
  // status plus totals — as a CSV that opens in Excel. Reflects the current
  // search/scope (the employees shown above).
  // Shared per-employee register computation (used by both CSV + PDF export).
  // For each day: a marked status takes priority; otherwise the day is filled
  // as HO (holiday) or WO (weekly-off), else blank (unmarked working day).
  function registerRows() {
    return filtered.map((e) => {
      const byDate = Object.fromEntries((attendanceByEmployee[e.id] || []).map((r) => [r.date, r]));
      const cells = [];
      const cnt = { P: 0, H: 0, A: 0, PL: 0, UL: 0, WO: 0, HO: 0 };
      let ot = 0;
      let lop = 0;
      for (let d = 1; d <= days; d++) {
        const iso = `${monthKey}-${pad2(d)}`;
        const r = byDate[iso];
        let st = "";
        if (r) {
          st = r.status;
          ot += Number(r.otHours) || 0;
          lop += ATTENDANCE_LOP[r.status] ?? 0;
        } else if (holidayMap[iso]) {
          st = "HO";
        } else if ((e.weeklyOffDays || [0]).includes(new Date(y, m - 1, d).getDay())) {
          st = "WO";
        }
        if (st && cnt[st] !== undefined) cnt[st] += 1;
        cells.push(st);
      }
      return { e, cells, cnt, ot: Number(ot.toFixed(2)), lop: Number(lop.toFixed(2)), payable: Math.max(0, days - lop) };
    });
  }

  function exportRegister() {
    const dayCols = Array.from({ length: days }, (_, i) => String(i + 1));
    const header = [
      "Code", "Name", "Designation", ...dayCols,
      "Present", "Half-day", "Absent", "Paid Leave", "Unpaid Leave",
      "Week-off", "Holiday", "OT hrs", "LOP days", "Payable days",
    ];
    const lines = [header.map(csvEscape).join(",")];
    for (const { e, cells, cnt, ot, lop, payable } of registerRows()) {
      lines.push([
        e.employeeCode || "", e.name, e.designation || "",
        ...cells,
        cnt.P, cnt.H, cnt.A, cnt.PL, cnt.UL, cnt.WO, cnt.HO, ot, lop, payable,
      ].map(csvEscape).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-register-${monthKey}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Print-to-PDF: open a clean landscape register in a new window and trigger
  // the browser's print dialog (the user chooses "Save as PDF"). No library.
  function exportPdf() {
    const data = registerRows();
    const dayHead = Array.from({ length: days }, (_, i) => `<th>${i + 1}</th>`).join("");
    const body = data.map(({ e, cells, cnt, ot, lop, payable }) => {
      const dayCells = cells.map((c) => `<td class="${c}">${c}</td>`).join("");
      return `<tr><td class="code">${htmlEscape(e.employeeCode || "")}</td><td class="name">${htmlEscape(e.name)}</td>${dayCells}`
        + `<td class="t">${cnt.P}</td><td class="t">${cnt.H}</td><td class="t">${cnt.A}</td><td class="t">${cnt.PL}</td><td class="t">${cnt.UL}</td>`
        + `<td>${cnt.WO}</td><td>${cnt.HO}</td><td class="t">${ot}</td><td class="t">${lop}</td><td class="t">${payable}</td></tr>`;
    }).join("");
    const w = window.open("", "_blank");
    if (!w) { alert("Allow pop-ups for this site to export the PDF."); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Attendance Register — ${htmlEscape(monthLabel)}</title>
<style>
  @page { size: A4 landscape; margin: 8mm; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
  body { font-family: -apple-system, Arial, sans-serif; color:#111; margin:0; }
  h1 { font-size:13px; margin:0 0 1px; }
  .meta { font-size:8px; color:#666; margin-bottom:5px; }
  table { border-collapse:collapse; width:100%; font-size:6px; table-layout:fixed; }
  th, td { border:0.4px solid #ccc; padding:1px; text-align:center; }
  th { background:#eee; font-weight:600; }
  th.l { text-align:left; }
  td.code { text-align:left; white-space:nowrap; }
  td.name { text-align:left; white-space:normal; word-break:break-word; line-height:1.15; vertical-align:middle; }
  td.t { font-weight:bold; }
  thead { display:table-header-group; }
  .P{background:#d1fae5} .A{background:#fee2e2} .H{background:#fef3c7} .PL{background:#e0f2fe}
  .UL{background:#ffedd5} .WO{background:#f3f4f6;color:#999} .HO{background:#dbeafe}
  .legend{font-size:7px;color:#444;margin-top:5px}
</style></head><body>
  <h1>Attendance Register — ${htmlEscape(monthLabel)}</h1>
  <div class="meta">Aeros · ${data.length} employees · generated ${htmlEscape(new Date().toLocaleString("en-IN"))}</div>
  <table>
    <colgroup><col style="width:32px"><col style="width:120px">${Array.from({ length: days }, () => '<col style="width:15px">').join("")}${Array.from({ length: 11 }, () => '<col style="width:20px">').join("")}</colgroup>
    <thead><tr><th class="l">Code</th><th class="l">Name</th>${dayHead}<th>P</th><th>H</th><th>A</th><th>PL</th><th>UL</th><th>WO</th><th>HO</th><th>OT</th><th>LOP</th><th>Pay</th></tr></thead>
    <tbody>${body}</tbody>
  </table>
  <div class="legend">P Present · H Half-day · A Absent · PL Paid Leave · UL Unpaid Leave · WO Weekly-off · HO Holiday · LOP loss-of-pay days · Pay payable days</div>
  <script>window.onload=function(){window.print();}<\/script>
</body></html>`);
    w.document.close();
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
        <div className="flex items-center gap-2">
          {canToggleScope && (
            <button
              type="button"
              onClick={toggleScope}
              className="text-xs px-3 py-1.5 rounded-md border border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              {showingAll ? "View: all employees" : "View: my reports only"}
            </button>
          )}
          <span className="text-xs text-gray-400 hidden sm:inline">Export:</span>
          <button
            type="button"
            onClick={exportRegister}
            title="Download this month's attendance register as a CSV (opens in Excel)"
            className="text-xs px-3 py-1.5 rounded-md bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600"
          >
            ⬇ CSV
          </button>
          <button
            type="button"
            onClick={exportPdf}
            title="Open a print-ready register and save as PDF"
            className="text-xs px-3 py-1.5 rounded-md bg-red-600 text-white hover:bg-red-700"
          >
            ⬇ PDF
          </button>
        </div>
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
                      const dow = new Date(y, m - 1, d).getDay();
                      const holidayName = holidayMap[iso];
                      const isOff = (e.weeklyOffDays || [0]).includes(dow);
                      const hasOt = r && Number(r.otHours) > 0;
                      // Priority: explicit mark > holiday > weekly-off > plain unmarked.
                      let cls, label, title;
                      if (r) {
                        cls = STATUS_STYLE[r.status] || "bg-gray-200";
                        label = r.status;
                        title = `${iso} · ${r.status}${r.inTime ? ` · ${r.inTime}` : ""}${r.outTime ? `–${r.outTime}` : ""}${hasOt ? ` · ${r.otHours}h OT` : ""}`;
                      } else if (holidayName) {
                        cls = STATUS_STYLE.HO; label = ""; title = `${iso} · Holiday: ${holidayName}`;
                      } else if (isOff) {
                        cls = STATUS_STYLE.WO; label = ""; title = `${iso} · Weekly off`;
                      } else {
                        cls = "bg-gray-100 dark:bg-gray-800/60"; label = ""; title = `${iso} · not marked`;
                      }
                      return (
                        <td key={d} className="p-0.5 text-center">
                          <Link
                            href={`/hr/attendance?date=${iso}${showingAll ? "&scope=all" : ""}`}
                            className={`block w-6 h-6 leading-6 rounded text-[10px] font-bold mx-auto ${cls} ${
                              hasOt ? "ring-2 ring-emerald-300 dark:ring-emerald-600" : ""
                            }`}
                            title={title}
                          >
                            {label}
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
