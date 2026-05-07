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

// Build using a PUBLIC URL (for buckets like clearance-photos that are public=true).
async function buildPublicAttachmentArrayFromJoin(joinTable, fkCol, pgId, bucket) {
  // clearance_item_photos has sort_order. Keep it for stable photo ordering.
  const rows = await dbSelect(joinTable, {
    select: "id,storage_path,filename,content_type,size_bytes,sort_order",
    filter: { [fkCol]: `eq.${pgId}` },
    order: "sort_order.asc",
  });
  return rows.map((r) => {
    const url = publicStorageUrl(bucket, r.storage_path);
    return {
      id: r.id,
      url,
      thumbnails: { small: { url }, large: { url } },
      filename: r.filename,
      type: r.content_type,
      size: r.size_bytes,
    };
  });
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
    toPg: (f) => ({
      code: str(f.Code),
      brand: str(f.Brand),
      item: str(f.Item),
      bag_type: selectName(f["Bag Type"]),
      width_mm: num(f["Width mm"]),
      gusset_mm: num(f["Gusset mm"]),
      height_mm: num(f["Height mm"]),
      paper_type: selectName(f["Paper Type"]),
      mill: selectName(f.Mill),
      gsm: num(f.GSM),
      bf: num(f.BF),
      case_pack: int(f["Case Pack"]),
      printing: bool(f.Printing),
      colours: int(f.Colours),
      coverage_pct: int(f["Coverage %"]),
      locked_wastage_pct: num(f["Locked Wastage %"]),
    }),
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
    toPg: (f) => ({
      ref: str(f.Ref),
      title: str(f.Title),
      client_email: str(f["Client Email"])?.toLowerCase() ?? null,
      client_name: str(f["Client Name"]),
      brand: str(f.Brand),
      status: selectName(f.Status) || "Draft",
      payment_terms: str(f["Payment Terms"]),
      rate_basis: str(f["Rate Basis"]),
      lead_time: str(f["Lead Time"]),
      currency: str(f.Currency) || "INR",
      terms: str(f.Terms),
    }),
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
      return {
        rate_card_id: await resolvePgIdFromPublicId("rate_cards", Array.isArray(f["Rate Card"]) ? f["Rate Card"][0] : null),
        rate_card_ref: str(f["Rate Card Ref"]),
        section: str(f.Section),
        sort_order: int(f["Sort Order"]) ?? 0,
        product_id: str(f["Product Id"]),
        product_sku: str(f["Product SKU"]),
        product_name: str(f["Product Name"]),
        brand: str(f.Brand),
        printing: selectName(f.Printing),
        material: str(f.Material),
        dimension: str(f.Dimension),
        carton_size: str(f["Carton Size"]),
        case_pack: int(f["Case Pack"]),
        moq: str(f.MOQ),
        pricing_mode: selectName(f["Pricing Mode"]) || "fixed",
        cup_spec: tryParse(str(f["Cup Spec"])),
        tier_qtys: tryParse(str(f["Tier Qtys"])),
        fixed_rates: tryParse(str(f["Fixed Rates"])),
        notes: str(f.Notes),
        group_label: str(f.Group),
        coating: selectName(f.Coating),
      };
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
    toPg: (f) => ({
      name: str(f.Name),
      code: str(f.Code),
      contact_person: str(f["Contact Person"]),
      contact_email: str(f["Contact Email"])?.toLowerCase() ?? null,
      contact_phone: str(f["Contact Phone"]),
      brand_manager: str(f["Brand Manager"]),
      brand_manager_email: str(f["Brand Manager Email"])?.toLowerCase() ?? null,
    }),
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
    toAirtable: async (row) => {
      const clientPubId = row.client_id ? await publicIdFromPgId("clients", row.client_id) : null;
      const cmPubId = row.customer_manager_id ? await publicIdFromPgId("users", row.customer_manager_id) : null;
      const lrFiles = await buildAttachmentArrayFromJoin("job_lr_files", "job_id", row.id, "lr-files");
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
          "Printing Due Date": row.printing_due_date,
          "Production Due Date": row.production_due_date,
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
      const masterSku = str(f["Master SKU"]);
      let masterProductId = null;
      if (masterSku) {
        const rows = await dbSelect("master_products", { select: "id", filter: { sku: `eq.${masterSku}` }, limit: 1 });
        masterProductId = rows[0]?.id ?? null;
      }
      return {
        j_number: str(f["J#"]),
        client_id: await resolvePgIdFromPublicId("clients", Array.isArray(f.Client) ? f.Client[0] : null),
        brand: str(f.Brand),
        master_sku: masterSku,
        master_product_id: masterProductId,
        master_product_name: str(f["Master Product Name"]),
        customer_manager_id: await resolvePgIdFromPublicId("users", Array.isArray(f["Customer Manager"]) ? f["Customer Manager"][0] : null),
        category: selectName(f.Category),
        item: str(f.Item),
        item_size: str(f["Item Size"]),
        city: str(f.City),
        qty: int(f.Qty),
        order_date: dateOnly(f["Order Date"]),
        expected_dispatch_date: dateOnly(f["Expected Dispatch Date"]),
        estimated_delivery_date: dateOnly(f["Estimated Delivery Date"]),
        stage: selectName(f.Stage) || "RM Pending",
        internal_status: str(f["Internal Status"]),
        po_number: str(f["PO Number"]),
        rm_type: str(f["RM Type"]),
        rm_supplier: str(f["RM Supplier"]),
        paper_type: str(f["Paper Type"]),
        gsm: num(f.GSM),
        rm_size_mm: num(f["RM Size (mm)"]),
        rm_qty_sheets: num(f["RM Qty (Sheets)"]),
        rm_qty_kgs: num(f["RM Qty (kgs)"]),
        rm_delivery_date: dateOnly(f["RM Delivery Date"]),
        printing_type: selectName(f["Printing Type"]),
        printing_vendor: str(f["Printing Vendor"]),
        printing_due_date: dateOnly(f["Printing Due Date"]),
        production_due_date: dateOnly(f["Production Due Date"]),
        action_points: str(f["Action Points"]),
        notes: str(f.Notes),
        urgent: bool(f.Urgent) ?? false,
        transport_mode: selectName(f["Transport Mode"]),
        lr_or_vehicle_number: str(f["LR / Vehicle Number"]),
        driver_contact: str(f["Driver Contact"]),
      };
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
    toPg: async (f) => ({
      job_id: await resolvePgIdFromPublicId("jobs", Array.isArray(f.Job) ? f.Job[0] : null),
      stage: selectName(f.Stage),
      note: str(f.Note),
      updated_by_email: str(f["Updated By Email"])?.toLowerCase() ?? null,
      updated_by_name: str(f["Updated By Name"]),
    }),
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
    toPg: async (f) => ({
      po_number: str(f["PO Number"]),
      client_id: await resolvePgIdFromPublicId("clients", Array.isArray(f.Client) ? f.Client[0] : null),
      uploaded_by_email: str(f["Uploaded By"])?.toLowerCase() ?? null,
      notes: str(f.Notes),
    }),
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
      const masterName = str(f["Master RM"]);
      let masterPaperId = null;
      if (masterName) {
        const rows = await dbSelect("master_papers", { select: "id", filter: { material_name: `eq.${masterName}` }, limit: 1 });
        masterPaperId = rows[0]?.id ?? null;
      }
      return {
        master_paper_id: masterPaperId,
        master_rm_name: masterName,
        name: str(f.Name) ?? str(f.Label),
        paper_type: str(f["Paper Type"]),
        gsm: num(f.GSM),
        bf: num(f.BF),
        width_mm: num(f["Width (mm)"]),
        length_mm: num(f["Length (mm)"]),
        form: selectName(f.Form),
        supplier: str(f.Supplier),
        mill: str(f.Mill),
        coating: str(f.Coating),
        location: str(f.Location),
        status: selectName(f.Status) || "In Stock",
        qty_rolls: num(f["Qty (Rolls)"]),
        qty_kgs: num(f["Qty (kgs)"]),
        base_rate_inr_kg: num(f["Base Rate (INR/kg)"]),
        discount_inr_kg: num(f["Discount (INR/kg)"]),
        transport_inr_kg: num(f["Transport (INR/kg)"]),
        wet_strength_extra_inr_kg: num(f["Wet Strength Extra (INR/kg)"]),
        notes: str(f.Notes),
        active: bool(f.Active) ?? true,
      };
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
      const masterName = str(f["Master Paper Name"]);
      let masterPaperId = null;
      if (masterName) {
        const rows = await dbSelect("master_papers", { select: "id", filter: { material_name: `eq.${masterName}` }, limit: 1 });
        masterPaperId = rows[0]?.id ?? null;
      }
      return {
        invoice_number: str(f["Invoice Number"]),
        invoice_date: dateOnly(f["Invoice Date"]),
        supplier: str(f.Supplier),
        master_paper_id: masterPaperId,
        master_paper_name: masterName,
        qty_rolls: num(f["Qty (Rolls)"]),
        qty_kgs: num(f["Qty (kgs)"]),
        stock_line_id: await resolvePgIdFromPublicId("raw_materials", Array.isArray(f["Stock Line"]) ? f["Stock Line"][0] : null),
        notes: str(f.Notes),
        created_by_email: str(f["Created By Email"])?.toLowerCase() ?? null,
      };
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
    toPg: async (f) => ({
      job_code: str(f["Job ID"]),
      status: selectName(f.Status) || "Sent",
      coater: selectName(f.Coater),
      coating_type: selectName(f["Coating Type"]),
      source_stock_line_id: await resolvePgIdFromPublicId("raw_materials", Array.isArray(f["Source Stock Line"]) ? f["Source Stock Line"][0] : null),
      result_stock_line_id: await resolvePgIdFromPublicId("raw_materials", Array.isArray(f["Result Stock Line"]) ? f["Result Stock Line"][0] : null),
      qty_sent_kgs: num(f["Qty Sent (kgs)"]),
      qty_returned_kgs: num(f["Qty Returned (kgs)"]),
      sent_date: dateOnly(f["Sent Date"]),
      return_date: dateOnly(f["Return Date"]),
      pe_rate_inr_kg: num(f["PE Rate (INR/kg)"]),
      invoice_number: str(f["Invoice Number"]),
      notes: str(f.Notes),
      created_by_email: str(f["Created By Email"])?.toLowerCase() ?? null,
    }),
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
    toPg: (f) => ({
      name: str(f.Name),
      type: selectName(f.Type) || "other",
      status: selectName(f.Status) || "active",
      location: str(f.Location),
      notes: str(f.Notes),
      active: bool(f.Active) ?? true,
    }),
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
    toPg: async (f) => ({
      run_id: str(f["Run ID"]),
      machine_id: await resolvePgIdFromPublicId("machines", Array.isArray(f.Machine) ? f.Machine[0] : null),
      job_id: await resolvePgIdFromPublicId("jobs", Array.isArray(f.Job) ? f.Job[0] : null),
      status: selectName(f.Status) || "planned",
      start_time: str(f["Start Time"]),
      end_time: str(f["End Time"]),
      output_pcs: int(f["Output (pcs)"]),
      waste_pcs: int(f["Waste (pcs)"]),
      operator_email: str(f["Operator Email"])?.toLowerCase() ?? null,
      operator_name: str(f["Operator Name"]),
      notes: str(f.Notes),
    }),
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
    toPg: async (f) => ({
      run_id: await resolvePgIdFromPublicId("production_runs", Array.isArray(f.Run) ? f.Run[0] : null),
      stock_line_id: await resolvePgIdFromPublicId("raw_materials", Array.isArray(f["Stock Line"]) ? f["Stock Line"][0] : null),
      qty_kgs: num(f["Qty (kgs)"]),
      operator_email: str(f["Operator Email"])?.toLowerCase() ?? null,
      notes: str(f.Notes),
    }),
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
    toPg: (f) => ({
      name: str(f.Name),
      type: selectName(f.Type),
      contact_person: str(f["Contact Person"]),
      phone: str(f.Phone),
      email: str(f.Email)?.toLowerCase() ?? null,
      active: bool(f.Active) ?? true,
      notes: str(f.Notes),
    }),
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
          Designation: row.designation,
          "Monthly Salary": row.monthly_salary,
          "Joining Date": row.joining_date,
          Manager: row.manager_id ? [await publicIdFromPgId("users", row.manager_id)] : undefined,
          "OT Eligible": row.ot_eligible,
          Notes: row.notes,
          Active: row.active,
          "Aadhar Photo": aadhar,
          Created: row.created_at,
        },
      };
    },
    toPg: async (f) => ({
      name: str(f.Name),
      aadhar: str(f.Aadhar),
      phone: str(f.Phone),
      designation: str(f.Designation),
      monthly_salary: num(f["Monthly Salary"]) ?? 0,
      joining_date: dateOnly(f["Joining Date"]),
      manager_id: await resolvePgIdFromPublicId("users", Array.isArray(f.Manager) ? f.Manager[0] : null),
      ot_eligible: bool(f["OT Eligible"]) ?? false,
      notes: str(f.Notes),
      active: bool(f.Active) ?? true,
    }),
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
        "OT Hours": row.ot_hours,
        "Marked By": row.marked_by_user_id ? [await publicIdFromPgId("users", row.marked_by_user_id)] : undefined,
        "Marked By Email": row.marked_by_email,
        "Marked By Name": row.marked_by_name,
        Notes: row.notes,
        Created: row.created_at,
        "Last Updated": row.updated_at,
      },
    }),
    toPg: async (f) => ({
      employee_id: await resolvePgIdFromPublicId("employees", Array.isArray(f.Employee) ? f.Employee[0] : null),
      date: dateOnly(f.Date),
      status: selectName(f.Status) || "P",
      in_time: str(f["In Time"]),
      out_time: str(f["Out Time"]),
      ot_hours: num(f["OT Hours"]) ?? 0,
      marked_by_user_id: await resolvePgIdFromPublicId("users", Array.isArray(f["Marked By"]) ? f["Marked By"][0] : null),
      marked_by_email: str(f["Marked By Email"])?.toLowerCase() ?? null,
      marked_by_name: str(f["Marked By Name"]),
      notes: str(f.Notes),
    }),
  },

  // ============================================================
  // Catalog (Aeros Products Master) base
  // ============================================================
  Products: {
    pgTable: "master_products",
    selectColumns: "*",
    toAirtable: (row) => ({
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
        "Price per Unit": row.price_per_unit,
        "Price per Case": row.price_per_case,
        "Supplier / Manufacturer": row.supplier,
        "Lead Time": row.lead_time,
        "Stock Status": row.stock_status,
        Notes: row.notes,
        Image: [], // catalog images bucket TBD; left empty for now
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
        "Top Diameter (mm)": row.top_diameter_mm,
        "Bottom Diameter (mm)": row.bottom_diameter_mm,
        "Height (mm)": row.height_mm,
        "Inner Case Pack": row.inner_case_pack,
        "Lid Type": row.lid_type,
        "Length (mm)": row.length_mm,
        "Width (mm)": row.width_mm,
        "Individually Wrapped": row.individually_wrapped,
      },
    }),
    toPg: (f) => ({
      product_name: str(f["Product Name"]),
      sku: str(f.SKU),
      category: selectName(f.Category),
      sub_category: str(f["Sub-Category / Style"]),
      size_volume: str(f["Size / Volume"]),
      colour: str(f["Colour / Print"]),
      material: selectName(f.Material),
      gsm: num(f.GSM),
      bf: num(f.BF),
      paper_finish: str(f["Paper Finish"]),
      wall_type: selectName(f["Wall Type"]),
      coating: selectName(f.Coating),
      units_per_case: int(f["Units per Case"]),
      cases_per_pallet: int(f["Cases per Pallet"]),
      moq_units: int(f["MOQ (units)"]),
      price_per_unit: num(f["Price per Unit"]),
      price_per_case: num(f["Price per Case"]),
      supplier: str(f["Supplier / Manufacturer"]),
      lead_time: str(f["Lead Time"]),
      stock_status: selectName(f["Stock Status"]),
      notes: str(f.Notes),
      item_weight_g: num(f["Item Weight (g)"]),
      carton_dimensions: str(f["Carton Dimensions (mm)"]),
      net_weight_kg: num(f["Net Weight (kg)"]),
      gross_weight_kg: num(f["Gross Weight (kg)"]),
      inner_wall_material: selectName(f["Inner Wall Material"]),
      inner_wall_gsm: num(f["Inner Wall GSM"]),
      inner_wall_bf: num(f["Inner Wall BF"]),
      inner_wall_finish: str(f["Inner Wall Finish"]),
      inner_wall_coating: selectName(f["Inner Wall Coating"]),
      top_diameter_mm: num(f["Top Diameter (mm)"]),
      bottom_diameter_mm: num(f["Bottom Diameter (mm)"]),
      height_mm: num(f["Height (mm)"]),
      inner_case_pack: int(f["Inner Case Pack"]),
      lid_type: selectName(f["Lid Type"]),
      length_mm: num(f["Length (mm)"]),
      width_mm: num(f["Width (mm)"]),
      individually_wrapped: bool(f["Individually Wrapped"]),
    }),
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
    toPg: (f) => ({
      material_name: str(f["Material Name"]),
      type: str(f.Type),
      gsm: num(f.GSM),
      bf: num(f.BF),
      supplier: str(f.Supplier),
      form: selectName(f.Form),
      mill_coating: selectName(f["Mill Coating"]),
      base_rate_inr_kg: num(f["Base Rate (INR/kg)"]),
      discount_inr_kg: num(f["Discount (INR/kg)"]),
      specifications: str(f.Specifications),
    }),
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
        },
      };
    },
    toPg: (f) => ({
      item_name: str(f["Item Name"]),
      sku: str(f.SKU),
      brand: str(f.Brand),
      category: str(f.Category),
      stock_quantity: num(f["Stock Quantity"]),
      unit: str(f.Unit) || "pcs",
      case_pack: int(f["Case Pack"]),
      price: num(f.Price),
      show_price: bool(f["Show Price"]) ?? false,
      description: str(f.Description),
      specifications: str(f.Specifications),
      status: selectName(f.Status) || "Available",
      location: str(f.Location),
      notes: str(f.Notes),
      material: selectName(f.Material),
      carton_dimensions: str(f["Carton Dimensions (mm)"]),
      whatsapp_inquiry: str(f["Whatsapp Inquiry"]),
      // RM dead-stock fields.
      gsm: int(f.GSM),
      rm_form: selectName(f["RM Form"]),
      rm_type: selectName(f["RM Type"]),
      price_unit: str(f["Price Unit"]),
    }),
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
};

export { resolvePgIdFromPublicId, publicIdFromPgId, resolveLinks };
