import { getSession, hasModule } from "@/lib/auth/session";
import { listPayouts, createPayout } from "@/lib/payouts/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function guard(session) {
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!hasModule(session, "payouts")) return new Response("Forbidden", { status: 403 });
  return null;
}

export async function GET(req) {
  const session = getSession();
  const bad = guard(session);
  if (bad) return bad;
  try {
    const url = new URL(req.url);
    const from = url.searchParams.get("from") || undefined;
    const to = url.searchParams.get("to") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const payouts = await listPayouts({ from, to, status });
    return Response.json({ payouts });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

export async function POST(req) {
  const session = getSession();
  const bad = guard(session);
  if (bad) return bad;
  try {
    const body = await req.json();
    const payout = await createPayout({
      vendorId: body.vendorId || null,
      vendorName: body.vendorName || "",
      amount: body.amount,
      currency: body.currency || "INR",
      dueDate: body.dueDate || null,
      note: body.note || "",
      createdByEmail: session.email || null,
    });
    return Response.json({ payout });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 400 });
  }
}
