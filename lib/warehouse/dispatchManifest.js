// WarehouseOS — Vehicle Dispatch manifest (the load calculator).
//
// The job this does: the team should never again hand-assemble case-pack data
// in Excel before a vehicle goes out. Pick a box type from the product master,
// say how many boxes, and the pcs/box, kg/box and carton size come with it —
// rolling up into the total weight and total CBM the vehicle has to carry, and
// a suggested vehicle size for that cube.
//
// Items come from master_products ONLY. The manifest never creates a product;
// an unknown box type is a gap in the master to be fixed there, not here.
//
// Per-box specs are still snapshotted onto each line, because a manifest is a
// shipping document: it must reprint the same numbers a year later even if the
// master carton spec is later revised. spec_source records where each line's
// numbers came from — the master, derived from piece weight, or typed by hand.
//
// Totals are always derived, never stored, so an edited line can't leave a
// stale total behind.

import { dbSelect, dbInsert, dbDelete } from "../db/supabase.js";

// ---------- invoices ----------
//
// A vehicle routinely carries 3–4 invoices, and not always to one consignee —
// a trip may drop at several customers. Each invoice therefore carries its own
// e-way bill (India issues one EWB per invoice) and its own consignee.

const INVOICE_SELECT =
  "id,dispatch_id,seq,invoice_no,eway_bill_no,client_id,customer_name," +
  "drop_city,invoice_value_inr,notes,created_at";

export async function listDispatchInvoices(dispatchId) {
  const rows = await dbSelect("vehicle_dispatch_invoices", {
    select: INVOICE_SELECT,
    filter: { dispatch_id: `eq.${dispatchId}` },
    order: "seq.asc,created_at.asc",
    limit: 200,
  });
  return rows.map((r) => ({
    ...r,
    invoice_value_inr: r.invoice_value_inr != null ? Number(r.invoice_value_inr) : null,
  }));
}

// Invoices for many dispatches at once, grouped by dispatch — lets the queue
// show "INV-1 (+2)" without a query per row.
export async function listInvoicesForDispatches(dispatchIds = []) {
  const ids = [...new Set(dispatchIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const rows = await dbSelect("vehicle_dispatch_invoices", {
    select: "dispatch_id,seq,invoice_no,eway_bill_no,customer_name",
    filter: { dispatch_id: `in.(${ids.join(",")})` },
    order: "seq.asc",
    limit: 5000,
  });
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.dispatch_id)) map.set(r.dispatch_id, []);
    map.get(r.dispatch_id).push(r);
  }
  return map;
}

// ---------- carton geometry ----------

// "640 x 400 x 570 mm" / "470 × 380 × 650" → { l, w, h } in mm. Handles the
// ×/x/* separators and the optional trailing unit that the master data mixes.
export function parseCartonDims(text) {
  if (!text) return null;
  const nums = String(text).match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 3) return null;
  const [l, w, h] = nums.slice(0, 3).map(Number);
  if (!(l > 0 && w > 0 && h > 0)) return null;
  return { l, w, h };
}

// Carton volume in m³ from an "L × W × H" (mm) string. null if unparseable.
export function cbmFromDims(text) {
  const d = parseCartonDims(text);
  if (!d) return null;
  return +((d.l * d.w * d.h) / 1e9).toFixed(5); // mm³ → m³
}

// Normalise however the dims were typed into the canonical display form.
export function formatDims(text) {
  const d = parseCartonDims(text);
  if (!d) return String(text || "").trim() || null;
  return `${d.l} × ${d.w} × ${d.h}`;
}

// ---------- box-type picker (master_products) ----------

const MASTER_SELECT =
  "id,sku,product_name,category,sub_category,size_volume,units_per_case," +
  "inner_case_pack,carton_dimensions,gross_weight_kg,net_weight_kg,item_weight_g";

// Shape one master row into the picker's box type, resolving the two numbers
// the manifest actually needs. Weight prefers the master's gross carton weight;
// where that's blank we derive net from piece weight × units per case, which is
// close enough to plan a vehicle around and clearly flagged as derived.
function toBoxType(m) {
  const cartonDims = m.carton_dimensions || null;
  const cbm = cbmFromDims(cartonDims);
  const upc = m.units_per_case != null ? Number(m.units_per_case) : null;

  let kg = m.gross_weight_kg != null ? Number(m.gross_weight_kg) : null;
  let weightSource = kg != null ? "master" : null;
  if (kg == null && m.net_weight_kg != null) {
    kg = Number(m.net_weight_kg);
    weightSource = "master";
  }
  if (kg == null && m.item_weight_g != null && upc) {
    kg = +((Number(m.item_weight_g) * upc) / 1000).toFixed(3);
    weightSource = "derived"; // net of the carton itself
  }

  return {
    id: m.id,
    sku: m.sku || "",
    name: m.product_name || m.sku || "",
    category: m.category || null,
    sub_category: m.sub_category || null,
    size_volume: m.size_volume || null,
    units_per_case: upc,
    inner_case_pack: m.inner_case_pack != null ? Number(m.inner_case_pack) : null,
    carton_dims: cartonDims ? formatDims(cartonDims) : null,
    kg_per_box: kg,
    cbm_per_box: cbm,
    // 'master' only when both shipping numbers came straight off the master —
    // anything else needs a human to at least glance at it.
    spec_source: kg != null && cbm != null ? (weightSource === "derived" ? "derived" : "master") : "manual",
    // Lets the picker show, and sort by, whether the maths will work as-is.
    complete: kg != null && cbm != null,
  };
}

