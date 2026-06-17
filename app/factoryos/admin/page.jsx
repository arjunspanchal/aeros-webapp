import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, requireManager } from "@/lib/auth/session";
import { listJobsForSession, listClients, listUsers } from "@/lib/factoryos/repo";
import StatusChart from "@/app/factoryos/_components/StatusChart";
import { StageBadge, formatDate } from "@/app/factoryos/_components/ui";

export const dynamic = "force-dynamic";

// FactoryOS admin dashboard. Until this rewrite, the dashboard was a row of
// nav pills (Manage customers / RM inventory / PE coating / Machines / …)
// that duplicated the sidebar verbatim, plus a stage-pie chart and a recent-
// jobs table. There was no surface for the questions an FM actually opens
// the page to answer ("what needs me right now?"). Layout audit finding D1.
//
// Replaced with a 6-tile KPI grid. Every tile is a deep-link into the
// manager view (`/factoryos/manager?stage=… | urgent=1 | due=overdue`),
// computed from the existing jobs payload so no extra round-trip is
// needed. The pill row is gone — sidebar carries that navigation.
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function buildKpis(jobs) {
  const today = todayIso();
  const isOpen   = (j) => j.stage !== "Dispatched" && j.stage !== "Delivered";
  const isOverdue = (j) =>
    j.expectedDispatchDate && j.expectedDispatchDate < today && isOpen(j);

  return [
    {
      key: "urgent",
      label: "Urgent",
      sub: "open & flagged",
      count: jobs.filter((j) => j.urgent && isOpen(j)).length,
      href: "/factoryos/manager?urgent=1",
      tone: "red",
    },
    {
      key: "overdue",
      label: "Overdue dispatch",
      sub: "past expected date",
      count: jobs.filter(isOverdue).length,
      href: "/factoryos/manager?due=overdue",
      tone: "amber",
    },
    {
      key: "rmpending",
      label: "RM Pending",
      sub: "waiting on materials",
      count: jobs.filter((j) => j.stage === "RM Pending").length,
      href: "/factoryos/manager?stage=RM%20Pending",
      tone: "slate",
    },
    {
      key: "printing",
      label: "Under Printing",
      sub: "with vendor",
      count: jobs.filter((j) => j.stage === "Under Printing").length,
      href: "/factoryos/manager?stage=Under%20Printing",
      tone: "blue",
    },
    {
      key: "ready",
      label: "Ready for Dispatch",
      sub: "push pending",
      count: jobs.filter((j) => j.stage === "Ready for Dispatch").length,
      href: "/factoryos/manager?stage=Ready%20for%20Dispatch",
      tone: "green",
    },
    {
      key: "dispatched",
      label: "Dispatched",
      sub: "in transit",
      count: jobs.filter((j) => j.stage === "Dispatched").length,
      href: "/factoryos/manager?stage=Dispatched",
      tone: "indigo",
    },
  ];
}

// Tile colour palette. Kept inline (rather than a tokens file) because there
// are exactly six tones and they're all daily-friction signals — easier to
// scan in one place than chase through a theme.
const TILE_TONES = {
  red:    { ring: "border-red-200    hover:border-red-300    dark:border-red-900/60",    accent: "text-red-700    dark:text-red-300",    dot: "bg-red-500"    },
  amber:  { ring: "border-amber-200  hover:border-amber-300  dark:border-amber-900/60",  accent: "text-amber-700  dark:text-amber-300",  dot: "bg-amber-500"  },
  slate:  { ring: "border-slate-200  hover:border-slate-300  dark:border-slate-700",     accent: "text-slate-700  dark:text-slate-300",  dot: "bg-slate-400"  },
  blue:   { ring: "border-blue-200   hover:border-blue-300   dark:border-blue-900/60",   accent: "text-blue-700   dark:text-blue-300",   dot: "bg-blue-500"   },
  green:  { ring: "border-green-200  hover:border-green-300  dark:border-green-900/60",  accent: "text-green-700  dark:text-green-300",  dot: "bg-green-500"  },
  indigo: { ring: "border-indigo-200 hover:border-indigo-300 dark:border-indigo-900/60", accent: "text-indigo-700 dark:text-indigo-300", dot: "bg-indigo-500" },
};

