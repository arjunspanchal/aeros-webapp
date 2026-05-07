// Airtable-API shim over Supabase. Implements the same surface the legacy
// wrappers expose (airtableList / airtableGet / airtableCreate / airtableUpdate
// / airtableDelete / airtableUploadAttachment), routing every call to Supabase
// instead. Caller code (repo.js, store.js, route handlers) doesn't need to
// change — they still get Airtable-shaped {id, fields, createdTime} records.
//
// filterByFormula support: only the most common patterns repo.js + route
// handlers use are translated. Unknown formulas throw at runtime so we catch
// them rather than silently returning wrong data.

import {
  dbSelect, dbInsert, dbUpdate, dbDelete,
  isAirtableId, idFilterCol, findOne,
} from "./supabase.js";
import { uploadToBucket, deleteFromBucket, safeFilename } from "./storage.js";
import { SHAPES, ATTACHMENT_ROUTES, resolvePgIdFromPublicId } from "./shapes.js";

function shapeFor(airtableTable) {
  const cfg = SHAPES[airtableTable];
  if (!cfg) throw new Error(`No shape defined for Airtable table '${airtableTable}'`);
  return cfg;
}

// ---- filterByFormula → PG filter translator ----
// Supports only what we need today. Patterns recognised:
//   {Field}='value'                                   → field eq value
//   LOWER({Field})='value'                            → field eq value (citext is case-insensitive anyway)
//   {Field}=true / {Field}=false / NOT({Field})       → boolean
//   RECORD_ID()='id'                                  → id filter
//   FIND('id', ARRAYJOIN({LinkField}))                → link contains id
//   AND(...) / OR(...)                                → composes the above
async function translateFormulaToFilter(formula, cfg) {
  if (!formula) return {};
  const f = formula.trim();

  // RECORD_ID()='X'
  let m = f.match(/^RECORD_ID\(\)='([^']+)'$/);
  if (m) {
    const id = m[1];
    return { [idFilterCol(id)]: `eq.${id}` };
  }

  // {Field}='value'
  m = f.match(/^\{([^}]+)\}='((?:[^']|\\')*)'$/);
  if (m) {
    const col = pgColForAirtableField(cfg, m[1]);
    return { [col]: `eq.${m[2].replace(/\\'/g, "'")}` };
  }

  // LOWER({Field})='value'
  m = f.match(/^LOWER\(\{([^}]+)\}\)='((?:[^']|\\')*)'$/);
  if (m) {
    const col = pgColForAirtableField(cfg, m[1]);
    return { [col]: `eq.${m[2].toLowerCase().replace(/\\'/g, "'")}` };
  }

  // NOT({Field})
  m = f.match(/^NOT\(\{([^}]+)\}\)$/);
  if (m) {
    const col = pgColForAirtableField(cfg, m[1]);
    return { [col]: `is.false` };
  }

  // {Field} — bare truthy check (Airtable renders checkboxes as 0/1 truthy;
  // map to PG `is.true` for boolean columns).
  m = f.match(/^\{([^}]+)\}$/);
  if (m) {
    const col = pgColForAirtableField(cfg, m[1]);
    return { [col]: `is.true` };
  }

  // FIND('id', ARRAYJOIN({LinkField}))
  m = f.match(/^FIND\('([^']+)',\s*ARRAYJOIN\(\{([^}]+)\}\)\)$/);
  if (m) {
    const linkId = m[1];
    const linkField = m[2];
    const fkCol = pgFkColForLinkField(cfg, linkField);
    // Resolve the public id (recXXX) → PG uuid for the FK comparison
    const pgId = await resolvePgIdFromPublicId(fkTargetTableForLinkField(cfg, linkField), linkId);
    return { [fkCol]: pgId ? `eq.${pgId}` : `eq.__no_match__` };
  }

  // IS_SAME({DateField}, 'YYYY-MM-DD', 'day')  → date eq value
  m = f.match(/^IS_SAME\(\{([^}]+)\},\s*'([^']+)',\s*'day'\)$/);
  if (m) {
    const col = pgColForAirtableField(cfg, m[1]);
    return { [col]: `eq.${m[2].slice(0, 10)}` };
  }

  // AND(p1, p2, ...) — combine filters
  m = f.match(/^AND\((.*)\)$/);
  if (m) {
    const parts = splitTopLevel(m[1]);
    const merged = {};
    for (const p of parts) {
      const sub = await translateFormulaToFilter(p.trim(), cfg);
      Object.assign(merged, sub);
    }
    return merged;
  }

  // OR(p1, p2, ...) — PostgREST `or` operator
  m = f.match(/^OR\((.*)\)$/);
  if (m) {
    const parts = splitTopLevel(m[1]);
    const conds = [];
    for (const p of parts) {
      const sub = await translateFormulaToFilter(p.trim(), cfg);
      // Each sub is a single-key {col: "eq.value"}; reformat to PostgREST or-syntax: col.eq.value
      for (const [col, val] of Object.entries(sub)) {
        const m2 = String(val).match(/^([a-z]+)\.(.*)$/);
        if (m2) conds.push(`${col}.${m2[1]}.${m2[2]}`);
      }
    }
    return { or: `(${conds.join(",")})` };
  }

  throw new Error(`filterByFormula not yet translated: ${formula}`);
}

