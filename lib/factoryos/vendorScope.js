// Single definition of "does this printing vendor own this job?", shared by
// the repo (listJobsForSession) and jobAccess (route guards) so the two can't
// drift. Kept dependency-free to avoid an import cycle (repo ↔ jobAccess).
//
// Prefers the robust FK (jobs.printing_vendor_id). The legacy text-snapshot
// name match is ONLY a fallback for jobs not yet FK-linked — without this
// preference, two vendor records sharing a trading name ("Sai Printers") could
// cross-access each other's FK-linked jobs whenever the name happened to match
// (audit H2). A vendor with neither id nor a matching name owns nothing.
export function vendorOwnsJob(job, vendorId, vendorName) {
  if (!job) return false;
  if (job.printingVendorId) {
    return !!vendorId && job.printingVendorId === vendorId;
  }
  const vn = (vendorName || "").trim().toLowerCase();
  return !!vn && (job.printingVendor || "").trim().toLowerCase() === vn;
}
