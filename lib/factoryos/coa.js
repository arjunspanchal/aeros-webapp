// QC → Certificate of Analysis (COA). A COA certifies one dispatch lot, so a
// job can have many (one per invoice / challan — Arjun, 06-Oct-2026: "if we
// dispatch 25,000 of the 2 lakh, that needs a COA as well"). A COA can also
// be made with no job behind it (samples, stock items, orders that never went
// through FactoryOS) — those rows have job_id null. Everything on the sheet
// is free text the factory manager can overwrite; it starts pre-filled from
// the job and/or the product master so nobody re-types cup dimensions.

import { dbSelect, dbInsert, dbUpdate, findOne, publicId } from "@/lib/db/supabase";
import { str, dateOnly } from "@/lib/db/shapes";

// Row order on the printed sheet (matches the COA the team already sends
// out). `optional` rows print only when filled in.
export const COA_FIELDS = [
  { key: "productName",      col: "product_name",      label: "Item / Product Name" },
  { key: "material",         col: "material",          label: "Material" },
  { key: "dimensions",       col: "dimensions",        label: "Dimensions" },
  { key: "qtyPerBox",        col: "qty_per_box",       label: "Quantity per Box" },
  { key: "dispatchQty",      col: "dispatch_qty",      label: "Dispatch Quantity", optional: true },
  { key: "dispatchRef",      col: "dispatch_ref",      label: "Invoice / Challan No.", optional: true },
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
// Who signs the certificate (Arjun, 06-Oct-2026); "Other" stays available
// for a one-off name.
export const COA_APPROVERS = ["Rahul", "Sachin", "Sharmika"];

export const COA_PRINT_FIELDS = COA_FIELDS.map(({ key, label, optional }) => ({ key, label, optional: !!optional }));

const SELECT = "*,jobs(id,airtable_id,j_number,brand,item)";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function jobPgId(jobPublicId) {
  const row = await findOne("jobs", jobPublicId, "id");
  return row?.id || null;
}

function norm(r) {
  if (!r) return null;
  const out = { id: r.id, date: r.coa_date, updatedAt: r.updated_at, updatedByEmail: r.updated_by_email || null, job: null };
  if (r.jobs) out.job = { id: publicId(r.jobs), jNumber: r.jobs.j_number || "", brand: r.jobs.brand || "", item: r.jobs.item || "" };
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
    // Size strings read "<vol> | dims | blank … | board …"; keep only the
    // segments that are product dimensions, not blank / layout / board notes.
    const size = itemSize || m?.size_volume || "";
    const segs = size.split("|").map((x) => x.trim()).filter(Boolean);
    const dimSegs = segs.filter((x) => /\d\s*x\s*\d/i.test(x) && /mm/i.test(x) && !/blank|layout|sheet|up on|gsm|flap/i.test(x));
    dimensions = dimSegs.length ? dimSegs.join(" | ") : segs.length > 1 ? segs[1] : size;
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
    dispatchQty: "",
    dispatchRef: "",
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

// New COA for a job. If the job already has one, start from the latest so
// lot 2 reads like lot 1 — only the lot-specific rows are cleared.
export async function coaDefaults(job) {
  const previous = (await listJobCoas(job.id))[0];
  if (previous) {
    return { ...previous, id: undefined, job: undefined, updatedAt: undefined, updatedByEmail: undefined,
      date: todayIST(), dispatchQty: "", dispatchRef: "", inspectionResult: "", approvedBy: "" };
  }
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

function toPatch(body, email) {
  const patch = { updated_by_email: str(email), updated_at: new Date().toISOString() };
  for (const f of [...COA_FIELDS, ...EXTRA]) {
    if (body[f.key] !== undefined) patch[f.col] = str(String(body[f.key] ?? "").slice(0, 500));
  }
  if (body.date !== undefined) patch.coa_date = dateOnly(body.date) || todayIST();
  if (!patch.product_name && body.productName !== undefined) throw new Error("Item / Product Name is required");
  return patch;
}

export async function listJobCoas(jobPublicId) {
  const pgId = await jobPgId(jobPublicId);
  if (!pgId) return [];
  const rows = await dbSelect("job_coas", { select: SELECT, filter: { job_id: `eq.${pgId}` }, order: "coa_date.desc,created_at.desc" });
  return rows.map(norm);
}

export async function createJobCoa(jobPublicId, body = {}, { email } = {}) {
  const pgId = await jobPgId(jobPublicId);
  if (!pgId) throw new Error("Job not found");
  if (!str(body.productName)) throw new Error("Item / Product Name is required");
  const row = await dbInsert("job_coas", { job_id: pgId, ...toPatch(body, email) });
  return getCoaById(row.id);
}

export async function createStandaloneCoa(body = {}, { email } = {}) {
  if (!str(body.productName)) throw new Error("Item / Product Name is required");
  const row = await dbInsert("job_coas", { job_id: null, ...toPatch(body, email) });
  return getCoaById(row.id);
}

export async function getCoaById(coaId) {
  if (!UUID.test(String(coaId || ""))) return null;
  const rows = await dbSelect("job_coas", { select: SELECT, filter: { id: `eq.${coaId}` }, limit: 1 });
  return norm(rows[0] || null);
}

export async function updateCoaById(coaId, body = {}, { email } = {}) {
  const existing = await getCoaById(coaId);
  if (!existing) return null;
  await dbUpdate("job_coas", "id", existing.id, toPatch(body, email), { returning: "minimal" });
  return getCoaById(existing.id);
}

export async function listStandaloneCoas() {
  const rows = await dbSelect("job_coas", { select: "id,coa_date,product_name,dispatch_qty,updated_at", filter: { job_id: "is.null" }, order: "updated_at.desc", limit: 200 });
  return rows.map((r) => ({ id: r.id, date: r.coa_date, productName: r.product_name || "", dispatchQty: r.dispatch_qty || "", updatedAt: r.updated_at }));
}

// Public job id → { count, last } for the QC list.
export async function listCoaIndex() {
  const rows = await dbSelect("job_coas", { select: "coa_date,jobs(id,airtable_id)", filter: { job_id: "not.is.null" }, order: "coa_date.desc", range: [0, 1999] });
  const out = {};
  for (const r of rows) {
    if (!r.jobs) continue;
    const id = publicId(r.jobs);
    out[id] = out[id] || { count: 0, last: r.coa_date };
    out[id].count += 1;
  }
  return out;
}