// Split top-level comma-separated expressions ignoring those inside parens/quotes.
function splitTopLevel(s) {
  const out = [];
  let depth = 0, inQuote = false, start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" && s[i - 1] !== "\\") inQuote = !inQuote;
    else if (!inQuote) {
      if (c === "(") depth++;
      else if (c === ")") depth--;
      else if (c === "," && depth === 0) {
        out.push(s.slice(start, i));
        start = i + 1;
      }
    }
  }
  out.push(s.slice(start));
  return out;
}

// Per-table mapping of Airtable field name → PG column name (read filter use).
// Just enough for the formulas we currently translate.
const FIELD_TO_PG_COL = {
  "Bag Specs":     { Code: "code", Brand: "brand", Created: "created_at" },
  // The five legacy quote tables (Quotes / Box Quotes / Cup Quotes / PP
  // Quotes / Import Quotes — Import never had a shim entry) used to live
  // here. All five calculators now write quotes_v2 directly, so the field
  // maps + their pgTable mappings in shapes.js have been removed.
  "Rate Cards":    { Ref: "ref", "Client Email": "client_email", Created: "created_at", Updated: "updated_at" },
  "Rate Card Items": { "Rate Card Ref": "rate_card_ref", "Sort Order": "sort_order" },
  "OTP Codes":     { Email: "email", Code: "code", Used: "used", Created: "created_at" },
  Clients:         { Name: "name", "Contact Email": "contact_email", Created: "created_at" },
  // The legacy Airtable Users table had a single `Role` column; Supabase
  // splits it into factoryos_role + calculator_role. The two callers that
  // filter by {Role} (Clients admin + /api/factoryos/brand-managers) both
  // want the FactoryOS role, so map that here. Calculator-side queries
  // bypass the shim and read calculator_role directly.
  Users:           { Email: "email", Active: "active", Role: "factoryos_role", Created: "created_at" },
  Jobs:            { "J#": "j_number", Stage: "stage", "PO Number": "po_number", Created: "created_at", "Last Updated": "updated_at" },
  "Job Status Updates": { Created: "created_at" },
  "Customer POs":  { "PO Number": "po_number", Created: "created_at" },
  "RM Inventory":  { Name: "name", Status: "status", Active: "active", "Master RM": "master_rm_name", Created: "created_at", "Last Updated": "updated_at" },
  Vendors:         { Name: "name", Type: "type", Active: "active", Created: "created_at" },
  Machines:        { Name: "name", Status: "status", Active: "active", Created: "created_at" },
  Employees:       { Name: "name", Active: "active", Created: "created_at" },
  Attendance:      { Date: "date", Created: "created_at", "Last Updated": "updated_at" },
  "RM Receipts":   { "Invoice Number": "invoice_number", Created: "created_at" },
  "Coating Jobs":  { "Job ID": "job_code", Status: "status", Created: "created_at" },
  "Production Runs": { "Run ID": "run_id", Status: "status", Created: "created_at" },
  "RM Consumption": { Created: "created_at" },
  Products:        { SKU: "sku", "Product Name": "product_name", Category: "category" },
  "Raw Materials": { "Material Name": "material_name", Supplier: "supplier", Type: "type" },
  "Plain Items":   { "Item Name": "item_name", Brand: "brand", Status: "status" },
};

