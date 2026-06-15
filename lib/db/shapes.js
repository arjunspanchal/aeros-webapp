// Field-mapping registry. Each entry knows how to convert between an
// Airtable-shaped record `{id, fields: {...}, createdTime}` (the format
// repo.js + route handlers expect) and a Postgres row.
//
// This lets the wrappers in lib/calc/airtable.js, lib/factoryos/airtable.js,
// etc. preserve their callers' contracts while running entirely on Supabase.

import { dbSelect, publicId } from "./supabase.js";
import { signStorageUrl, publicStorageUrl } from "./storage.js";

// ---------- Tiny coercers ----------
const blank = (v) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
export const num = (v) => { if (blank(v)) return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
export const int = (v) => { const n = num(v); return n === null ? null : Math.trunc(n); };
export const bool = (v) => blank(v) ? null : Boolean(v);
export const str = (v) => blank(v) ? null : String(v);
export const dateOnly = (v) => blank(v) ? null : String(v).slice(0, 10);
export const selectName = (v) => {
  if (blank(v)) return null;
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0]?.name ?? v[0] ?? null;
  if (typeof v === "object" && v.name) return v.name;
  return null;
};

// Resolve a public id (recXXX or uuid) → PG uuid (or vice versa) for FK fields.
async function resolvePgIdFromPublicId(table, publicIdValue) {
  if (!publicIdValue) return null;
  if (!publicIdValue.startsWith("rec")) return publicIdValue; // already PG uuid
  const rows = await dbSelect(table, {
    select: "id",
    filter: { airtable_id: `eq.${publicIdValue}` },
    limit: 1,
  });
  return rows[0]?.id ?? null;
}

// Reverse: PG uuid → public id (airtable_id if present, else uuid).
async function publicIdFromPgId(table, pgId) {
  if (!pgId) return null;
  const rows = await dbSelect(table, {
    select: "airtable_id",
    filter: { id: `eq.${pgId}` },
    limit: 1,
  });
  return rows[0]?.airtable_id || pgId;
}

// Convenience: resolve a list of public ids (mixed recXXX + uuids) to PG uuids.
async function resolveLinks(table, ids) {
  if (!Array.isArray(ids) || !ids.length) return [];
  const out = [];
  for (const id of ids) {
    const pg = await resolvePgIdFromPublicId(table, id);
    if (pg) out.push(pg);
  }
  return out;
}

// ---------- Per-table shape definitions ----------
//
// Each entry has:
//   pgTable         — PG table name
//   selectColumns   — what to SELECT for reads (so we don't fetch extras)
//   toAirtable(row) — async or sync; returns { id, fields, createdTime }
//   toPg(fields)    — async or sync; returns PG row { col: value, ... }
//   storage?        — { bucket, attachmentField, joinTable?, pathColumn? }
//                      used by attachment upload routing in the wrappers

const ATTACHMENT_FIELD = Symbol("attachment");

// Helper used by toAirtable for storage-backed attachment fields. Pulls rows
// from the photo join table and signs URLs.
async function buildAttachmentArrayFromJoin(joinTable, fkCol, pgId, bucket) {
  // Some join tables (job_lr_files, employee_aadhar_photos) have created_at,
  // others (clearance_item_photos) have sort_order. Use created_at — it
  // exists on all of them and gives a stable order.
  const rows = await dbSelect(joinTable, {
    select: "id,storage_path,filename,content_type,size_bytes",
    filter: { [fkCol]: `eq.${pgId}` },
    order: "created_at.asc",
  });
  return Promise.all(rows.map(async (r) => {
    const url = await signStorageUrl(bucket, r.storage_path).catch(() => null);
    return {
      id: r.id,
      url,
      thumbnails: { small: { url }, large: { url } },
      filename: r.filename,
      type: r.content_type,
      size: r.size_bytes,
    };
  }));
}

// Build a single-attachment array (or empty) from a `<table>.<col>` storage path.
async function buildAttachmentArrayFromColumn(bucket, path, filename, contentType, sizeBytes) {
  if (!path) return [];
  const url = await signStorageUrl(bucket, path).catch(() => null);
  return [{
    id: path,
    url,
    thumbnails: { small: { url }, large: { url } },
    filename,
    type: contentType,
    size: sizeBytes,
  }];
}

// Map one photo-join row → public-URL attachment object. Shared by the
// per-row and batched paths so they can't drift.
function mapPublicPhotoRow(r, bucket) {
  const url = publicStorageUrl(bucket, r.storage_path);
  return {
    id: r.id,
    url,
    thumbnails: { small: { url }, large: { url } },
    filename: r.filename,
    type: r.content_type,
    size: r.size_bytes,
  };
}

// Build using a PUBLIC URL (for buckets like clearance-photos that are public=true).
async function buildPublicAttachmentArrayFromJoin(joinTable, fkCol, pgId, bucket) {
  // clearance_item_photos has sort_order. Keep it for stable photo ordering.
  const rows = await dbSelect(joinTable, {
    select: "id,storage_path,filename,content_type,size_bytes,sort_order",
    filter: { [fkCol]: `eq.${pgId}` },
    order: "sort_order.asc",
  });
  return rows.map((r) => mapPublicPhotoRow(r, bucket));
}

