import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/hub/session";
import { canManageSampleKits, listKits } from "@/lib/warehouse/sampleKits";

export const dynamic = "force-dynamic";

export const metadata = { title: "Kit Manager — WarehouseOS" };

function fmtINR(n) {
  if (n == null) return "—";
  return `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function SampleKitsPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!canManageSampleKits(session)) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-800">
          <p className="text-lg font-semibold">Access denied</p>
        </div>
      </div>
    );
  }
  const kits = await listKits();
  const active = kits.filter((k) => k.active);
  const inactive = kits.filter((k) => !k.active);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Kit Manager</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Predefined groupings (e.g. PET Cup Sample Kit). Each kit appears as one line item on a sample dispatch; components are warehouse packing reference only.
          </p>
        </div>
        <Link
          href="/warehouse/sample-kits/new"
          className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800 dark:bg-white dark:text-gray-900"
        >
          + New kit
        </Link>
      </div>

      {kits.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
          No kits yet. Create one to make the picker available on the new-dispatch form.
        </div>
      ) : (
        <KitsTable rows={active} title="Active" />
      )}
      {inactive.length > 0 && <div className="mt-8"><KitsTable rows={inactive} title="Inactive" muted /></div>}
    </div>
  );

  function KitsTable({ rows, title, muted = false }) {
    return (
      <section>
        <h2 className={`mb-2 text-xs font-semibold uppercase tracking-wide ${muted ? "text-gray-400" : "text-gray-500 dark:text-gray-400"}`}>{title}</h2>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-900/60">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Components</th>
                <th className="px-4 py-3 text-right">Default price</th>
                <th className="px-4 py-3 text-right">GST %</th>
                <th className="px-4 py-3 text-right" />
              </tr>
            </thead>
            <tbody className={`divide-y divide-gray-100 text-sm dark:divide-gray-800 ${muted ? "opacity-70" : ""}`}>
              {rows.map((k) => (
                <tr key={k.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{k.name}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{k.component_count} {k.component_count === 1 ? "item" : "items"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtINR(k.default_price)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{k.default_gst_pct}%</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/warehouse/sample-kits/${k.id}`} className="text-sm font-medium text-blue-700 hover:text-blue-800 dark:text-blue-400">Edit →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }
}
