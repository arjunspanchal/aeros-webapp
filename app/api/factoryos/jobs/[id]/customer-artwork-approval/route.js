import { getSession } from "@/lib/auth/session";
import { resolveJobAccess } from "@/lib/factoryos/jobAccess";
import {
  approveCustomerArtwork,
  getJobCustomerExtras,
  postJobMessage,
} from "@/lib/factoryos/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — customer signs off on the artwork the Aeros team posted on the thread.
// Stamps jobs.customer_artwork_approved_at and drops a system message on the
// thread so the team (and vendor) see the approval inline.
export async function POST(_req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { job, access } = await resolveJobAccess(session, params.id);
  if (!job || !access) return Response.json({ error: "Not found" }, { status: 404 });
  if (access !== "customer") {
    return Response.json({ error: "Only the customer can approve artwork." }, { status: 403 });
  }

  try {
    const approvedAt = await approveCustomerArtwork(job.id);
    await postJobMessage({
      jobId: job.id,
      body: "Customer approved artwork.",
      authorEmail: session.email || null,
      authorRole: "customer",
      kind: "system",
    }).catch(() => {});
    return Response.json({ approvedAt });
  } catch (e) {
    console.error("customer artwork approval failed:", e);
    return Response.json({ error: "Could not record approval" }, { status: 500 });
  }
}

// GET — current approval state (so the page can revalidate after a re-render).
export async function GET(_req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { job, access } = await resolveJobAccess(session, params.id);
  if (!job || !access) return Response.json({ error: "Not found" }, { status: 404 });
  const extras = await getJobCustomerExtras(job.id);
  return Response.json(extras);
}
