// Bag specs CRUD against Supabase `bag_specs`. Replaces the legacy
// Airtable-backed version — clients/admin reads now return Supabase
// UUIDs that line up with the `quotes_v2.bag_spec_id` typed FK so saves
// don't reject anymore.
//
// Display labels stay the same on the wire so the existing AdminCalculator
// loader doesn't change. Bag-type strings round-trip via BAG_TYPE_OUT/IN.

import { dbSelect, dbInsert, dbDelete } from "@/lib/db/supabase";
import { getSession, requireRole } from "@/lib/auth/session";

export const runtime = "nodejs";

const BAG_TYPE_IN = {
  "Rope Handle": "rope_handle",
  "Flat Handle": "flat_handle",
  "Handle": "rope_handle", // legacy rows default to rope
  "V-Bottom": "v_bottom_gusset",
  "SOS": "sos",
};

const BAG_TYPE_OUT = {
  sos: "SOS",
  rope_handle: "Rope Handle",
  flat_handle: "Flat Handle",
  v_bottom_gusset: "V-Bottom",
};

function rowToSpec(r) {
  return {
    id: r.id,
    code: r.code || "",
    brand: r.brand || "",
    item: r.item || "",
    bagType: BAG_TYPE_IN[r.bag_type] || "sos",
    width: r.width_mm ?? 0,
    gusset: r.gusset_mm ?? 0,
    height: r.height_mm ?? 0,
    paperType: r.paper_type || "",
    millName: r.mill || "",
    gsm: r.gsm ?? 0,
    bf: r.bf ?? "",
    casePack: r.case_pack ?? 0,
    printing: !!r.printing,
    colours: r.colours ?? 1,
    coverage: r.coverage_pct ?? 30,
    lockedWastage: r.locked_wastage_pct ?? null,
  };
}

export async function GET() {
  if (!getSession()) return new Response("Unauthorized", { status: 401 });
  const rows = await dbSelect("bag_specs", { select: "*", order: "code.asc" });
  return Response.json(rows.map(rowToSpec));
}

export async function POST(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireRole(session, "calculator", "admin")) return new Response("Forbidden", { status: 403 });
  const body = await req.json();
  const row = {
    code: body.code,
    brand: body.brand || null,
    item: body.item || null,
    bag_type: BAG_TYPE_OUT[body.bagType] || "SOS",
    width_mm: body.width ? Number(body.width) : null,
    gusset_mm: body.gusset ? Number(body.gusset) : null,
    height_mm: body.height ? Number(body.height) : null,
    paper_type: body.paperType || null,
    mill: body.millName || null,
    gsm: body.gsm ? Number(body.gsm) : null,
    bf: body.bf ? Number(body.bf) : null,
    case_pack: body.casePack ? Number(body.casePack) : null,
    printing: !!body.printing,
    colours: body.colours ? Number(body.colours) : null,
    coverage_pct: body.coverage ? Number(body.coverage) : null,
    locked_wastage_pct: body.lockedWastage ? Number(body.lockedWastage) : null,
  };
  const created = await dbInsert("bag_specs", row);
  return Response.json(rowToSpec(created));
}

export async function DELETE(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireRole(session, "calculator", "admin")) return new Response("Forbidden", { status: 403 });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  await dbDelete("bag_specs", "id", id);
  return Response.json({ ok: true });
}
