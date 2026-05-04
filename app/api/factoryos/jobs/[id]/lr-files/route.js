import { getSession as getFactoryosSession } from "@/lib/factoryos/session";
import { getSession, requireInternal, requireRole } from "@/lib/auth/session";
import { getJob, attachJobLrFile } from "@/lib/factoryos/repo";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["application/pdf", "image/jpeg", "image/png"]);

// POST /api/factoryos/jobs/[id]/lr-files
// Upload a Lorry Receipt copy (PDF/JPG/PNG). AM scoped to own clients.
export async function POST(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireInternal(session)) return new Response("Forbidden", { status: 403 });
  // Legacy factoryos session for s.clientIds — collapses in PR 1.5.
  const s = getFactoryosSession();
  try {
    const job = await getJob(params.id);
    if (!job) return Response.json({ error: "Not found" }, { status: 404 });

    if (requireRole(session, "factoryos", "account_manager")) {
      const myClients = new Set(s.clientIds || []);
      const ok = job.clientIds.some((c) => myClients.has(c));
      if (!ok) return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { filename, contentType, fileBase64 } = body;
    if (!filename || !fileBase64) return Response.json({ error: "filename and fileBase64 required" }, { status: 400 });
    if (!ALLOWED.has((contentType || "").toLowerCase())) {
      return Response.json({ error: "Only PDF, JPG, or PNG accepted" }, { status: 400 });
    }
    const rawBytes = Math.floor((fileBase64.length * 3) / 4);
    if (rawBytes > MAX_BYTES) return Response.json({ error: "File too large. Max 5 MB." }, { status: 413 });

    await attachJobLrFile({ jobId: job.id, contentType, filename, fileBase64 });
    // Return the refreshed job so the client can update state.
    const refreshed = await getJob(job.id);
    return Response.json({ job: refreshed });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