// The full product master, picker-shaped. Every manifest line must resolve to
// one of these.
export async function listBoxTypes() {
  const rows = await dbSelect("master_products", {
    select: MASTER_SELECT,
    order: "product_name.asc",
    limit: 5000,
  });
  return rows.map(toBoxType);
}

// ---------- history ----------

// What this team has actually put on vehicles before, most-used first.
// Two reasons this exists: repeat lanes (Zepto every week) should be two
// clicks, and a product the floor has shipped before is far likelier to be
// the right pick than an alphabetical neighbour in a 1,000-row master.
//
// `clientId` / `customerName` bias the list to this customer's own history —
// the same box type shipped to the same customer is the strongest signal
// there is.
export async function listBoxTypeHistory({ clientId = null, customerName = null, limit = 400 } = {}) {
  const rows = await dbSelect("vehicle_dispatch_lines", {
    select: "master_product_id,sku,description,box_count,created_at,dispatch_id",
    filter: { master_product_id: "not.is.null" },
    order: "created_at.desc",
    limit,
  });
  if (!rows.length) return [];

  // Resolve the owning dispatches in one follow-up rather than an embed, so a
  // soft-deleted dispatch's lines drop out of the history.
  const ids = [...new Set(rows.map((r) => r.dispatch_id).filter(Boolean))];
  const dispatches = await dbSelect("vehicle_dispatches", {
    select: "id,client_id,customer_name",
    filter: { id: `in.(${ids.join(",")})`, deleted_at: "is.null" },
    limit: ids.length,
  });
  const byDispatch = new Map(dispatches.map((d) => [d.id, d]));

  const byProduct = new Map();
  for (const r of rows) {
    const d = byDispatch.get(r.dispatch_id);
    if (!d) continue; // dispatch soft-deleted
    const mine =
      (clientId && d.client_id === clientId) ||
      (!!customerName && (d.customer_name || "").toLowerCase() === customerName.toLowerCase());
    const cur = byProduct.get(r.master_product_id);
    if (cur) {
      cur.times += 1;
      cur.forThisCustomer = cur.forThisCustomer || mine;
      if (mine && cur.lastBoxCountForCustomer == null) cur.lastBoxCountForCustomer = r.box_count;
    } else {
      byProduct.set(r.master_product_id, {
        master_product_id: r.master_product_id,
        sku: r.sku || "",
        description: r.description || "",
        times: 1,
        lastUsedAt: r.created_at,
        forThisCustomer: mine,
        // Pre-filling last time's count makes a repeat run nearly typing-free.
        lastBoxCountForCustomer: mine ? r.box_count : null,
      });
    }
  }

  return [...byProduct.values()].sort((a, b) => {
    if (a.forThisCustomer !== b.forThisCustomer) return a.forThisCustomer ? -1 : 1;
    if (a.times !== b.times) return b.times - a.times;
    return String(b.lastUsedAt || "").localeCompare(String(a.lastUsedAt || ""));
  });
}

// The previous manifest raised for this customer, ready to be loaded wholesale
// into a new one — the "same order as last month" case that drives most of the
// Excel copy-paste today. Returns null when there's nothing to copy.
export async function getLastManifestForCustomer({ dispatchId, clientId, customerName }) {
  const filter = { deleted_at: "is.null", id: `neq.${dispatchId}` };
  if (clientId) filter.client_id = `eq.${clientId}`;
  else if (customerName) filter.customer_name = `eq.${customerName}`;
  else return null;

  const prior = await dbSelect("vehicle_dispatches", {
    select: "id,dispatch_no,dispatch_date",
    filter,
    order: "dispatch_date.desc,created_at.desc",
    limit: 10,
  });
  if (!prior.length) return null;

  // One query across the candidates rather than a loop of ten — most customers
  // have a manifest on their latest dispatch, but a customer who's only just
  // started using this would otherwise cost ten empty round-trips.
  const rows = await dbSelect("vehicle_dispatch_lines", {
    select: LINE_SELECT,
    filter: { dispatch_id: `in.(${prior.map((p) => p.id).join(",")})` },
    order: "sr_no.asc,created_at.asc",
    limit: 1000,
  });
  if (!rows.length) return null;

  // `prior` is newest-first, so the first candidate with lines is the answer.
  const withLines = prior.find((p) => rows.some((r) => r.dispatch_id === p.id));
  if (!withLines) return null;

  return {
    dispatch_no: withLines.dispatch_no,
    dispatch_date: withLines.dispatch_date,
    lines: rows.filter((r) => r.dispatch_id === withLines.id).map(normalizeLine),
  };
}

