"use client";
import { LINES, LINE_KEYS, LINE_LABEL, lineForCategory, describeLines } from "@/lib/factoryos/lines";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { StageBadge, formatDate, inputCls } from "@/app/factoryos/_components/ui";
import { STAGES } from "@/lib/factoryos/constants";
import { nextStage, canMoveTo } from "@/lib/factoryos/steps";
import QuickStepSheet from "./QuickStepSheet";

// Deep-link support: KPI tiles on /factoryos/admin land here with a query
// string that pre-populates the filters. Validated against the canonical
// STAGES list so a typo in a URL doesn't show "no jobs match" with no clue
// why. `due=overdue` swaps in a date-comparison filter computed below.
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Printer late = printing due passed, job still at or before Under Printing,
// and the printer hasn't marked it printed on /printer.
// Finished jobs — not work any more.
const DONE = new Set(["Dispatched", "Delivered"]);
// Late = ready date passed and the goods are not ready yet.
function isLate(j, today) {
  return !!(j.productionDueDate && j.productionDueDate.slice(0, 10) < today && !["Ready for Dispatch", "Dispatched", "Delivered"].includes(j.stage));
}

function isPrinterLate(j, today) {
  return !!j.printingDueDate && j.printingDueDate.slice(0, 10) < today
    && ["RM Pending", "Coating", "Under Printing"].includes(j.stage)
    && !["printing_completed", "dispatched"].includes(j.vendorStatus || "");
}

