// Shared job-access resolver for vendor-facing + team-facing job APIs
// (thread, vendor status, invoices). Returns the job plus the caller's
// relationship to it:
//   access = "internal" → admin / FM / FE / AM (AM scoped to own clients)
//   access = "vendor"   → the printing vendor this job is assigned to
//   access = null       → no access
//
// Mirrors repo.listJobsForSession scoping so a guessed job id can't leak
// another vendor's (or another AM's) job.

import { getJob, getVendor } from "./repo";
import { requireInternal, requireRole } from "@/lib/auth/session";

export async function resolveJobAccess(session, jobId) {
  if (!session) return { job: null, access: null, vendor: null };
  const job = await getJob(jobId);
  if (!job) return { job: null, access: null, vendor: null };

  if (requireInternal(session)) {
    if (requireRole(session, "factoryos", "account_manager")) {
      const myClients = new Set(session.factoryosClientIds || []);
      if (!job.clientIds.some((c) => myClients.has(c))) return { job, access: null, vendor: null };
    }
    return { job, access: "internal", vendor: null };
  }

  if (requireRole(session, "factoryos", "vendor")) {
    const vendor = session.factoryosVendorId ? await getVendor(session.factoryosVendorId) : null;
    const vid = session.factoryosVendorId || null;
    const vn = (vendor?.name || "").trim().toLowerCase();
    const owns =
      (vid && job.printingVendorId === vid) ||
      (vn && (job.printingVendor || "").trim().toLowerCase() === vn);
    if (owns) return { job, access: "vendor", vendor };
  }

  return { job, access: null, vendor: null };
}
