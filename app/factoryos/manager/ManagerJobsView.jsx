"use client";
import { LINES, LINE_KEYS, LINE_LABEL, lineForCategory, describeLines } from "@/lib/factoryos/lines";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { StageBadge, formatDate, inputCls } from "@/app/factoryos/_components/ui";
import { STAGES } from "@/lib/factoryos/constants";

// Deep-link support: KPI tiles on /factoryos/admin land here with a query
// string that pre-populates the filters. Validated against the canonical
// STAGES list so a typo in a URL doesn't show "no jobs match" with no clue
// why. `due=overdue` swaps in a date-comparison filter computed below.
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Printer late = printing due passed, job still at or before Under Printing,
// and the printer hasn't marked it printed on /printer.
function isPrinterLate(j, today) {
  return !!j.printingDueDate && j.printingDueDate.slice(0, 10) < today
    && ["RM Pending", "Under Printing"].includes(j.stage)
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

export default function ManagerJobsView({ jobs, clientMap, userMap, role, myLines = null }) {
  const searchParams = useSearchParams();
  const initialStage  = (() => {
    const s = searchParams.get("stage");
    return s && STAGES.includes(s) ? s : "all";
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
  const [dueFilter, setDueFilter] = useState(initialDue);
  const today = useMemo(() => todayIso(), []);

  const clients = useMemo(() => {
    const seen = new Set();
    const list = [];
    for (const j of jobs) for (const cid of j.clientIds) {
      if (!seen.has(cid) && clientMap[cid]) { seen.add(cid); list.push(clientMap[cid]); }
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [jobs, clientMap]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return jobs.filter((j) => {
      if (line !== "all") {
        const jl = lineForCategory(j.category, j.item);
        if (line === "mine" ? !(myLines || []).includes(jl) : jl !== line) return false;
      }
      if (urgentOnly && !j.urgent) return false;
      if (lateOnly && !isPrinterLate(j, today)) return false;
      if (stage !== "all" && j.stage !== stage) return false;
      if (clientId !== "all" && !j.clientIds.includes(clientId)) return false;
      // Overdue dispatch: scheduled for before today AND not already in the
      // post-dispatch stages. Delivered and Dispatched jobs aren't "overdue"
      // even if their date is in the past.
      if (dueFilter === "overdue") {
        if (factoryView) {
          // Floor works to Production due: late if FG aren't ready by then.
          if (!j.productionDueDate || j.productionDueDate >= today) return false;
          if (["Ready for Dispatch", "Dispatched", "Delivered"].includes(j.stage)) return false;
        } else {
          if (!j.expectedDispatchDate || j.expectedDispatchDate >= today) return false;
          if (j.stage === "Dispatched" || j.stage === "Delivered") return false;
        }
      }
      if (!term) return true;
      const clientName = j.clientIds.map((c) => clientMap[c]?.name || "").join(" ");
      const hay = `${j.jNumber} ${j.brand} ${j.item} ${j.city} ${j.printingVendor} ${j.poNumber} ${clientName} ${j.internalStatus}`.toLowerCase();
      return hay.includes(term);
    })
    // Urgent jobs float to the top; otherwise keep the list's J# order.
    .sort((a, b) => (b.urgent === true) - (a.urgent === true));
  }, [jobs, q, stage, clientId, urgentOnly, lateOnly, dueFilter, today, clientMap, line, myLines, factoryView]);
  const printerLateCount = useMemo(() => jobs.filter((j) => isPrinterLate(j, today)).length, [jobs, today]);

  const urgentCount = useMemo(() => jobs.filter((j) => j.urgent).length, [jobs]);

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
    for (const j of jobs) if (c[j.stage] !== undefined) c[j.stage]++;
    return c;
  }, [jobs]);

  return (
    <div>
      <div className="flex items-start justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Jobs</h1>
          <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
            {role === "account_manager" ? "Jobs for your customers" : line === "mine" ? describeLines(myLines) : line === "all" ? "All jobs" : LINE_LABEL[line]} · {filtered.length} shown · {jobs.length} total
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

      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 mb-5">
        <button
          onClick={() => setStage("all")}
          className={`p-3 rounded-lg text-left transition-colors ${stage === "all" ? "bg-blue-600 text-white" : "bg-white border border-gray-200 hover:border-gray-300 dark:bg-gray-900 dark:border-gray-800"}`}
        >
          <div className="text-xs opacity-75">All</div>
          <div className="text-lg font-bold">{jobs.length}</div>
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
          placeholder="Search J#, brand, item, printer, PO…"
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

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden dark:bg-gray-900 dark:border-gray-800">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-500 uppercase dark:text-gray-400">
              <tr>
                <th className="text-left px-4 py-2 font-medium">J#</th>
                <th className="text-left px-4 py-2 font-medium">Customer / Brand</th>
                <th className="text-left px-4 py-2 font-medium">Item</th>
                <th className="text-right px-4 py-2 font-medium">Qty</th>
                <th className="text-left px-4 py-2 font-medium">Printer</th>
                <th className="text-left px-4 py-2 font-medium">Stage</th>
                <th className="text-left px-4 py-2 font-medium">Internal</th>
                <th className="text-left px-4 py-2 font-medium">{factoryView ? "Prod due" : "Dispatch"}</th>
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
                    <td className="px-4 py-2"><StageBadge stage={j.stage} /></td>
                    <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 max-w-xs truncate">
                      {j.internalStatus || "—"}
                    </td>
                    <td className={`px-4 py-2 text-xs ${
                      factoryView && j.productionDueDate && j.productionDueDate < today && !["Ready for Dispatch", "Dispatched", "Delivered"].includes(j.stage)
                        ? "text-red-600 font-semibold dark:text-red-400"
                        : "text-gray-600 dark:text-gray-300"}`}>
                      {formatDate(factoryView ? j.productionDueDate : j.expectedDispatchDate)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="text-center text-sm text-gray-500 py-8 dark:text-gray-400">No jobs match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
