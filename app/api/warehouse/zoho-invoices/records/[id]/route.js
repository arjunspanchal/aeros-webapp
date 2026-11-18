import { getSession } from "@/lib/hub/session";
import { isWarehouseAdmin } from "@/lib/warehouse/access";
import { undoInvoiceRecord } from "@/lib/warehouse/outward";
import { respond, forbidden } from "../../../_respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE — admin only: undo a recorded invoice (stock goes back to its racks,
// the invoice shows as "to load" again).
export async function DELETE(_req, { params }) {
  const session = getSession();
  if (!isWarehouseAdmin(session)) return forbidden("Only an admin can undo");
  return respond(await undoInvoiceRecord({ session, recordId: params.id }));
}
