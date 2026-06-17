// Public — start a production run from the operator page. Requires an employee
// session; the operator name is taken from the SESSION (never client input) so
// runs are reliably attributed. Resolves the picked SKU's public id to the
// master_products PG uuid for the FK.
import { startRun } from "@/lib/factoryos/floor";
import { findOne } from "@/lib/db/supabase";
import { currentEmployee } from "@/lib/factoryos/floorAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const emp = currentEmployee();
  if (!emp) return Response.json({ error: "Not signed in" }, { status: 401 });
  try {
    const b = await req.json().catch(() => ({}));
    // Resolve the product SKU public id → PG uuid.
    let skuPgId = null;
    if (b.skuId) {
      const row = await findOne("master_products", b.skuId, "id");
      skuPgId = row?.id || null;
    }
    if (!skuPgId) return Response.json({ error: "Pick a valid SKU" }, { status: 400 });

    // Resolve any sku-kind feed (DW single-wall cups) public id → PG uuid.
    const feeds = Array.isArray(b.feeds) ? b.feeds : [];
    const resolvedFeeds = [];
    for (const f of feeds) {
      if (f.kind === "sku" && f.skuId) {
        const row = await findOne("master_products", f.skuId, "id");
        resolvedFeeds.push({ ...f, skuId: row?.id || null });
      } else {
        resolvedFeeds.push(f);
      }
    }

    const run = await startRun({
      machineCategory: b.machineCategory,
      machineId: b.machineId || null,
      operatorName: emp.name || "",
      skuId: skuPgId,
      skuSnapshot: b.skuSnapshot || "",
      machineSpeed: b.machineSpeed,
      speedUnit: b.speedUnit || "pcs/min",
      photoPath: b.photoPath || null,
      feeds: resolvedFeeds,
    });
    return Response.json({ run });
  } catch (e) {
    console.error("floor run start", e);
    return Response.json({ error: e.message || "Could not start run" }, { status: 400 });
  }
}
