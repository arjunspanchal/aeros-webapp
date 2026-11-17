"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ButtonGroup } from "@/app/factoryos/_components/ui";

// Dates arrive as "YYYY-MM-DD" strings. Everything here works on those keys
// so a job never slides a day because of the browser's timezone.
const pad = (n) => String(n).padStart(2, "0");
const keyOf = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayKey = () => {
  const t = new Date();
  return keyOf(t.getFullYear(), t.getMonth(), t.getDate());
};
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DONE_STAGES = new Set(["Dispatched", "Delivered"]);
const num = (n) => (typeof n === "number" ? n.toLocaleString("en-IN") : "—");

const MODES = [
  { value: "delivery", label: "Committed delivery" },
  { value: "dispatch", label: "Expected dispatch" },
];

// One chip on the calendar. `kind` = delivery | dispatch | schedule.
function buildEvents(jobs, mode) {
  const out = [];
  for (const j of jobs) {
    const done = DONE_STAGES.has(j.stage) || j.deliveryStatus === "cancelled";
    if (mode === "delivery") {
      if (j.estimatedDeliveryDate) out.push({ key: `${j.jobId}-d`, date: j.estimatedDeliveryDate.slice(0, 10), job: j, qty: j.balance || j.ordered, done, kind: "delivery" });
    } else {
      if (j.expectedDispatchDate) out.push({ key: `${j.jobId}-x`, date: j.expectedDispatchDate.slice(0, 10), job: j, qty: j.balance || j.ordered, done, kind: "dispatch" });
      for (const s of j.schedule || []) {
        if (!s.dispatchDate) continue;
        out.push({ key: `${j.jobId}-s-${s.id}`, date: s.dispatchDate.slice(0, 10), job: j, qty: s.qty, done: done || s.status === "dispatched", kind: "schedule" });
      }
    }
  }
  return out;
}

function chipCls(ev, today) {
  if (ev.done) return "bg-green-50 text-green-700 border-green-200 line-through decoration-green-400/60 dark:bg-green-900/20 dark:text-green-300 dark:border-green-900";
  if (ev.date < today) return "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-900";
  return "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-200 dark:border-blue-900";
}

function Chip({ ev, today, wide = false }) {
  const j = ev.job;
  const who = j.brand || j.clientName || "";
  return (
    <Link
      href={`/factoryos/manager/${j.jobId}`}
      title={`${j.jNumber || "Job"} · ${who} · ${j.item || j.sku} · ${num(ev.qty)} pcs · ${j.stage}${ev.kind === "schedule" ? " · dispatch-schedule row" : ""}`}
      className={`block border rounded px-1.5 py-0.5 text-[11px] leading-tight hover:brightness-95 ${chipCls(ev, today)} ${wide ? "text-xs py-1" : "truncate"}`}
    >
      {j.urgent && !ev.done && <span className="font-bold text-red-600 dark:text-red-400">! </span>}
      <span className="font-semibold">{j.jNumber || "Job"}</span>
      {" · "}{who}
      {wide && <> · {j.item || j.sku} · {num(ev.qty)} pcs · <span className="opacity-80">{j.stage}</span></>}
      {ev.kind === "schedule" && " ⟳"}
    </Link>
  );
}

