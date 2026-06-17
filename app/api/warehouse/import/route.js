import { NextResponse } from "next/server";
import { getSession } from "@/lib/hub/session";
import { canManageInventory } from "@/lib/warehouse/inventory";
import { previewImport, commitImport } from "@/lib/warehouse/importStock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/warehouse/import
//   { mode: "preview", rows: [...] }                         -> validate, no writes
//   { mode: "commit",  rows: [...], reference, movementDate } -> create items + post opening Inward
export async function POST(req) {
  const session = getSession();
  if (!canManageInventory(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const rows = Array.isArray(body?.rows) ? body.rows : null;
  if (!rows) return NextResponse.json({ error: "rows[] required" }, { status: 400 });

  try {
    if (body.mode === "commit") {
      const result = await commitImport(
        { rawRows: rows, reference: body.reference, movementDate: body.movementDate },
        session.email,
      );
      return NextResponse.json({ result }, { status: 201 });
    }
    // Default: preview.
    const { rows: previewRows, summary } = await previewImport(rows);
    return NextResponse.json({ rows: previewRows, summary });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Import failed" }, { status: 400 });
  }
}