function KpiTile({ tile }) {
  const tone = TILE_TONES[tile.tone] || TILE_TONES.slate;
  return (
    <Link
      href={tile.href}
      className={`group block rounded-xl border-2 bg-white p-4 transition-colors dark:bg-gray-900 ${tone.ring}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-medium uppercase tracking-wide ${tone.accent}`}>
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${tone.dot} mr-1.5 align-middle`} />
          {tile.label}
        </span>
      </div>
      <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{tile.count}</div>
      <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{tile.sub}</div>
    </Link>
  );
}

export default async function AdminDashboard() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!requireManager(session)) redirect("/factoryos");
  const role = session.modules?.factoryos;

  const [jobs, clients, users] = await Promise.all([
    listJobsForSession({
      role,
      userId: session.factoryosUserId,
      clientIds: session.factoryosClientIds,
    }),
    listClients(),
    listUsers(),
  ]);
  const clientMap = Object.fromEntries(clients.map((c) => [c.id, c]));
  const recent = jobs.slice(0, 10);
  const kpis = buildKpis(jobs);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <header className="mb-6">
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
            <Link
              href="/factoryos/admin/jobs/new"
              className="shrink-0 px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              + New job
            </Link>
          </div>
          <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
            {jobs.length} jobs · {clients.length} customers · {users.length} users
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <Link href="/factoryos/admin/inventory" className="rounded-md border border-gray-200 px-3 py-1.5 hover:border-gray-300 dark:border-gray-800">RM inventory</Link>
            <Link href="/factoryos/admin/rm-rolls" className="rounded-md border border-gray-200 px-3 py-1.5 hover:border-gray-300 dark:border-gray-800">RM rolls</Link>
            <Link href="/factoryos/admin/runs" className="rounded-md border border-gray-200 px-3 py-1.5 hover:border-gray-300 dark:border-gray-800">Production runs</Link>
            <Link href="/factoryos/admin/floor-qr" className="rounded-md border border-gray-200 px-3 py-1.5 hover:border-gray-300 dark:border-gray-800">Floor QR ↗</Link>
          </div>
        </header>

        {/* KPI tiles — replaces the old nav-pill row. Each tile deep-links
            into a pre-filtered /factoryos/manager view. 6 tiles fit one row
            at lg+, two rows of three at sm, two columns at mobile. */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {kpis.map((tile) => (
            <KpiTile key={tile.key} tile={tile} />
          ))}
        </div>

        <div className="mb-6">
          <StatusChart jobs={jobs} title="Jobs by stage" />
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden dark:bg-gray-900 dark:border-gray-800">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Recent jobs</h2>
            <Link href="/factoryos/manager" className="text-xs text-blue-600 hover:underline dark:text-blue-400">View all →</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase dark:bg-gray-800/50 dark:text-gray-400">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">J#</th>
                  <th className="text-left px-4 py-2 font-medium">Customer / Brand</th>
                  <th className="text-left px-4 py-2 font-medium">Item</th>
                  <th className="text-right px-4 py-2 font-medium">Qty</th>
                  <th className="text-left px-4 py-2 font-medium">Stage</th>
                  <th className="text-left px-4 py-2 font-medium">Dispatch</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {recent.map((j) => (
                  <tr key={j.id}>
                    <td className="px-4 py-2 font-mono text-xs">
                      <Link href={`/factoryos/admin/jobs/${j.id}`} className="text-blue-600 hover:underline dark:text-blue-400">{j.jNumber}</Link>
                    </td>
                    <td className="px-4 py-2">
                      <div className="text-gray-900 dark:text-white">{j.clientIds.map((c) => clientMap[c]?.name).filter(Boolean).join(", ") || "—"}</div>
                      {j.brand && <div className="text-xs text-gray-500 dark:text-gray-400">{j.brand}</div>}
                    </td>
                    <td className="px-4 py-2 text-gray-900 dark:text-white">{j.item}</td>
                    <td className="px-4 py-2 text-right text-gray-900 dark:text-white">
                      {j.qty != null ? j.qty.toLocaleString("en-IN") : "—"}
                    </td>
                    <td className="px-4 py-2"><StageBadge stage={j.stage} /></td>
                    <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300">{formatDate(j.expectedDispatchDate)}</td>
                  </tr>
                ))}
                {recent.length === 0 && <tr><td colSpan={6} className="text-center text-sm text-gray-500 py-8 dark:text-gray-400">No jobs yet. Create one to get started.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
