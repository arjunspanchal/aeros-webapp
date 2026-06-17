// WarehouseOS — bulk opening-stock importer.
//
// First-load path for an empty (or partially loaded) warehouse: take a CSV of
// physically-counted stock and, in one pass, create any missing SKUs and post
// a single "opening" Inward movement that seeds both quantity and weighted-avg
// cost. This is the right tool for the first audit — the Stock Audit feature
// is for reconciling EXISTING system stock against a recount (it posts only
// variances and captures no cost), so it would leave Total Value at ₹0 on a
// first load.
//
// Two phases, same validation:
//   previewImport(rows) — resolve + validate, NO writes. Powers the preview.
//   commitImport(rows)  — re-validate server-side, batch-create items, post
//                         one opening Inward.

import { dbSelect, dbInsert } from "../db/supabase.js";
import { listLocations } from "./inventory.js";
import { postMovement } from "./movements.js";

// Columns the CSV understands (header row, case-insensitive). Only sku, qty,
// location_code are always required; name is required when the SKU is new;
// unit_cost is strongly recommended (warning if missing). The rest are used
// only when creating a new item.
export const IMPORT_COLUMNS = [
  { key: "sku",           label: "sku",           required: true,  note: "Item SKU (matched case-insensitively)" },
  { key: "qty",           label: "qty",           required: true,  note: "Counted quantity (> 0)" },
  { key: "location_code", label: "location_code", required: true,  note: "Zone code, e.g. BWD-FG-A" },
  { key: "unit_cost",     label: "unit_cost",     required: false, note: "Purchase / landed ₹ per unit (recommended)" },
  { key: "name",          label: "name",          required: false, note: "Required only when the SKU is new" },
  { key: "category",      label: "category",      required: false, note: "New items only" },
  { key: "uom",           label: "uom",           required: false, note: "New items only (default pcs)" },
  { key: "brand",         label: "brand",         required: false, note: "New items only" },
  { key: "case_pack",     label: "case_pack",     required: false, note: "New items only" },
  { key: "source",        label: "source",        required: false, note: "New items only (FG/RM/Clearance/Other, default FG)" },
  { key: "gsm",           label: "gsm",           required: false, note: "New items only" },
];

export function importTemplateCsv() {
  const header = "sku,name,qty,unit_cost,location_code,category,uom,brand,case_pack,source,gsm";
  const sample =
    "CUP-DW-8OZ-PLAIN,8 oz DW paper cup (plain),50000,2.85,BWD-FG-A,Paper Cup,pcs,Aeros,1000,FG,280";
  return `${header}\n${sample}\n`;
}

// ---- CSV parsing -----------------------------------------------------------
// Minimal RFC-4180-ish parser: handles quoted fields, escaped quotes (""),
// and CRLF/LF. No dependency.
export function parseCsv(text) {
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;
  const s = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); rows.push(row); field = ""; row = [];
    } else field += c;
  }
  // Flush last field/row if any content.
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  // Drop fully-empty rows.
  return rows.filter((r) => r.some((cell) => String(cell).trim() !== ""));
}

// Turn raw CSV text into header-keyed objects. Header names are lowercased +
// trimmed so "Unit Cost" / "unit_cost" / "UNIT_COST" all map to unit_cost.
export function csvToObjects(text) {
  const grid = parseCsv(text);
  if (grid.length === 0) return { headers: [], rows: [] };
  const headers = grid[0].map((h) => String(h).trim().toLowerCase().replace(/\s+/g, "_"));
  const rows = grid.slice(1).map((cells) => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = cells[idx] != null ? String(cells[idx]).trim() : ""; });
    return obj;
  });
  return { headers, rows };
}

// ---- Validation + resolution ----------------------------------------------

