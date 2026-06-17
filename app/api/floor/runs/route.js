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
    let skuPgId = null;
    if (b.skuId) {
      const row = await findOne("master_products", b.skuId, "id");
      skuPgId = row?.id || null;
    }
    if (!skuPgId) return Response.json({ error: "Pick a valid SKU" }, { status: 400 });

    const run = await startRun({
      machineCategory: b.machineCategory,
      operatorName: emp.name || "",
      rmRollId: b.rmRollId,
      skuId: skuPgId,
      skuSnapshot: b.skuSnapshot || "",
      machineSpeed: b.machineSpeed,
      speedUnit: b.speedUnit || "pcs/min",
      photoPath: b.photoPath || null,
    });
    return Response.json({ run });
  } catch (e) {
    console.error("floor run start", e);
    return Response.json({ error: e.message || "Could not start run" }, { status: 400 });
  }
}
