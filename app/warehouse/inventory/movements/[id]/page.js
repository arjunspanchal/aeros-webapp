import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/hub/session";
import { canManageInventory } from "@/lib/warehouse/inventory";
import { getMovement } from "@/lib/warehouse/movements";

export const dynamic = "force-dynamic";

export const metadata = { title: "Movement detail — WarehouseOS" };

const TYPE_TONE = {
  inward:     "bg-emerald-100 text-emerald-800",
  outward:    "bg-blue-100 text-blue-800",
  transfer:   "bg-purple-100 text-purple-800",
  adjustment: "bg-amber-100 text-amber-800",
};

export default async function MovementDetailPage({ params }) {
  const session = getSession();
  if (!session) redirect("/login");
  if (!canManageInventory(session)) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-800">
          <p className="text-lg font-semibold">Access denied</p>
        </div>
      </div>
    );
  }

  const movement = await getMovement(params.id);
  if (!movement) notFound();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <Link href="/warehouse/inventory/movements" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400">
          ← Movements
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-semibold text-gray-900 dark:text-white">{movement.movement_no}</h1>
          <span className={`rounded px-2 py-0.5 text-xs font-semibold ${TYPE_TONE[movement.type] || "bg-gray-100 text-gray-800"}`}>
            {movement.type}
          </span>
          {movement.reference_type && (
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">
              {movement.reference_type}
            </span>
          )}
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Date" value={movement.movement_date} />
          <Field label="Reference" value={movement.reference || "—"} />
          <Field label="Posted by" value={movement.created_by || "—"} />
          <Field label="Posted at" value={movement.posted_at ? new Date(movement.posted_at).toLocaleString("en-IN") : "—"} />
          {movement.source_job_id && <Field label="Source job" value={movement.source_job_id} mono />}
          {movement.notes && <Field label="Notes" value={movement.notes} className="sm:col-span-4" />}
        </dl>

        <h2 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">Lines</h2>
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <Th>SKU</Th>
                <Th>Item</Th>
                <Th>From</Th>
                <Th>To</Th>
                <Th right>Qty</Th>
                <Th right>Unit cost (₹)</Th>
                <Th>Reject</Th>
                <Th>Remarks</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
              {movement.lines.map((ln) => (
                <tr key={ln.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                  <Td mono>{ln.inventory_items?.sku || "—"}</Td>
                  <Td>{ln.inventory_items?.name || "—"}</Td>
                  <Td>{ln.from_loc?.code || "—"}</Td>
                  <Td>{ln.to_loc?.code || "—"}</Td>
                  <Td right>{Number(ln.qty).toLocaleString("en-IN", { maximumFractionDigits: 4 })} {ln.inventory_items?.uom || ""}</Td>
                  <Td right>{ln.unit_cost == null ? "—" : Number(ln.unit_cost).toFixed(4)}</Td>
                  <Td>{ln.reject_reason || "—"}</Td>
                  <Td>{ln.remarks || "—"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
    </div>
  );
}

function Field({ label, value, mono, className = "" }) {
  return (
    <div className={className}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className={`mt-1 text-sm text-gray-900 dark:text-gray-100 ${mono ? "font-mono text-xs break-all" : ""}`}>{value}</dd>
    </div>
  );
}
function Th({ children, right }) {
  return <th className={`px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 ${right ? "text-right" : "text-left"}`}>{children}</th>;
}
function Td({ children, right, mono }) {
  return <td className={`px-3 py-2 text-sm ${right ? "text-right" : ""} ${mono ? "font-mono text-xs text-gray-700 dark:text-gray-300" : "text-gray-900 dark:text-gray-100"}`}>{children}</td>;
}
