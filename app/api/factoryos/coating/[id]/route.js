import { getSession, requireManager } from "@/lib/auth/session";
import { receiveCoatingJob, cancelCoatingJob } from "@/lib/factoryos/repo";

export const runtime = "nodejs";

// PATCH /api/factoryos/coating/[id]
// Body variants:
//   { action: "receive", qtyReturned, peRate, returnDate?, invoiceNumber?, notes? }
//   { action: "cancel",  reason? }
export async function PATCH(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireManager(session)) return new Response("Forbidden", { status: 403 });
  try {
    const body = await req.json();
    const action = body.action || "receive";
    if (action === "receive") {
      const out = await receiveCoatingJob({
        jobId: params.id,
        qtyReturned: body.qtyReturned,
        peRate: body.peRate,
        returnDate: body.returnDate,
        invoiceNumber: body.invoiceNumber,
        notes: body.notes,
      });
      return Response.json(out);
    }
    if (action === "cancel") {
      const out = await cancelCoatingJob({ jobId: params.id, reason: body.reason });
      return Response.json(out);
    }
    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 400 });
  }
}
