import { getSession, hasModule } from "@/lib/auth/session";
import { updatePayout, setPaid, deletePayout } from "@/lib/payouts/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function guard(session) {
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!hasModule(session, "payouts")) return new Response("Forbidden", { status: 403 });
  return null;
}

// PATCH handles both the mark-paid toggle ({ paid: true|false }) and field
// edits ({ vendorId, vendorName, amount, dueDate, note }). The presence of a
// `paid` key routes to setPaid; otherwise it's a field update.
export async function PATCH(req, { params }) {
  const session = getSession();
  const bad = guard(session);
  if (bad) return bad;
  try {
    const body = await req.json();
    let payout;
    if (Object.prototype.hasOwnProperty.call(body, "paid")) {
      payout = await setPaid(params.id, { paid: !!body.paid, email: session.email || null });
    } else {
      payout = await updatePayout(params.id, body);
    }
    if (!payout) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ payout });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 400 });
  }
}

export async function DELETE(_req, { params }) {
  const session = getSession();
  const bad = guard(session);
  if (bad) return bad;
  try {
    await deletePayout(params.id);
    return Response.json({ ok: true });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
