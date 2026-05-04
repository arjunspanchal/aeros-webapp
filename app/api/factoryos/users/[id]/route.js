import { getSession, requireManager } from "@/lib/auth/session";
import { updateUser, getUser } from "@/lib/factoryos/repo";
import { ROLES } from "@/lib/factoryos/constants";

export const runtime = "nodejs";

export async function PATCH(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireManager(session)) return new Response("Forbidden", { status: 403 });
  try {
    const body = await req.json();

    // Validate role if being changed
    if (body.role) {
      const validRoles = new Set([
        ROLES.ACCOUNT_MANAGER,
        ROLES.FACTORY_MANAGER,
        ROLES.FACTORY_EXECUTIVE,
        ROLES.CUSTOMER,
      ]);
      if (!validRoles.has(body.role)) {
        return Response.json({ error: "Invalid role (admin is password-only)" }, { status: 400 });
      }
    }

    // Get existing user to check current role if not updating it
    const existingUser = await getUser(params.id);
    if (!existingUser) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const roleToCheck = body.role || existingUser.role;

    // Customers must have at least one client
    if (body.clientIds !== undefined && roleToCheck === ROLES.CUSTOMER) {
      if (!Array.isArray(body.clientIds) || body.clientIds.length === 0) {
        return Response.json({ error: "Customers must be linked to at least one Client" }, { status: 400 });
      }
    }

    const user = await updateUser(params.id, body);
    return Response.json({ user });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
