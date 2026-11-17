import { getSession, requireManager } from "@/lib/auth/session";
import { normaliseSoNumber } from "@/lib/zoho/books";
import { dbInsert, dbDelete } from "@/lib/db/supabase";

export const runtime = "nodejs";

// POST { number, reason, customer?, date? } — mark a Zoho SO as not needing a
// FactoryOS job (stock, traded item, sample). DELETE { number } — undo.
// Managers only (Rahul, Sachin, admins).
export async function POST(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireManager(session)) return Response.json({ error: "Only a factory manager or admin can do this" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const number = normaliseSoNumber(body.number);
  const reason = String(body.reason || "").trim().slice(0, 200);
  if (!number) return Response.json({ error: "SO number missing" }, { status: 400 });
  if (!reason) return Response.json({ error: "Give the reason this SO needs no job" }, { status: 400 });
  await dbInsert("zoho_so_reviews", {
    so_number: number, decision: "no_job_needed", reason,
    customer: body.customer ? String(body.customer).slice(0, 200) : null,
    so_date: /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || "")) ? body.date : null,
    reviewed_by_email: session.email || "admin",
  }, { onConflict: "so_number" });
  return Response.json({ ok: true });
}

export async function DELETE(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireManager(session)) return Response.json({ error: "Not allowed" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const number = normaliseSoNumber(body.number);
  if (!number) return Response.json({ error: "SO number missing" }, { status: 400 });
  await dbDelete("zoho_so_reviews", "so_number", number);
  return Response.json({ ok: true });
}
