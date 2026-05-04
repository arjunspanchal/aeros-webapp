// Per-item update / delete. Admin only.

import { getSession, requireRole, requireAdminStrict } from "@/lib/auth/session";
import { updateItem, deleteItem } from "@/lib/rate-cards/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRateCardAdmin(session) {
  return requireAdminStrict(session) || requireRole(session, "rate_cards", "admin");
}

export async function PATCH(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!isRateCardAdmin(session)) return new Response("Forbidden", { status: 403 });
  const body = await req.json();
  const item = await updateItem(params.itemId, body);
  return Response.json(item);
}

export async function DELETE(_req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!isRateCardAdmin(session)) return new Response("Forbidden", { status: 403 });
  await deleteItem(params.itemId);
  return Response.json({ ok: true });
}