export default function DeliveryCalendarClient({ jobs }) {
  const today = todayKey();
  const [mode, setMode] = useState("delivery");
  const [clientFilter, setClientFilter] = useState("all");
  const [showDone, setShowDone] = useState(true);
  const [cursor, setCursor] = useState(() => {
    const t = new Date();
    return { y: t.getFullYear(), m: t.getMonth() };
  });
  const [selected, setSelected] = useState(null); // day key for the detail list

  const clientNames = useMemo(
    () => Array.from(new Set(jobs.map((j) => j.clientName).filter(Boolean))).sort(),
    [jobs],
  );
  const scoped = useMemo(
    () => (clientFilter === "all" ? jobs : jobs.filter((j) => j.clientName === clientFilter)),
    [jobs, clientFilter],
  );

  const events = useMemo(
    () => buildEvents(scoped, mode).filter((e) => showDone || !e.done),
    [scoped, mode, showDone],
  );
  const byDay = useMemo(() => {
    const m = new Map();
    for (const e of events) {
      if (!m.has(e.date)) m.set(e.date, []);
      m.get(e.date).push(e);
    }
    for (const list of m.values()) list.sort((a, b) => Number(a.done) - Number(b.done) || Number(a.job.jNumber || 0) - Number(b.job.jNumber || 0));
    return m;
  }, [events]);

  // Open jobs with no date in the current mode — the gap to fill.
  const undated = useMemo(
    () =>
      scoped.filter((j) => {
        if (DONE_STAGES.has(j.stage) || j.deliveryStatus === "cancelled") return false;
        if (mode === "delivery") return !j.estimatedDeliveryDate;
        return !j.expectedDispatchDate && !(j.schedule || []).length;
      }),
    [scoped, mode],
  );
  const overdue = events.filter((e) => !e.done && e.date < today);

  // Month grid, Monday first, padded to whole weeks.
  const { y, m } = cursor;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const lead = (new Date(y, m, 1).getDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(keyOf(y, m, d));
  while (cells.length % 7) cells.push(null);

  const monthPrefix = `${y}-${pad(m + 1)}-`;
  const monthEvents = events.filter((e) => e.date.startsWith(monthPrefix));
  const monthDays = Array.from(byDay.keys()).filter((k) => k.startsWith(monthPrefix)).sort();

  const shift = (delta) => {
    setSelected(null);
    setCursor(({ y, m }) => {
      const d = new Date(y, m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };
  const goToday = () => {
    const t = new Date();
    setSelected(null);
    setCursor({ y: t.getFullYear(), m: t.getMonth() });
  };

  const selectedEvents = selected ? byDay.get(selected) || [] : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Delivery Calendar</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {mode === "delivery"
              ? "Jobs on the delivery date committed to the customer."
              : "Jobs on their expected dispatch date, plus dispatch-schedule rows (⟳)."}{" "}
            <Link href="/factoryos/delivery" className="text-blue-600 hover:underline dark:text-blue-400">Delivery Plan →</Link>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ButtonGroup value={mode} onChange={(v) => { setMode(v); setSelected(null); }} options={MODES} />
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="max-w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
          >
            <option value="all">All customers</option>
            {clientNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
            Show dispatched
          </label>
        </div>
      </div>

      {/* Month header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => shift(-1)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800" aria-label="Previous month">‹</button>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white w-44 text-center">{MONTHS[m]} {y}</h2>
          <button onClick={() => shift(1)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800" aria-label="Next month">›</button>
          <button onClick={goToday} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">Today</button>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-gray-600 dark:text-gray-300">
          <span>{monthEvents.length} this month</span>
          <span className="text-red-600 dark:text-red-400">{overdue.length} overdue (all months)</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-200 dark:bg-blue-800" />Upcoming</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-200 dark:bg-red-800" />Past date, not dispatched</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-200 dark:bg-green-800" />Dispatched</span>
        </div>
      </div>

      {/* Grid — tablet and up */}
      <div className="hidden sm:block bg-white border border-gray-200 rounded-xl overflow-hidden dark:bg-gray-900 dark:border-gray-800">
        <div className="grid grid-cols-7 bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-500 dark:text-gray-400">
          {WEEKDAYS.map((w) => <div key={w} className="px-2 py-1.5 font-medium">{w}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((k, i) => {
            if (!k) return <div key={`pad-${i}`} className="min-h-[96px] border-t border-l border-gray-100 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-900/40" />;
            const list = byDay.get(k) || [];
            const isToday = k === today;
            const isSel = k === selected;
            return (
              <div
                key={k}
                onClick={() => setSelected(isSel ? null : k)}
                className={`min-h-[96px] border-t border-l border-gray-100 dark:border-gray-800 p-1 cursor-pointer ${isSel ? "bg-blue-50/60 dark:bg-blue-900/20" : "hover:bg-gray-50 dark:hover:bg-gray-800/40"}`}
              >
                <div className={`text-xs mb-1 ${isToday ? "inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white font-semibold" : "text-gray-500 dark:text-gray-400"}`}>
                  {Number(k.slice(8))}
                </div>
                <div className="space-y-0.5">
                  {list.slice(0, 3).map((ev) => <Chip key={ev.key} ev={ev} today={today} />)}
                  {list.length > 3 && <div className="text-[11px] text-gray-500 dark:text-gray-400 px-1">+{list.length - 3} more</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected day detail (grid view) */}
      {selected && (
        <div className="hidden sm:block bg-white border border-gray-200 rounded-xl p-4 dark:bg-gray-900 dark:border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              {Number(selected.slice(8))} {MONTHS[Number(selected.slice(5, 7)) - 1]} — {selectedEvents.length} job{selectedEvents.length === 1 ? "" : "s"}
            </h3>
            <button onClick={() => setSelected(null)} className="text-xs text-gray-500 hover:underline">Close</button>
          </div>
          {selectedEvents.length ? (
            <div className="space-y-1">{selectedEvents.map((ev) => <Chip key={ev.key} ev={ev} today={today} wide />)}</div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">Nothing committed on this day.</p>
          )}
        </div>
      )}

      {/* Agenda — phones */}
      <div className="sm:hidden space-y-3">
        {monthDays.length ? (
          monthDays.map((k) => (
            <div key={k} className="bg-white border border-gray-200 rounded-xl p-3 dark:bg-gray-900 dark:border-gray-800">
              <div className={`text-sm font-semibold mb-1.5 ${k === today ? "text-blue-600 dark:text-blue-400" : "text-gray-900 dark:text-white"}`}>
                {WEEKDAYS[(new Date(y, m, Number(k.slice(8))).getDay() + 6) % 7]} {Number(k.slice(8))} {MONTHS[m].slice(0, 3)}
                {k === today && " · Today"}
              </div>
              <div className="space-y-1">{byDay.get(k).map((ev) => <Chip key={ev.key} ev={ev} today={today} wide />)}</div>
            </div>
          ))
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">Nothing committed in {MONTHS[m]}.</p>
        )}
      </div>

      {/* Open jobs with no date */}
      {undated.length > 0 && (
        <details className="bg-white border border-gray-200 rounded-xl p-4 dark:bg-gray-900 dark:border-gray-800">
          <summary className="text-sm font-medium text-gray-900 dark:text-white cursor-pointer">
            {undated.length} open job{undated.length === 1 ? "" : "s"} with no {mode === "delivery" ? "committed delivery" : "dispatch"} date
          </summary>
          <div className="mt-3 space-y-1">
            {undated.map((j) => (
              <Link key={j.jobId} href={`/factoryos/manager/${j.jobId}`} className="block text-sm text-gray-700 hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400">
                <span className="font-semibold">{j.jNumber || "Job"}</span> · {j.brand || j.clientName} · {j.item || j.sku} · {num(j.balance || j.ordered)} pcs · <span className="text-gray-500">{j.stage}</span>
              </Link>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
