import { getSession, requireManager } from "@/lib/auth/session";
import { listCoatingJobs, createCoatingJob } from "@/lib/factoryos/repo";

export const runtime = "nodejs";

// GET /api/factoryos/coating — list all coating jobs
export async function GET() {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  try {
    const jobs = await listCoatingJobs();
    return Response.json({ jobs });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

// POST /api/factoryos/coating — send-out flow
export async function POST(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireManager(session)) return new Response("Forbidden", { status: 403 });
  try {
    const body = await req.json();
    const result = await createCoatingJob({
      sourceStockLineId: body.sourceStockLineId,
      coater: body.coater,
      coatingType: body.coatingType,
      qtySent: body.qtySent,
      sentDate: body.sentDate,
      notes: body.notes,
      createdByEmail: session.email || "",
    });
    return Response.json(result);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 400 });
  }
}