// Every manifest ever generated, newest first — the record the team asks for
// when a customer queries what actually went on a vehicle. Totals come from
// v_vehicle_dispatch_manifests (grouped in Postgres) so this is one query, not
// one per dispatch.
export async function listManifestHistory({ limit = 500 } = {}) {
  const rows = await dbSelect("v_vehicle_dispatch_manifests", {
    select: "*",
    order: "dispatch_date.desc,dispatch_no.desc",
    limit,
  });
  return rows.map((r) => ({
    ...r,
    line_count: Number(r.line_count) || 0,
    total_boxes: Number(r.total_boxes) || 0,
    total_pcs: Number(r.total_pcs) || 0,
    total_kg: Number(r.total_kg) || 0,
    total_cbm: Number(r.total_cbm) || 0,
    missing_kg: Number(r.missing_kg) || 0,
    missing_cbm: Number(r.missing_cbm) || 0,
  }));
}

// ---------- lines ----------

const LINE_SELECT =
  "id,dispatch_id,invoice_id,sr_no,master_product_id,item_id,sku,description,box_count," +
  "kg_per_box,cbm_per_box,carton_dims,units_per_case,spec_source,created_at";

function normalizeLine(row) {
  if (!row) return null;
  const boxes = Number(row.box_count) || 0;
  const kg = row.kg_per_box != null ? Number(row.kg_per_box) : null;
  const cbm = row.cbm_per_box != null ? Number(row.cbm_per_box) : null;
  const upc = row.units_per_case != null ? Number(row.units_per_case) : null;
  return {
    ...row,
    box_count: boxes,
    kg_per_box: kg,
    cbm_per_box: cbm,
    units_per_case: upc,
    line_kg: kg != null ? +(boxes * kg).toFixed(2) : null,
    line_cbm: cbm != null ? +(boxes * cbm).toFixed(3) : null,
    line_pcs: upc != null ? boxes * upc : null,
  };
}

export async function listManifestLines(dispatchId) {
  const rows = await dbSelect("vehicle_dispatch_lines", {
    select: LINE_SELECT,
    filter: { dispatch_id: `eq.${dispatchId}` },
    order: "sr_no.asc,created_at.asc",
    limit: 500,
  });
  return rows.map(normalizeLine);
}

// Shipment roll-up. `missingKg` / `missingCbm` count lines still short of a
// spec so the UI and the PDF can say "this total excludes N lines" rather
// than quietly under-reporting the load.
export function manifestTotals(lines = []) {
  let boxes = 0, kg = 0, cbm = 0, pcs = 0;
  let missingKg = 0, missingCbm = 0;
  for (const l of lines) {
    const n = Number(l.box_count) || 0;
    boxes += n;
    if (l.kg_per_box != null)  kg  += n * Number(l.kg_per_box);  else if (n) missingKg++;
    if (l.cbm_per_box != null) cbm += n * Number(l.cbm_per_box); else if (n) missingCbm++;
    if (l.units_per_case != null) pcs += n * Number(l.units_per_case);
  }
  return {
    boxes,
    kg: +kg.toFixed(2),
    cbm: +cbm.toFixed(3),
    pcs,
    missingKg,
    missingCbm,
    complete: missingKg === 0 && missingCbm === 0,
  };
}

// Manifest split by invoice, in drop order, each with its own subtotal — what
// the PDF prints and what the consignee checks their boxes against. Lines not
// yet tagged to an invoice come back in a trailing `unassigned` group rather
// than being dropped, so nothing on the vehicle can go unprinted.
export function groupByInvoice(lines = [], invoices = []) {
  const byId = new Map();
  for (const inv of invoices) byId.set(inv.id, { invoice: inv, lines: [] });

  const unassigned = [];
  for (const l of lines) {
    const g = l.invoice_id ? byId.get(l.invoice_id) : null;
    if (g) g.lines.push(l);
    else unassigned.push(l);
  }

  const groups = [...byId.values()]
    .map((g) => ({ ...g, totals: manifestTotals(g.lines) }))
    .sort((a, b) => (a.invoice.seq ?? 0) - (b.invoice.seq ?? 0));

  if (unassigned.length) {
    groups.push({ invoice: null, lines: unassigned, totals: manifestTotals(unassigned) });
  }
  return groups;
}

function numOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(v) {
  const n = numOrNull(v);
  return n == null ? null : Math.round(n);
}

const SPEC_SOURCES = new Set(["master", "derived", "manual"]);

// Save the whole manifest — invoices and lines together, in one shot. The form
// edits both client-side and submits them entire, mirroring how sample-dispatch
// items are written: simpler than diffing, and a manifest is small.
//
// Invoices are replaced first, which mints new ids. Lines therefore reference
// their invoice by the CLIENT's stable local key (`invoice_key`), which is
// remapped to the new id here — a line can't carry a database id that the
// replace is about to invalidate.
export async function saveManifest(dispatchId, { invoices = [], lines = [] } = {}) {
  const invoiceRows = [];
  invoices.forEach((inv, idx) => {
    const no = String(inv.invoice_no || "").trim();
    if (!no) throw new Error(`Invoice ${idx + 1}: invoice number is required`);
    const consignee = String(inv.customer_name || "").trim();
    if (!consignee) throw new Error(`Invoice ${no}: consignee is required`);
    const value = numOrNull(inv.invoice_value_inr);
    if (value != null && value < 0) throw new Error(`Invoice ${no}: value cannot be negative`);
    invoiceRows.push({
      dispatch_id: dispatchId,
      seq: idx + 1,
      invoice_no: no,
      eway_bill_no: inv.eway_bill_no?.trim() || null,
      client_id: inv.client_id || null,
      customer_name: consignee,
      drop_city: inv.drop_city?.trim() || null,
      invoice_value_inr: value,
      notes: inv.notes?.trim() || null,
    });
  });

  const dupes = invoiceRows
    .map((r) => r.invoice_no.toLowerCase())
    .filter((no, i, all) => all.indexOf(no) !== i);
  if (dupes.length) throw new Error(`Invoice ${dupes[0]} is listed twice on this vehicle`);

  // Lines go first so a validation failure can't leave the invoices replaced
  // and the lines untouched.
  const clean = [];
  lines.forEach((l, idx) => {
    // Enforced here, not just in the UI: a line must point at a real master
    // product, so the manifest can never become a back door for ad-hoc items.
    if (!l.master_product_id) {
      throw new Error(`Line ${idx + 1}: pick the item from the product master`);
    }
    const description = String(l.description || "").trim();
    if (!description) throw new Error(`Line ${idx + 1}: description is required`);
    const boxes = intOrNull(l.box_count);
    if (boxes == null || boxes < 0) throw new Error(`Line ${idx + 1}: box count must be 0 or more`);
    const kg = numOrNull(l.kg_per_box);
    if (kg != null && kg < 0) throw new Error(`Line ${idx + 1}: weight per box cannot be negative`);
    const dims = l.carton_dims ? formatDims(l.carton_dims) : null;
    // CBM follows the dims whenever they parse, so the two can't disagree on
    // the printed manifest; an explicit cbm_per_box covers dims-less lines.
    const cbm = cbmFromDims(dims) ?? numOrNull(l.cbm_per_box);
    if (cbm != null && cbm < 0) throw new Error(`Line ${idx + 1}: CBM per box cannot be negative`);

    clean.push({
      _invoice_key: l.invoice_key ?? null,
      dispatch_id: dispatchId,
      sr_no: idx + 1,
      master_product_id: l.master_product_id,
      item_id: l.item_id || null,
      sku: l.sku?.trim() || null,
      description,
      box_count: boxes,
      kg_per_box: kg,
      cbm_per_box: cbm,
      carton_dims: dims,
      units_per_case: intOrNull(l.units_per_case),
      spec_source: SPEC_SOURCES.has(l.spec_source) ? l.spec_source : "manual",
    });
  });

  // Replace invoices, then map each line's client key onto the new id. Lines
  // are deleted before the invoices they point at, so the FK never dangles.
  await dbDelete("vehicle_dispatch_lines", "dispatch_id", dispatchId);
  await dbDelete("vehicle_dispatch_invoices", "dispatch_id", dispatchId);

  const idByKey = new Map();
  if (invoiceRows.length) {
    const inserted = await dbInsert("vehicle_dispatch_invoices", invoiceRows);
    inserted.forEach((row, i) => {
      const key = invoices[i]?.key;
      if (key != null) idByKey.set(String(key), row.id);
    });
  }

  if (clean.length) {
    await dbInsert(
      "vehicle_dispatch_lines",
      clean.map(({ _invoice_key, ...row }) => ({
        ...row,
        invoice_id: _invoice_key != null ? idByKey.get(String(_invoice_key)) || null : null,
      })),
    );
  }

  return {
    invoices: await listDispatchInvoices(dispatchId),
    lines: await listManifestLines(dispatchId),
  };
}
