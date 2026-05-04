// One rate card: fetch (header + priced items), update header, delete card.

import { getSession, requireRole, requireAdminStrict } from "@/lib/auth/session";
import { getCard, updateCard, deleteCard, listItems } from "@/lib/rate-cards/store";
import { priceAll } from "@/lib/rate-cards/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Hub admin OR module-level rate-cards admin. Mirrors the legacy
// requireRateCardAdmin semantics (which treated session.isAdmin as
// equivalent to a rate-cards admin role).
function isRateCardAdmin(session) {
  return requireAdminStrict(session) || requireRole(session, "rate_cards", "admin");
}

export async function GET(_req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  // Either rate-card role grants visibility — admins to all, clients to own.
  if (!isRateCardAdmin(session) && !requireRole(session, "rate_cards", "client")) {
    return new Response("Unauthorized", { status: 401 });
  }
  const card = await getCard(params.id);
  if (!card) return Response.json({ error: "Not found" }, { status: 404 });

  // Client ownership check — admins (hub or module-level) bypass this.
  if (!isRateCardAdmin(session) && card.clientEmail !== session.email) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const items = await listItems(card.ref);
  const priced = priceAll(items);
  return Response.json({ card, items: priced });
}

export async function PATCH(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!isRateCardAdmin(session)) return new Response("Forbidden", { status: 403 });
  const body = await req.json();
  const updated = await updateCard(params.id, body);
  return Response.json(updated);
}

export async function DELETE(_req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!isRateCardAdmin(session)) return new Response("Forbidden", { status: 403 });
  await deleteCard(params.id);
  return Response.json({ ok: true });
}
