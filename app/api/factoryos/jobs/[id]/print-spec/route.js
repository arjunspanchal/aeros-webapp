import { getSession, requireManager } from "@/lib/auth/session";
import { resolveJobAccess } from "@/lib/factoryos/jobAccess";
import { postJobMessage } from "@/lib/factoryos/repo";
import {
  getJobOrder,
  ensureJobOrder,
  saveJobOrder,
  issueJobOrder,
  unissueJobOrder,
  ackJobOrder,
} from "@/lib/factoryos/jobOrder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The vendor job order carries plate charges and internal instructions, so
// `customer` access — which resolveJobAccess grants for the client's own
// users — is deliberately NOT enough to read it.
function canRead(access) {
  return access === "internal" || access === "vendor";
}

// GET /api/factoryos/jobs/[id]/print-spec
// Vendors only ever see an issued order; a draft reads as "not ready yet"
// rather than leaking a half-written spec.
export async function GET(_req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { job, access } = await resolveJobAccess(session, params.id);
  if (!job || !canRead(access)) return Response.json({ error: "Not found" }, { status: 404 });

  const order = await getJobOrder(job.id);
  if (access === "vendor" && order.spec?.status !== "issued") {
    return Response.json({ spec: null, colours: [], pending: true });
  }
  return Response.json(order);
}

// PUT /api/factoryos/jobs/[id]/print-spec — save the spec + colour list.
// Internal managers only: a vendor reads their order, they don't author it.
export async function PUT(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { job, access } = await resolveJobAccess(session, params.id);
  if (!job || access !== "internal") return Response.json({ error: "Not found" }, { status: 404 });
  if (!requireManager(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const order = await saveJobOrder(job.id, body, { job });
    return Response.json(order);
  } catch (e) {
    console.error("print-spec save failed:", e);
    return Response.json({ error: "Could not save the job order" }, { status: 500 });
  }
}

// POST /api/factoryos/jobs/[id]/print-spec — lifecycle actions.
//   issue / unissue : internal managers
//   ack             : the assigned vendor
export async function POST(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { job, access } = await resolveJobAccess(session, params.id);
  if (!job || !canRead(access)) return Response.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const action = body?.action;

  try {
    if (action === "ack") {
      if (access !== "vendor") return Response.json({ error: "Forbidden" }, { status: 403 });
      const order = await ackJobOrder(job.id, { by: session.email || null });
      if (!order) return Response.json({ error: "No issued job order to accept" }, { status: 409 });
      await postJobMessage({
        jobId: job.id,
        body: `Job order rev ${order.spec?.rev} accepted by vendor`,
        authorEmail: session.email || null,
        authorRole: "vendor",
        kind: "system",
      }).catch(() => {});
      return Response.json(order);
    }

    if (access !== "internal" || !requireManager(session)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    if (action === "issue") {
      const order = await issueJobOrder(job.id, { email: session.email || null });
      if (!order?.spec) return Response.json({ error: "No job order to issue" }, { status: 409 });
      await postJobMessage({
        jobId: job.id,
        body: `Job order rev ${order.spec.rev} issued to ${job.printingVendor || "the printing vendor"}`,
        authorEmail: session.email || null,
        authorRole: "team",
        kind: "system",
      }).catch(() => {});
      return Response.json(order);
    }

    if (action === "unissue") {
      const order = await unissueJobOrder(job.id);
      return Response.json(order);
    }

    if (action === "ensure") {
      return Response.json(await ensureJobOrder(job.id, job));
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("print-spec action failed:", e);
    return Response.json({ error: "Could not update the job order" }, { status: 500 });
  }
}
