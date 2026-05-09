import { getSession, requireManager } from "@/lib/auth/session";
import { listUsers, createUser, findUserByEmail } from "@/lib/factoryos/repo";
import { normalizeEmail } from "@/lib/factoryos/auth";
import { ROLES } from "@/lib/factoryos/constants";

export const runtime = "nodejs";

const VALID_ROLES = new Set([
  ROLES.ACCOUNT_MANAGER,
  ROLES.FACTORY_MANAGER,
  ROLES.FACTORY_EXECUTIVE,
  ROLES.CUSTOMER,
]);

export async function GET() {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireManager(session)) return new Response("Forbidden", { status: 403 });
  try {
    const users = await listUsers();
    return Response.json({ users });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

export async function POST(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireManager(session)) return new Response("Forbidden", { status: 403 });
  try {
    const body = await req.json();
    const email = normalizeEmail(body.email);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "Valid email required" }, { status: 400 });
    }
    if (!VALID_ROLES.has(body.role)) {
      return Response.json({ error: "Invalid role (admin is password-only)" }, { status: 400 });
    }
    if (body.role === ROLES.CUSTOMER && !(body.clientIds && body.clientIds.length)) {
      return Response.json({ error: "Customer-role users must be linked to at least one customer." }, { status: 400 });
    }
    const existing = await findUserByEmail(email);
    if (existing) return Response.json({ error: "User with that email already exists" }, { status: 409 });

    const user = await createUser({
      email,
      name: body.name || "",
      role: body.role,
      clientIds: body.clientIds || [],
      active: true,
    });
    return Response.json({ user });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
