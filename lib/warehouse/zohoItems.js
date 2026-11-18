// Matching Zoho items to warehouse items, shared by Inward (POs) and Outward
// (invoices). Arjun, 18-Nov-2026: match on first use — the first time a Zoho
// item turns up, the warehouse picks (or creates) its warehouse item once and
// zoho_item_links remembers it.
//
// Industry-neutral on purpose: a warehouse item is just a code, a name and a
// unit, so packaging, bearings or screws all go through the same path.

import { dbSelect, dbInsert } from "../db/supabase.js";

export const quoteIn = (vals) => `in.(${vals.map((v) => `"${String(v).replace(/"/g, "")}"`).join(",")})`;

const UNIT_ALIASES = { nos: "pcs", no: "pcs", pc: "pcs", piece: "pcs", pieces: "pcs", kgs: "kg", boxes: "box", rolls: "roll", sets: "set", mtr: "m", meter: "m", metre: "m", ltr: "l" };
export function normaliseUnit(u) {
  const s = String(u || "").trim().toLowerCase().replace(/\.$/, "");
  return UNIT_ALIASES[s] || s || "pcs";
}

// Stock goods a job produced are kept under their own code (one per job), so
// a printed job never mixes with plain stock of the same size.
export const jobItemSku = (jNumber) => `J-${String(jNumber).trim()}`;
export const isJobItem = (sku) => /^J-/.test(String(sku || ""));

// itemIds → Map(itemId → [{ locationId, code, qty }]) for stock on hand.
export async function stockFor(itemIds) {
  const ids = [...new Set((itemIds || []).filter(Boolean))];
  const out = new Map();
  if (!ids.length) return out;
  const rows = await dbSelect("inventory_stock", {
    select: "item_id,location_id,qty,inventory_locations(code)",
    filter: { item_id: quoteIn(ids), qty: "gt.0" },
    limit: 5000,
  });
  for (const s of rows) {
    if (!out.has(s.item_id)) out.set(s.item_id, []);
    out.get(s.item_id).push({ locationId: s.location_id, code: s.inventory_locations?.code || "", qty: Number(s.qty) || 0 });
  }
  for (const list of out.values()) list.sort((a, b) => b.qty - a.qty);
  return out;
}

// Zoho reuses one generic item for different goods (item "CORRUGATED" carries
// two box sizes on one PO, told apart only by the line name), so what is
// remembered is the Zoho item together with the line name.
export const nameKey = (name) => String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 200);
const linkKey = (itemId, name) => `${itemId || ""}|${nameKey(name)}`;

const shapeItem = (i) => (i ? { id: i.id, sku: i.sku, name: i.name, uom: i.uom, casePack: i.case_pack } : null);

// Adds to each Zoho line: `link` (what was remembered) and `stock` (where the
// linked item sits).
export async function decorateLines(lines) {
  const itemIds = [...new Set(lines.map((l) => l.itemId || ""))];
  const links = lines.length
    ? await dbSelect("zoho_item_links", {
        select: "zoho_item_id,name_key,inventory_item_id,not_stock,inventory_items(id,sku,name,uom,case_pack)",
        filter: { zoho_item_id: quoteIn(itemIds) },
        limit: 5000,
      })
    : [];
  const linkBy = new Map(links.map((l) => [`${l.zoho_item_id}|${l.name_key}`, l]));
  const stock = await stockFor(links.map((l) => l.inventory_item_id));
  return lines.map((l) => {
    const link = linkBy.get(linkKey(l.itemId, l.name)) || null;
    const item = shapeItem(link?.inventory_items);
    return { ...l, link: link ? { notStock: !!link.not_stock, item } : null, stock: item ? stock.get(item.id) || [] : [] };
  });
}

async function nextCode(prefix) {
  const rows = await dbSelect("inventory_items", { select: "sku", filter: { sku: `like.${prefix}-*` }, order: "sku.desc", limit: 2000 });
  let max = 0;
  for (const r of rows) { const m = String(r.sku).match(/-(\d+)$/); if (m) max = Math.max(max, Number(m[1])); }
  return `${prefix}-${String(max + 1).padStart(5, "0")}`;
}

// A new warehouse item. Uses the Zoho SKU as the code when it is free,
// otherwise the next WH-00001 number.
export async function createWarehouseItem({ name, unit, zohoSku, source = "Other", industry = null, brandCustomer = null, sku = null, notes = null, email = null }) {
  const clean = String(name || "").trim().slice(0, 200);
  if (!clean) throw new Error("Item name is required");
  const wanted = String(sku || zohoSku || "").trim().toUpperCase().replace(/\s+/g, "").slice(0, 60);
  for (let attempt = 0; attempt < 3; attempt++) {
    let code = attempt === 0 && wanted ? wanted : await nextCode("WH");
    if (attempt === 0 && wanted) {
      const taken = await dbSelect("inventory_items", { select: "id", filter: { sku: `eq.${wanted}` }, limit: 1 });
      if (taken.length) code = await nextCode("WH");
    }
    try {
      return await dbInsert("inventory_items", {
        sku: code, name: clean, uom: normaliseUnit(unit), source, industry,
        brand_customer: brandCustomer, notes, needs_review: true,
        created_by: email, updated_by: email,
      });
    } catch (e) {
      if (!/duplicate|23505/.test(String(e?.message)) || attempt === 2) throw e;
    }
  }
  throw new Error("Could not create the item");
}

