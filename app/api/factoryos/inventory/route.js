import { getSession, requireManager } from "@/lib/auth/session";
import { listRawMaterials, createRawMaterial } from "@/lib/factoryos/repo";

export const runtime = "nodejs";

// GET /api/factoryos/inventory?activeOnly=1
// Lists rows from the Orders base's `Raw Materials` table — this tracks
// on-hand stock. The master paper catalogue lives in a separate base and is
// read via /api/factoryos/master-papers.
export async function GET(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  try {
    const url = new URL(req.url);
    const activeOnly = url.searchParams.get("activeOnly") === "1";
    const inventory = await listRawMaterials({ activeOnly });
    return Response.json({ inventory });
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
    // At least *something* identifying — either a name, or enough other fields to build one.
    const hasLabel = (body.name && body.name.trim()) || body.supplier || body.paperType || body.gsm;
    if (!hasLabel) {
      return Response.json({ error: "Provide a name, or at least supplier / paper type / GSM" }, { status: 400 });
    }
    const stockLine = await createRawMaterial(body);
    return Response.json({ stockLine });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
