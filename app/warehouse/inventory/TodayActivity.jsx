// "Today" activity widget for the Stock Position landing.
//
// One quick read of what the warehouse did today: inward count + qty,
// outward count + qty, total movements (incl drafts), and a callout if
// any unposted drafts are sitting on today's date. Quick links jump to
// inward / outward / history so the staff can act in one click.
//
// Server component — fetches inventory_movements_summary rows for the
// IST calendar date and renders synchronously. No client ticking; the
// page is force-dynamic so every navigation refreshes the snapshot.

import Link from "next/link";
import { listMovements } from "@/lib/warehouse/movements";

// IST date in YYYY-MM-DD. Bhiwandi runs on Asia/Kolkata; raw new Date()
// on Vercel is UTC and would roll over the date 5h30m early. en-CA gives
// us ISO-style YYYY-MM-DD directly.
function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function fmtInt(n) {
  return Number(n || 0).toLocaleString("en-IN");
}

function fmtINR(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

async function loadTodayMovements() {
  const today = todayIst();
  try {
    const rows = await listMovements({ fromDate: today, toDate: today, limit: 500 });
    return { today, rows: Array.isArray(rows) ? rows : [], error: null };
  } catch (e) {
    return { today, rows: [], error: e.message || String(e) };
  }
}

export default async function TodayActivity() {
  const { today, rows, error } = await loadTodayMovements();

  // Bucket by type. inventory_movements_summary `type` is one of
  // 'inward' | 'outward' | 'transfer' | 'adjustment'.
  const inward    = rows.filter((r) => r.type === "inward");
  const outward   = rows.filter((r) => r.type === "outward");
  const other     = rows.filter((r) => r.type !== "inward" && r.type !== "outward");
  const drafts    = rows.filter((r) => !r.posted);

  const inwardQty  = inward.reduce((s, r) => s + Number(r.total_qty || 0), 0);
  const outwardQty = outward.reduce((s, r) => s + Number(r.total_qty || 0), 0);
  const inwardVal  = inward.reduce((s, r) => s + Number(r.total_value || 0), 0);
  const outwardVal = outward.reduce((s, r) => s + Number(r.total_value || 0), 0);

  const Card = ({ tone, label, count, sub, href, hrefLabel }) => (
    <Link
      href={href}
      className={`group rounded-lg border p-4 transition hover:shadow-sm ${tone.border} ${tone.bg}`}
    >
      <div className="flex items-baseline justify-between">
        <span className={`text-xs font-medium uppercase tracking-wide ${tone.label}`}>{label}</span>
        <span className={`text-[11px] ${tone.muted} opacity-0 group-hover:opacity-100 transition-opacity`}>
          {hrefLabel} →
        </span>
      </div>
      <div className={`mt-2 text-2xl font-semibold ${tone.value}`}>{fmtInt(count)}</div>
      <div className={`mt-1 text-xs ${tone.sub}`}>{sub}</div>
    </Link>
  );

  return (
    <section
      aria-label="Today's activity"
      className="mb-6 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Today's activity</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Movements dated {today} · {fmtInt(rows.length)} record{rows.length === 1 ? "" : "s"}
          </p>
        </div>
        <Link
          href="/warehouse/inventory/movements"
          className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          Full history →
        </Link>
      </div>

      {error ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
          Could not load today's movements: {error}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card
              tone={{
                border: "border-emerald-200 dark:border-emerald-900/40",
                bg:     "bg-emerald-50/60 hover:bg-emerald-50 dark:bg-emerald-900/10 dark:hover:bg-emerald-900/20",
                label:  "text-emerald-700 dark:text-emerald-300",
                value:  "text-emerald-900 dark:text-emerald-100",
                sub:    "text-emerald-700/80 dark:text-emerald-300/80",
                muted:  "text-emerald-700 dark:text-emerald-300",
              }}
              label="Inward"
              count={inward.length}
              sub={`${fmtInt(inwardQty)} units · ${fmtINR(inwardVal)}`}
              href="/warehouse/inventory/inward"
              hrefLabel="Inward"
            />
            <Card
              tone={{
                border: "border-rose-200 dark:border-rose-900/40",
                bg:     "bg-rose-50/60 hover:bg-rose-50 dark:bg-rose-900/10 dark:hover:bg-rose-900/20",
                label:  "text-rose-700 dark:text-rose-300",
                value:  "text-rose-900 dark:text-rose-100",
                sub:    "text-rose-700/80 dark:text-rose-300/80",
                muted:  "text-rose-700 dark:text-rose-300",
              }}
              label="Outward"
              count={outward.length}
              sub={`${fmtInt(outwardQty)} units · ${fmtINR(outwardVal)}`}
              href="/warehouse/inventory/outward"
              hrefLabel="Outward"
            />
            <Card
              tone={{
                border: "border-gray-200 dark:border-gray-800",
                bg:     "bg-gray-50/60 hover:bg-gray-50 dark:bg-gray-900/40 dark:hover:bg-gray-900/60",
                label:  "text-gray-600 dark:text-gray-400",
                value:  "text-gray-900 dark:text-white",
                sub:    "text-gray-500 dark:text-gray-400",
                muted:  "text-gray-600 dark:text-gray-400",
              }}
              label="Other"
              count={other.length}
              sub={
                other.length === 0
                  ? "Transfers + adjustments"
                  : `${fmtInt(other.length)} transfer/adjustment${other.length === 1 ? "" : "s"}`
              }
              href="/warehouse/inventory/movements"
              hrefLabel="History"
            />
          </div>

          {drafts.length > 0 && (
            <div className="mt-3 flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs dark:border-amber-900/40 dark:bg-amber-900/20">
              <span className="text-amber-900 dark:text-amber-200">
                <strong>{fmtInt(drafts.length)} unposted draft{drafts.length === 1 ? "" : "s"}</strong> dated today.
                Stock position only reflects posted movements.
              </span>
              <Link
                href="/warehouse/inventory/movements"
                className="font-medium text-amber-900 underline hover:text-amber-700 dark:text-amber-200 dark:hover:text-amber-100"
              >
                Review →
              </Link>
            </div>
          )}
        </>
      )}
    </section>
  );
}
