// RM stock lines (raw_materials) in the slim shape the job forms need to
// let the team pick paper that is physically in stock. Reads Postgres
// directly so ids are the uuid the jobs.rm_stock_line_id FK expects —
// listRawMaterials() goes through the airtable shim and surfaces legacy
// recXXX ids for migrated rows, which the FK can't take.

import { dbSelect } from "@/lib/db/supabase";

const CLOSED_STAGES = ["Dispatched", "Delivered"];

export async function listRmStockOptions() {
  const rows = await dbSelect("raw_materials", {
    select: "id,name,master_rm_name,paper_type,gsm,width_mm,length_mm,form,supplier,mill,coating,location,status,qty_rolls,qty_kgs,qty_sheets",
    filter: { active: "eq.true" },
    order: "name.asc",
    range: "0-9999",
  }).catch((e) => {
    console.error("listRmStockOptions failed:", e);
    return [];
  });
  // What open jobs have already claimed against each line. A job's RM
  // requirement (sheets or kg, entered when the job is raised) counts as
  // reserved until the job is dispatched.
  const claims = await dbSelect("jobs", {
    select: "rm_stock_line_id,rm_qty_sheets,rm_qty_kgs",
    filter: { rm_stock_line_id: "not.is.null", stage: `not.in.(${CLOSED_STAGES.map((x) => `"${x}"`).join(",")})` },
    range: "0-9999",
  }).catch(() => []);
  const reserved = {};
  for (const j of claims) {
    const r = (reserved[j.rm_stock_line_id] ||= { kg: 0, sheets: 0 });
    r.kg += Number(j.rm_qty_kgs) || 0;
    r.sheets += Number(j.rm_qty_sheets) || 0;
  }

  return rows
    .filter((r) => (r.name || r.master_rm_name))
    .map((r) => ({
      reservedKg: reserved[r.id]?.kg || 0,
      reservedSheets: reserved[r.id]?.sheets || 0,
      qtySheets: r.qty_sheets == null ? null : Number(r.qty_sheets),
      id: r.id,
      name: r.name || r.master_rm_name,
      paperType: r.paper_type || "",
      gsm: r.gsm == null ? null : Number(r.gsm),
      widthMm: r.width_mm == null ? null : Number(r.width_mm),
      lengthMm: r.length_mm == null ? null : Number(r.length_mm),
      form: r.form || "",
      supplier: r.supplier || r.mill || "",
      coating: r.coating || "",
      location: r.location || "",
      status: r.status || "",
      qtyRolls: r.qty_rolls == null ? null : Number(r.qty_rolls),
      qtyKgs: r.qty_kgs == null ? null : Number(r.qty_kgs),
    }));
}

// One-line label for pickers: "FBB Board Sheets 250 GSM 711 x 800 mm · 28 packs · 795 kg · Warehouse"
export function rmStockLabel(rm) {
  if (!rm) return "";
  const bits = [rm.name];
  if (rm.qtyRolls != null) {
    const unit = /sheet/i.test(rm.form) ? "pack" : "roll";
    bits.push(`${rm.qtyRolls} ${unit}${rm.qtyRolls === 1 ? "" : "s"}`);
  }
  if (/sheet/i.test(rm.form) && rm.qtySheets != null) bits.push(`${rm.qtySheets.toLocaleString("en-IN")} sheets`);
  if (rm.qtyKgs != null) bits.push(`${Math.round(rm.qtyKgs)} kg`);
  if (rm.location) bits.push(rm.location);
  if (rm.status && rm.status !== "In Stock") bits.push(rm.status);
  return bits.join(" · ");
}

// Free stock after open-job claims, in the unit the line is counted in.
export function rmStockFree(rm) {
  if (!rm) return null;
  if (/sheet/i.test(rm.form)) {
    if (rm.qtySheets == null) return null;
    return { unit: "sheets", onHand: rm.qtySheets, reserved: rm.reservedSheets || 0, free: rm.qtySheets - (rm.reservedSheets || 0) };
  }
  if (rm.qtyKgs == null) return null;
  return { unit: "kg", onHand: rm.qtyKgs, reserved: rm.reservedKg || 0, free: rm.qtyKgs - (rm.reservedKg || 0) };
}