// ---------------------------------------------------------------------------
// Batch helpers — collapse the per-row N+1 that toAirtable would otherwise fire
// when airtableList() maps a large result set. Each is scoped to the row set
// (PostgREST `in.(...)`) and chunked to keep URLs sane. Used by the shapes'
// `buildBatchContext`, which airtableList calls once per list.
// ---------------------------------------------------------------------------
function chunkIds(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// Map a set of PG ids → public ids (airtable_id || id) in one query per chunk.
async function buildPgIdToPublicIdMap(table, pgIds) {
  const ids = [...new Set(pgIds.filter(Boolean).map(String))];
  const map = new Map();
  for (const part of chunkIds(ids, 200)) {
    const rows = await dbSelect(table, {
      select: "id,airtable_id",
      filter: { id: `in.(${part.join(",")})` },
    });
    for (const r of rows) map.set(String(r.id), r.airtable_id || r.id);
  }
  return map;
}

// Group all PUBLIC-URL attachments for a set of parent ids → Map(parentId → []).
async function batchPublicAttachmentsByParent(joinTable, fkCol, parentIds, bucket) {
  const ids = [...new Set(parentIds.filter(Boolean).map(String))];
  const byParent = new Map();
  for (const part of chunkIds(ids, 200)) {
    const rows = await dbSelect(joinTable, {
      select: `id,${fkCol},storage_path,filename,content_type,size_bytes,sort_order`,
      filter: { [fkCol]: `in.(${part.join(",")})` },
      order: "sort_order.asc",
    });
    for (const r of rows) {
      const k = String(r[fkCol]);
      if (!byParent.has(k)) byParent.set(k, []);
      byParent.get(k).push(mapPublicPhotoRow(r, bucket));
    }
  }
  return byParent;
}

// Group all SIGNED-URL attachments for a set of parent ids → Map(parentId → []).
async function batchSignedAttachmentsByParent(joinTable, fkCol, parentIds, bucket) {
  const ids = [...new Set(parentIds.filter(Boolean).map(String))];
  const byParent = new Map();
  for (const part of chunkIds(ids, 200)) {
    const rows = await dbSelect(joinTable, {
      select: `id,${fkCol},storage_path,filename,content_type,size_bytes`,
      filter: { [fkCol]: `in.(${part.join(",")})` },
      order: "created_at.asc",
    });
    const mapped = await Promise.all(rows.map(async (r) => {
      const url = await signStorageUrl(bucket, r.storage_path).catch(() => null);
      return {
        k: String(r[fkCol]),
        att: { id: r.id, url, thumbnails: { small: { url }, large: { url } }, filename: r.filename, type: r.content_type, size: r.size_bytes },
      };
    }));
    for (const { k, att } of mapped) {
      if (!byParent.has(k)) byParent.set(k, []);
      byParent.get(k).push(att);
    }
  }
  return byParent;
}

export const SHAPES = {
  // ============================================================
  // Calculator base tables
  // ============================================================
  "Bag Specs": {
    pgTable: "bag_specs",
    selectColumns: "*",
    toAirtable: (row) => ({
      id: publicId(row),
      createdTime: row.created_at,
      fields: {
        Code: row.code,
        Brand: row.brand,
        Item: row.item,
        "Bag Type": row.bag_type,
        "Width mm": row.width_mm,
        "Gusset mm": row.gusset_mm,
        "Height mm": row.height_mm,
        "Paper Type": row.paper_type,
        Mill: row.mill,
        GSM: row.gsm,
        BF: row.bf,
        "Case Pack": row.case_pack,
        Printing: row.printing,
        Colours: row.colours,
        "Coverage %": row.coverage_pct,
        "Locked Wastage %": row.locked_wastage_pct,
        Notes: row.raw_fields?.Notes,
      },
    }),
    toPg: (f) => {
      const out = {};
      if ("Code" in f) out.code = str(f.Code);
      if ("Brand" in f) out.brand = str(f.Brand);
      if ("Item" in f) out.item = str(f.Item);
      if ("Bag Type" in f) out.bag_type = selectName(f["Bag Type"]);
      if ("Width mm" in f) out.width_mm = num(f["Width mm"]);
      if ("Gusset mm" in f) out.gusset_mm = num(f["Gusset mm"]);
      if ("Height mm" in f) out.height_mm = num(f["Height mm"]);
      if ("Paper Type" in f) out.paper_type = selectName(f["Paper Type"]);
      if ("Mill" in f) out.mill = selectName(f.Mill);
      if ("GSM" in f) out.gsm = num(f.GSM);
      if ("BF" in f) out.bf = num(f.BF);
      if ("Case Pack" in f) out.case_pack = int(f["Case Pack"]);
      if ("Printing" in f) out.printing = bool(f.Printing);
      if ("Colours" in f) out.colours = int(f.Colours);
      if ("Coverage %" in f) out.coverage_pct = int(f["Coverage %"]);
      if ("Locked Wastage %" in f) out.locked_wastage_pct = num(f["Locked Wastage %"]);
      return out;
    },
  },
  "Rate Cards": {
    pgTable: "rate_cards",
    selectColumns: "*",
    toAirtable: (row) => ({
      id: publicId(row),
      createdTime: row.created_at,
      fields: {
        Ref: row.ref,
        Title: row.title,
        "Client Email": row.client_email,
        "Client Name": row.client_name,
        Brand: row.brand,
        Status: row.status,
        "Payment Terms": row.payment_terms,
        "Rate Basis": row.rate_basis,
        "Lead Time": row.lead_time,
        Currency: row.currency,
        Terms: row.terms,
        Created: row.created_at,
        Updated: row.updated_at,
      },
    }),
    toPg: (f) => {
      const out = {};
      if ("Ref" in f) out.ref = str(f.Ref);
      if ("Title" in f) out.title = str(f.Title);
      if ("Client Email" in f) out.client_email = str(f["Client Email"])?.toLowerCase() ?? null;
      if ("Client Name" in f) out.client_name = str(f["Client Name"]);
      if ("Brand" in f) out.brand = str(f.Brand);
      if ("Status" in f) out.status = selectName(f.Status) || "Draft";
      if ("Payment Terms" in f) out.payment_terms = str(f["Payment Terms"]);
      if ("Rate Basis" in f) out.rate_basis = str(f["Rate Basis"]);
      if ("Lead Time" in f) out.lead_time = str(f["Lead Time"]);
      if ("Currency" in f) out.currency = str(f.Currency) || "INR";
      if ("Terms" in f) out.terms = str(f.Terms);
      return out;
    },
  },
  "Rate Card Items": {
    pgTable: "rate_card_items",
    selectColumns: "*",
    toAirtable: async (row) => ({
      id: publicId(row),
      createdTime: row.created_at,
      fields: {
        "Rate Card": row.rate_card_id ? [await publicIdFromPgId("rate_cards", row.rate_card_id)] : undefined,
        "Rate Card Ref": row.rate_card_ref,
        Section: row.section,
        "Sort Order": row.sort_order,
        "Product Id": row.product_id,
        "Product SKU": row.product_sku,
        "Product Name": row.product_name,
        Brand: row.brand,
        Printing: row.printing,
        Material: row.material,
        Dimension: row.dimension,
        "Carton Size": row.carton_size,
        "Case Pack": row.case_pack,
        MOQ: row.moq,
        "Pricing Mode": row.pricing_mode,
        "Cup Spec": row.cup_spec ? JSON.stringify(row.cup_spec) : "",
        "Tier Qtys": row.tier_qtys ? JSON.stringify(row.tier_qtys) : "[]",
        "Fixed Rates": row.fixed_rates ? JSON.stringify(row.fixed_rates) : "[]",
        Notes: row.notes,
        Group: row.group_label,
        Coating: row.coating,
      },
    }),
    toPg: async (f) => {
      const tryParse = (s) => { if (blank(s)) return null; try { return JSON.parse(s); } catch { return null; } };
      const out = {};
      if ("Rate Card" in f) out.rate_card_id = await resolvePgIdFromPublicId("rate_cards", Array.isArray(f["Rate Card"]) ? f["Rate Card"][0] : null);
      if ("Rate Card Ref" in f) out.rate_card_ref = str(f["Rate Card Ref"]);
      if ("Section" in f) out.section = str(f.Section);
      if ("Sort Order" in f) out.sort_order = int(f["Sort Order"]) ?? 0;
      if ("Product Id" in f) out.product_id = str(f["Product Id"]);
      if ("Product SKU" in f) out.product_sku = str(f["Product SKU"]);
      if ("Product Name" in f) out.product_name = str(f["Product Name"]);
      if ("Brand" in f) out.brand = str(f.Brand);
      if ("Printing" in f) out.printing = selectName(f.Printing);
      if ("Material" in f) out.material = str(f.Material);
      if ("Dimension" in f) out.dimension = str(f.Dimension);
      if ("Carton Size" in f) out.carton_size = str(f["Carton Size"]);
      if ("Case Pack" in f) out.case_pack = int(f["Case Pack"]);
      if ("MOQ" in f) out.moq = str(f.MOQ);
      if ("Pricing Mode" in f) out.pricing_mode = selectName(f["Pricing Mode"]) || "fixed";
      if ("Cup Spec" in f) out.cup_spec = tryParse(str(f["Cup Spec"]));
      if ("Tier Qtys" in f) out.tier_qtys = tryParse(str(f["Tier Qtys"]));
      if ("Fixed Rates" in f) out.fixed_rates = tryParse(str(f["Fixed Rates"]));
      if ("Notes" in f) out.notes = str(f.Notes);
      if ("Group" in f) out.group_label = str(f.Group);
      if ("Coating" in f) out.coating = selectName(f.Coating);
      return out;
    },
  },
  "OTP Codes": {
    pgTable: "otp_codes",
    selectColumns: "id,airtable_id,email,code,expires_at,used,created_at",
    toAirtable: (row) => ({
      id: publicId(row),
      createdTime: row.created_at,
      fields: {
        Email: row.email,
        Code: row.code,
        "Expires At": row.expires_at,
        Used: row.used,
        Created: row.created_at,
      },
    }),
    // Only emit columns whose Airtable-style key was actually present in the
    // input. Without these `in` guards, partial updates like { Used: true }
    // produce { code: null, expires_at: null, used: true } — which Supabase
    // rejects (400) because `code` and `expires_at` are NOT NULL columns.
    toPg: (f) => {
      const out = {};
      if ("Email" in f) out.email = str(f.Email)?.toLowerCase();
      if ("Code" in f) out.code = str(f.Code);
      if ("Expires At" in f) out.expires_at = str(f["Expires At"]);
      if ("Used" in f) out.used = bool(f.Used) ?? false;
      return out;
    },
  },

  // ============================================================
  // FactoryOS / Orders base tables
  // ============================================================
  Clients: {
    pgTable: "clients",
    selectColumns: "*",
    toAirtable: (row) => ({
      id: publicId(row),
      createdTime: row.created_at,
      fields: {
        Name: row.name,
        Code: row.code,
        "Contact Person": row.contact_person,
        "Contact Email": row.contact_email,
        "Contact Phone": row.contact_phone,
        "Brand Manager": row.brand_manager,
        "Brand Manager Email": row.brand_manager_email,
        Created: row.created_at,
      },
    }),
    toPg: (f) => {
      const out = {};
      if ("Name" in f) out.name = str(f.Name);
      if ("Code" in f) out.code = str(f.Code);
      if ("Contact Person" in f) out.contact_person = str(f["Contact Person"]);
      if ("Contact Email" in f) out.contact_email = str(f["Contact Email"])?.toLowerCase() ?? null;
      if ("Contact Phone" in f) out.contact_phone = str(f["Contact Phone"]);
      if ("Brand Manager" in f) out.brand_manager = str(f["Brand Manager"]);
      if ("Brand Manager Email" in f) out.brand_manager_email = str(f["Brand Manager Email"])?.toLowerCase() ?? null;
      return out;
    },
  },
  Users: {
    pgTable: "users",
    selectColumns: "id,airtable_id,email,name,company,country,phone,factoryos_role,calculator_role,active,designation,margin_pct,margin_cups_pct,discount_pct,preferred_currency,preferred_unit,last_login,notes,photo_path,created_at,updated_at",
    toAirtable: async (row) => {
      // Pull linked clients via user_clients junction; emit airtable_ids
      const links = await dbSelect("user_clients", {
        select: "client_id",
        filter: { user_id: `eq.${row.id}` },
      }).catch(() => []);
      const clientPubIds = await Promise.all(
        links.map((l) => publicIdFromPgId("clients", l.client_id))
      );
      // Photo (single-attachment via users.photo_path)
      const photo = await buildAttachmentArrayFromColumn("user-photos", row.photo_path);
      // Reverse-map factoryos_role snake_case → Title Case for backward compat
      const roleMap = { admin: "Admin", account_manager: "Account Manager", factory_manager: "Factory Manager", factory_executive: "Factory Executive", customer: "Customer" };
      const calcRoleMap = { admin: "Admin", client: "Client" };
      return {
        id: publicId(row),
        createdTime: row.created_at,
        fields: {
          Email: row.email,
          Name: row.name,
          Role: row.factoryos_role ? roleMap[row.factoryos_role] || row.factoryos_role : undefined,
          Client: clientPubIds.filter(Boolean),
          Active: row.active,
          Designation: row.designation,
          Phone: row.phone,
          Photo: photo,
          "Calculator Role": row.calculator_role ? calcRoleMap[row.calculator_role] || row.calculator_role : undefined,
          "Margin %": row.margin_pct,
          "Discount %": row.discount_pct,
          Country: row.country,
          Company: row.company,
          "Preferred Currency": row.preferred_currency,
          "Preferred Units": row.preferred_unit,
          "Last Login": row.last_login,
          Notes: row.notes,
          "Margin % Cups": row.margin_cups_pct,
          Created: row.created_at,
        },
      };
    },
    toPg: async (f) => {
      // Presence-aware patch: only emit columns whose source field is actually
      // present in the input. Returning a key with `null` for "field not in
      // input" caused destructive partial updates — every airtableUpdate
      // wiped name/company/country/role/margin to null when the caller only
      // intended to set Calculator Role (e.g. revokeCalcClient). Without this
      // gate the airtableShim's undefined-stripping pass treats null as
      // intentional and writes it through.
      const norm = (v) => v == null ? null : String(v).toLowerCase().trim().replace(/\s+/g, "_");
      const FOS = new Set(["admin", "account_manager", "factory_manager", "factory_executive", "customer"]);
      const CALC = new Set(["admin", "client"]);
      const out = {};
      if ("Email" in f) out.email = str(f.Email)?.toLowerCase();
      if ("Name" in f) out.name = str(f.Name);
      if ("Company" in f) out.company = str(f.Company);
      if ("Country" in f) out.country = str(f.Country);
      if ("Phone" in f) out.phone = str(f.Phone);
      if ("Role" in f) {
        const r = norm(selectName(f.Role));
        out.factoryos_role = r && FOS.has(r) ? r : null;
      }
      if ("Calculator Role" in f) {
        const c = norm(selectName(f["Calculator Role"]));
        out.calculator_role = c && CALC.has(c) ? c : null;
      }
      if ("Active" in f) out.active = bool(f.Active) ?? true;
      if ("Designation" in f) out.designation = str(f.Designation);
      if ("Margin %" in f) out.margin_pct = num(f["Margin %"]);
      if ("Margin % Cups" in f) out.margin_cups_pct = num(f["Margin % Cups"]);
      if ("Discount %" in f) out.discount_pct = num(f["Discount %"]) ?? 0;
      if ("Preferred Currency" in f) out.preferred_currency = selectName(f["Preferred Currency"]) || "INR";
      if ("Preferred Units" in f) out.preferred_unit = selectName(f["Preferred Units"]) || "mm";
      if ("Last Login" in f) out.last_login = str(f["Last Login"]);
      if ("Notes" in f) out.notes = str(f.Notes);
      return out;
    },
    // Multi-link Client field requires a junction-table rebuild after upsert.
    afterUpsert: async (pgRow, fields) => {
      if (!Array.isArray(fields.Client)) return;
      const { dbDelete, dbInsert } = await import("./supabase.js");
      await dbDelete("user_clients", "user_id", pgRow.id);
      const clientPgIds = await resolveLinks("clients", fields.Client);
      if (clientPgIds.length) {
        await dbInsert("user_clients", clientPgIds.map((cid) => ({ user_id: pgRow.id, client_id: cid })), {
          onConflict: "user_id,client_id",
          returning: "minimal",
        });
      }
    },
  },
  Jobs: {
    pgTable: "jobs",
    selectColumns: "*",
    // Collapse the 3 per-job queries (client id, manager id, LR files) into
    // 3 total for the whole list. airtableList builds this once; toAirtable
    // reads from it. listJobsForSession over hundreds of jobs goes from
    // ~3N round trips to 3.
    buildBatchContext: async (rows) => {
      const [clientIdMap, userIdMap, lrFilesByJobId] = await Promise.all([
        buildPgIdToPublicIdMap("clients", rows.map((r) => r.client_id)),
        buildPgIdToPublicIdMap("users", rows.map((r) => r.customer_manager_id)),
        batchSignedAttachmentsByParent("job_lr_files", "job_id", rows.map((r) => r.id), "lr-files"),
      ]);
      return { clientIdMap, userIdMap, lrFilesByJobId };
    },
    toAirtable: async (row, ctx) => {
      const clientPubId = row.client_id
        ? (ctx?.clientIdMap
            ? (ctx.clientIdMap.get(String(row.client_id)) || row.client_id)
            : await publicIdFromPgId("clients", row.client_id))
        : null;
      const cmPubId = row.customer_manager_id
        ? (ctx?.userIdMap
            ? (ctx.userIdMap.get(String(row.customer_manager_id)) || row.customer_manager_id)
            : await publicIdFromPgId("users", row.customer_manager_id))
        : null;
      const lrFiles = ctx?.lrFilesByJobId
        ? (ctx.lrFilesByJobId.get(String(row.id)) || [])
        : await buildAttachmentArrayFromJoin("job_lr_files", "job_id", row.id, "lr-files");
      return {
        id: publicId(row),
        createdTime: row.created_at,
        fields: {
          "J#": row.j_number,
          Client: clientPubId ? [clientPubId] : undefined,
          Brand: row.brand,
          "Master SKU": row.master_sku,
          "Master Product Name": row.master_product_name,
          "Customer Manager": cmPubId ? [cmPubId] : undefined,
          Category: row.category,
          Item: row.item,
          "Item Size": row.item_size,
          City: row.city,
          Qty: row.qty,
          "Order Date": row.order_date,
          "Expected Dispatch Date": row.expected_dispatch_date,
          "Estimated Delivery Date": row.estimated_delivery_date,
          Stage: row.stage,
          "Internal Status": row.internal_status,
          "PO Number": row.po_number,
          "RM Type": row.rm_type,
          "RM Supplier": row.rm_supplier,
          "Paper Type": row.paper_type,
          GSM: row.gsm,
          "RM Size (mm)": row.rm_size_mm,
          "RM Qty (Sheets)": row.rm_qty_sheets,
          "RM Qty (kgs)": row.rm_qty_kgs,
          "RM Delivery Date": row.rm_delivery_date,
          "Printing Type": row.printing_type,
          "Printing Vendor": row.printing_vendor,
          "Printing Vendor ID": row.printing_vendor_id,
          "Printing Due Date": row.printing_due_date,
          "Production Due Date": row.production_due_date,
          "Vendor Status": row.vendor_status,
          "Vendor Status Updated": row.vendor_status_updated_at,
          "Vendor Dispatch Date": row.vendor_dispatch_date,
          "Action Points": row.action_points,
          Notes: row.notes,
          Urgent: row.urgent,
          "Transport Mode": row.transport_mode,
          "LR / Vehicle Number": row.lr_or_vehicle_number,
          "Driver Contact": row.driver_contact,
          "LR Files": lrFiles,
          Created: row.created_at,
          "Last Updated": row.updated_at,
        },
      };
    },
    toPg: async (f) => {
      const out = {};
      if ("J#" in f) out.j_number = str(f["J#"]);
      if ("Client" in f) out.client_id = await resolvePgIdFromPublicId("clients", Array.isArray(f.Client) ? f.Client[0] : null);
      if ("Brand" in f) out.brand = str(f.Brand);
      // Master SKU drives both master_sku and master_product_id (FK lookup).
      // Only do the lookup + emit both columns when caller actually changed
      // Master SKU.
      if ("Master SKU" in f) {
        const masterSku = str(f["Master SKU"]);
        out.master_sku = masterSku;
        let masterProductId = null;
        if (masterSku) {
          const rows = await dbSelect("master_products", { select: "id", filter: { sku: `eq.${masterSku}` }, limit: 1 });
          masterProductId = rows[0]?.id ?? null;
        }
        out.master_product_id = masterProductId;
      }
      if ("Master Product Name" in f) out.master_product_name = str(f["Master Product Name"]);
      if ("Customer Manager" in f) out.customer_manager_id = await resolvePgIdFromPublicId("users", Array.isArray(f["Customer Manager"]) ? f["Customer Manager"][0] : null);
      if ("Category" in f) out.category = selectName(f.Category);
      if ("Item" in f) out.item = str(f.Item);
      if ("Item Size" in f) out.item_size = str(f["Item Size"]);
      if ("City" in f) out.city = str(f.City);
      if ("Qty" in f) out.qty = int(f.Qty);
      if ("Order Date" in f) out.order_date = dateOnly(f["Order Date"]);
      if ("Expected Dispatch Date" in f) out.expected_dispatch_date = dateOnly(f["Expected Dispatch Date"]);
      if ("Estimated Delivery Date" in f) out.estimated_delivery_date = dateOnly(f["Estimated Delivery Date"]);
      if ("Stage" in f) out.stage = selectName(f.Stage) || "RM Pending";
      if ("Internal Status" in f) out.internal_status = str(f["Internal Status"]);
      if ("PO Number" in f) out.po_number = str(f["PO Number"]);
      if ("RM Type" in f) out.rm_type = str(f["RM Type"]);
      if ("RM Supplier" in f) out.rm_supplier = str(f["RM Supplier"]);
      if ("Paper Type" in f) out.paper_type = str(f["Paper Type"]);
      if ("GSM" in f) out.gsm = num(f.GSM);
      if ("RM Size (mm)" in f) out.rm_size_mm = num(f["RM Size (mm)"]);
      if ("RM Qty (Sheets)" in f) out.rm_qty_sheets = num(f["RM Qty (Sheets)"]);
      if ("RM Qty (kgs)" in f) out.rm_qty_kgs = num(f["RM Qty (kgs)"]);
      if ("RM Delivery Date" in f) out.rm_delivery_date = dateOnly(f["RM Delivery Date"]);
      if ("Printing Type" in f) out.printing_type = selectName(f["Printing Type"]);
      if ("Printing Vendor" in f) out.printing_vendor = str(f["Printing Vendor"]);
      if ("Printing Vendor ID" in f) out.printing_vendor_id = f["Printing Vendor ID"] || null;
      if ("Printing Due Date" in f) out.printing_due_date = dateOnly(f["Printing Due Date"]);
      if ("Production Due Date" in f) out.production_due_date = dateOnly(f["Production Due Date"]);
      if ("Action Points" in f) out.action_points = str(f["Action Points"]);
      if ("Notes" in f) out.notes = str(f.Notes);
      if ("Urgent" in f) out.urgent = bool(f.Urgent) ?? false;
      if ("Transport Mode" in f) out.transport_mode = selectName(f["Transport Mode"]);
      if ("LR / Vehicle Number" in f) out.lr_or_vehicle_number = str(f["LR / Vehicle Number"]);
      if ("Driver Contact" in f) out.driver_contact = str(f["Driver Contact"]);
      return out;
    },
  },
  "Job Status Updates": {
    pgTable: "job_status_updates",
    selectColumns: "*",
    toAirtable: async (row) => ({
      id: publicId(row),
      createdTime: row.created_at,
      fields: {
        Summary: row.raw_fields?.Summary || `${row.stage || ""}`,
        Job: row.job_id ? [await publicIdFromPgId("jobs", row.job_id)] : undefined,
        Stage: row.stage,
        "Updated By Email": row.updated_by_email,
        "Updated By Name": row.updated_by_name,
        Note: row.note,
        Created: row.created_at,
      },
    }),
    toPg: async (f) => {
      const out = {};
      if ("Job" in f) out.job_id = await resolvePgIdFromPublicId("jobs", Array.isArray(f.Job) ? f.Job[0] : null);
      if ("Stage" in f) out.stage = selectName(f.Stage);
      if ("Note" in f) out.note = str(f.Note);
      if ("Updated By Email" in f) out.updated_by_email = str(f["Updated By Email"])?.toLowerCase() ?? null;
      if ("Updated By Name" in f) out.updated_by_name = str(f["Updated By Name"]);
      return out;
    },
  },
  "Customer POs": {
    pgTable: "customer_pos",
    selectColumns: "*",
    toAirtable: async (row) => {
      const file = await buildAttachmentArrayFromColumn("po-files", row.storage_path, row.filename, row.content_type, row.size_bytes);
      return {
        id: publicId(row),
        createdTime: row.created_at,
        fields: {
          "PO Number": row.po_number,
          Client: row.client_id ? [await publicIdFromPgId("clients", row.client_id)] : undefined,
          File: file,
          "Uploaded By": row.uploaded_by_email,
          Notes: row.notes,
          Created: row.created_at,
        },
      };
    },
    toPg: async (f) => {
      const out = {};
      if ("PO Number" in f) out.po_number = str(f["PO Number"]);
      if ("Client" in f) out.client_id = await resolvePgIdFromPublicId("clients", Array.isArray(f.Client) ? f.Client[0] : null);
      if ("Uploaded By" in f) out.uploaded_by_email = str(f["Uploaded By"])?.toLowerCase() ?? null;
      if ("Notes" in f) out.notes = str(f.Notes);
      return out;
    },
  },
  "RM Inventory": {
    pgTable: "raw_materials",
    selectColumns: "*",
    toAirtable: (row) => ({
      id: publicId(row),
      createdTime: row.created_at,
      fields: {
        Label: row.name,
        Name: row.name,
        Mill: row.mill,
        "Paper Type": row.paper_type,
        GSM: row.gsm,
        "Width (mm)": row.width_mm,
        "Length (mm)": row.length_mm,
        "Qty (Rolls)": row.qty_rolls,
        "Qty (kgs)": row.qty_kgs,
        Coating: row.coating,
        Location: row.location,
        Status: row.status,
        Notes: row.notes,
        BF: row.bf,
        Form: row.form,
        Supplier: row.supplier,
        "Base Rate (INR/kg)": row.base_rate_inr_kg,
        "Discount (INR/kg)": row.discount_inr_kg,
        "Transport (INR/kg)": row.transport_inr_kg,
        "Wet Strength Extra (INR/kg)": row.wet_strength_extra_inr_kg,
        Active: row.active,
        "Master RM": row.master_rm_name,
        Created: row.created_at,
        "Last Updated": row.updated_at,
      },
    }),
    toPg: async (f) => {
      const out = {};
      // Master RM drives both master_paper_id (FK lookup) and master_rm_name.
      if ("Master RM" in f) {
        const masterName = str(f["Master RM"]);
        out.master_rm_name = masterName;
        let masterPaperId = null;
        if (masterName) {
          const rows = await dbSelect("master_papers", { select: "id", filter: { material_name: `eq.${masterName}` }, limit: 1 });
          masterPaperId = rows[0]?.id ?? null;
        }
        out.master_paper_id = masterPaperId;
      }
      // Display name is sourced from Name OR Label — emit when either is touched.
      if ("Name" in f || "Label" in f) {
        out.name = str(f.Name) ?? str(f.Label);
      }
      if ("Paper Type" in f) out.paper_type = str(f["Paper Type"]);
      if ("GSM" in f) out.gsm = num(f.GSM);
      if ("BF" in f) out.bf = num(f.BF);
      if ("Width (mm)" in f) out.width_mm = num(f["Width (mm)"]);
      if ("Length (mm)" in f) out.length_mm = num(f["Length (mm)"]);
      if ("Form" in f) out.form = selectName(f.Form);
      if ("Supplier" in f) out.supplier = str(f.Supplier);
      if ("Mill" in f) out.mill = str(f.Mill);
      if ("Coating" in f) out.coating = str(f.Coating);
      if ("Location" in f) out.location = str(f.Location);
      if ("Status" in f) out.status = selectName(f.Status) || "In Stock";
      if ("Qty (Rolls)" in f) out.qty_rolls = num(f["Qty (Rolls)"]);
      if ("Qty (kgs)" in f) out.qty_kgs = num(f["Qty (kgs)"]);
      if ("Base Rate (INR/kg)" in f) out.base_rate_inr_kg = num(f["Base Rate (INR/kg)"]);
      if ("Discount (INR/kg)" in f) out.discount_inr_kg = num(f["Discount (INR/kg)"]);
      if ("Transport (INR/kg)" in f) out.transport_inr_kg = num(f["Transport (INR/kg)"]);
      if ("Wet Strength Extra (INR/kg)" in f) out.wet_strength_extra_inr_kg = num(f["Wet Strength Extra (INR/kg)"]);
      if ("Notes" in f) out.notes = str(f.Notes);
      if ("Active" in f) out.active = bool(f.Active) ?? true;
      return out;
    },
  },
  "RM Receipts": {
    pgTable: "rm_receipts",
    selectColumns: "*",
    toAirtable: async (row) => ({
      id: publicId(row),
      createdTime: row.created_at,
      fields: {
        Summary: row.raw_fields?.Summary || `${row.master_paper_name || ""} · ${row.qty_kgs || 0}kg`,
        "Invoice Number": row.invoice_number,
        "Invoice Date": row.invoice_date,
        Supplier: row.supplier,
        "Master Paper Name": row.master_paper_name,
        "Master Paper ID": row.raw_fields?.["Master Paper ID"],
        "Qty (Rolls)": row.qty_rolls,
        "Qty (kgs)": row.qty_kgs,
        "Stock Line": row.stock_line_id ? [await publicIdFromPgId("raw_materials", row.stock_line_id)] : undefined,
        Notes: row.notes,
        "Created By Email": row.created_by_email,
        Created: row.created_at,
      },
    }),
    toPg: async (f) => {
      const out = {};
      if ("Invoice Number" in f) out.invoice_number = str(f["Invoice Number"]);
      if ("Invoice Date" in f) out.invoice_date = dateOnly(f["Invoice Date"]);
      if ("Supplier" in f) out.supplier = str(f.Supplier);
      // Master Paper Name drives both master_paper_id (FK lookup) and master_paper_name.
      if ("Master Paper Name" in f) {
        const masterName = str(f["Master Paper Name"]);
        out.master_paper_name = masterName;
        let masterPaperId = null;
        if (masterName) {
          const rows = await dbSelect("master_papers", { select: "id", filter: { material_name: `eq.${masterName}` }, limit: 1 });
          masterPaperId = rows[0]?.id ?? null;
        }
        out.master_paper_id = masterPaperId;
      }
      if ("Qty (Rolls)" in f) out.qty_rolls = num(f["Qty (Rolls)"]);
      if ("Qty (kgs)" in f) out.qty_kgs = num(f["Qty (kgs)"]);
      if ("Stock Line" in f) out.stock_line_id = await resolvePgIdFromPublicId("raw_materials", Array.isArray(f["Stock Line"]) ? f["Stock Line"][0] : null);
      if ("Notes" in f) out.notes = str(f.Notes);
      if ("Created By Email" in f) out.created_by_email = str(f["Created By Email"])?.toLowerCase() ?? null;
      return out;
    },
  },
  "Coating Jobs": {
    pgTable: "coating_jobs",
    selectColumns: "*",
    toAirtable: async (row) => ({
      id: publicId(row),
      createdTime: row.created_at,
      fields: {
        "Job ID": row.job_code,
        Status: row.status,
        Coater: row.coater,
        "Coating Type": row.coating_type,
        "Source Stock Line": row.source_stock_line_id ? [await publicIdFromPgId("raw_materials", row.source_stock_line_id)] : undefined,
        "Result Stock Line": row.result_stock_line_id ? [await publicIdFromPgId("raw_materials", row.result_stock_line_id)] : undefined,
        "Qty Sent (kgs)": row.qty_sent_kgs,
        "Qty Returned (kgs)": row.qty_returned_kgs,
        "Sent Date": row.sent_date,
        "Return Date": row.return_date,
        "PE Rate (INR/kg)": row.pe_rate_inr_kg,
        "Invoice Number": row.invoice_number,
        Notes: row.notes,
        "Created By Email": row.created_by_email,
        Created: row.created_at,
      },
    }),
    toPg: async (f) => {
      const out = {};
      if ("Job ID" in f) out.job_code = str(f["Job ID"]);
      if ("Status" in f) out.status = selectName(f.Status) || "Sent";
      if ("Coater" in f) out.coater = selectName(f.Coater);
      if ("Coating Type" in f) out.coating_type = selectName(f["Coating Type"]);
      if ("Source Stock Line" in f) out.source_stock_line_id = await resolvePgIdFromPublicId("raw_materials", Array.isArray(f["Source Stock Line"]) ? f["Source Stock Line"][0] : null);
      if ("Result Stock Line" in f) out.result_stock_line_id = await resolvePgIdFromPublicId("raw_materials", Array.isArray(f["Result Stock Line"]) ? f["Result Stock Line"][0] : null);
      if ("Qty Sent (kgs)" in f) out.qty_sent_kgs = num(f["Qty Sent (kgs)"]);
      if ("Qty Returned (kgs)" in f) out.qty_returned_kgs = num(f["Qty Returned (kgs)"]);
      if ("Sent Date" in f) out.sent_date = dateOnly(f["Sent Date"]);
      if ("Return Date" in f) out.return_date = dateOnly(f["Return Date"]);
      if ("PE Rate (INR/kg)" in f) out.pe_rate_inr_kg = num(f["PE Rate (INR/kg)"]);
      if ("Invoice Number" in f) out.invoice_number = str(f["Invoice Number"]);
      if ("Notes" in f) out.notes = str(f.Notes);
      if ("Created By Email" in f) out.created_by_email = str(f["Created By Email"])?.toLowerCase() ?? null;
      return out;
    },
  },
  Machines: {
    pgTable: "machines",
    selectColumns: "*",
    toAirtable: (row) => ({
      id: publicId(row),
      createdTime: row.created_at,
      fields: {
        Name: row.name,
        Type: row.type,
        Status: row.status,
        Location: row.location,
        Notes: row.notes,
        Active: row.active,
        Created: row.created_at,
      },
    }),
    toPg: (f) => {
      const out = {};
      if ("Name" in f) out.name = str(f.Name);
      if ("Type" in f) out.type = selectName(f.Type) || "other";
      if ("Status" in f) out.status = selectName(f.Status) || "active";
      if ("Location" in f) out.location = str(f.Location);
      if ("Notes" in f) out.notes = str(f.Notes);
      if ("Active" in f) out.active = bool(f.Active) ?? true;
      return out;
    },
  },
  "Production Runs": {
    pgTable: "production_runs",
    selectColumns: "*",
    toAirtable: async (row) => ({
      id: publicId(row),
      createdTime: row.created_at,
      fields: {
        "Run ID": row.run_id,
        Machine: row.machine_id ? [await publicIdFromPgId("machines", row.machine_id)] : undefined,
        Job: row.job_id ? [await publicIdFromPgId("jobs", row.job_id)] : undefined,
        // J# string preserved across job deletion. Reads from the snapshot
        // first; if the row predates the snapshot column (legacy), falls
        // back to a live join via job_id at read time isn't worth the cost
        // — null is the honest signal.
        "J# Snapshot": row.j_number_snapshot,
        Status: row.status,
        "Start Time": row.start_time,
        "End Time": row.end_time,
        "Output (pcs)": row.output_pcs,
        "Waste (pcs)": row.waste_pcs,
        "Operator Email": row.operator_email,
        "Operator Name": row.operator_name,
        Notes: row.notes,
        Created: row.created_at,
      },
    }),
    toPg: async (f) => {
      const out = {};
      if ("Run ID" in f) out.run_id = str(f["Run ID"]);
      if ("Machine" in f) out.machine_id = await resolvePgIdFromPublicId("machines", Array.isArray(f.Machine) ? f.Machine[0] : null);
      // Audit L3: snapshot jobs.j_number into j_number_snapshot whenever
      // job_id is being written. The FK is ON DELETE SET NULL (financial
      // history must survive even when the source job goes), and without
      // this snapshot a later "which job was this for?" lookup hits a
      // dead UUID. Same pattern PR4a used for inventory_movements.reference.
      if ("Job" in f) {
        out.job_id = await resolvePgIdFromPublicId("jobs", Array.isArray(f.Job) ? f.Job[0] : null);
        if (out.job_id) {
          const rows = await dbSelect("jobs", {
            select: "j_number",
            filter: { id: `eq.${out.job_id}` },
            limit: 1,
          });
          out.j_number_snapshot = rows[0]?.j_number || null;
        } else {
          // Caller cleared the job link explicitly. Wipe the snapshot too.
          out.j_number_snapshot = null;
        }
      }
      if ("Status" in f) out.status = selectName(f.Status) || "planned";
      if ("Start Time" in f) out.start_time = str(f["Start Time"]);
      if ("End Time" in f) out.end_time = str(f["End Time"]);
      if ("Output (pcs)" in f) out.output_pcs = int(f["Output (pcs)"]);
      if ("Waste (pcs)" in f) out.waste_pcs = int(f["Waste (pcs)"]);
      if ("Operator Email" in f) out.operator_email = str(f["Operator Email"])?.toLowerCase() ?? null;
      if ("Operator Name" in f) out.operator_name = str(f["Operator Name"]);
      if ("Notes" in f) out.notes = str(f.Notes);
      return out;
    },
  },
  "RM Consumption": {
    pgTable: "rm_consumption",
    selectColumns: "*",
    toAirtable: async (row) => ({
      id: publicId(row),
      createdTime: row.created_at,
      fields: {
        Summary: row.raw_fields?.Summary,
        Run: row.run_id ? [await publicIdFromPgId("production_runs", row.run_id)] : undefined,
        "Stock Line": row.stock_line_id ? [await publicIdFromPgId("raw_materials", row.stock_line_id)] : undefined,
        "Qty (kgs)": row.qty_kgs,
        "Operator Email": row.operator_email,
        Notes: row.notes,
        Created: row.created_at,
      },
    }),
    toPg: async (f) => {
      const out = {};
      if ("Run" in f) out.run_id = await resolvePgIdFromPublicId("production_runs", Array.isArray(f.Run) ? f.Run[0] : null);
      if ("Stock Line" in f) out.stock_line_id = await resolvePgIdFromPublicId("raw_materials", Array.isArray(f["Stock Line"]) ? f["Stock Line"][0] : null);
      if ("Qty (kgs)" in f) out.qty_kgs = num(f["Qty (kgs)"]);
      if ("Operator Email" in f) out.operator_email = str(f["Operator Email"])?.toLowerCase() ?? null;
      if ("Notes" in f) out.notes = str(f.Notes);
      return out;
    },
  },
  Vendors: {
    pgTable: "vendors",
    selectColumns: "*",
    toAirtable: (row) => ({
      id: publicId(row),
      createdTime: row.created_at,
      fields: {
        Name: row.name,
        Type: row.type,
        "Contact Person": row.contact_person,
        Phone: row.phone,
        Email: row.email,
        Active: row.active,
        Notes: row.notes,
        Created: row.created_at,
      },
    }),
    toPg: (f) => {
      const out = {};
      if ("Name" in f) out.name = str(f.Name);
      if ("Type" in f) out.type = selectName(f.Type);
      if ("Contact Person" in f) out.contact_person = str(f["Contact Person"]);
      if ("Phone" in f) out.phone = str(f.Phone);
      if ("Email" in f) out.email = str(f.Email)?.toLowerCase() ?? null;
      if ("Active" in f) out.active = bool(f.Active) ?? true;
      if ("Notes" in f) out.notes = str(f.Notes);
      return out;
    },
  },
  Employees: {
    pgTable: "employees",
    selectColumns: "*",
    toAirtable: async (row) => {
      const aadhar = await buildAttachmentArrayFromJoin("employee_aadhar_photos", "employee_id", row.id, "aadhar-photos");
      return {
        id: publicId(row),
        createdTime: row.created_at,
        fields: {
          Name: row.name,
          Aadhar: row.aadhar,
          Phone: row.phone,
          "Employee Code": row.employee_code,
          "Work Mode": row.work_mode,
          "Weekly Off Days": row.weekly_off_days,
          Designation: row.designation,
          "Monthly Salary": row.monthly_salary,
          "Joining Date": row.joining_date,
          Manager: row.manager_id ? [await publicIdFromPgId("users", row.manager_id)] : undefined,
          "OT Eligible": row.ot_eligible,
          Notes: row.notes,
          Active: row.active,
          // Derived boolean only — the punch-clock PIN hash itself never
          // leaves the server. toPg below has no "Pin Set" branch, so this
          // is read-only and round-trips harmlessly.
          "Pin Set": !!row.pin_hash,
          "Aadhar Photo": aadhar,
          Created: row.created_at,
        },
      };
    },
    toPg: async (f) => {
      const out = {};
      if ("Name" in f) out.name = str(f.Name);
      if ("Aadhar" in f) out.aadhar = str(f.Aadhar);
      if ("Phone" in f) out.phone = str(f.Phone);
      // Empty string -> null so the partial unique index (where not null) and
      // case-insensitive lookups don't trip over blanks.
      if ("Employee Code" in f) out.employee_code = str(f["Employee Code"])?.trim() || null;
      if ("Work Mode" in f) out.work_mode = f["Work Mode"] === "WFH" ? "WFH" : "WFO";
      if ("Weekly Off Days" in f) {
        const v = f["Weekly Off Days"];
        // Accept an array of DOW ints (0..6); sanitise + de-dup. Empty stays empty.
        out.weekly_off_days = Array.isArray(v)
          ? [...new Set(v.map(Number).filter((n) => n >= 0 && n <= 6))]
          : [];
      }
      if ("Designation" in f) out.designation = str(f.Designation);
      if ("Monthly Salary" in f) out.monthly_salary = num(f["Monthly Salary"]) ?? 0;
      if ("Joining Date" in f) out.joining_date = dateOnly(f["Joining Date"]);
      if ("Manager" in f) out.manager_id = await resolvePgIdFromPublicId("users", Array.isArray(f.Manager) ? f.Manager[0] : null);
      if ("OT Eligible" in f) out.ot_eligible = bool(f["OT Eligible"]) ?? false;
      if ("Notes" in f) out.notes = str(f.Notes);
      if ("Active" in f) out.active = bool(f.Active) ?? true;
      return out;
    },
  },
  Attendance: {
    pgTable: "attendance",
    selectColumns: "*",
    toAirtable: async (row) => ({
      id: publicId(row),
      createdTime: row.created_at,
      fields: {
        Key: row.raw_fields?.Key,
        Employee: row.employee_id ? [await publicIdFromPgId("employees", row.employee_id)] : undefined,
        Date: row.date,
        Status: row.status,
        "In Time": row.in_time,
        "Out Time": row.out_time,
        "In Lat": row.in_lat,
        "In Lng": row.in_lng,
        "In Accuracy": row.in_accuracy_m,
        "Out Lat": row.out_lat,
        "Out Lng": row.out_lng,
        "Out Accuracy": row.out_accuracy_m,
        "OT Hours": row.ot_hours,
        "Marked By": row.marked_by_user_id ? [await publicIdFromPgId("users", row.marked_by_user_id)] : undefined,
        "Marked By Email": row.marked_by_email,
        "Marked By Name": row.marked_by_name,
        Notes: row.notes,
        Created: row.created_at,
        "Last Updated": row.updated_at,
      },
    }),
    toPg: async (f) => {
      const out = {};
      if ("Employee" in f) out.employee_id = await resolvePgIdFromPublicId("employees", Array.isArray(f.Employee) ? f.Employee[0] : null);
      if ("Date" in f) out.date = dateOnly(f.Date);
      if ("Status" in f) out.status = selectName(f.Status) || "P";
      if ("In Time" in f) out.in_time = str(f["In Time"]);
      if ("Out Time" in f) out.out_time = str(f["Out Time"]);
      if ("In Lat" in f) out.in_lat = num(f["In Lat"]);
      if ("In Lng" in f) out.in_lng = num(f["In Lng"]);
      if ("In Accuracy" in f) out.in_accuracy_m = num(f["In Accuracy"]);
      if ("Out Lat" in f) out.out_lat = num(f["Out Lat"]);
      if ("Out Lng" in f) out.out_lng = num(f["Out Lng"]);
      if ("Out Accuracy" in f) out.out_accuracy_m = num(f["Out Accuracy"]);
      if ("OT Hours" in f) out.ot_hours = num(f["OT Hours"]) ?? 0;
      if ("Marked By" in f) out.marked_by_user_id = await resolvePgIdFromPublicId("users", Array.isArray(f["Marked By"]) ? f["Marked By"][0] : null);
      if ("Marked By Email" in f) out.marked_by_email = str(f["Marked By Email"])?.toLowerCase() ?? null;
      if ("Marked By Name" in f) out.marked_by_name = str(f["Marked By Name"]);
      if ("Notes" in f) out.notes = str(f.Notes);
      return out;
    },
  },

  // ============================================================
  // Catalog (Aeros Products Master) base
  // ============================================================
  Products: {
    pgTable: "master_products",
    selectColumns: "*",
    // Collapse the per-product photo query: airtableList builds this once and
    // passes it to every toAirtable, so a full catalog read is 1 photo query
    // instead of one per product (~600 → 1).
    buildBatchContext: async (rows) => ({
      photosByProductId: await batchPublicAttachmentsByParent(
        "master_product_photos", "product_id", rows.map((r) => r.id), "catalog-photos",
      ),
    }),
    toAirtable: async (row, ctx) => {
      const photos = ctx?.photosByProductId
        ? (ctx.photosByProductId.get(String(row.id)) || [])
        : await buildPublicAttachmentArrayFromJoin(
            "master_product_photos",
            "product_id",
            row.id,
            "catalog-photos",
          );
      return {
        id: publicId(row),
        createdTime: row.created_at,
        fields: {
        "Product Name": row.product_name,
        SKU: row.sku,
        Category: row.category,
        "Sub-Category / Style": row.sub_category,
        "Size / Volume": row.size_volume,
        "Colour / Print": row.colour,
        "Units per Case": row.units_per_case,
        "Cases per Pallet": row.cases_per_pallet,
        "MOQ (units)": row.moq_units,
        // Legacy price columns dropped 2026-05-29 — sell rates now live
        // in master_product_pricing. Kept here as nulls to avoid touching
        // every caller that still destructures these keys.
        "Price per Unit": null,
        "Price per Case": null,
        "Supplier / Manufacturer": row.supplier,
        "Lead Time": row.lead_time,
        "Stock Status": row.stock_status,
        Notes: row.notes,
        // Legacy field name retained for any caller still reading `Image`;
        // new code should use `Photos`, which is the join-attachment field
        // configured in ATTACHMENT_ROUTES (catalog-photos bucket).
        Image: photos,
        Photos: photos,
        GSM: row.gsm,
        BF: row.bf,
        "Paper Finish": row.paper_finish,
        "Item Weight (g)": row.item_weight_g,
        "Carton Dimensions (mm)": row.carton_dimensions,
        "Net Weight (kg)": row.net_weight_kg,
        "Gross Weight (kg)": row.gross_weight_kg,
        Material: row.material,
        Coating: row.coating,
        "Wall Type": row.wall_type,
        "Inner Wall Material": row.inner_wall_material,
        "Inner Wall GSM": row.inner_wall_gsm,
        "Inner Wall BF": row.inner_wall_bf,
        "Inner Wall Finish": row.inner_wall_finish,
        "Inner Wall Coating": row.inner_wall_coating,
        // Newer wall-specific GSM/coating split (cleaner naming than the
        // legacy inner_wall_*). Inner == sidewall (drink-contact) for DW.
        // Sidewall is the only wall for SW; outer is the decorative wrap.
        "Sidewall GSM": row.sidewall_gsm,
        "Sidewall Coating": row.sidewall_coating,
        "Outer Wall GSM": row.outer_wall_gsm,
        "Outer Wall Coating": row.outer_wall_coating,
        "Bottom GSM": row.bottom_gsm,
        "Bottom Coating": row.bottom_coating,
        "Top Diameter (mm)": row.top_diameter_mm,
        "Bottom Diameter (mm)": row.bottom_diameter_mm,
        "Height (mm)": row.height_mm,
        "Inner Case Pack": row.inner_case_pack,
        "Lid Type": row.lid_type,
        "Length (mm)": row.length_mm,
        "Width (mm)": row.width_mm,
        "Individually Wrapped": row.individually_wrapped,
        "Straw Cut": row.straw_cut,
        "Print MOQ (units)": row.print_moq_units,
        },
      };
    },
    toPg: (f) => {
      const out = {};
      if ("Product Name" in f) out.product_name = str(f["Product Name"]);
      if ("SKU" in f) out.sku = str(f.SKU);
      if ("Category" in f) out.category = selectName(f.Category);
      if ("Sub-Category / Style" in f) out.sub_category = str(f["Sub-Category / Style"]);
      if ("Size / Volume" in f) out.size_volume = str(f["Size / Volume"]);
      if ("Colour / Print" in f) out.colour = str(f["Colour / Print"]);
      if ("Material" in f) out.material = selectName(f.Material);
      if ("GSM" in f) out.gsm = num(f.GSM);
      if ("BF" in f) out.bf = num(f.BF);
      if ("Paper Finish" in f) out.paper_finish = str(f["Paper Finish"]);
      if ("Wall Type" in f) out.wall_type = selectName(f["Wall Type"]);
      if ("Coating" in f) out.coating = selectName(f.Coating);
      if ("Units per Case" in f) out.units_per_case = int(f["Units per Case"]);
      if ("Cases per Pallet" in f) out.cases_per_pallet = int(f["Cases per Pallet"]);
      if ("MOQ (units)" in f) out.moq_units = int(f["MOQ (units)"]);
      // Legacy price columns dropped 2026-05-29 — silently ignore any
      // stale Price per Unit / Price per Case in incoming shim payloads.
      if ("Supplier / Manufacturer" in f) out.supplier = str(f["Supplier / Manufacturer"]);
      if ("Lead Time" in f) out.lead_time = str(f["Lead Time"]);
      if ("Stock Status" in f) out.stock_status = selectName(f["Stock Status"]);
      if ("Notes" in f) out.notes = str(f.Notes);
      if ("Item Weight (g)" in f) out.item_weight_g = num(f["Item Weight (g)"]);
      if ("Carton Dimensions (mm)" in f) out.carton_dimensions = str(f["Carton Dimensions (mm)"]);
      if ("Net Weight (kg)" in f) out.net_weight_kg = num(f["Net Weight (kg)"]);
      if ("Gross Weight (kg)" in f) out.gross_weight_kg = num(f["Gross Weight (kg)"]);
      if ("Inner Wall Material" in f) out.inner_wall_material = selectName(f["Inner Wall Material"]);
      if ("Inner Wall GSM" in f) out.inner_wall_gsm = num(f["Inner Wall GSM"]);
      if ("Inner Wall BF" in f) out.inner_wall_bf = num(f["Inner Wall BF"]);
      if ("Inner Wall Finish" in f) out.inner_wall_finish = str(f["Inner Wall Finish"]);
      if ("Inner Wall Coating" in f) out.inner_wall_coating = selectName(f["Inner Wall Coating"]);
      if ("Top Diameter (mm)" in f) out.top_diameter_mm = num(f["Top Diameter (mm)"]);
      if ("Bottom Diameter (mm)" in f) out.bottom_diameter_mm = num(f["Bottom Diameter (mm)"]);
      if ("Height (mm)" in f) out.height_mm = num(f["Height (mm)"]);
      if ("Inner Case Pack" in f) out.inner_case_pack = int(f["Inner Case Pack"]);
      if ("Lid Type" in f) out.lid_type = selectName(f["Lid Type"]);
      if ("Length (mm)" in f) out.length_mm = num(f["Length (mm)"]);
      if ("Width (mm)" in f) out.width_mm = num(f["Width (mm)"]);
      if ("Individually Wrapped" in f) out.individually_wrapped = bool(f["Individually Wrapped"]);
      if ("Straw Cut" in f) out.straw_cut = bool(f["Straw Cut"]);
      if ("Print MOQ (units)" in f) out.print_moq_units = int(f["Print MOQ (units)"]);
      return out;
    },
  },

  // ============================================================
  // Paper RM master catalogue base
  // ============================================================
  "Raw Materials": {
    pgTable: "master_papers",
    selectColumns: "*",
    toAirtable: (row) => ({
      id: publicId(row),
      createdTime: row.created_at,
      fields: {
        "Material Name": row.material_name,
        Type: row.type,
        GSM: row.gsm,
        BF: row.bf,
        Supplier: row.supplier,
        Form: row.form,
        "Mill Coating": row.mill_coating,
        "Base Rate (INR/kg)": row.base_rate_inr_kg,
        "Discount (INR/kg)": row.discount_inr_kg,
        "Effective Rate (INR/kg)": row.effective_rate_inr_kg,
        Specifications: row.specifications,
      },
    }),
    toPg: (f) => {
      const out = {};
      if ("Material Name" in f) out.material_name = str(f["Material Name"]);
      if ("Type" in f) out.type = str(f.Type);
      if ("GSM" in f) out.gsm = num(f.GSM);
      if ("BF" in f) out.bf = num(f.BF);
      if ("Supplier" in f) out.supplier = str(f.Supplier);
      if ("Form" in f) out.form = selectName(f.Form);
      if ("Mill Coating" in f) out.mill_coating = selectName(f["Mill Coating"]);
      if ("Base Rate (INR/kg)" in f) out.base_rate_inr_kg = num(f["Base Rate (INR/kg)"]);
      if ("Discount (INR/kg)" in f) out.discount_inr_kg = num(f["Discount (INR/kg)"]);
      if ("Specifications" in f) out.specifications = str(f.Specifications);
      return out;
    },
  },

  // ============================================================
  // Clearance base
  // ============================================================
  "Plain Items": {
    pgTable: "clearance_items",
    selectColumns: "*",
    toAirtable: async (row) => {
      const photos = await buildPublicAttachmentArrayFromJoin("clearance_item_photos", "item_id", row.id, "clearance-photos");
      return {
        id: publicId(row),
        createdTime: row.created_at,
        fields: {
          "Item Name": row.item_name,
          SKU: row.sku,
          Brand: row.brand,
          Category: row.category,
          "Stock Quantity": row.stock_quantity,
          Unit: row.unit,
          "Case Pack": row.case_pack,
          Price: row.price,
          "Show Price": row.show_price,
          Description: row.description,
          Specifications: row.specifications,
          Status: row.status,
          Location: row.location,
          Notes: row.notes,
          Photos: photos,
          Material: row.material,
          "Carton Dimensions (mm)": row.carton_dimensions,
          "Whatsapp Inquiry": row.whatsapp_inquiry,
          // RM dead-stock fields. NULL on finished-goods rows.
          GSM: row.gsm,
          "RM Form": row.rm_form,
          "RM Type": row.rm_type,
          // Price denomination override. NULL means "price is per `unit`".
          "Price Unit": row.price_unit,
          // Hidden from public /clearance when true (branded dead stock).
          "Is Internal": row.is_internal === true,
        },
      };
    },
    toPg: (f) => {
      const out = {};
      if ("Item Name" in f) out.item_name = str(f["Item Name"]);
      if ("SKU" in f) out.sku = str(f.SKU);
      if ("Brand" in f) out.brand = str(f.Brand);
      if ("Category" in f) out.category = str(f.Category);
      if ("Stock Quantity" in f) out.stock_quantity = num(f["Stock Quantity"]);
      if ("Unit" in f) out.unit = str(f.Unit) || "pcs";
      if ("Case Pack" in f) out.case_pack = int(f["Case Pack"]);
      if ("Price" in f) out.price = num(f.Price);
      if ("Show Price" in f) out.show_price = bool(f["Show Price"]) ?? false;
      if ("Description" in f) out.description = str(f.Description);
      if ("Specifications" in f) out.specifications = str(f.Specifications);
      if ("Status" in f) out.status = selectName(f.Status) || "Available";
      if ("Location" in f) out.location = str(f.Location);
      if ("Notes" in f) out.notes = str(f.Notes);
      if ("Material" in f) out.material = selectName(f.Material);
      if ("Carton Dimensions (mm)" in f) out.carton_dimensions = str(f["Carton Dimensions (mm)"]);
      if ("Whatsapp Inquiry" in f) out.whatsapp_inquiry = str(f["Whatsapp Inquiry"]);
      // RM dead-stock fields.
      if ("GSM" in f) out.gsm = int(f.GSM);
      if ("RM Form" in f) out.rm_form = selectName(f["RM Form"]);
      if ("RM Type" in f) out.rm_type = selectName(f["RM Type"]);
      if ("Price Unit" in f) out.price_unit = str(f["Price Unit"]);
      if ("Is Internal" in f) out.is_internal = bool(f["Is Internal"]) ?? false;
      return out;
    },
  },
};

// ---------- Storage routing for attachment uploads ----------
// Maps (Airtable table, attachment field) to a Storage destination plus the
// PG side-effect (column patch on the same table, OR insert into a join table).
//
// Used by the wrappers' airtableUploadAttachment shim to route uploads to the
// right bucket and update the right PG row(s).
export const ATTACHMENT_ROUTES = {
  "Customer POs": {
    File: { kind: "column", bucket: "po-files", pgTable: "customer_pos", columns: { storage_path: "path", filename: "filename", content_type: "contentType", size_bytes: "size" } },
  },
  Users: {
    Photo: { kind: "column", bucket: "user-photos", pgTable: "users", columns: { photo_path: "path" } },
  },
  Employees: {
    "Aadhar Photo": { kind: "join", bucket: "aadhar-photos", joinTable: "employee_aadhar_photos", fkCol: "employee_id" },
  },
  Jobs: {
    "LR Files": { kind: "join", bucket: "lr-files", joinTable: "job_lr_files", fkCol: "job_id" },
  },
  "Plain Items": {
    Photos: { kind: "join", bucket: "clearance-photos", joinTable: "clearance_item_photos", fkCol: "item_id" },
  },
  Products: {
    Photos: { kind: "join", bucket: "catalog-photos", joinTable: "master_product_photos", fkCol: "product_id" },
  },
};

export { resolvePgIdFromPublicId, publicIdFromPgId, resolveLinks };

// ─── Regression guard: toPg invariant ────────────────────────────────────────
// Every shape's toPg MUST be presence-aware: calling it with {} must return {}.
// Otherwise partial airtableUpdate() calls become destructive full-row
// replacements (the bug that wiped Talico's row 3 times in 2 days).
//
// We run the check at module load in non-production environments. A misbehaving
// shape throws here loudly during dev / preview build, long before it reaches
// a real Vercel deploy. Async toPgs return a thenable — we only validate
// synchronous returns at module load; async ones get checked lazily the first
// time they run with an empty input (rare in practice).
if (process.env.NODE_ENV !== "production") {
  for (const [name, cfg] of Object.entries(SHAPES)) {
    if (typeof cfg?.toPg !== "function") continue;
    let result;
    try { result = cfg.toPg({}); } catch { continue; } // toPg may legitimately throw on malformed input
    if (result && typeof result.then === "function") continue; // skip async
    const keys = result && typeof result === "object" ? Object.keys(result) : [];
    if (keys.length > 0) {
      throw new Error(
        `[shapes.js] ${name}.toPg({}) emitted keys [${keys.join(", ")}] — toPg must be presence-aware ` +
        `(only emit a column when its source field is "in" the input). Otherwise partial airtableUpdate ` +
        `becomes a destructive full-row replacement. See commit 2c1bca7 for the pattern.`
      );
    }
  }
}
