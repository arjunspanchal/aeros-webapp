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
  const jobs = await dbSelect("jobs", {
    select: "id,airtable_id,j_number,item,stage,qty",
    filter: { zoho_so_no: `ilike.${number}` },
    limit: 50,
  }).catch(() => []);
  const linkedJobs = (jobs || []).map((j) => ({ id: j.airtable_id || j.id, jNumber: j.j_number, item: j.item, stage: j.stage, qty: j.qty }));
  // Zoho not connected or not reachable (e.g. the daily API limit): the form
  // may still save the number, flagged "not checked yet" (Arjun, 18-Nov-2026).
  if (!zohoConfigured()) return Response.json({ number, found: null, unreachable: true, so: null, linkedJobs });
  try {
    const so = await getSalesOrderByNumber(number);
    return Response.json({ number, found: !!so, so, linkedJobs });
  } catch (e) {
    console.error("zoho so lookup failed:", e?.message || e);
    return Response.json({ number, found: null, unreachable: true, so: null, linkedJobs });
  }
}
