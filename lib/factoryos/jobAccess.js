// Shared "can this session read this job?" check. Used by every endpoint
// that reads or mutates a specific job (jobs/[id], jobs/[id]/lr-files, etc.)
// so there's exactly one definition of scope.
//
// Historical: this lived inline at app/api/factoryos/jobs/[id]/route.js.
// app/api/factoryos/jobs/[id]/lr-files/route.js had its own narrower
// AM-only variant that dropped the customerManagerId branch, which meant
// an AM who could see + edit a job because they were its Customer Manager
// (not the client's AM) got 403 on LR upload. Audit M3.
//
// FE behaviour: listJobsForSession returns every job for FE (no scoping),
// the manager job list renders for FE, and the DELETE allow-list includes
// FE — but this function previously fell through to `return false` for
// them, leaving FE with delete-but-not-read access. Audit H5.

import { ROLES } from "./constants.js";

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