// Per-table link-field → (FK column on this table, PG table the link points at).
const LINK_FIELDS = {
  // The bag-quote `Quotes` link entry (Bag Code → bag_spec_id) was removed
  // alongside the Quotes field map above; the new bag-quotes route writes
  // bag_spec_id straight into quotes_v2.
  "Rate Card Items": { "Rate Card": ["rate_card_id", "rate_cards"] },
  Users:            { Client: ["client_id", "clients"] }, // M:N — lives in user_clients; not directly filterable here
  Jobs:             { Client: ["client_id", "clients"], "Customer Manager": ["customer_manager_id", "users"] },
  "Job Status Updates": { Job: ["job_id", "jobs"] },
  "Customer POs":   { Client: ["client_id", "clients"] },
  "RM Receipts":    { "Stock Line": ["stock_line_id", "raw_materials"] },
  "Coating Jobs":   { "Source Stock Line": ["source_stock_line_id", "raw_materials"], "Result Stock Line": ["result_stock_line_id", "raw_materials"] },
  "Production Runs": { Machine: ["machine_id", "machines"], Job: ["job_id", "jobs"] },
  "RM Consumption": { Run: ["run_id", "production_runs"], "Stock Line": ["stock_line_id", "raw_materials"] },
  Employees:        { Manager: ["manager_id", "users"] },
  Attendance:       { Employee: ["employee_id", "employees"], "Marked By": ["marked_by_user_id", "users"] },
};

