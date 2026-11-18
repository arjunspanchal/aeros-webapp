import { getSession } from "@/lib/hub/session";
import { isWarehouseAdmin } from "@/lib/warehouse/access";
import { undoReceipt } from "@/lib/warehouse/inward";
import { respond, forbidden } from "../../../_respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE — admin only: undo a receipt (stock comes back out of the racks).
export async function DELETE(_req, { params }) {
  const session = getSession();
  if (!isWarehouseAdmin(session)) return forbidden("Only an admin can undo");
  return respond(await undoReceipt({ session, receiptId: params.id }));
}