function numOrNull(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function loadContext() {
  const [locations, items, stock] = await Promise.all([
    listLocations(),
    dbSelect("inventory_items", { select: "id,sku,name,uom,is_active", limit: 10000 }),
    dbSelect("inventory_stock_position", { select: "sku,by_location", limit: 10000 }),
  ]);
  const locByCode = new Map();
  for (const l of locations) locByCode.set(l.code.toLowerCase(), l);
  const itemBySku = new Map();
  for (const it of items) itemBySku.set(String(it.sku).toLowerCase(), it);
  const onHandBySku = new Map();
  for (const r of stock) onHandBySku.set(String(r.sku).toLowerCase(), r.by_location || {});
  return { locByCode, itemBySku, onHandBySku, locations };
}

// Resolve + validate every row. Pure read — no writes. Returns enriched rows
// plus a summary. Blocking errors disable commit; warnings are advisory.
export async function previewImport(rawRows) {
  const ctx = await loadContext();
  const seen = new Map(); // sku|loc -> first row index, to flag in-file dupes

  const rows = (Array.isArray(rawRows) ? rawRows : []).map((r, idx) => {
    const sku = String(r.sku || "").trim();
    const locationCode = String(r.location_code || "").trim();
    const qty = numOrNull(r.qty);
    const unitCost = numOrNull(r.unit_cost);
    const name = String(r.name || "").trim();

    const errors = [];
    const warnings = [];

    if (!sku) errors.push("Missing sku");
    if (qty == null || qty <= 0) errors.push("qty must be a number > 0");

    const loc = locationCode ? ctx.locByCode.get(locationCode.toLowerCase()) : null;
    if (!locationCode) errors.push("Missing location_code");
    else if (!loc) errors.push(`Unknown location "${locationCode}"`);

    const existing = sku ? ctx.itemBySku.get(sku.toLowerCase()) : null;
    const isNew = !!sku && !existing;
    if (isNew && !name) errors.push("New SKU needs a name");
    if (r.brand_customer) errors.push("Branded variants can't be imported (FactoryOS push only)");

    if (unitCost == null) warnings.push("No unit_cost — loads at ₹0 value (backfill later)");
    else if (unitCost < 0) errors.push("unit_cost can't be negative");

    // Already-has-stock warning (existing item at this location).
    let currentOnHand = 0;
    if (existing && loc) {
      const byLoc = ctx.onHandBySku.get(sku.toLowerCase()) || {};
      currentOnHand = Number(byLoc[loc.code] || 0);
      if (currentOnHand > 0) {
        warnings.push(`Already ${currentOnHand.toLocaleString("en-IN")} at ${loc.code} — import ADDS to it`);
      }
    }

    // In-file duplicate (same sku + location appears twice).
    if (sku && loc) {
      const key = `${sku.toLowerCase()}|${loc.code.toLowerCase()}`;
      if (seen.has(key)) warnings.push(`Duplicate of row ${seen.get(key) + 1} (same SKU + location) — both post`);
      else seen.set(key, idx);
    }

    return {
      idx,
      sku,
      name: name || existing?.name || "",
      locationCode: loc?.code || locationCode,
      locationId: loc?.id || null,
      qty,
      unitCost,
      uom: String(r.uom || "").trim() || existing?.uom || "pcs",
      category: String(r.category || "").trim() || null,
      brand: String(r.brand || "").trim() || null,
      casePack: numOrNull(r.case_pack),
      source: String(r.source || "").trim() || "FG",
      gsm: numOrNull(r.gsm),
      itemStatus: isNew ? "new" : "existing",
      currentOnHand,
      errors,
      warnings,
      ok: errors.length === 0,
    };
  });

  const summary = {
    total: rows.length,
    ready: rows.filter((r) => r.ok).length,
    errors: rows.filter((r) => !r.ok).length,
    warnings: rows.filter((r) => r.ok && r.warnings.length > 0).length,
    newItems: new Set(rows.filter((r) => r.ok && r.itemStatus === "new").map((r) => r.sku.toLowerCase())).size,
    existingItems: new Set(rows.filter((r) => r.ok && r.itemStatus === "existing").map((r) => r.sku.toLowerCase())).size,
    totalValue: rows.filter((r) => r.ok).reduce((s, r) => s + (r.qty || 0) * (r.unitCost || 0), 0),
  };

  return { rows, summary };
}

// Commit: re-validate, batch-create new items, post ONE opening Inward.
// reference/date come from the caller. Aborts if ANY row has a blocking error
// (partial opening loads silently miss stock — too dangerous).
export async function commitImport({ rawRows, reference, movementDate }, userEmail) {
  const { rows, summary } = await previewImport(rawRows);
  if (summary.total === 0) throw new Error("Nothing to import");
  if (summary.errors > 0) {
    throw new Error(`${summary.errors} row(s) have errors — fix the CSV and re-upload. Opening loads are all-or-nothing.`);
  }

  // 1. Batch-create new items (one row per unique new SKU).
  const newBySku = new Map();
  for (const r of rows) {
    if (r.itemStatus !== "new") continue;
    if (newBySku.has(r.sku.toLowerCase())) continue;
    newBySku.set(r.sku.toLowerCase(), {
      sku: r.sku,
      name: r.name,
      category: r.category,
      brand: r.brand,
      uom: r.uom || "pcs",
      case_pack: r.casePack,
      source: r.source || "FG",
      gsm: r.gsm,
      created_by: userEmail || null,
      updated_by: userEmail || null,
    });
  }
  let createdRows = [];
  if (newBySku.size > 0) {
    createdRows = await dbInsert("inventory_items", Array.from(newBySku.values()));
  }
  const idBySku = new Map();
  for (const it of createdRows) idBySku.set(String(it.sku).toLowerCase(), it.id);

  // Re-load existing item ids (cheap; covers the existing-SKU rows).
  const existing = await dbSelect("inventory_items", { select: "id,sku", limit: 10000 });
  for (const it of existing) {
    if (!idBySku.has(String(it.sku).toLowerCase())) idBySku.set(String(it.sku).toLowerCase(), it.id);
  }

  // 2. Build lines — one per row, into its physical location.
  const lines = rows.map((r) => ({
    item_id: idBySku.get(r.sku.toLowerCase()),
    to_location_id: r.locationId,
    qty: r.qty,
    unit_cost: r.unitCost == null ? "" : r.unitCost,
    remarks: "Opening stock (bulk import)",
  }));
  if (lines.some((l) => !l.item_id)) {
    throw new Error("Internal: an item id could not be resolved after creation. No movement posted.");
  }

  // 3. Post ONE opening Inward — atomic header + all lines via the RPC.
  const result = await postMovement(
    {
      type: "inward",
      reference_type: "opening",
      reference: reference || `Opening stock — ${new Date().toISOString().slice(0, 10)}`,
      movement_date: movementDate || null,
      notes: `Bulk opening-stock import · ${lines.length} line(s)`,
      lines,
    },
    userEmail,
  );

  return {
    movement_no: result?.movement_no || null,
    movement_id: result?.id || null,
    items_created: newBySku.size,
    lines_posted: lines.length,
    total_value: summary.totalValue,
  };
}
