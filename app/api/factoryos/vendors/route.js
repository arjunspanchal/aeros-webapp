import { getSession, requireInternal, requireManager } from "@/lib/auth/session";
import { listVendors, createVendor } from "@/lib/factoryos/repo";
import { VENDOR_TYPES } from "@/lib/factoryos/constants";

export const runtime = "nodejs";

// Vendor directory is internal-only. Contacts, types, and (eventually rate-
// bearing) supplier records are not for customers — and external printing
// vendors must not see each other's entries. Internal = admin / FM / FE / AM.
// `requireInternal` allows hub-level isAdmin (password admin) too.
export async function GET(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireInternal(session)) return new Response("Forbidden", { status: 403 });
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || undefined;
    const activeOnly = searchParams.get("activeOnly") === "1";
    const vendors = await listVendors({ type, activeOnly });
    return Response.json({ vendors });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

export async function POST(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireManager(session)) return new Response("Forbidden", { status: 403 });
  try {
    const body = await req.json();
    if (!body.name || !body.name.trim()) {
      return Response.json({ error: "Name required" }, { status: 400 });
    }
    if (!body.type || !VENDOR_TYPES.includes(body.type)) {
      return Response.json({ error: `Type must be one of: ${VENDOR_TYPES.join(", ")}` }, { status: 400 });
    }
    const vendor = await createVendor({ ...body, name: body.name.trim() });
    return Response.json({ vendor });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
