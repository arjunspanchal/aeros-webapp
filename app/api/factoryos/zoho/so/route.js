import { getSession } from "@/lib/auth/session";
import { requireInternal } from "@/lib/auth/policy";
import { getSalesOrderByNumber, normaliseSoNumber, zohoConfigured } from "@/lib/zoho/books";
import { dbSelect } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/factoryos/zoho/so?number=SO-14612
// Read-only lookup of one Zoho sales order for the job form / job page.
// Staff only. Returns customer, date, status and item names + quantities —
// never rates — plus the FactoryOS jobs already linked to that SO.
export async function GET(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireInternal(session)) return new Response("Forbidden", { status: 403 });
  const number = normaliseSoNumber(new URL(req.url).searchParams.get("number"));
  if (!number) return Response.json({ error: "Enter a Zoho SO number" }, { status: 400 });
  if (!zohoConfigured()) return Response.json({ error: "Zoho is not connected yet" }, { status: 503 });
  try {
    const so = await getSalesOrderByNumber(number);
    const jobs = await dbSelect("jobs", {
      select: "id,airtable_id,j_number,item,stage,qty",
      filter: { zoho_so_no: `eq.${number}` },
      limit: 50,
    }).catch(() => []);
    return Response.json({
      number,
      found: !!so,
      so,
      linkedJobs: (jobs || []).map((j) => ({ id: j.airtable_id || j.id, jNumber: j.j_number, item: j.item, stage: j.stage, qty: j.qty })),
    });
  } catch (e) {
    console.error("zoho so lookup failed:", e?.message || e);
    return Response.json({ error: "Couldn't reach Zoho right now. Try again in a minute." }, { status: 502 });
  }
}
