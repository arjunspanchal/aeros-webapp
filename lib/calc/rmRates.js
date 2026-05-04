// Reads paper RM rates from Supabase `master_papers`. Normalises into a
// { supplier: { gsm: { bf: { baseRate, discount } } } } shape that the
// calculator can index without scanning rows.
//
// Returns null on any failure — caller falls back to static tables in
// lib/calc/calculator.js.

import { dbSelect } from "../db/supabase.js";

const PAPER_TYPES = ["Brown Kraft", "Bleach Kraft White", "OGR", "MG"];

const SUPPLIER_ALIAS = {
  "Jodhani Mill": "Jodhani",
  "Om Shivaay": "Om Shivaay",
  Pudumjee: "Pudumjee",
  BILT: "BILT",
  JK: "JK",
  Ajit: "Ajit",
};

function normalisedSupplier(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  return SUPPLIER_ALIAS[trimmed] || trimmed;
}

export async function fetchPaperRMTables() {
  let rows;
  try {
    rows = await dbSelect("master_papers", {
      select: "type,supplier,gsm,bf,base_rate_inr_kg,discount_inr_kg",
      filter: { type: `in.(${PAPER_TYPES.map((t) => `"${t}"`).join(",")})` },
      range: "0-999",
    });
  } catch {
    return null;
  }

  const bySupplier = {};
  const byPaperType = { "Brown Kraft": [], "Bleach Kraft White": [], OGR: [], MG: [] };

  for (const r of rows) {
    const paperType = r.type;
    const supplier = normalisedSupplier(r.supplier);
    const gsm = Number(r.gsm);
    const bf = r.bf !== undefined && r.bf !== null ? Number(r.bf) : null;
    const baseRate = Number(r.base_rate_inr_kg);
    const discount = Number(r.discount_inr_kg || 0);
    if (!supplier || !baseRate || !PAPER_TYPES.includes(paperType)) continue;

    if (gsm) {
      bySupplier[supplier] = bySupplier[supplier] || {};
      bySupplier[supplier][gsm] = bySupplier[supplier][gsm] || {};
      const bfKey = bf || 0;
      bySupplier[supplier][gsm][bfKey] = { baseRate, discount };
    }
    byPaperType[paperType].push({ supplier, gsm: gsm || null, bf, baseRate, discount });
  }

  return { bySupplier, byPaperType };
}

const DEFAULT_TRANSPORT = 5;

export function lookupRMPaperRate(tables, { paperType, mill, gsm, bf }, opts = {}) {
  if (!tables) return null;
  const transport = opts.transport ?? DEFAULT_TRANSPORT;
  const wet = opts.wetStrength ? 5 : 0;

  let pick = mill && tables.bySupplier[mill]?.[gsm]?.[bf || 0];

  if (!pick && !mill && paperType === "Brown Kraft") {
    pick = tables.bySupplier["Jodhani"]?.[gsm]?.[bf || 0]
        || tables.bySupplier["Om Shivaay"]?.[gsm]?.[bf || 0];
  }

  if (!pick) {
    const candidates = (tables.byPaperType[paperType] || [])
      .filter((r) => (!gsm || r.gsm === gsm) && (!bf || !r.bf || r.bf === bf));
    if (candidates.length) pick = { baseRate: candidates[0].baseRate, discount: candidates[0].discount };
  }

  if (!pick) return null;
  const effective = pick.baseRate - pick.discount + transport;
  return Math.round((effective + wet) * 100) / 100;
}