function LinePill({ active, onClick, label, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm border whitespace-nowrap transition-colors ${
        active
          ? "bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900 dark:border-white"
          : "bg-white text-gray-700 border-gray-200 hover:border-gray-400 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-700"}`}
    >
      {label} <span className={active ? "opacity-75" : "text-gray-400"}>· {count}</span>
    </button>
  );
}

// Sortable columns of the jobs table, in display order. `value` is what a
// row sorts by; "" means "nothing here" and always sorts last.
const SORT_COLUMNS = {
  jNumber: { label: "J#", value: (j) => String(j.jNumber || "") },
  customer: { label: "Customer / Brand", value: (j, clientMap) => `${j.clientIds.map((c) => clientMap[c]?.name || "").join(" ")} ${j.brand || ""}`.trim() },
  item: { label: "Item", value: (j) => String(j.item || "") },
  qty: { label: "Qty", right: true, value: (j) => (typeof j.qty === "number" ? j.qty : "") },
  printer: { label: "Printer", value: (j) => String(j.printingVendor || "") },
  // By the order a job moves through the factory, not A to Z.
  stage: { label: "Stage", value: (j) => (STAGES.indexOf(j.stage) >= 0 ? STAGES.indexOf(j.stage) : "") },
  internal: { label: "Internal", value: (j) => String(j.internalStatus || "") },
  ready: { label: "Ready date", value: (j) => String(j.productionDueDate || "").slice(0, 10) },
};

export default function ManagerJobsView({ jobs, clientMap, userMap, role, myLines = null, meId = null }) {
  const searchParams = useSearchParams();
  const initialStage  = (() => {
    const s = searchParams.get("stage");
    // Default = open work only (Arjun, 18-Nov-2026: dispatched/delivered jobs
    // were burying Rahul's live jobs). "all" still shows everything.
    return s && (STAGES.includes(s) || s === "all") ? s : "open";
  })();
  const initialUrgent = searchParams.get("urgent") === "1";
  const initialDue    = searchParams.get("due") === "overdue" ? "overdue" : "all";

  // "mine" = the user's own production lines (default when they have any),
  // "all", or a single line key. URL ?line= overrides so links can deep-link.
  const initialLine = (() => {
    const l = searchParams.get("line");
    if (l === "all" || l === "mine" || LINE_KEYS.has(l)) return l;
    return myLines?.length ? "mine" : "all";
  })();
  const [line, setLine] = useState(initialLine);
  // Which date this screen manages by. Factory roles run the floor to the
  // production due date; account managers manage the customer promise
  // (expected dispatch).
  const factoryView = role !== "account_manager" && role !== "customer";
  const [lateOnly, setLateOnly] = useState(searchParams.get("late") === "printer");
  const [q, setQ] = useState("");
  const [stage, setStage] = useState(initialStage);
  const [clientId, setClientId] = useState("all");
  const [urgentOnly, setUrgentOnly] = useState(initialUrgent);
  // "My jobs" = jobs where I am the sales manager (sales see every job).
  const [mineOnly, setMineOnly] = useState(false);
  const myCount = meId ? jobs.filter((j) => j.customerManagerId === meId).length : 0;
  const [dueFilter, setDueFilter] = useState(initialDue);
  const today = useMemo(() => todayIso(), []);
  // Column sort. key null = the default work order (urgent, late, ready date).
  // Click a heading: A→Z / low→high; again: the other way; a third time: back
  // to the default order.
  const [sort, setSort] = useState({ key: null, dir: "asc" });
  // "Next step" from the list: which job's step sheet is open.
  const router = useRouter();
  const [stepJob, setStepJob] = useState(null);
  // The next stage for a job, if this person is the one who moves it there.
  const myNext = (j) => {
    const to = nextStage(j);
    return to && canMoveTo(role, to) ? to : null;
  };
  const toggleSort = (key) => setSort((cur) => (
    cur.key !== key ? { key, dir: "asc" } : cur.dir === "asc" ? { key, dir: "desc" } : { key: null, dir: "asc" }
  ));

  const clients = useMemo(() => {
    const seen = new Set();
    const list = [];
    for (const j of jobs) for (const cid of j.clientIds) {
      if (!seen.has(cid) && clientMap[cid]) { seen.add(cid); list.push(clientMap[cid]); }
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [jobs, clientMap]);

  // The line pill is the outer filter: every tile and count below it
  // (stages, urgent, printer late, "total") is counted within that line, so
  // Sachin never clicks "In Conversion · 3" and gets an empty list because
  // those three are cups (06-Oct-2026).
  const lineJobs = useMemo(() => {
    if (line === "all") return jobs;
    return jobs.filter((j) => {
      const jl = lineForCategory(j.category, j.item);
      return line === "mine" ? (myLines || []).includes(jl) : jl === line;
    });
  }, [jobs, line, myLines]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return lineJobs.filter((j) => {
      if (urgentOnly && (!j.urgent || DONE.has(j.stage))) return false;
      if (mineOnly && j.customerManagerId !== meId) return false;
      if (lateOnly && !isPrinterLate(j, today)) return false;
      if (stage === "open" && DONE.has(j.stage)) return false;
      if (stage !== "all" && stage !== "open" && j.stage !== stage) return false;
      if (clientId !== "all" && !j.clientIds.includes(clientId)) return false;
      // Overdue dispatch: scheduled for before today AND not already in the
      // post-dispatch stages. Delivered and Dispatched jobs aren't "overdue"
      // even if their date is in the past.
      if (dueFilter === "overdue") {
        // One date for everyone: late = not ready by the production ready date.
        if (!j.productionDueDate || j.productionDueDate >= today) return false;
        if (["Ready for Dispatch", "Dispatched", "Delivered"].includes(j.stage)) return false;
      }
      if (!term) return true;
      const clientName = j.clientIds.map((c) => clientMap[c]?.name || "").join(" ");
      const hay = `${j.jNumber} ${j.brand} ${j.item} ${j.city} ${j.printingVendor} ${j.poNumber} ${j.zohoSoNo || ""} ${clientName} ${j.internalStatus}`.toLowerCase();
      return hay.includes(term);
    })
    .sort((a, b) => {
      // A column heading was clicked: sort by that column. Rows with nothing
      // in that column always go last, whichever way the sort runs.
      if (sort.key) {
        const col = SORT_COLUMNS[sort.key];
        const va = col.value(a, clientMap), vb = col.value(b, clientMap);
        const ea = va === "" || va == null, eb = vb === "" || vb == null;
        if (ea !== eb) return ea ? 1 : -1;
        const cmp = typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: "base" });
        if (cmp !== 0) return sort.dir === "asc" ? cmp : -cmp;
        return String(b.jNumber).localeCompare(String(a.jNumber), undefined, { numeric: true });
      }
      // Default work order: open urgent jobs first, then late (ready date
      // passed, not ready yet), then by ready date (soonest first); undated
      // last; finished jobs at the bottom, newest first.
      const rank = (j) => (DONE.has(j.stage) ? 4 : j.urgent ? 0 : isLate(j, today) ? 1 : j.productionDueDate ? 2 : 3);
      const ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra - rb;
      if (ra === 4) return String(b.jNumber).localeCompare(String(a.jNumber), undefined, { numeric: true });
      const da = a.productionDueDate || "9999", db = b.productionDueDate || "9999";
      return da < db ? -1 : da > db ? 1 : 0;
    });
  }, [lineJobs, q, stage, clientId, urgentOnly, lateOnly, dueFilter, today, clientMap, factoryView, sort, mineOnly, meId]);
  const printerLateCount = useMemo(() => lineJobs.filter((j) => isPrinterLate(j, today)).length, [lineJobs, today]);

  // Urgent only counts open jobs — a dispatched job is no longer urgent.
  const urgentCount = useMemo(() => lineJobs.filter((j) => j.urgent && !DONE.has(j.stage)).length, [lineJobs]);
  const openCount = useMemo(() => lineJobs.filter((j) => !DONE.has(j.stage)).length, [lineJobs]);

  // Open-job count per line for the pills (closed jobs aren't work).
  const lineCount = useMemo(() => {
    const c = { mine: 0, all: 0 };
    for (const l of LINES) c[l.key] = 0;
    for (const j of jobs) {
      if (j.stage === "Dispatched" || j.stage === "Delivered") continue;
      c.all++;
      const jl = lineForCategory(j.category, j.item);
      if (jl) c[jl]++;
      if (jl && (myLines || []).includes(jl)) c.mine++;
    }
    return c;
  }, [jobs, myLines]);

  const stageCount = useMemo(() => {
    const c = Object.fromEntries(STAGES.map((s) => [s, 0]));
    for (const j of lineJobs) if (c[j.stage] !== undefined) c[j.stage]++;
    return c;
  }, [lineJobs]);
  // Same stage across every line — so the empty state can say where the
  // jobs actually are.
  const stageCountAll = useMemo(() => (stage === "all" || stage === "open" ? 0 : jobs.filter((j) => j.stage === stage).length), [jobs, stage]);

  return (
    <div>
      <div className="flex items-start justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Jobs</h1>
          <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
            {role === "account_manager" ? (mineOnly ? "My jobs" : "All jobs") : line === "mine" ? describeLines(myLines) : line === "all" ? "All jobs" : LINE_LABEL[line]} · {filtered.length} shown · {openCount} open · {lineJobs.length - openCount} done
            {sort.key && (
              <>
                {" · sorted by "}{SORT_COLUMNS[sort.key].label.toLowerCase()}{" "}
                <button type="button" onClick={() => setSort({ key: null, dir: "asc" })} className="text-blue-600 hover:underline dark:text-blue-400">back to default order</button>
              </>
            )}
          </p>
        </div>
        {/* Mirrors the create-job allow-list: admin / factory manager only. */}
        {(role === "admin" || role === "factory_manager") && (
          <Link
            href="/factoryos/admin/jobs/new"
            className="shrink-0 px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            + New job
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {myLines?.length > 0 && (
          <LinePill active={line === "mine"} onClick={() => setLine("mine")} label={`My lines · ${describeLines(myLines)}`} count={lineCount.mine} />
        )}
        <LinePill active={line === "all"} onClick={() => setLine("all")} label="All lines" count={lineCount.all} />
        {LINES.map((l) => (
          <LinePill key={l.key} active={line === l.key} onClick={() => setLine(l.key)} label={l.label} count={lineCount[l.key]} />
        ))}
      </div>

      {/* Phones: one row you swipe sideways, so the jobs start on the first screen. */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar mb-5 [&>button]:shrink-0 [&>button]:min-w-[112px] sm:grid sm:grid-cols-6 sm:overflow-visible sm:[&>button]:min-w-0">
        <button
          onClick={() => setStage("open")}
          className={`p-3 rounded-lg text-left transition-colors ${stage === "open" ? "bg-blue-600 text-white" : "bg-white border border-gray-200 hover:border-gray-300 dark:bg-gray-900 dark:border-gray-800"}`}
        >
          <div className="text-xs opacity-75">Open</div>
          <div className="text-lg font-bold">{openCount}</div>
        </button>
        <button
          onClick={() => setStage("all")}
          className={`p-3 rounded-lg text-left transition-colors ${stage === "all" ? "bg-blue-600 text-white" : "bg-white border border-gray-200 hover:border-gray-300 dark:bg-gray-900 dark:border-gray-800"}`}
        >
          <div className="text-xs opacity-75">All (incl. done)</div>
          <div className="text-lg font-bold">{lineJobs.length}</div>
        </button>
        {STAGES.map((s) => (
          <button
            key={s}
            onClick={() => setStage(s)}
            className={`p-3 rounded-lg text-left transition-colors ${stage === s ? "bg-blue-600 text-white" : "bg-white border border-gray-200 hover:border-gray-300 dark:bg-gray-900 dark:border-gray-800"}`}
          >
            <div className="text-xs opacity-75 truncate">{s}</div>
            <div className="text-lg font-bold">{stageCount[s] || 0}</div>
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          className={`${inputCls} flex-1`}
          placeholder="Search J#, SO, brand, item, printer, PO…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className={`${inputCls} sm:w-56`} value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="all">All customers</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button
          type="button"
          onClick={() => setUrgentOnly((v) => !v)}
          className={`shrink-0 px-3 py-2 text-sm rounded-lg border whitespace-nowrap ${urgentOnly ? "bg-red-600 text-white border-red-600" : "bg-white text-red-600 border-red-200 hover:border-red-300 dark:bg-gray-900 dark:border-red-900"}`}
        >
          {urgentOnly ? "Urgent only ✓" : `Urgent (${urgentCount})`}
        </button>
        {meId && myCount > 0 && (
          <button
            type="button"
            onClick={() => setMineOnly((v) => !v)}
            className={`shrink-0 px-3 py-2 text-sm rounded-lg border whitespace-nowrap ${mineOnly ? "bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900" : "bg-white text-gray-700 border-gray-200 hover:border-gray-300 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-700"}`}
          >
            {mineOnly ? "My jobs ✓" : `My jobs (${myCount})`}
          </button>
        )}
        {(printerLateCount > 0 || lateOnly) && (
          <button
            type="button"
            onClick={() => setLateOnly((v) => !v)}
            className={`shrink-0 px-3 py-2 text-sm rounded-lg border whitespace-nowrap ${lateOnly ? "bg-red-700 text-white border-red-700" : "bg-white text-red-700 border-red-200 hover:border-red-300 dark:bg-gray-900 dark:border-red-900"}`}
            title="Printing due date passed and the printer hasn't marked it printed"
          >
            {lateOnly ? "Printer late ✓" : `Printer late (${printerLateCount})`}
          </button>
        )}
        {dueFilter === "overdue" && (
          <button
            type="button"
            onClick={() => setDueFilter("all")}
            className="shrink-0 px-3 py-2 text-sm rounded-lg border whitespace-nowrap bg-amber-600 text-white border-amber-600"
            title={factoryView ? "Showing jobs past their production due date and not yet ready. Click to clear." : "Showing jobs past their expected dispatch date. Click to clear."}
          >
            Overdue only ✓
          </button>
        )}
      </div>

      {/* Phones: one card per job instead of a table that is twice the screen width. */}
      <div className="sm:hidden">
        <label className="mb-3 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
          Sort
          <select
            className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            value={sort.key ? `${sort.key}:${sort.dir}` : ""}
            onChange={(e) => {
              const [key, dir] = e.target.value.split(":");
              setSort(key ? { key, dir } : { key: null, dir: "asc" });
            }}
          >
            <option value="">Needs attention first</option>
            <option value="ready:asc">Ready date, earliest first</option>
            <option value="ready:desc">Ready date, latest first</option>
            <option value="stage:asc">Stage, start to finish</option>
            <option value="stage:desc">Stage, finish to start</option>
            <option value="customer:asc">Customer, A to Z</option>
            <option value="qty:desc">Quantity, largest first</option>
            <option value="jNumber:desc">Newest job first</option>
            <option value="jNumber:asc">Oldest job first</option>
          </select>
        </label>
        <ul className="space-y-2">
          {filtered.map((j) => {
            const client = j.clientIds.map((c) => clientMap[c]?.name).filter(Boolean).join(", ");
            const late = isLate(j, today);
            return (
              <li key={j.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                <Link href={`/factoryos/manager/${j.id}`} className="block p-3 active:bg-gray-50 dark:active:bg-gray-800">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-gray-900 dark:text-white">{client || "—"}</div>
                      {j.brand && j.brand !== client && <div className="truncate text-xs text-gray-500 dark:text-gray-400">{j.brand}</div>}
                    </div>
                    <span className="shrink-0"><StageBadge stage={j.stage} /></span>
                  </div>
                  <div className="mt-1.5 text-sm text-gray-800 dark:text-gray-200">
                    {j.urgent && <span className="mr-1.5 inline-flex items-center rounded bg-red-100 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-red-800 dark:bg-red-900/40 dark:text-red-200">URGENT</span>}
                    {j.item}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                    <span className="font-mono text-blue-700 dark:text-blue-400">J# {j.jNumber}</span>
                    <span className={j.zohoSoNo ? "font-mono" : "text-amber-600 dark:text-amber-400"}>{j.zohoSoNo || "no SO"}</span>
                    {j.qty != null && <span>{j.qty.toLocaleString("en-IN")} pcs</span>}
                    {j.printingVendor && (
                      <span>
                        {j.printingVendor}
                        {isPrinterLate(j, today) && <span className="ml-1 rounded bg-red-100 px-1 py-0.5 text-[10px] font-semibold text-red-800 dark:bg-red-900/40 dark:text-red-200">LATE</span>}
                      </span>
                    )}
                    <span className={late ? "font-semibold text-red-600 dark:text-red-400" : ""}>
                      {j.productionDueDate ? `Ready ${formatDate(j.productionDueDate)}` : "No ready date"}
                    </span>
                  </div>
                  {j.internalStatus && <div className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{j.internalStatus}</div>}
                </Link>
                {myNext(j) && (
                  <button type="button" onClick={() => setStepJob(j)} className="flex w-full items-center justify-between border-t border-gray-100 px-3 py-2.5 text-sm font-medium text-blue-700 active:bg-blue-50 dark:border-gray-800 dark:text-blue-400">
                    <span>Next step: {myNext(j)}</span>
                    <span aria-hidden>→</span>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {filtered.length === 0 && (
          <p className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
            No jobs match.
            {line !== "all" && stage !== "all" && stageCountAll > 0 && (
              <>
                {" "}{stageCountAll} {stage} {stageCountAll === 1 ? "job is" : "jobs are"} in other lines.{" "}
                <button type="button" onClick={() => setLine("all")} className="underline text-blue-700 dark:text-blue-400">Show all lines</button>
              </>
            )}
          </p>
        )}
      </div>

      <div className="hidden sm:block bg-white border border-gray-200 rounded-xl overflow-hidden dark:bg-gray-900 dark:border-gray-800">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-500 uppercase dark:text-gray-400">
              <tr>
                {Object.entries(SORT_COLUMNS).map(([key, col]) => {
                  const on = sort.key === key;
                  return (
                    <th key={key} aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={`px-4 py-2 font-medium ${col.right ? "text-right" : "text-left"}`}>
                      <button
                        type="button"
                        onClick={() => toggleSort(key)}
                        title={on ? (sort.dir === "asc" ? "Sorted: click to reverse" : "Sorted: click for the default order") : `Sort by ${col.label}`}
                        className={`inline-flex items-center gap-1 uppercase hover:text-gray-900 dark:hover:text-white ${on ? "text-gray-900 dark:text-white" : ""}`}
                      >
                        {col.label}
                        <span aria-hidden className={on ? "" : "opacity-30"}>{on ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map((j) => {
                const client = j.clientIds.map((c) => clientMap[c]?.name).filter(Boolean).join(", ");
                return (
                  <tr key={j.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                    <td className="px-4 py-2 font-mono text-xs">
                      <Link href={`/factoryos/manager/${j.id}`} className="text-blue-600 hover:underline dark:text-blue-400">
                        {j.jNumber}
                      </Link>
                      <div className={j.zohoSoNo ? "text-[11px] text-gray-500 dark:text-gray-400" : "text-[11px] text-amber-600 dark:text-amber-400"}>
                        {j.zohoSoNo || "no SO"}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="text-gray-900 dark:text-white">{client || "—"}</div>
                      {j.brand && <div className="text-xs text-gray-500 dark:text-gray-400">{j.brand}</div>}
                    </td>
                    <td className="px-4 py-2 text-gray-900 dark:text-white">
                      {j.urgent && <span className="inline-flex items-center text-[10px] font-semibold bg-red-100 text-red-800 px-1.5 py-0.5 rounded mr-1.5 align-middle dark:bg-red-900/40 dark:text-red-200">URGENT</span>}
                      {j.item}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-900 dark:text-white">
                      {j.qty != null ? j.qty.toLocaleString("en-IN") : "—"}
                    </td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-300">
                      {j.printingVendor || "—"}
                      {j.vendorStatus === "paper_awaited" && !["Ready for Dispatch", "Dispatched", "Delivered"].includes(j.stage) && (
                        <span className="ml-1.5 inline-flex items-center text-[10px] font-semibold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded align-middle dark:bg-amber-900/40 dark:text-amber-200" title="Printer says they haven't received the paper">NO PAPER</span>
                      )}
                      {isPrinterLate(j, today) && (
                        <span className="ml-1.5 inline-flex items-center text-[10px] font-semibold bg-red-100 text-red-800 px-1.5 py-0.5 rounded align-middle dark:bg-red-900/40 dark:text-red-200">LATE</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <StageBadge stage={j.stage} />
                      {myNext(j) && (
                        <button type="button" onClick={() => setStepJob(j)} className="mt-1 block whitespace-nowrap text-xs font-medium text-blue-700 hover:underline dark:text-blue-400" title={`Fill what is needed and move this job to ${myNext(j)}`}>
                          Next step →
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 max-w-xs truncate">
                      {j.internalStatus || "—"}
                    </td>
                    <td className={`px-4 py-2 text-xs ${
                      isLate(j, today)
                        ? "text-red-600 font-semibold dark:text-red-400"
                        : "text-gray-600 dark:text-gray-300"}`}>
                      {formatDate(j.productionDueDate)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-sm text-gray-500 py-8 dark:text-gray-400">
                    No jobs match.
                    {line !== "all" && stage !== "all" && stageCountAll > 0 && (
                      <>
                        {" "}{stageCountAll} {stage} {stageCountAll === 1 ? "job is" : "jobs are"} in other lines —{" "}
                        <button type="button" onClick={() => setLine("all")} className="underline text-blue-700 dark:text-blue-400">show all lines</button>
                      </>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {stepJob && (
        <QuickStepSheet
          jobId={stepJob.id}
          role={role}
          title={`J# ${stepJob.jNumber} · ${stepJob.item}`}
          subtitle={[stepJob.clientIds.map((c) => clientMap[c]?.name).filter(Boolean).join(", "), stepJob.brand].filter(Boolean).join(" · ")}
          onClose={() => setStepJob(null)}
          onMoved={() => { setStepJob(null); router.refresh(); }}
        />
      )}
    </div>
  );
}
