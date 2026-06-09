// Shared job-access helpers used by every endpoint that reads or mutates a
// specific job. Two complementary primitives:
//
//   resolveJobAccess(session, jobId) — async, async-fetches the job and
//     returns the caller's relationship to it. Used by vendor-facing + team-
//     facing job APIs (thread, vendor status, invoices) where the route
//     needs to know "is this the assigned vendor or an internal user, and
//     what's the vendor row?".
//       access = "internal" → admin / FM / FE / AM (AM scoped to own clients)
//       access = "vendor"   → the printing vendor this job is assigned to
//       access = null       → no access
//
//   sessionCanSeeJob(session, job) — sync, takes an already-loaded job.
//     Used by every per-job CRUD endpoint (jobs/[id], jobs/[id]/lr-files,
//     etc.) so there's exactly one definition of "can this session touch
//     this job?". Previously every route had its own slightly-different
//     copy: jobs/[id]/route.js excluded FE from the early-return (delete-
//     but-not-read), lr-files/route.js used a narrower AM-only check that
//     dropped the customerManagerId branch (audit H5 + M3).
//
// Both mirror repo.listJobsForSession scoping so a guessed job id can't
// leak another vendor's (or another AM's) job.

import { getJob, getVendor } from "./repo";
import { ROLES } from "./constants.js";
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

export function sessionCanSeeJob(session, job) {
  if (!session || !job) return false;
  // Hub-level password admin (no factoryos role on cookie, just isAdmin=true).
  if (session.isAdmin) return true;
  const role = session.modules?.factoryos;
  // Internal staff with no client-scoping: full access.
  if (
    role === ROLES.ADMIN ||
    role === ROLES.FACTORY_MANAGER ||
    role === ROLES.FACTORY_EXECUTIVE
  ) {
    return true;
  }
  const myClients = new Set(session.factoryosClientIds || []);
  if (role === ROLES.ACCOUNT_MANAGER) {
    // AM sees a job if they manage one of its customers OR they are the job's
    // designated customer manager (mirrors listJobsForSession's AM filter).
    return job.clientIds.some((c) => myClients.has(c)) ||
      (job.customerManagerId && job.customerManagerId === session.factoryosUserId);
  }
  if (role === ROLES.CUSTOMER) {
    return job.clientIds.some((c) => myClients.has(c));
  }
  return false;
}
