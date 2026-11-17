import { NextResponse } from "next/server";
import { getSession } from "@/lib/hub/session";
import { undoInvoiceRecord } from "@/lib/warehouse/invoiceDispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE — admin only: undo a recorded invoice (stock goes back to its racks,
// the invoice shows as "to load" again).
export async function DELETE(_req, { params }) {
  const session = getSession();
  if (!session?.isAdmin) return NextResponse.json({ error: "Only an admin can undo" }, { status: 403 });
  const res = await undoInvoiceRecord({ session, recordId: params.id });
  const { status, ok, ...rest } = res;
  return NextResponse.json(ok ? rest : { error: res.error }, { status });
}
