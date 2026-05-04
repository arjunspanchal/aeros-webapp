// Create a new line item on a given rate card. Admin only.

import { getSession, requireRole, requireAdminStrict } from "@/lib/auth/session";
import { getCard, createItem } from "@/lib/rate-cards/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRateCardAdmin(session) {
  return requireAdminStrict(session) || requireRole(session, "rate_cards", "admin");
}

export async function POST(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!isRateCardAdmin(session)) return new Response("Forbidden", { status: 403 });
  const card = await getCard(params.id);
  if (!card) return Response.json({ error: "Rate card not found" }, { status: 404 });
  const body = await req.json();
  const item = await createItem({ cardId: card.id, cardRef: card.ref }, body);
  return Response.json(item);
}
