// Hub-level admin login. One shared password (`ADMIN_PASSWORD`) grants admin
// access to every module via the unified hub session cookie. Phase 1.5d
// retired the per-module legacy cookies (aeros_session,
// aeros_factoryos_session); the unified cookie carries module-level role
// at modules.{calculator,factoryos,rate_cards} and is read by middleware,
// pages, and API routes alike.
import { cookies } from "next/headers";
import { signSession as signHub, sessionCookie as hubCookie } from "@/lib/hub/auth";
import { adminEntitlements } from "@/lib/hub/users";

export const runtime = "nodejs";

export async function POST(req) {
  const { password } = await req.json().catch(() => ({}));
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return Response.json({ error: "Admin password not configured" }, { status: 500 });
  if (!password || password !== expected) {
    return Response.json({ error: "Incorrect password" }, { status: 401 });
  }

  const ents = adminEntitlements();
  const jar = cookies();

  // Hub cookie carries factoryosUserId + factoryosClientIds so the unified
  // session helpers can serve callers that today reach for the legacy
  // factoryos cookie. Password admin has no users row → both stay
  // null/[] (adminEntitlements() already returns those defaults).
  jar.set(hubCookie(signHub({
    email: ents.email,
    name: ents.name,
    isAdmin: true,
    modules: ents.modules,
    factoryosUserId: ents.factoryosUserId ?? null,
    factoryosClientIds: ents.factoryosClientIds ?? [],
  })));

  return Response.json({ ok: true });
}
