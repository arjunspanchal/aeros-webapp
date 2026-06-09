import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { ROLES } from "@/lib/factoryos/constants";
import { pushJobToWarehouse, getJobPushStatus } from "@/lib/warehouse/jobPush";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Push-to-warehouse writes to the FG ledger (inventory_movements) and seals
// in a unit cost — a financial write. Admin + Factory Manager only. Audit
// finding C2: FE was previously included to mirror "WarehouseOS staff set",
// but cost authorisation isn't a shop-floor role. FE still drives production
// (RM consumption, stage updates) — they just can't book stock + cost.
function canPush(session) {
  if (!session) return false;
  if (session.isAdmin) return true;
  const role = session.modules?.factoryos;
  return role === ROLES.ADMIN || role === ROLES.FACTORY_MANAGER;
}

export async function GET(_req, { params }) {
  const session = getSession();
  if (!canPush(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const status = await getJobPushStatus(params.id);
    return NextResponse.json({ status });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req, { params }) {
  const session = getSession();
  if (!canPush(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  try {
    const result = await pushJobToWarehouse({
      jobId:            params.id,
      goodQty:          body.goodQty,
      rejectQty:        body.rejectQty,
      rejectReason:     body.rejectReason,
      unitCost:         body.unitCost,
      goodLocationCode: body.goodLocationCode,
      finalPush:        body.finalPush,
    }, session.email);
    return NextResponse.json({ result }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
