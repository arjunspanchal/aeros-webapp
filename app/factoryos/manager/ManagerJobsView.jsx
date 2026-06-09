"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { StageBadge, formatDate, inputCls } from "@/app/factoryos/_components/ui";
import { STAGES } from "@/lib/factoryos/constants";

export default function ManagerJobsView({ jobs, clientMap, userMap, role }) {
  const [q, setQ] = useState("");
  const [stage, setStage] = useState("all");
  const [clientId, setClientId] = useState("all");
  const [urgentOnly, setUrgentOnly] = useState(false);

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
      if (urgentOnly && !j.urgent) return false;
      if (stage !== "all" && j.stage !== stage) return false;
      if (clientId !== "all" && !j.clientIds.includes(clientId)) return false;
      if (!term) return true;
      const clientName = j.clientIds.map((c) => clientMap[c]?.name || "").join(" ");
      const hay = `${j.jNumber} ${j.brand} ${j.item} ${j.city} ${j.poNumber} ${clientName} ${j.internalStatus}`.toLowerCase();
      return hay.includes(term);
    });
  }, [jobs, q, stage, clientId, urgentOnly, clientMap]);

  const urgentCount = useMemo(() => jobs.filter((j) => j.urgent).length, [jobs]);

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
            {role === "account_manager" ? "Jobs for your customers" : "All jobs"} · {jobs.length} total
          </p>
        </div>
        {/* Mirrors the create-job allow-list: admin / FM / AM. Middleware
            now lets AM through to /factoryos/admin/jobs/new (audit H1).
            FE excluded — shop floor doesn't open new jobs. */}
        {(role === "admin" || role === "factory_manager" || role === "account_manager") && (
          <Link
            href="/factoryos/admin/jobs/new"
            className="shrink-0 px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            + New job
          </Link>
        )}
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
          placeholder="Search J#, brand, item, city, PO…"
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
                <th className="text-left px-4 py-2 font-medium">City</th>
                <th className="text-left px-4 py-2 font-medium">Stage</th>
                <th className="text-left px-4 py-2 font-medium">Internal</th>
                <th className="text-left px-4 py-2 font-medium">Dispatch</th>
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
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{j.city || "—"}</td>
                    <td className="px-4 py-2"><StageBadge stage={j.stage} /></td>
                    <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 max-w-xs truncate">
                      {j.internalStatus || "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300">
                      {formatDate(j.expectedDispatchDate)}
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
