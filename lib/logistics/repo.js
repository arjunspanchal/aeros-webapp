// Logistics calculator — server-side data access (service-role REST helpers).
// Rates come from the Delhivery Addendum tables; persistence covers vendor
// origin pincodes, saved delivery addresses and the quote log.

import { dbSelect, dbInsert, dbUpdate } from "../db/supabase.js";
import { ROLES } from "../factoryos/constants.js";

// Internal staff only — freight cost structure is not for customer logins.
export function canUseLogistics(session) {
  if (!session) return false;
  if (session.isAdmin) return true;
  const f = session.modules?.factoryos;
  if ([ROLES.ADMIN, ROLES.ACCOUNT_MANAGER, ROLES.FACTORY_MANAGER, ROLES.FACTORY_EXECUTIVE, ROLES.WAREHOUSE].includes(f)) return true;
  return session.modules?.calculator === "admin";
}

export async function loadBootstrap() {
  const [config, zoneMatrix, laneRates, zoneMap, vendors, rawAddresses, clients, quotes, products] = await Promise.all([
    dbSelect("pricing_config", { limit: 1 }),
    dbSelect("delhivery_zone_rates", { select: "origin_zone,dest_zone,rate_per_kg" }),
    dbSelect("delhivery_lane_rates", { select: "origin_zone,dest_name,rate_per_kg" }),
    dbSelect("delhivery_zone_map", { select: "state,zone,status" }),
    dbSelect("vendors", {
      select: "id,name,type,pincode",
      filter: { active: "eq.true" },
      order: "name.asc",
    }),
    // Customer ship-to addresses live on the CLIENTS master (client_addresses),
    // never in a calculator-private list.
    dbSelect("client_addresses", {
      select: "id,client_id,label,pincode,city,state,is_oda,clients(name)",
      order: "label.asc",
    }),
    dbSelect("clients", {
      select: "id,name",
      filter: { deleted_at: "is.null" },
      order: "name.asc",
    }),
    dbSelect("logistics_quotes", {
      select: "id,created_at,created_by,origin_label,origin_pincode,dest_label,dest_pincode,lines,chargeable_kg,total_ex_gst,gst_inr,total_inr,breakdown",
      order: "created_at.desc",
      limit: 100,
    }),
    // The ENTIRE catalogue, every category — items missing case-pack or
    // weight data are still quotable via manual overrides in the UI.
    dbSelect("master_products", {
      select: "id,sku,product_name,category,units_per_case,gross_weight_kg,volumetric_weight_kg,carton_dimensions",
      order: "category.asc,sku.asc",
      limit: 3000,
    }),
  ]);
  const addresses = rawAddresses.map(({ clients: c, ...a }) => ({
    ...a,
    client_name: c?.name || "",
  }));
  return {
    config: config[0] || {},
    zoneMatrix,
    laneRates,
    zoneMap,
    vendors,
    addresses,
    clients,
    quotes,
    products,
  };
}

export async function saveVendorPincode(vendorId, pincode) {
  return dbUpdate("vendors", "id", vendorId, { pincode });
}

export async function createAddress(payload) {
  const clean = {
    client_id: payload.client_id || null,
    label: String(payload.label || "").trim(),
    contact_name: payload.contact_name || null,
    phone: payload.phone || null,
    address_line: payload.address_line || null,
    city: payload.city || null,
    state: payload.state || null,
    pincode: String(payload.pincode || "").trim(),
    is_oda: !!payload.is_oda,
    source: payload.source || "logistics calculator",
    notes: payload.notes || null,
  };
  if (!clean.client_id) throw new Error("Pick the customer this address belongs to");
  if (!clean.label) throw new Error("Address label is required");
  if (!/^\d{6}$/.test(clean.pincode)) throw new Error("Pincode must be 6 digits");
  return dbInsert("client_addresses", clean);
}

export async function updateAddress(id, patch) {
  return dbUpdate("client_addresses", "id", id, patch);
}

export async function saveQuote(payload, session) {
  const row = await dbInsert("logistics_quotes", {
    ...payload,
    created_by: session?.email || session?.name || null,
  });
  if (payload.address_id) {
    await dbUpdate("client_addresses", "id", payload.address_id, {
      last_used_at: new Date().toISOString(),
    }).catch(() => {});
  }
  return row;
}
