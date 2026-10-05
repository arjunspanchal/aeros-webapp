// QC → Certificate of Analysis (COA). Usually one per job, but a COA can also
// be made with no job behind it (samples, stock items, orders that never went
// through FactoryOS) — those rows simply have job_id null. Everything on the
// sheet is free text the factory manager can overwrite; it starts pre-filled
// from the job and/or the product master so nobody re-types cup dimensions.

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

// Factory is in India; a COA made at 2 a.m. IST must not carry yesterday's (UTC) date.
const todayIST = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const n = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
const wall = (gsm, coat) => (gsm ? `(${gsm}${coat ? `+${coat}` : ""})` : null);

// Best first guess for every row. Blank where the master has nothing — a
// blank the manager fills beats a confident wrong number on a certificate.
function buildDefaults(m, { item = "", brand = "", paperType = "", gsm = null, itemSize = "", printed = null, colours = [] } = {}) {
  const paper = paperType || m?.material || "";
  let material = "";
  if (m && /double/i.test(m.wall_type || "") && (m.outer_wall_gsm || m.inner_wall_gsm)) {
    material = [/[+(]/.test(paper) ? `${paper} —` : `${(paper || "Cupstock").replace(/\s*paper$/i, "")} Paper`, [wall(m.outer_wall_gsm, m.outer_wall_coating), wall(m.inner_wall_gsm, m.inner_wall_coating)].filter(Boolean).join(" + ")].join(" ");
  } else {
    const g = gsm || m?.gsm;
    material = [paper, g ? `${g} GSM` : null, m?.coating ? `+ ${m.coating}` : null].filter(Boolean).join(" ");
  }

  let dimensions = "";
  if (m?.top_diameter_mm && m?.height_mm) {
    dimensions = `Top-${n(m.top_diameter_mm)} x ${m.bottom_diameter_mm ? `Bottom-${n(m.bottom_diameter_mm)} x ` : ""}Height-${n(m.height_mm)} mm`;
  } else {
    const size = itemSize || m?.size_volume || "";
    dimensions = size.includes("|") ? size.split("|").slice(1).join("|").trim() : size;
  }

  const upc = n(m?.units_per_case);
  const inner = n(m?.inner_case_pack);
  const bundles = upc && inner && upc % inner === 0 ? upc / inner : null;
  const isPrinted = printed ?? (m ? /print|custom/i.test(`${m.colour || ""} ${m.product_type || ""}`) : null);

  return {
    date: todayIST(),
    productName: [item || m?.product_name, brand].filter(Boolean).join(" — "),
    material,
    dimensions,
    qtyPerBox: upc ? `${upc.toLocaleString("en-IN")} Pcs/Box` : "",
    avgWeight: m?.item_weight_g ? `${n(m.item_weight_g)} gm/pcs` : "",
    printing: isPrinted === null ? "" : isPrinted ? "Printed" : "Plain",
    colour: colours.map((c) => c.name).filter(Boolean).join(" + "),
    packagingType: upc ? `${upc.toLocaleString("en-IN")} pcs in 1 Master Box${bundles ? ` — ${inner} pcs x ${bundles} bundles` : ""}` : "",
    alternatePacking: "",
    inspectionResult: "",
    approvedBy: "",
  };
}

async function masterBySku(sku) {
  if (!sku) return null;
  const rows = await dbSelect("master_products", { select: "*", filter: { sku: `eq.${sku}` }, limit: 1 }).catch(() => []);
  return rows[0] || null;
}

export async function coaDefaults(job) {
  const m = await masterBySku(job.masterSku);
  let colours = [];
  const pgId = await jobPgId(job.id);
  if (pgId) {
    colours = await dbSelect("job_print_colours", { select: "name,seq", filter: { job_id: `eq.${pgId}` }, order: "seq.asc" }).catch(() => []);
  }
  return buildDefaults(m, {
    item: job.item, brand: job.brand, paperType: job.paperType, gsm: job.gsm, itemSize: job.itemSize,
    printed: !!job.printingType, colours,
  });
}

// No job: start blank, or from a catalogue product if one was picked.
export async function coaDefaultsForSku(sku) {
  return buildDefaults(await masterBySku(sku));
}

// Product picker for the no-job COA: SKU or name, a handful of matches.
export async function searchCoaProducts(q) {
  const term = String(q || "").trim().replace(/[%,()*]/g, " ").trim();
  if (term.length < 2) return [];
  const like = `*${term.split(/\s+/).join("*")}*`;
  const rows = await dbSelect("master_products", {
    select: "sku,product_name,size_volume",
    filter: { or: `(sku.ilike.${like},product_name.ilike.${like})` },
    order: "sku.asc", limit: 12,
  }).catch(() => []);
  return rows.map((r) => ({ sku: r.sku, name: r.product_name, size: r.size_volume || "" }));
}

export async function getCoa(jobPublicId) {
  const pgId = await jobPgId(jobPublicId);
  if (!pgId) return null;
  const rows = await dbSelect("job_coas", { select: "*", filter: { job_id: `eq.${pgId}` }, limit: 1 });
  return norm(rows[0] || null);
}

function toPatch(body, email) {
  const patch = { updated_by_email: str(email), updated_at: new Date().toISOString() };
  for (const f of [...COA_FIELDS, ...EXTRA]) {
    if (body[f.key] !== undefined) patch[f.col] = str(String(body[f.key] ?? "").slice(0, 500));
  }
  if (body.date !== undefined) patch.coa_date = dateOnly(body.date) || todayIST();
  if (!patch.product_name && body.productName !== undefined) throw new Error("Item / Product Name is required");
  return patch;
}

export async function saveCoa(jobPublicId, body = {}, { email } = {}) {
  const pgId = await jobPgId(jobPublicId);
  if (!pgId) throw new Error("Job not found");
  const patch = toPatch(body, email);
  const existing = await dbSelect("job_coas", { select: "id", filter: { job_id: `eq.${pgId}` }, limit: 1 });
  const row = existing[0]
    ? await dbUpdate("job_coas", "id", existing[0].id, patch, { returning: "representation" })
    : await dbInsert("job_coas", { job_id: pgId, ...patch });
  return norm(row);
}

// ---- COAs with no job ----
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getStandaloneCoa(coaId) {
  if (!UUID.test(String(coaId || ""))) return null;
  const rows = await dbSelect("job_coas", { select: "*", filter: { id: `eq.${coaId}`, job_id: "is.null" }, limit: 1 });
  return norm(rows[0] || null);
}

export async function createStandaloneCoa(body = {}, { email } = {}) {
  if (!str(body.productName)) throw new Error("Item / Product Name is required");
  return norm(await dbInsert("job_coas", { job_id: null, ...toPatch(body, email) }));
}

export async function updateStandaloneCoa(coaId, body = {}, { email } = {}) {
  const existing = await getStandaloneCoa(coaId);
  if (!existing) return null;
  return norm(await dbUpdate("job_coas", "id", existing.id, toPatch(body, email), { returning: "representation" }));
}

export async function listStandaloneCoas() {
  const rows = await dbSelect("job_coas", { select: "id,coa_date,product_name,updated_at", filter: { job_id: "is.null" }, order: "updated_at.desc", limit: 200 });
  return rows.map((r) => ({ id: r.id, date: r.coa_date, productName: r.product_name || "", updatedAt: r.updated_at }));
}

// Public job id → { date, updatedAt } for the QC list.
export async function listCoaIndex() {
  const rows = await dbSelect("job_coas", { select: "coa_date,updated_at,jobs(id,airtable_id)", filter: { job_id: "not.is.null" }, order: "updated_at.desc", range: [0, 999] });
  const out = {};
  for (const r of rows) if (r.jobs) out[publicId(r.jobs)] = { date: r.coa_date, updatedAt: r.updated_at };
  return out;
}
