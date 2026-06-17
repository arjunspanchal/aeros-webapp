// Public — start a production run from the operator page. Resolves the picked
// SKU's public id (recXXX or uuid) to its master_products PG uuid for the FK,
// then delegates to startRun (which also flips the roll to in_use).
import { startRun } from "@/lib/factoryos/floor";
import { findOne } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const b = await req.json().catch(() => ({}));
    // SKU comes in as a public id from the picker; resolve to PG uuid.
    let skuPgId = null;
    if (b.skuId) {
      const row = await findOne("master_products", b.skuId, "id");
      skuPgId = row?.id || null;
    }
    if (!skuPgId) return Response.json({ error: "Pick a valid SKU" }, { status: 400 });

    const run = await startRun({
      machineCategory: b.machineCategory,
      operatorName: b.operatorName,
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
