import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { resolveJobAccess } from "@/lib/factoryos/jobAccess";
import { getJobOrder, ensureJobOrder } from "@/lib/factoryos/jobOrder";
import { listVendors } from "@/lib/factoryos/repo";
import PrintView from "./PrintView";

export const dynamic = "force-dynamic";

export const metadata = { title: "Print — vendor job order" };

export default async function JobOrderPrintPage({ params, searchParams }) {
  const session = getSession();
  if (!session) redirect("/login");

  const { job, access } = await resolveJobAccess(session, params.id);
  // Same rule as the API: team or the assigned vendor. A customer login
  // never gets the vendor's job order.
  if (!job || (access !== "internal" && access !== "vendor")) notFound();

  // The team can hit "PDF" before ever opening the editor; seed the draft
  // from the job so that prints a (watermarked) draft instead of a 404.
  const { spec, colours } = access === "internal"
    ? await ensureJobOrder(job.id, job)
    : await getJobOrder(job.id);
  if (!spec) notFound();
  if (access === "vendor" && spec.status !== "issued") notFound();

  const vendors = await listVendors({ type: "Printing", activeOnly: false }).catch(() => []);
  const vendor =
    vendors.find((v) => job.printingVendorId && v.id === job.printingVendorId) ||
    vendors.find((v) => v.name && v.name.trim().toLowerCase() === (job.printingVendor || "").trim().toLowerCase()) ||
    null;

  return (
    <PrintView
      // The vendor sheet deliberately omits the end client's company name and
      // the order rate. Brand is shown because it is on the artwork anyway.
      job={{
        jNumber: job.jNumber,
        item: job.item,
        itemSize: job.itemSize,
        brand: job.brand,
        masterSku: job.masterSku,
        printingVendor: job.printingVendor,
      }}
      vendor={vendor ? { name: vendor.name, contactPerson: vendor.contactPerson, phone: vendor.phone, email: vendor.email } : null}
      spec={spec}
      colours={colours}
      // ?print=0 previews without popping the print dialog.
      autoPrint={access === "internal" && searchParams?.print !== "0"}
    />
  );
}
