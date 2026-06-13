// HR view of leave requests. Admin sees all; Manager sees only their reports'.
import { getSession, hasModule } from "@/lib/auth/session";
import { listLeaveRequests, listEmployees } from "@/lib/factoryos/repo";
import { hrScope } from "@/lib/factoryos/hrScope";

export const runtime = "nodejs";

export async function GET(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!hasModule(session, "hr")) return new Response("Forbidden", { status: 403 });
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") || undefined;
    let requests = await listLeaveRequests({ status });
    const scope = await hrScope(session);
    if (!scope.isAdmin) {
      const mine = await listEmployees({ managerUserId: scope.managerUserId });
      const ids = new Set(mine.map((e) => e.id)); // public ids
      requests = requests.filter((r) => ids.has(r.employeePublicId));
    }
    return Response.json({ requests });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
