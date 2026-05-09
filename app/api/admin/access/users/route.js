// Unified Access admin — list users + clients in one shot. The page-level
// editor reads this on mount and patches per-user via the [id] route.

import { getSession } from "@/lib/auth/session";
import { listAccessUsers, listAccessClients } from "@/lib/access/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isStaffAdmin(session) {
  if (!session) return false;
  if (session.isAdmin) return true;
  // Allow Factory Manager too — same gate as the FactoryOS Users admin
  // currently uses (requireManager). Anyone weaker than FM shouldn't be
  // changing other people's access.
  const r = session.modules?.factoryos;
  return r === "admin" || r === "factory_manager";
}

export async function GET(req) {
  const session = getSession();
  if (!isStaffAdmin(session)) return new Response("Forbidden", { status: 403 });
  try {
    const url = new URL(req.url);
    const search = url.searchParams.get("q") || "";
    const [users, clients] = await Promise.all([
      listAccessUsers({ search }),
      listAccessClients(),
    ]);
    return Response.json({ users, clients });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