function pgColForAirtableField(cfg, fieldName) {
  // Find which Airtable table this cfg belongs to
  for (const [atTable, c] of Object.entries(SHAPES)) {
    if (c === cfg) {
      const map = FIELD_TO_PG_COL[atTable];
      if (map && map[fieldName]) return map[fieldName];
      break;
    }
  }
  // Fallback: snake_case the field name. Strips parens, lowercases, _-joins.
  return fieldName.toLowerCase().replace(/\s*\([^)]*\)/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function pgFkColForLinkField(cfg, linkField) {
  for (const [atTable, c] of Object.entries(SHAPES)) {
    if (c === cfg) {
      const map = LINK_FIELDS[atTable];
      if (map && map[linkField]) return map[linkField][0];
      break;
    }
  }
  throw new Error(`Unknown link field for filter translation: ${linkField}`);
}

function fkTargetTableForLinkField(cfg, linkField) {
  for (const [atTable, c] of Object.entries(SHAPES)) {
    if (c === cfg) {
      const map = LINK_FIELDS[atTable];
      if (map && map[linkField]) return map[linkField][1];
      break;
    }
  }
  throw new Error(`Unknown link target for: ${linkField}`);
}

// Translate Airtable sort spec → PostgREST `order` string.
function translateSort(sort, cfg) {
  if (!Array.isArray(sort) || !sort.length) return undefined;
  return sort.map((s) => {
    const col = pgColForAirtableField(cfg, s.field);
    const dir = s.direction === "desc" ? "desc" : "asc";
    return `${col}.${dir}`;
  }).join(",");
}

// =============================================================================
// Public API — Airtable-shape over Supabase
// =============================================================================

export async function airtableList(table, { filterByFormula, sort, maxRecords, pageSize } = {}) {
  const cfg = shapeFor(table);
  const filter = await translateFormulaToFilter(filterByFormula, cfg);
  const order = translateSort(sort, cfg);
  const rows = await dbSelect(cfg.pgTable, {
    select: cfg.selectColumns,
    filter,
    order,
    limit: maxRecords ?? undefined,
    range: maxRecords ? undefined : "0-9999",
  });
  return Promise.all(rows.map((r) => Promise.resolve(cfg.toAirtable(r))));
}

export async function airtableGet(table, id) {
  const cfg = shapeFor(table);
  const row = await findOne(cfg.pgTable, id, cfg.selectColumns);
  if (!row) return null;
  return await Promise.resolve(cfg.toAirtable(row));
}

export async function airtableCreate(table, fields, { typecast = true } = {}) {
  const cfg = shapeFor(table);
  const pgRow = await Promise.resolve(cfg.toPg(fields));
  // Strip undefineds so they don't override defaults
  for (const k of Object.keys(pgRow)) if (pgRow[k] === undefined) delete pgRow[k];
  const inserted = await dbInsert(cfg.pgTable, pgRow, { returning: "representation" });
  if (cfg.afterUpsert) await cfg.afterUpsert(inserted, fields);
  return await Promise.resolve(cfg.toAirtable(inserted));
}

export async function airtableUpdate(table, id, fields, { typecast = true } = {}) {
  const cfg = shapeFor(table);
  const pgPatch = await Promise.resolve(cfg.toPg(fields));
  for (const k of Object.keys(pgPatch)) if (pgPatch[k] === undefined) delete pgPatch[k];
  const filterCol = idFilterCol(id);
  const updated = await dbUpdate(cfg.pgTable, filterCol, id, pgPatch, { returning: "representation" });
  if (!updated) {
    // Row not found — try the OTHER id column as fallback
    const altCol = filterCol === "airtable_id" ? "id" : "airtable_id";
    const updated2 = await dbUpdate(cfg.pgTable, altCol, id, pgPatch, { returning: "representation" });
    if (!updated2) throw new Error(`Update ${table}/${id}: no matching row`);
    if (cfg.afterUpsert) await cfg.afterUpsert(updated2, fields);
    return await Promise.resolve(cfg.toAirtable(updated2));
  }
  if (cfg.afterUpsert) await cfg.afterUpsert(updated, fields);
  return await Promise.resolve(cfg.toAirtable(updated));
}

export async function airtableDelete(table, id) {
  const cfg = shapeFor(table);
  await dbDelete(cfg.pgTable, idFilterCol(id), id);
  return { id, deleted: true };
}

// =============================================================================
// Attachment uploads — route to Supabase Storage
// =============================================================================

export async function airtableUploadAttachment(recordId, fieldName, { contentType, filename, fileBase64 }) {
  // Find the route by trying every table (the wrappers know their table; this
  // generic shim doesn't, but the recordId is unambiguous).
  // Faster: callers pass the table, so we just iterate ATTACHMENT_ROUTES.
  // Since the existing API takes (recordId, fieldName), we have to discover
  // the table by checking which table has a row with that id.
  const route = await discoverAttachmentRoute(recordId, fieldName);
  if (!route) throw new Error(`No attachment route configured for ${fieldName} on ${recordId}`);

  const { config, pgRow } = route;
  const path = `${pgRow.id}/${Date.now()}-${safeFilename(filename)}`;
  const up = await uploadToBucket({ bucket: config.bucket, path, contentType, fileBase64 });

  if (config.kind === "column") {
    // Single attachment: store path + metadata on the record's own row.
    // First, delete the previous file from Storage if there was one.
    const oldPath = pgRow[Object.keys(config.columns).find((c) => config.columns[c] === "path")] || pgRow.storage_path || pgRow.photo_path;
    if (oldPath && oldPath !== path) {
      try { await deleteFromBucket(config.bucket, oldPath); } catch {}
    }
    const patch = {};
    for (const [col, key] of Object.entries(config.columns)) {
      if (key === "path") patch[col] = up.path;
      else if (key === "filename") patch[col] = filename || null;
      else if (key === "contentType") patch[col] = contentType || null;
      else if (key === "size") patch[col] = up.size;
    }
    await dbUpdate(config.pgTable, "id", pgRow.id, patch, { returning: "minimal" });
  } else if (config.kind === "join") {
    // Multi-attachment: insert a row in the join table.
    await dbInsert(config.joinTable, {
      [config.fkCol]: pgRow.id,
      storage_path: up.path,
      filename: filename || null,
      content_type: contentType || null,
      size_bytes: up.size,
      sort_order: 0,
    }, { returning: "minimal" });
  }

  return { ok: true, path: up.path, fieldName };
}

// Walk every table that has a route defined for this fieldName, looking up by
// public id. Since recordId may be either a recXXX or a uuid, both forms work.
async function discoverAttachmentRoute(recordId, fieldName) {
  for (const [airtableTable, fields] of Object.entries(ATTACHMENT_ROUTES)) {
    if (!fields[fieldName]) continue;
    const cfg = SHAPES[airtableTable];
    if (!cfg) continue;
    const row = await findOne(cfg.pgTable, recordId, "*");
    if (row) return { config: fields[fieldName], pgRow: row };
  }
  return null;
}
