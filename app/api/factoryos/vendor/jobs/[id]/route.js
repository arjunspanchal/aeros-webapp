import { getSession, requireRole } from "@/lib/auth/session";
import { getJob, getVendor, updateJob } from "@/lib/factoryos/repo";

export const runtime = "nodejs";

// Confirm the signed-in vendor owns this job. Mirrors repo.listJobsForSession
// scoping: primary match on printing_vendor_id, name-snapshot fallback.
async function resolveOwnedJob(session, jobId) {
  const job = await getJob(jobId);
  if (!job) return { error: "Not found", status: 404 };
  const vendor = session.factoryosVendorId ? await getVendor(session.factoryosVendorId) : null;
  const vid = session.factoryosVendorId || null;
  const vn = (vendor?.name || "").trim().toLowerCase();
  const owns =
    (vid && job.printingVendorId === vid) ||
    (vn && (job.printingVendor || "").trim().toLowerCase() === vn);
  if (!owns) return { error: "Forbidden", status: 403 };
  return { job };
}

// PATCH /api/factoryos/vendor/jobs/[id]
// Vendor updates their committed delivery date (the job's Printing Due Date).
export async function PATCH(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireRole(session, "factoryos", "vendor")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { job, error, status } = await resolveOwnedJob(session, params.id);
  if (error) return Response.json({ error }, { status });

  const body = await req.json().catch(() => ({}));
  if (!("printingDueDate" in body)) {
    return Response.json({ error: "printingDueDate required" }, { status: 400 });
  }
  const raw = body.printingDueDate;
  // Accept an empty value to clear the date, or a YYYY-MM-DD string.
  let printingDueDate = null;
  if (raw) {
    const d = String(raw).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      return Response.json({ error: "Invalid date" }, { status: 400 });
    }
    printingDueDate = d;
  }

  try {
    const updated = await updateJob(job.id, { printingDueDate });
    return Response.json({ job: updated });
  } catch (e) {
    console.error("vendor due-date update failed:", e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
