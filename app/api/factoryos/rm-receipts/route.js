import { getSession, requireManager } from "@/lib/auth/session";
import { recordRmReceipt, listRmReceipts } from "@/lib/factoryos/repo";

export const runtime = "nodejs";

export async function GET() {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireManager(session)) return new Response("Forbidden", { status: 403 });
  try {
    const receipts = await listRmReceipts();
    return Response.json({ receipts });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

export async function POST(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireManager(session)) return new Response("Forbidden", { status: 403 });
  try {
    const body = await req.json().catch(() => ({}));
    const { invoiceNumber, invoiceDate, supplier, notes, lines } = body || {};
    if (!invoiceNumber || !invoiceNumber.trim()) {
      return Response.json({ error: "Invoice number required" }, { status: 400 });
    }
    if (!Array.isArray(lines) || lines.length === 0) {
      return Response.json({ error: "Add at least one line" }, { status: 400 });
    }
    // Require each line to reference a master paper and have some quantity.
    for (const l of lines) {
      if (!l || !l.masterPaperName) {
        return Response.json({ error: "Every line needs a paper spec from the master DB" }, { status: 400 });
      }
      const hasQty = Number(l.qtyRolls) > 0 || Number(l.qtyKgs) > 0;
      if (!hasQty) {
        return Response.json({ error: `Line for "${l.masterPaperName}" needs a quantity` }, { status: 400 });
      }
    }
    const created = await recordRmReceipt({
      invoiceNumber: invoiceNumber.trim(),
      invoiceDate: invoiceDate || null,
      supplier: supplier || "",
      notes: notes || "",
      createdByEmail: session.email || "",
      lines: lines.map((l) => ({
        masterPaperId: l.masterPaperId || "",
        masterPaperName: l.masterPaperName || "",
        paperType: l.paperType || "",
        gsm: l.gsm === "" || l.gsm == null ? undefined : Number(l.gsm),
        bf: l.bf === "" || l.bf == null ? undefined : Number(l.bf),
        sizeMm: l.sizeMm === "" || l.sizeMm == null ? undefined : Number(l.sizeMm),
        form: l.form || "",
        qtyRolls: Number(l.qtyRolls) || 0,
        qtyKgs: Number(l.qtyKgs) || 0,
      })),
    });
    return Response.json({ receipts: created });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
