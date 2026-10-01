// RM stock lines (raw_materials) in the slim shape the job forms need to
// let the team pick paper that is physically in stock. Reads Postgres
// directly so ids are the uuid the jobs.rm_stock_line_id FK expects —
// listRawMaterials() goes through the airtable shim and surfaces legacy
// recXXX ids for migrated rows, which the FK can't take.

import { dbSelect } from "@/lib/db/supabase";

export async function listRmStockOptions() {
  const rows = await dbSelect("raw_materials", {
    select: "id,name,master_rm_name,paper_type,gsm,width_mm,length_mm,form,supplier,mill,coating,location,status,qty_rolls,qty_kgs",
    filter: { active: "eq.true" },
    order: "name.asc",
    range: "0-9999",
  }).catch((e) => {
    console.error("listRmStockOptions failed:", e);
    return [];
  });
  return rows
    .filter((r) => (r.name || r.master_rm_name))
    .map((r) => ({
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
  if (rm.qtyKgs != null) bits.push(`${Math.round(rm.qtyKgs)} kg`);
  if (rm.location) bits.push(rm.location);
  if (rm.status && rm.status !== "In Stock") bits.push(rm.status);
  return bits.join(" · ");
}
