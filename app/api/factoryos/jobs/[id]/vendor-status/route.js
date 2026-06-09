import { getSession } from "@/lib/auth/session";
import { resolveJobAccess } from "@/lib/factoryos/jobAccess";
import { setVendorStatus, postJobMessage, VENDOR_STATUSES } from "@/lib/factoryos/repo";

export const runtime = "nodejs";

const VALID = new Set(VENDOR_STATUSES.map((s) => s.value));
const LABEL = Object.fromEntries(VENDOR_STATUSES.map((s) => [s.value, s.label]));

// PATCH /api/factoryos/jobs/[id]/vendor-status
// Vendor (or team, on the vendor's behalf) advances the vendor milestone.
// 'dispatched' may carry a dispatch date. A system note is posted to the
// thread so progress is visible in the conversation timeline.
export async function PATCH(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { job, access } = await resolveJobAccess(session, params.id);
  if (!job) return Response.json({ error: "Not found" }, { status: 404 });
  if (!access) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const status = body.status;
  if (!VALID.has(status)) return Response.json({ error: "Invalid status" }, { status: 400 });

  let dispatchDate = null;
  if (status === "dispatched" && body.dispatchDate) {
    const d = String(body.dispatchDate).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return Response.json({ error: "Invalid date" }, { status: 400 });
    dispatchDate = d;
  }

  try {
    const updated = await setVendorStatus(job.id, status, { dispatchDate });
    const who = access === "vendor" ? "vendor" : "team";
    await postJobMessage({
      jobId: job.id,
      body: `Marked: ${LABEL[status]}${dispatchDate ? ` (${dispatchDate})` : ""}`,
      authorEmail: session.email || null,
      authorRole: who,
      kind: "system",
    }).catch(() => {});
    return Response.json({ job: updated });
  } catch (e) {
    console.error("vendor-status update failed:", e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
