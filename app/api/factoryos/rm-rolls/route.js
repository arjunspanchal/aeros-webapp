// Staff-gated RM roll registration. GET lists rolls; POST registers one or
// many (bulk). Operators never hit this — they pick from registered rolls on
// the public /floor page. Gated to manager+ like the other RM endpoints.
import { getSession, requireManager } from "@/lib/auth/session";
import { listAllRolls, registerRoll, bulkRegisterRolls } from "@/lib/factoryos/floor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireManager(session)) return new Response("Forbidden", { status: 403 });
  try {
    const rolls = await listAllRolls();
    return Response.json({ rolls });
  } catch (e) {
    console.error("rm-rolls GET", e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

export async function POST(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireManager(session)) return new Response("Forbidden", { status: 403 });
  try {
    const body = await req.json().catch(() => ({}));
    // Bulk: { rolls: [...] }. Single: the roll fields at top level.
    if (Array.isArray(body.rolls)) {
      const clean = body.rolls
        .map((r) => ({
          rawMaterialId: r.rawMaterialId || null,
          serial: (r.serial || "").trim(),
          weightKg: Number(r.weightKg),
          location: r.location || "",
          notes: r.notes || "",
        }))
        .filter((r) => Number.isFinite(r.weightKg) && r.weightKg > 0);
      if (!clean.length) return Response.json({ error: "Add at least one roll with a weight" }, { status: 400 });
      const created = await bulkRegisterRolls(clean);
      return Response.json({ rolls: created });
    }
    const roll = await registerRoll({
      rawMaterialId: body.rawMaterialId || null,
      serial: (body.serial || "").trim(),
      weightKg: Number(body.weightKg),
      location: body.location || "",
      notes: body.notes || "",
    });
    return Response.json({ roll });
  } catch (e) {
    console.error("rm-rolls POST", e);
    return Response.json({ error: e.message || "Failed" }, { status: 400 });
  }
}
