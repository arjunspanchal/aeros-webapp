"use client";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import {
  attendanceRankingSvg,
  statusBreakdownSvg,
  otLeaderboardSvg,
  dailyTrendSvg,
} from "./charts";

function monthLabel(mk) {
  const [y, m] = mk.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}
function shiftMonth(mk, delta) {
  const [y, m] = mk.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function bandColor(pct) {
  return pct >= 90 ? "#1D9E75" : pct >= 75 ? "#BA7517" : "#A32D2D";
}

const Svg = ({ markup }) => <div dangerouslySetInnerHTML={{ __html: markup }} />;

export default function PerformanceDashboard({ monthKey, stats, scopeLabel }) {
  const router = useRouter();
  const { perEmployee, company, trend } = stats;
  const label = monthLabel(monthKey);

  const charts = useMemo(
    () => ({
      ranking: attendanceRankingSvg(perEmployee),
      breakdown: statusBreakdownSvg(perEmployee),
      ot: otLeaderboardSvg(perEmployee),
      trend: dailyTrendSvg(trend),
    }),
    [perEmployee, trend],
  );

  const tableRows = useMemo(
    () => [...perEmployee].sort((a, b) => a.attendancePct - b.attendancePct),
    [perEmployee],
  );

  function go(mk) {
    router.push(`/hr/performance?month=${mk}`);
  }

  function exportPdf() {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(buildPrintHtml({ label, scopeLabel, company, charts, tableRows }));
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 350);
  }

  return (
    <div className="mt-6 space-y-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 justify-between bg-white border border-gray-200 rounded-xl p-3 dark:bg-gray-900 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <button onClick={() => go(shiftMonth(monthKey, -1))} className="px-2.5 py-1.5 text-sm rounded-md border border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800" aria-label="Previous month">←</button>
          <input
            type="month"
            value={monthKey}
            onChange={(e) => e.target.value && go(e.target.value)}
            className="text-sm px-2 py-1.5 rounded-md border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />
          <button onClick={() => go(shiftMonth(monthKey, 1))} className="px-2.5 py-1.5 text-sm rounded-md border border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800" aria-label="Next month">→</button>
          <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">{scopeLabel} · {company.headcount} staff</span>
        </div>
        <button
          onClick={exportPdf}
          className="text-sm font-medium px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
        >
          ⬇ Export PDF
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Stat label="Avg attendance" value={`${company.avgAttendancePct}%`} color={bandColor(company.avgAttendancePct)} />
        <Stat label="Total OT hours" value={`${company.totalOt}h`} />
        <Stat label="Absent days" value={company.totalAbsent} />
        <Stat label="Late arrivals" value={company.totalLate} />
        <Stat label="Employees" value={company.headcount} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Attendance % ranking">{charts.ranking}</ChartCard>
        <ChartCard title="Status breakdown per employee">{charts.breakdown}</ChartCard>
        <ChartCard title="Overtime leaderboard">{charts.ot}</ChartCard>
        <ChartCard title="Daily attendance trend">{charts.trend}</ChartCard>
      </div>

      {/* Detail table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden dark:bg-gray-900 dark:border-gray-800">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Per-employee detail · {label}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">Sorted by attendance, lowest first.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                <th className="px-4 py-2 font-medium">Employee</th>
                <th className="px-3 py-2 font-medium text-right">Working</th>
                <th className="px-3 py-2 font-medium text-right">Present</th>
                <th className="px-3 py-2 font-medium text-right">Late</th>
                <th className="px-3 py-2 font-medium text-right">Paid lv</th>
                <th className="px-3 py-2 font-medium text-right">Unpaid lv</th>
                <th className="px-3 py-2 font-medium text-right">Absent</th>
                <th className="px-3 py-2 font-medium text-right">OT h</th>
                <th className="px-3 py-2 font-medium text-right">Attendance</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((p) => (
                <tr key={p.id} className="border-b border-gray-50 dark:border-gray-800/60">
                  <td className="px-4 py-2">
                    <div className="font-medium text-gray-900 dark:text-white">{p.name}</div>
                    {p.designation && <div className="text-xs text-gray-400">{p.designation}</div>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">{p.workingDays}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">{p.present}{p.half ? `+${p.half}½` : ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">{p.late}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">{p.paidLeave}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">{p.unpaidLeave}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">{p.absent}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">{p.ot || 0}</td>
                  <td className="px-3 py-2 text-right">
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold text-white tabular-nums" style={{ background: bandColor(p.attendancePct) }}>
                      {p.attendancePct}%
                    </span>
                  </td>
                </tr>
              ))}
              {!tableRows.length && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">No employees in this view.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500">
        Attendance % = present-equivalent (half-day = ½) ÷ working days, capped at today for the current month. A working day with no punch counts as absent.
      </p>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 dark:bg-gray-900 dark:border-gray-800">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-2xl font-semibold mt-0.5" style={color ? { color } : undefined}>{value}</div>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 dark:border-gray-800">
      <h3 className="text-sm font-semibold text-gray-800 mb-3">{title}</h3>
      <Svg markup={children} />
    </div>
  );
}

// Standalone print document. Inline styles only — opens in a blank window.
function buildPrintHtml({ label, scopeLabel, company, charts, tableRows }) {
  const stamp = new Date().toLocaleString("en-IN");
  const card = (l, v, c) =>
    `<div class="card"><div class="cl">${l}</div><div class="cv" style="${c ? `color:${c}` : ""}">${v}</div></div>`;
  const section = (title, svg) => `<section><h2>${title}</h2>${svg}</section>`;
  const rows = tableRows
    .map(
      (p) => `<tr>
        <td>${escapeHtml(p.name)}${p.designation ? `<div class="sub">${escapeHtml(p.designation)}</div>` : ""}</td>
        <td class="n">${p.workingDays}</td><td class="n">${p.present}${p.half ? `+${p.half}½` : ""}</td>
        <td class="n">${p.late}</td><td class="n">${p.paidLeave}</td><td class="n">${p.unpaidLeave}</td>
        <td class="n">${p.absent}</td><td class="n">${p.ot || 0}</td>
        <td class="n"><b style="color:${bandColor(p.attendancePct)}">${p.attendancePct}%</b></td>
      </tr>`,
    )
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>Attendance Performance — ${label}</title>
  <style>
    *{box-sizing:border-box} body{font-family:system-ui,-apple-system,Arial,sans-serif;color:#2C2C2A;margin:0;padding:24px}
    .eyebrow{font:600 10px/1 ui-monospace,monospace;letter-spacing:2px;color:#888780;text-transform:uppercase}
    h1{font-size:20px;margin:4px 0 2px} .meta{font-size:12px;color:#6B6A66;margin-bottom:16px}
    .cards{display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap}
    .card{border:1px solid #E5E4DF;border-radius:8px;padding:8px 12px;min-width:120px}
    .cl{font-size:11px;color:#6B6A66} .cv{font-size:20px;font-weight:600;margin-top:2px}
    section{border:1px solid #E5E4DF;border-radius:8px;padding:12px 14px;margin-bottom:14px;page-break-inside:avoid}
    h2{font-size:13px;margin:0 0 8px}
    table{width:100%;border-collapse:collapse;font-size:11px}
    th,td{text-align:left;padding:5px 6px;border-bottom:1px solid #EFEEE9} th{color:#6B6A66;font-weight:600}
    td.n,th.n{text-align:right;font-variant-numeric:tabular-nums} .sub{font-size:9px;color:#888780}
    @page{size:A4;margin:12mm}
  </style></head><body>
  <div class="eyebrow">Aeros · Attendance Performance</div>
  <h1>${label}</h1>
  <div class="meta">${escapeHtml(scopeLabel)} · ${company.headcount} employees · generated ${escapeHtml(stamp)}</div>
  <div class="cards">
    ${card("Avg attendance", company.avgAttendancePct + "%", bandColor(company.avgAttendancePct))}
    ${card("Total OT hours", company.totalOt + "h")}
    ${card("Absent days", company.totalAbsent)}
    ${card("Late arrivals", company.totalLate)}
    ${card("Employees", company.headcount)}
  </div>
  ${section("Attendance % ranking", charts.ranking)}
  ${section("Status breakdown per employee", charts.breakdown)}
  ${section("Overtime leaderboard", charts.ot)}
  ${section("Daily attendance trend", charts.trend)}
  <section><h2>Per-employee detail</h2>
    <table><thead><tr><th>Employee</th><th class="n">Working</th><th class="n">Present</th><th class="n">Late</th><th class="n">Paid lv</th><th class="n">Unpaid lv</th><th class="n">Absent</th><th class="n">OT h</th><th class="n">Attendance</th></tr></thead>
    <tbody>${rows}</tbody></table>
  </section>
  </body></html>`;
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]),
  );
}