// Turn the user's per-line picks into warehouse items.
//   choices: Map(lineId → { inventoryItemId?, createNew?, notStock? })
// Returns { resolved: Map(lineId → { itemId|null, notStock }), missing: [names] }.
// New items are created and links saved only when `commit` is true, so the
// caller can validate the whole form first.
export async function resolveLineItems({ lines, choices, email, sourceForNew = "Other", commit = false }) {
  const resolved = new Map();
  const missing = [];
  const newLinks = [];
  const picked = [...choices.values()].map((c) => c.inventoryItemId).filter(Boolean);
  const pickedRows = picked.length
    ? await dbSelect("inventory_items", { select: "id,sku", filter: { id: quoteIn(picked) }, limit: 1000 })
    : [];
  const skuById = new Map(pickedRows.map((r) => [r.id, r.sku]));
  const createdByZohoItem = new Map(); // one new item per Zoho item + name, even over several lines

  for (const l of lines) {
    if (!l.goods || !(l.qty > 0)) continue;
    const c = choices.get(l.lineId) || {};
    const remembered = l.link;
    const touched = c.notStock !== undefined || !!c.inventoryItemId || c.createNew === true;
    const notStock = c.notStock === true || (!touched && !!remembered?.notStock);
    let itemId = notStock ? null : c.inventoryItemId || (!touched || c.notStock === false ? remembered?.item?.id : null) || null;

    if (!notStock && !itemId && c.createNew === true) {
      if (!commit) { resolved.set(l.lineId, { itemId: "new", notStock: false }); continue; }
      const key = linkKey(l.itemId, l.name);
      if (!createdByZohoItem.has(key)) {
        const row = await createWarehouseItem({ name: l.name, unit: l.unit, zohoSku: l.sku, source: sourceForNew, notes: "Created from a Zoho item", email });
        createdByZohoItem.set(key, row.id);
        skuById.set(row.id, row.sku);
      }
      itemId = createdByZohoItem.get(key);
    }
    if (!notStock && !itemId) { missing.push(l.name); continue; }
    resolved.set(l.lineId, { itemId, notStock });

    // Remember the pick — except job stock, which is one-off by nature.
    if (commit && touched && nameKey(l.name) && !(itemId && isJobItem(skuById.get(itemId)))) {
      const changed = notStock ? !remembered?.notStock : remembered?.item?.id !== itemId;
      if (!remembered || changed) {
        newLinks.push({
          zoho_item_id: l.itemId || "", name_key: nameKey(l.name), zoho_name: l.name, zoho_sku: l.sku || null,
          inventory_item_id: itemId, not_stock: !!notStock,
          linked_by_email: email, linked_at: new Date().toISOString(),
        });
      }
    }
  }
  if (commit && newLinks.length) {
    const unique = [...new Map(newLinks.map((n) => [`${n.zoho_item_id}|${n.name_key}`, n])).values()];
    await dbInsert("zoho_item_links", unique, { onConflict: "zoho_item_id,name_key", returning: "minimal" });
  }
  return { resolved, missing };
}

// Small lists the screens need for their pickers.
export async function pickerData() {
  const [items, locations, stock] = await Promise.all([
    dbSelect("inventory_items", { select: "id,sku,name,uom,brand,brand_customer,industry", filter: { is_active: "eq.true" }, order: "name.asc", limit: 10000 }),
    dbSelect("inventory_locations", { select: "id,code,name,warehouse,zone", filter: { is_active: "eq.true" }, order: "code.asc", limit: 1000 }),
    dbSelect("inventory_stock", { select: "item_id,location_id,qty,inventory_locations(code)", filter: { qty: "gt.0" }, limit: 10000 }),
  ]);
  const stockByItem = {};
  for (const s of stock) {
    (stockByItem[s.item_id] ||= []).push({ locationId: s.location_id, code: s.inventory_locations?.code || "", qty: Number(s.qty) || 0 });
  }
  for (const k of Object.keys(stockByItem)) stockByItem[k].sort((a, b) => b.qty - a.qty);
  return {
    items: items.map((i) => ({ id: i.id, sku: i.sku, name: i.name, uom: i.uom, brand: i.brand_customer || i.brand || "" })),
    locations: locations.map((l) => ({ id: l.id, code: l.code, name: l.name || "", zone: l.zone || "" })),
    stockByItem,
  };
}
