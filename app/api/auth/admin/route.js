// Hub-level admin login. One shared password (`ADMIN_PASSWORD`) grants admin
// access to every module. Mints all three cookies (hub + calc + factoryos)
// with admin-equivalent role.
import { cookies } from "next/headers";
import { signSession as signHub, sessionCookie as hubCookie } from "@/lib/hub/auth";
import { signSession as signCalc, sessionCookie as calcCookie } from "@/lib/calc/auth";
import { signSession as signFactoryos, sessionCookie as factoryosCookie } from "@/lib/factoryos/auth";
import { ROLES } from "@/lib/factoryos/constants";
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
  jar.set(calcCookie(signCalc({ role: "admin" })));
  jar.set(factoryosCookie(signFactoryos({ role: ROLES.ADMIN, name: "Admin" })));

  return Response.json({ ok: true });
}
