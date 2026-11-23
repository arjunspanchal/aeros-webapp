// Excel for a quote list. The lines are re-priced here, on the server, so the
// file always matches the live rate book; nothing priced in the browser goes
// into it. kind = "customer" (safe to send) or "internal" (the working).
import { getSession } from "@/lib/auth/session";
import { canUseV2, priceMany, MAX_LINES } from "@/lib/calc-v2/server";
import { customerWorkbook, internalWorkbook } from "@/lib/calc-v2/excel";
import { indiaStamp } from "@/lib/calc-v2/record";

export const runtime = "nodejs";

const clean = (s) => String(s || "").replace(/[^\w .&()-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);

export async function POST(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!canUseV2(session)) return new Response("Forbidden", { status: 403 });
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const lines = Array.isArray(body?.lines) ? body.lines.filter((l) => l?.spec?.family) : [];
  if (!lines.length) return Response.json({ error: "Add at least one item to the quote" }, { status: 400 });
  if (lines.length > MAX_LINES) return Response.json({ error: `Up to ${MAX_LINES} lines` }, { status: 400 });
  const internal = body.kind === "internal";

  try {
    const results = await priceMany(lines.map((l) => l.spec));
    const priced = lines.map((l, i) => ({ spec: l.spec, ref: String(l.ref || "").trim(), result: results[i] }));
    // A customer copy must be complete and makeable: no holes, no blocked items.
    if (!internal) {
      const bad = priced.map((p, i) => (!p.result.lines ? `Line ${i + 1}: ${p.result.errors?.[0] ?? "not priced"}` : !p.result.ok ? `Line ${i + 1}: ${p.result.warnings.find((w) => w.level === "block")?.message ?? "blocked"}` : null)).filter(Boolean);
      if (bad.length) return Response.json({ error: "Fix these before sending a quote out", details: bad }, { status: 422 });
    }
    const meta = {
      customer: String(body.customer || "").trim(), brand: String(body.brand || "").trim(),
      quoteRef: String(body.quoteRef || "").trim(), date: indiaStamp().date.split("-").reverse().join("-"),
    };
    const buffer = internal ? await internalWorkbook(meta, priced) : await customerWorkbook(meta, priced);
    const name = `Aeros Quote - ${clean(meta.customer) || "Draft"} ${clean(meta.quoteRef) || meta.date}${internal ? " (internal working)" : ""}.xlsx`;
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("/api/calc/v2/export failed:", e);
    return Response.json({ error: e.message || "Could not build the Excel file" }, { status: 500 });
  }
}
