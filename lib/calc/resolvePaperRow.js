// Server-side resolution of a single master_papers row by id, for the rate
// route. Selecting by row id (not supplier×gsm×bf) is what lets the calculator
// distinguish same-spec grades like Pudumjee OGR Solidwrap vs Solidbag.
import { dbSelect } from "../db/supabase.js";

export async function getMasterPaperRow(id) {
  if (!id) return null;
  const rows = await dbSelect("master_papers", {
    select:
      "id,material_name,type,supplier,gsm,bf,base_rate_inr_kg,discount_inr_kg,effective_rate_inr_kg",
    filter: { id: `eq.${id}` },
    limit: 1,
  });
  return rows[0] || null;
}

// Effective ₹/kg from a row = base − discount. Returns a positive number or null
// (row missing / unpriced). Transport and wet-strength adders are applied by the
// caller, since they differ admin vs client.
export function rowBaseRate(row) {
  if (!row) return null;
  const base = Number(row.base_rate_inr_kg);
  if (!(base > 0)) return null;
  const discount = Number(row.discount_inr_kg || 0);
  return Math.round((base - discount) * 100) / 100;
}
