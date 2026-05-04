// List rate cards (client → own only, admin → all) and create new ones (admin).

import { getSession, requireRole, requireAdminStrict } from "@/lib/auth/session";
import { listCards, createCard } from "@/lib/rate-cards/store";
import { nextCardRef } from "@/lib/rate-cards/ref";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Hub admin OR module-level rate-cards admin. Mirrors the legacy
// requireRateCardAdmin semantics (which treated session.isAdmin as
// equivalent to a rate-cards admin role).
function isRateCardAdmin(session) {
  return requireAdminStrict(session) || requireRole(session, "rate_cards", "admin");
}

export async function GET() {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  // Caller must have any rate-cards entitlement (admin or client). Hub admin
  // passes via the admin path. Anyone else with no rate_cards module is 401.
  if (!isRateCardAdmin(session) && !requireRole(session, "rate_cards", "client")) {
    return new Response("Unauthorized", { status: 401 });
  }
  const opts = {};
  if (!isRateCardAdmin(session)) {
    opts.clientEmail = session.email;
  }
  const cards = await listCards(opts);
  return Response.json(cards);
}

export async function POST(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!isRateCardAdmin(session)) return new Response("Forbidden", { status: 403 });
  const body = await req.json();
  const clientEmail = (body.clientEmail || "").trim().toLowerCase();
  if (!clientEmail) return Response.json({ error: "clientEmail required" }, { status: 400 });

  const ref = body.ref || await nextCardRef({
    clientEmail,
    clientName: body.clientName,
    brand: body.brand,
  });

  const card = await createCard({
    ref,
    title: body.title,
    clientEmail,
    clientName: body.clientName,
    brand: body.brand,
    status: body.status || "Draft",
    terms: body.terms,
  });
  return Response.json(card);
}
