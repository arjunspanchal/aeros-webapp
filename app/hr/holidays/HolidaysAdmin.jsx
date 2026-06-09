"use client";
import { useMemo, useState } from "react";
import { inputCls, labelCls } from "@/app/factoryos/_components/ui";

function prettyDate(ymd) {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

export default function HolidaysAdmin({ initialHolidays }) {
  const [holidays, setHolidays] = useState(initialHolidays);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const grouped = useMemo(() => {
    const byYear = {};
    for (const h of holidays) {
      const y = h.date.slice(0, 4);
      (byYear[y] ||= []).push(h);
    }
    return Object.entries(byYear).sort(([a], [b]) => a.localeCompare(b));
  }, [holidays]);

  async function add(e) {
    e.preventDefault();
    setErr(""); setBusy(true);
    const res = await fetch("/api/hr/holidays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, name }),
    });
    setBusy(false);
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error || "Failed"); return; }
    const { holiday } = await res.json();
    setHolidays((prev) => [...prev.filter((h) => h.date !== holiday.date), holiday].sort((a, b) => a.date.localeCompare(b.date)));
    setDate(""); setName("");
  }

  async function remove(h) {
    if (!confirm(`Remove holiday "${h.name}" on ${prettyDate(h.date)}?`)) return;
    const res = await fetch(`/api/hr/holidays?id=${encodeURIComponent(h.id)}`, { method: "DELETE" });
    if (!res.ok) { alert((await res.json().catch(() => ({}))).error || "Failed"); return; }
    setHolidays((prev) => prev.filter((x) => x.id !== h.id));
  }

  return (
    <div className="mt-6 space-y-5">
      <form onSubmit={add} className="bg-white border border-gray-200 rounded-xl p-4 dark:bg-gray-900 dark:border-gray-800">
        <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-3 items-end">
          <div>
            <label className={labelCls}>Date</label>
            <input type="date" className={`${inputCls} text-base`} value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <label className={labelCls}>Holiday name</label>
            <input className={`${inputCls} text-base`} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Diwali, Republic Day" required />
          </div>
          <button type="submit" disabled={busy} className="h-[42px] px-4 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
            {busy ? "Adding…" : "+ Add holiday"}
          </button>
        </div>
        {err && <p className="mt-2 text-xs text-red-600">⚠️ {err}</p>}
      </form>

      {holidays.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-500 dark:bg-gray-900 dark:border-gray-800 dark:text-gray-400">
          No holidays added yet. Add your company&apos;s holiday calendar above.
        </div>
      ) : (
        grouped.map(([year, list]) => (
          <div key={year} className="bg-white border border-gray-200 rounded-xl overflow-hidden dark:bg-gray-900 dark:border-gray-800">
            <div className="px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase dark:bg-gray-800/50 dark:text-gray-400">
              {year} · {list.length} holiday{list.length > 1 ? "s" : ""}
            </div>
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {list.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{h.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{prettyDate(h.date)}</div>
                  </div>
                  <button onClick={() => remove(h)} className="shrink-0 text-xs px-3 py-1 rounded-md bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300 font-medium">
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
