// "Today" summary widget for /factoryos/admin/runs (PR_G). Renders three
// tiles + a list of currently-running runs with elapsed time.
//
// Server component on purpose — no client-side ticking. Operators get a
// fresh snapshot at page load; if they want updated elapsed times they
// refresh. Adding a setInterval clock would be ~50 lines of "use client"
// for very little marginal value (factory shifts are hours, not seconds).
//
// Three counts:
//   Running now    → status === 'running'
//   Today          → start_time falls in today (server-side local date)
//   Idle machines  → active machines minus machines currently running
import Link from "next/link";

function todayIsoLocal(d = new Date()) {
  // YYYY-MM-DD in the server's local time. Matches how factory shifts are
  // accounted (Mumbai single-timezone reality).
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function elapsedSince(iso) {
  if (!iso) return null;
  const start = new Date(iso).getTime();
  if (!Number.isFinite(start)) return null;
  const ms = Date.now() - start;
  if (ms < 0) return "scheduled";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs < 24) return rem ? `${hrs}h ${rem}m` : `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h`;
}

export default function RunsSummary({ runs, machines, jobs }) {
  const machineMap = Object.fromEntries(machines.map((m) => [m.id, m]));
  const jobMap     = Object.fromEntries(jobs.map((j) => [j.id, j]));

  const today = todayIsoLocal();
  const running = runs.filter((r) => r.status === "running");
  const todayRuns = runs.filter((r) => {
    if (!r.startTime) return false;
    return r.startTime.slice(0, 10) === today;
  });

  // Idle = active+available machines not currently in any running run.
  const runningMachineIds = new Set(running.map((r) => r.machineId).filter(Boolean));
  const availableMachines = machines.filter((m) => m.active !== false && m.status === "active");
  const idleMachines = availableMachines.filter((m) => !runningMachineIds.has(m.id));

  return (
    <div className="mt-6 rounded-xl border-2 border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800">
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-200 dark:divide-gray-800">
        <div className="p-4">
          <p className="text-xs uppercase tracking-wide text-blue-700 font-medium dark:text-blue-300">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500 mr-1.5 align-middle" />
            Running now
          </p>
          <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">{running.length}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">on a machine</p>
        </div>
        <div className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-700 font-medium dark:text-slate-300">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-400 mr-1.5 align-middle" />
            Today
          </p>
          <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">{todayRuns.length}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">runs started today</p>
        </div>
        <div className="p-4">
          <p className="text-xs uppercase tracking-wide text-amber-700 font-medium dark:text-amber-300">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 mr-1.5 align-middle" />
            Idle machines
          </p>
          <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">{idleMachines.length}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            of {availableMachines.length} active
          </p>
        </div>
      </div>

      {/* Drill-down list — only when there's something running. We
          deliberately skip rendering anything when running.length === 0,
          rather than showing "No runs in progress" — the empty-state lives
          in the tile count (0). Visual quiet beats redundant copy. */}
      {running.length > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-800">
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {running.map((r) => {
              const machine = machineMap[r.machineId];
              const job = r.jobId ? jobMap[r.jobId] : null;
              const elapsed = elapsedSince(r.startTime);
              return (
                <li key={r.id}>
                  <Link
                    href={`/factoryos/admin/runs/${r.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/40"
                  >
                    <span className="inline-block h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                    <span className="text-sm text-gray-900 dark:text-white font-medium truncate flex-1 min-w-0">
                      {machine?.name || "Unknown machine"}
                      {job && (
                        <span className="text-gray-500 dark:text-gray-400 ml-2">
                          · J# {job.jNumber}{job.item ? ` — ${job.item}` : ""}
                        </span>
                      )}
                      {!job && (
                        <span className="text-gray-500 dark:text-gray-400 ml-2 italic">· stock run</span>
                      )}
                    </span>
                    <span className="text-xs font-mono text-gray-600 dark:text-gray-300 shrink-0">
                      {elapsed || "—"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Idle-machine drill-down only when there's at least one, since the
          most useful case is "I want to know which machine I can put a job
          on right now." */}
      {idleMachines.length > 0 && idleMachines.length <= 6 && (
        <div className="border-t border-gray-200 dark:border-gray-800 px-4 py-2.5">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Available now: {idleMachines.map((m) => m.name).join(" · ")}
          </p>
        </div>
      )}
    </div>
  );
}
