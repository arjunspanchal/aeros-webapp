import { getSession, hasModule } from "@/lib/auth/session";
import { recordPayment } from "@/lib/payouts/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function guard(session) {
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!hasModule(session, "payouts")) return new Response("Forbidden", { status: 403 });
  return null;
}

// Record a partial payment (installment) against a payout. Body: { amount, note }.
// Returns the refreshed payout with its updated outstanding + status.
export async function POST(req, { params }) {
  const session = getSession();
  const bad = guard(session);
  if (bad) return bad;
  try {
    const body = await req.json();
    const payout = await recordPayment(params.id, {
      amount: body.amount,
      note: body.note || "",
      email: session.email || null,
    });
    return Response.json({ payout });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 400 });
  }
}
