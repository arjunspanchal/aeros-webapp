import { getSession } from "@/lib/auth/session";
import { resolveJobAccess } from "@/lib/factoryos/jobAccess";
import { updateJob } from "@/lib/factoryos/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/factoryos/vendor/jobs/[id]
// Vendor updates their committed delivery date (the job's Printing Due Date).
// Ownership goes through the shared resolveJobAccess so the scoping rule lives
// in exactly one place (audit H3). A 404 is returned for both "no such job" and
// "not your job" so the route can't be used to probe which ids exist (M5).
export async function PATCH(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { job, access } = await resolveJobAccess(session, params.id);
  if (!job || access !== "vendor") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

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
    return Response.json({ error: "Could not save date" }, { status: 500 });
  }
}
