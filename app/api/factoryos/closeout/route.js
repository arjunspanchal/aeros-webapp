import { getSession, requireInternal } from "@/lib/auth/session";
import { bulkDeliver, bulkCloseOld } from "@/lib/factoryos/closeout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { action: "deliver", ids, deliveredOn }
//   marks Dispatched jobs delivered (warehouse, sales, admin).
// POST { action: "close_old", ids, deliveredOn, leftOn?, reason }
//   admin only: closes Ready for Dispatch jobs that left long ago with no
//   dispatch record. Written on each job's timeline as an admin override.
export async function POST(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireInternal(session)) return new Response("Forbidden", { status: 403 });
  let body;
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }
  try {
    const res = body?.action === "close_old"
      ? await bulkCloseOld({ session, ids: body.ids, deliveredOn: body.deliveredOn, leftOn: body.leftOn || "", reason: body.reason })
      : body?.action === "deliver"
        ? await bulkDeliver({ session, ids: body.ids, deliveredOn: body.deliveredOn })
        : { ok: false, status: 400, error: "Unknown action" };
    if (!res.ok) return Response.json({ error: res.error }, { status: res.status || 400 });
    return Response.json({ done: res.done, failed: res.failed });
  } catch (e) {
    console.error("closeout failed:", e);
    return Response.json({ error: "Could not save. Nothing may have changed; reload and check." }, { status: 500 });
  }
}
