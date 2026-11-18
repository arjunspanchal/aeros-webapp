import { NextResponse } from "next/server";
import { getSession } from "@/lib/hub/session";
import { canWorkWarehouse } from "@/lib/warehouse/access";
import { recordJobReceipt } from "@/lib/warehouse/inward";
import { respond, forbidden, readJson } from "../../../_respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — take in goods the factory has handed over for one job.
export async function POST(req, { params }) {
  const session = getSession();
  if (!canWorkWarehouse(session)) return forbidden("Only the warehouse team can receive goods");
  const body = await readJson(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  try { return respond(await recordJobReceipt({ session, jobId: params.id, body })); }
  catch (e) { console.error("job receipt failed:", e?.message || e); return NextResponse.json({ error: e.message || "Could not record this receipt" }, { status: 500 }); }
}
