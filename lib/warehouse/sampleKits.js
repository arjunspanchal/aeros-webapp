// WarehouseOS — Sample Kits data layer.
// A sample kit is a predefined grouping (e.g. "PET Cup Sample Kit") that
// appears as ONE line item on a sample dispatch. Components describe
// what's physically inside (for warehouse packing reference) and are NOT
// individually listed on the dispatch PDF.

import { dbSelect, dbInsert, dbUpdate, dbDelete } from "../db/supabase.js";
import { ROLES } from "../factoryos/constants.js";

// Same audience as canManageSampleDispatch — admin/AM/FM/FE can manage
// kits since these are operational catalog data the team builds together.
export function canManageSampleKits(session) {
  if (!session) return false;
  if (session.isAdmin) return true;
  const role = session.modules?.factoryos;
  return (
    role === ROLES.ACCOUNT_MANAGER ||
    role === ROLES.FACTORY_MANAGER ||
    role === ROLES.FACTORY_EXECUTIVE
  );
}

const LIST_SELECT =
  "id,name,description,default_price,default_gst_pct,active,created_at,updated_at," +
  "sample_kit_components(id)";

const DETAIL_SELECT =
  "id,name,description,default_price,default_gst_pct,active,created_at,updated_at,created_by," +
  "sample_kit_components(id,master_product_id,description,quantity_per_kit,sort_order)";

function normalizeKit(row) {
  if (!row) return null;
  const components = (row.sample_kit_components || [])
    .slice()
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map((c) => ({
      id: c.id,
      master_product_id: c.master_product_id || null,
      description: c.description,
      quantity_per_kit: Number(c.quantity_per_kit),
      sort_order: c.sort_order,
    }));
  const { sample_kit_components: _omit, ...rest } = row;
  return {
    ...rest,
    default_price: rest.default_price == null ? null : Number(rest.default_price),
    default_gst_pct: Number(rest.default_gst_pct),
    component_count: components.length,
    components,
  };
}

export async function listKits({ activeOnly = false } = {}) {
  const filter = { deleted_at: "is.null" };
  if (activeOnly) filter.active = "eq.true";
  const rows = await dbSelect("sample_kits", {
    select: LIST_SELECT,
    filter,
    order: "name.asc",
    limit: 500,
  });
  return rows.map(normalizeKit);
}

export async function getKit(id) {
  const rows = await dbSelect("sample_kits", {
    select: DETAIL_SELECT,
    filter: { id: `eq.${id}`, deleted_at: "is.null" },
    limit: 1,
  });
  return normalizeKit(rows[0]);
}

export async function createKit(payload, userEmail) {
  const name = (payload?.name || "").trim();
  if (!name) throw new Error("Kit name is required");
  const header = await dbInsert("sample_kits", {
    name,
    description:     payload.description || null,
    default_price:   payload.default_price == null || payload.default_price === ""
                       ? null : Number(payload.default_price),
    default_gst_pct: payload.default_gst_pct == null || payload.default_gst_pct === ""
                       ? 18 : Number(payload.default_gst_pct),
    active:          payload.active !== false,
    created_by:      userEmail || null,
  });
  if (Array.isArray(payload.components) && payload.components.length > 0) {
    await replaceComponents(header.id, payload.components);
  }
  return getKit(header.id);
}

export async function updateKit(id, payload) {
  const patch = {};
  if (payload.name !== undefined)            patch.name = payload.name.trim();
  if (payload.description !== undefined)     patch.description = payload.description || null;
  if (payload.default_price !== undefined)   patch.default_price = payload.default_price === "" || payload.default_price == null ? null : Number(payload.default_price);
  if (payload.default_gst_pct !== undefined) patch.default_gst_pct = payload.default_gst_pct === "" || payload.default_gst_pct == null ? 18 : Number(payload.default_gst_pct);
  if (payload.active !== undefined)          patch.active = !!payload.active;
  if (Object.keys(patch).length > 0) {
    await dbUpdate("sample_kits", "id", id, patch);
  }
  if (Array.isArray(payload.components)) {
    await replaceComponents(id, payload.components);
  }
  return getKit(id);
}

async function replaceComponents(kitId, components) {
  // Simple replace: delete + reinsert. Volumes are tiny (a kit has ~5–20
  // components) so the cost is negligible and the code stays simple.
  await dbDelete("sample_kit_components", "kit_id", kitId);
  const rows = components
    .filter((c) => (c.description || "").trim())
    .map((c, idx) => ({
      kit_id: kitId,
      master_product_id: c.master_product_id || null,
      description:       c.description.trim(),
      quantity_per_kit:  Number(c.quantity_per_kit || 1),
      sort_order:        idx,
    }));
  if (rows.length > 0) await dbInsert("sample_kit_components", rows);
}

export async function softDeleteKit(id) {
  await dbUpdate("sample_kits", "id", id, {
    deleted_at: new Date().toISOString(),
    active: false,
  });
}
