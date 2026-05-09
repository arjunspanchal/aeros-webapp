// Patch a single user's access record. Field whitelist + value coercion
// lives in lib/access/users.js#updateAccessUser.

import { getSession } from "@/lib/auth/session";
import { updateAccessUser, getAccessUser } from "@/lib/access/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isStaffAdmin(session) {
  if (!session) return false;
  if (session.isAdmin) return true;
  return session.modules?.factoryos === "admin";
}

export async function GET(_req, { params }) {
  const session = getSession();
  if (!isStaffAdmin(session)) return new Response("Forbidden", { status: 403 });
  const user = await getAccessUser(params.id);
  if (!user) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ user });
}

export async function PATCH(req, { params }) {
  const session = getSession();
  if (!isStaffAdmin(session)) return new Response("Forbidden", { status: 403 });
  let body;
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  try {
    const user = await updateAccessUser(params.id, body);
    return Response.json({ user });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
