import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { listCustomerDocuments, listJobsForSession } from "@/lib/factoryos/repo";
import { ROLES } from "@/lib/factoryos/constants";
import CustomerDocumentsClient from "./CustomerDocumentsClient";

export const dynamic = "force-dynamic";

// Cross-job documents library — every artwork, proof, challan and LR file
// the customer has access to, in one searchable place. Mirrors the per-order
// Documents panel but flattened across the whole account.
export default async function CustomerDocumentsPage() {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.factoryos;
  if (!session || !role) redirect("/login");
  if (role !== ROLES.CUSTOMER) redirect("/factoryos");

  const jobs = await listJobsForSession({
    role,
    userId: session.factoryosUserId,
    clientIds: session.factoryosClientIds,
  });
  const jobIds = jobs.map((j) => j.id);
  const threadDocs = await listCustomerDocuments(jobIds);

  // Pull LR files from the Airtable job records too — they aren't in
  // job_messages (yet), but customers will look for them here.
  const lrDocs = [];
  for (const j of jobs) {
    for (const f of j.lrFiles || []) {
      lrDocs.push({
        id: `lr-${j.id}-${f.id || f.filename}`,
        kind: "lr",
        authorRole: "team",
        filename: f.filename || "LR file",
        contentType: f.type || null,
        sizeBytes: f.size || null,
        url: f.url || null,
        createdAt: null,
        jobId: j.id,
        jNumber: j.jNumber,
        jobItem: j.item,
        jobBrand: j.brand,
      });
    }
  }

  const all = [...threadDocs, ...lrDocs].sort((a, b) => {
    if (a.createdAt && b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    if (a.createdAt) return -1;
    if (b.createdAt) return 1;
    return 0;
  });

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <CustomerDocumentsClient initialDocs={all} />
    </main>
  );
}
