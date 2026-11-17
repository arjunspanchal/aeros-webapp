import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession, requireManager } from "@/lib/auth/session";
import { getJob, listClients, listVendors } from "@/lib/factoryos/repo";
import { listMasterPapers } from "@/lib/paper-rm";
import { ensureJobOrder } from "@/lib/factoryos/jobOrder";
import JobOrderEditor from "./JobOrderEditor";

export const dynamic = "force-dynamic";

export const metadata = { title: "Vendor job order" };

export default async function JobOrderPage({ params }) {
  const session = getSession();
  if (!session) redirect("/login");
  if (!requireManager(session)) redirect("/factoryos");

  const job = await getJob(params.id);
  if (!job) notFound();

  const [order, clients, masterPapers, printingVendors] = await Promise.all([
    // Creates the seeded draft on first open, so the team starts from the
    // job's own paper / qty / due date instead of a blank sheet.
    ensureJobOrder(job.id, job),
    listClients().catch(() => []),
    listMasterPapers().catch((e) => { console.error("Master paper fetch failed:", e); return []; }),
    listVendors({ type: "Printing", activeOnly: false }).catch(() => []),
  ]);

  const client = clients.find((c) => job.clientIds.includes(c.id)) || null;
  const vendor =
    printingVendors.find((v) => job.printingVendorId && v.id === job.printingVendorId) ||
    printingVendors.find((v) => v.name && v.name.trim().toLowerCase() === (job.printingVendor || "").trim().toLowerCase()) ||
    null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href={`/factoryos/admin/jobs/${job.id}`}
          className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400"
        >
          ← Back to job
        </Link>
        <JobOrderEditor
          job={{
            id: job.id,
            jNumber: job.jNumber,
            item: job.item,
            itemSize: job.itemSize,
            brand: job.brand,
            masterSku: job.masterSku,
            qty: job.qty,
            printingType: job.printingType,
            printingVendor: job.printingVendor,
            printingDueDate: job.printingDueDate,
            sourcing: job.sourcing,
          }}
          clientName={client?.name || ""}
          vendor={vendor ? { name: vendor.name, contactPerson: vendor.contactPerson, phone: vendor.phone } : null}
          initialSpec={order.spec}
          initialColours={order.colours}
          masterPapers={masterPapers.map((p) => ({
            id: p.id,
            materialName: p.materialName,
            gsm: p.gsm,
            bf: p.bf,
            type: p.type,
            supplier: p.supplier,
            form: p.form,
            millCoating: p.millCoating,
          }))}
        />
      </main>
    </div>
  );
}
