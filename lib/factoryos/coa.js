// QC → Certificate of Analysis (COA). One per job. Everything on the sheet is
// free text the factory manager can overwrite, but it starts pre-filled from
// the job + the product master so nobody re-types cup dimensions.

import { dbSelect, dbInsert, dbUpdate, findOne, publicId } from "@/lib/db/supabase";
import { str, dateOnly } from "@/lib/db/shapes";

// Row order on the printed sheet (matches the COA the team already sends out).
export const COA_FIELDS = [
  { key: "productName",      col: "product_name",      label: "Item / Product Name" },
  { key: "material",         col: "material",          label: "Material" },
  { key: "dimensions",       col: "dimensions",        label: "Dimensions" },
  { key: "qtyPerBox",        col: "qty_per_box",       label: "Quantity per Box" },
  { key: "avgWeight",        col: "avg_weight",        label: "Average Weight per Piece (±5%)" },
  { key: "printing",         col: "printing",          label: "Printing / Design" },
  { key: "colour",           col: "colour",            label: "Color" },
  { key: "packagingType",    col: "packaging_type",    label: "Packaging Type" },
  { key: "alternatePacking", col: "alternate_packing", label: "Alternate Packing" },
];
const EXTRA = [
  { key: "inspectionResult", col: "inspection_result" },
  { key: "approvedBy",       col: "approved_by" },
];

async function jobPgId(jobPublicId) {
  const row = await findOne("jobs", jobPublicId, "id");
  return row?.id || null;
}

function norm(r) {
  if (!r) return null;
  const out = { id: r.id, date: r.coa_date, updatedAt: r.updated_at, updatedByEmail: r.updated_by_email || null };
  for (const f of [...COA_FIELDS, ...EXTRA]) out[f.key] = r[f.col] || "";
  return out;
}

const n = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
const wall = (gsm, coat) => (gsm ? `(${gsm}${coat ? `+${coat}` : ""})` : null);

// Best first guess for every row. Blank where the master has nothing — a
// blank the manager fills beats a confident wrong number on a certificate.
export async function coaDefaults(job) {
  let m = null;
  if (job.masterSku) {
    const rows = await dbSelect("master_products", { select: "*", filter: { sku: `eq.${job.masterSku}` }, limit: 1 }).catch(() => []);
    m = rows[0] || null;
  }
  let colours = [];
  const pgId = await jobPgId(job.id);
  if (pgId) {
    colours = await dbSelect("job_print_colours", { select: "*", filter: { job_id: `eq.${pgId}` }, order: "seq.asc" }).catch(() => []);
  }

  const paper = job.paperType || m?.material || "";
  let material = "";
  if (m && /double/i.test(m.wall_type || "") && (m.outer_wall_gsm || m.inner_wall_gsm)) {
    material = [`${paper || "Cupstock"} Paper`, [wall(m.outer_wall_gsm, m.outer_wall_coating), wall(m.inner_wall_gsm, m.inner_wall_coating)].filter(Boolean).join(" + ")].join(" ");
  } else {
    const gsm = job.gsm || m?.gsm;
    material = [paper, gsm ? `${gsm} GSM` : null, m?.coating ? `+ ${m.coating}` : null].filter(Boolean).join(" ");
  }

  let dimensions = "";
  if (m?.top_diameter_mm && m?.height_mm) {
    dimensions = `Top-${n(m.top_diameter_mm)} x ${m.bottom_diameter_mm ? `Bottom-${n(m.bottom_diameter_mm)} x ` : ""}Height-${n(m.height_mm)} mm`;
  } else {
    const size = job.itemSize || m?.size_volume || "";
    dimensions = size.includes("|") ? size.split("|").slice(1).join("|").trim() : size;
  }

  const upc = n(m?.units_per_case);
  const inner = n(m?.inner_case_pack);
  const bundles = upc && inner && upc % inner === 0 ? upc / inner : null;

  return {
    date: new Date().toISOString().slice(0, 10),
    productName: [job.item, job.brand].filter(Boolean).join(" — "),
    material,
    dimensions,
    qtyPerBox: upc ? `${upc.toLocaleString("en-IN")} Pcs/Box` : "",
    avgWeight: m?.item_weight_g ? `${n(m.item_weight_g)} gm/pcs` : "",
    printing: job.printingType ? "Printed" : "Plain",
    colour: colours.map((c) => c.name || c.pantone || c.colour_name).filter(Boolean).join(" + "),
    packagingType: upc ? `${upc.toLocaleString("en-IN")} pcs in 1 Master Box${bundles ? ` — ${inner} pcs x ${bundles} bundles` : ""}` : "",
    alternatePacking: "",
    inspectionResult: "",
    approvedBy: "",
  };
}

export async function getCoa(jobPublicId) {
  const pgId = await jobPgId(jobPublicId);
  if (!pgId) return null;
  const rows = await dbSelect("job_coas", { select: "*", filter: { job_id: `eq.${pgId}` }, limit: 1 });
  return norm(rows[0] || null);
}

export async function saveCoa(jobPublicId, body = {}, { email } = {}) {
  const pgId = await jobPgId(jobPublicId);
  if (!pgId) throw new Error("Job not found");
  const patch = { updated_by_email: str(email), updated_at: new Date().toISOString() };
  for (const f of [...COA_FIELDS, ...EXTRA]) {
    if (body[f.key] !== undefined) patch[f.col] = str(String(body[f.key] ?? "").slice(0, 500));
  }
  if (body.date !== undefined) patch.coa_date = dateOnly(body.date) || new Date().toISOString().slice(0, 10);
  if (!patch.product_name && body.productName !== undefined) throw new Error("Item / Product Name is required");
  const existing = await dbSelect("job_coas", { select: "id", filter: { job_id: `eq.${pgId}` }, limit: 1 });
  const row = existing[0]
    ? await dbUpdate("job_coas", "id", existing[0].id, patch, { returning: "representation" })
    : await dbInsert("job_coas", { job_id: pgId, ...patch });
  return norm(Array.isArray(row) ? row[0] : row);
}

// Public job id → { date, updatedAt } for the QC list.
export async function listCoaIndex() {
  const rows = await dbSelect("job_coas", { select: "coa_date,updated_at,jobs(id,airtable_id)", order: "updated_at.desc", range: [0, 999] });
  const out = {};
  for (const r of rows) if (r.jobs) out[publicId(r.jobs)] = { date: r.coa_date, updatedAt: r.updated_at };
  return out;
}
