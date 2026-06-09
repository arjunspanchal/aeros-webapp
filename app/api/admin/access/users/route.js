// Unified Access admin — list users + clients in one shot. The page-level
// editor reads this on mount and patches per-user via the [id] route.

import { getSession } from "@/lib/auth/session";
import { listAccessUsers, listAccessClients, listAccessVendors } from "@/lib/access/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-only — Factory Managers no longer get to change other people's
// access from /admin/access. They can still see jobs / RM / users-as-list
// elsewhere; this surface is reserved for the platform admin.
function isStaffAdmin(session) {
  if (!session) return false;
  if (session.isAdmin) return true;
  return session.modules?.factoryos === "admin";
}

export async function GET(req) {
  const session = getSession();
  if (!isStaffAdmin(session)) return new Response("Forbidden", { status: 403 });
  try {
    const url = new URL(req.url);
    const search = url.searchParams.get("q") || "";
    const [users, clients, vendors] = await Promise.all([
      listAccessUsers({ search }),
      listAccessClients(),
      listAccessVendors(),
    ]);
    return Response.json({ users, clients, vendors });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
