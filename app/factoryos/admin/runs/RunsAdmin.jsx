"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { inputCls, labelCls } from "@/app/factoryos/_components/ui";
import { RUN_STATUSES } from "@/lib/factoryos/constants";

const statusLabel = Object.fromEntries(RUN_STATUSES.map((s) => [s.value, s.label]));

export default function RunsAdmin({ initialRuns, machines, jobs, currentUser }) {
  const [runs, setRuns] = useState(initialRuns);
  const [form, setForm] = useState({
    machineId: machines.find((m) => m.active && m.status === "active")?.id || machines[0]?.id || "",
    jobId: "",
    status: "running",
    startTime: toLocalInputValue(new Date()),
    notes: "",
    operatorName: currentUser?.name || "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [filterMachine, setFilterMachine] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const machineMap = useMemo(() => Object.fromEntries(machines.map((m) => [m.id, m])), [machines]);
  const jobMap = useMemo(() => Object.fromEntries(jobs.map((j) => [j.id, j])), [jobs]);

  const filtered = useMemo(() => {
    return runs.filter((r) => {
      if (filterMachine && r.machineId !== filterMachine) return false;
      if (filterStatus && r.status !== filterStatus) return false;
      return true;
    });
  }, [runs, filterMachine, filterStatus]);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const res = await fetch("/api/factoryos/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        machineId: form.machineId,
        jobId: form.jobId || undefined,
        status: form.status,
        startTime: form.startTime ? new Date(form.startTime).toISOString() : null,
        notes: form.notes,
        operatorName: form.operatorName,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setErr((await res.json()).error || "Failed");
      return;
    }
    const { run } = await res.json();
    setRuns((prev) => [run, ...prev]);
    setForm({ ...form, jobId: "", notes: "", startTime: toLocalInputValue(new Date()) });
  }

  return (
    <div className="mt-6 grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6">
      <form
        onSubmit={submit}
        className="lg:col-span-2 bg-white rounded-xl p-4 sm:p-5 space-y-3 dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-800 lg:sticky lg:top-4 lg:self-start"
      >
        <h2 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white">Start new run</h2>
        <div>
          <label className={labelCls}>Machine</label>
          <select
            className={`${inputCls} text-base`}
            value={form.machineId}
            onChange={(e) => setForm({ ...form, machineId: e.target.value })}
            required
          >
            <option value="">Select machine…</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id} disabled={m.status === "retired" || !m.active}>
                {m.name}
                {m.status !== "active" ? ` (${m.status})` : ""}
              </option>
            ))}
          </select>
          {machines.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              No machines yet — <Link href="/factoryos/admin/machines" className="underline">add one first</Link>.
            </p>
          )}
        </div>
        <div>
          <label className={labelCls}>Job (optional)</label>
          <select
            className={`${inputCls} text-base`}
            value={form.jobId}
            onChange={(e) => setForm({ ...form, jobId: e.target.value })}
          >
            <option value="">No specific job (stock run)</option>
            {jobs.slice(0, 200).map((j) => (
              <option key={j.id} value={j.id}>
                {j.jNumber || "J?"} · {j.brand || j.item || "job"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Status</label>
          <select
            className={`${inputCls} text-base`}
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
          >
            {RUN_STATUSES.filter((s) => s.value !== "cancelled").map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Start time</label>
          <input
            type="datetime-local"
            className={`${inputCls} text-base`}
            value={form.startTime}
            onChange={(e) => setForm({ ...form, startTime: e.target.value })}
          />
        </div>
        <div>
          <label className={labelCls}>Operator</label>
          <input
            className={`${inputCls} text-base`}
            value={form.operatorName}
            onChange={(e) => setForm({ ...form, operatorName: e.target.value })}
            placeholder="Name of person running the machine"
          />
        </div>
        <div>
          <label className={labelCls}>Notes</label>
          <textarea
            className={`${inputCls} text-base`}
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Optional"
          />
        </div>
        <button
          disabled={busy || !form.machineId}
          className="w-full bg-blue-600 text-white text-sm sm:text-base font-medium px-4 py-2.5 sm:py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60"
        >
          {busy ? "Starting…" : "Start run"}
        </button>
        {err && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-2 text-xs sm:text-sm text-red-700 dark:text-red-300 font-medium">
            ⚠️ {err}
          </div>
        )}
      </form>

      <div className="lg:col-span-3 space-y-3">
        <div className="flex flex-wrap gap-2 items-center text-xs">
          <select
            className={`${inputCls} text-xs w-auto`}
            value={filterMachine}
            onChange={(e) => setFilterMachine(e.target.value)}
          >
            <option value="">All machines</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select
            className={`${inputCls} text-xs w-auto`}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">Any status</option>
            {RUN_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <span className="text-gray-500 dark:text-gray-400">
            {filtered.length} of {runs.length}
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-6 text-center dark:bg-gray-900 dark:border-gray-800">
            {/* Over-filtered: runs exist but the picked machine/status hides
                them. Genuine empty: no runs at all → existing "start one"
                copy still makes sense as the next action. */}
            {runs.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No runs yet. Start one on the left.
              </p>
            ) : (
              <>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No runs match these filters.
                </p>
                <div className="mt-3 flex items-center justify-center gap-3 text-xs">
                  {filterMachine && (
                    <button type="button" onClick={() => setFilterMachine("")} className="text-blue-600 hover:underline dark:text-blue-400">
                      All machines
                    </button>
                  )}
                  {filterStatus && (
                    <button type="button" onClick={() => setFilterStatus("")} className="text-blue-600 hover:underline dark:text-blue-400">
                      Any status
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((r) => (
              <Link
                key={r.id}
                href={`/factoryos/admin/runs/${r.id}`}
                className="block bg-white border border-gray-200 rounded-lg p-3 hover:border-blue-400 dark:bg-gray-900 dark:border-gray-800 dark:hover:border-blue-500 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-mono text-gray-900 dark:text-white">{r.runId}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {machineMap[r.machineId]?.name || "Unknown machine"}
                      {r.jobId && jobMap[r.jobId] ? ` · ${jobMap[r.jobId].jNum || "Job"}` : ""}
                    </p>
                  </div>
                  <StatusPill status={r.status} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-300">
                  {r.outputPcs != null && <span>🎯 {r.outputPcs.toLocaleString()} pcs</span>}
                  {r.wastePcs ? <span>🗑️ {r.wastePcs.toLocaleString()} waste</span> : null}
                  {r.operatorName && <span>👤 {r.operatorName}</span>}
                  {r.startTime && <span>▶ {formatLocal(r.startTime)}</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const label = statusLabel[status] || status;
  const cls =
    status === "running"
      ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
      : status === "done"
      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
      : status === "cancelled"
      ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
      : "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200";
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${cls}`}>{label}</span>;
}

function toLocalInputValue(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatLocal(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}
