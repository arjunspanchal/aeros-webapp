// Supabase-backed user repo for the unified Access admin page. Reads from
// `public.users` (the canonical source for who can sign in) joined with the
// `user_clients` link table so every row carries its full company linkage in
// one shape. Replaces the Airtable-backed FactoryOS Users admin for the
// access-control surface — pricing fields (margin / discount / currency /
// unit) and `calculator_role` were never editable from that older form, so
// the only place to set them today is the Calculator clients page or
// directly in the DB. This module collapses both into one editor.

import { dbSelect, dbUpdate, dbInsert, dbDelete } from "@/lib/db/supabase";

const USERS_SELECT =
  "id,email,name,company,country,phone,factoryos_role,calculator_role,rate_cards_role,hr_role,payouts_role," +
  "active,designation,margin_pct,margin_cups_pct,discount_pct,vendor_id," +
  "preferred_currency,preferred_unit,last_login,notes,created_at,updated_at," +
  "user_clients(client_id,clients(id,name,code,airtable_id))";

const CLIENTS_SELECT = "id,name,code,airtable_id,brand_manager";
const VENDORS_SELECT = "id,name,type,active";

function normUser(row) {
  const links = Array.isArray(row.user_clients) ? row.user_clients : [];
  return {
    id: row.id,
    email: (row.email || "").toLowerCase(),
    name: row.name || "",
    company: row.company || "",
    country: row.country || "",
    phone: row.phone || "",
    designation: row.designation || "",
    factoryosRole: row.factoryos_role || "",
    calculatorRole: row.calculator_role || "",
    rateCardsRole: row.rate_cards_role || "",
    hrRole: row.hr_role || "",
    payoutsRole: row.payouts_role || "",
    vendorId: row.vendor_id || "",
    active: row.active !== false,
    marginPct: row.margin_pct == null ? null : Number(row.margin_pct),
    marginCupsPct: row.margin_cups_pct == null ? null : Number(row.margin_cups_pct),
    discountPct: row.discount_pct == null ? null : Number(row.discount_pct),
    preferredCurrency: row.preferred_currency || "",
    preferredUnit: row.preferred_unit || "",
    lastLogin: row.last_login || "",
    notes: row.notes || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    clientIds: links.map((l) => l.client_id).filter(Boolean),
    clients: links
      .map((l) => l.clients)
      .filter(Boolean)
      .map((c) => ({ id: c.id, name: c.name || "", code: c.code || "" })),
  };
}

export async function listAccessUsers({ search } = {}) {
  const opts = {
    select: USERS_SELECT,
    order: "email.asc",
    range: "0-1999",
  };
  if (search && search.trim()) {
    // PostgREST `or` filter — match across email/name/company.
    const needle = search.trim().toLowerCase();
    const safe = needle.replace(/[(),*]/g, "");
    opts.filter = { or: `(email.ilike.*${safe}*,name.ilike.*${safe}*,company.ilike.*${safe}*)` };
  }
  const rows = await dbSelect("users", opts);
  return rows.map(normUser);
}

export async function getAccessUser(id) {
  const rows = await dbSelect("users", {
    select: USERS_SELECT,
    filter: { id: `eq.${id}` },
    limit: 1,
  });
  return rows[0] ? normUser(rows[0]) : null;
}

export async function listAccessClients() {
  const rows = await dbSelect("clients", {
    select: CLIENTS_SELECT,
    order: "name.asc",
    range: "0-999",
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name || "",
    code: r.code || "",
    brandManager: r.brand_manager || "",
  }));
}

// Active vendor directory for the "link a vendor login to a vendor record"
// picker. Printing vendors are the only ones that get logins today, but we
// return all active vendors so the type label can disambiguate.
export async function listAccessVendors() {
  const rows = await dbSelect("vendors", {
    select: VENDORS_SELECT,
    order: "name.asc",
    range: "0-999",
  });
  return rows
    .filter((r) => r.active !== false)
    .map((r) => ({ id: r.id, name: r.name || "", type: r.type || "" }));
}

// Whitelist of patchable fields. Anything else in `input` is ignored —
// stops a stray frontend payload from turning into a column update we
// didn't intend (e.g. flipping `airtable_id`, `created_at`, etc.).
const PATCHABLE = new Set([
  "name", "company", "country", "phone", "designation",
  "factoryosRole", "calculatorRole", "rateCardsRole", "hrRole", "payoutsRole", "active",
  "marginPct", "marginCupsPct", "discountPct",
  "preferredCurrency", "preferredUnit", "notes", "vendorId",
]);

const FIELD_MAP = {
  name: "name", company: "company", country: "country", phone: "phone",
  designation: "designation",
  factoryosRole: "factoryos_role",
  calculatorRole: "calculator_role",
  rateCardsRole: "rate_cards_role",
  hrRole: "hr_role",
  payoutsRole: "payouts_role",
  active: "active",
  marginPct: "margin_pct",
  marginCupsPct: "margin_cups_pct",
  discountPct: "discount_pct",
  preferredCurrency: "preferred_currency",
  preferredUnit: "preferred_unit",
  notes: "notes",
  vendorId: "vendor_id",
};

function buildPatch(input) {
  const patch = {};
  for (const [k, v] of Object.entries(input || {})) {
    if (!PATCHABLE.has(k)) continue;
    const col = FIELD_MAP[k];
    if (k.endsWith("Pct")) {
      patch[col] = v === "" || v === null || v === undefined ? null : Number(v);
    } else if (k === "active") {
      patch[col] = !!v;
    } else if (typeof v === "string") {
      patch[col] = v.trim() || null;
    } else {
      patch[col] = v;
    }
  }
  // Empty-string role normalisation: blank role means "remove that role"
  // rather than the literal empty string (which fails the entitlement check
  // anyway but pollutes the column).
  if ("factoryos_role" in patch && patch.factoryos_role === "") patch.factoryos_role = null;
  if ("calculator_role" in patch && patch.calculator_role === "") patch.calculator_role = null;
  if ("rate_cards_role" in patch && patch.rate_cards_role === "") patch.rate_cards_role = null;
  if ("hr_role" in patch && patch.hr_role === "") patch.hr_role = null;
  if ("payouts_role" in patch && patch.payouts_role === "") patch.payouts_role = null;
  return patch;
}

// Fields that, when changed, force the user's existing session cookie to
// be discarded on next request (via session_invalidated_at). Anything that
// affects what they can see / do gets in here; pure label fields (name,
// phone, designation, notes) deliberately don't trigger a re-auth.
const SESSION_INVALIDATING = new Set([
  "factoryos_role", "calculator_role", "rate_cards_role", "hr_role", "payouts_role", "active", "vendor_id",
]);

export async function updateAccessUser(id, input) {
  const patch = buildPatch(input);
  patch.updated_at = new Date().toISOString();

  // If any access knob changed, bump session_invalidated_at so the
  // freshness check in middleware rejects the user's existing cookie.
  // Compare against the live row so we only bump when the value actually
  // moved (idempotent saves don't kick everyone out).
  const before = await getAccessUser(id);
  const accessChanged = before && Object.keys(patch).some((col) => {
    if (!SESSION_INVALIDATING.has(col)) return false;
    const liveCol = beforeColValue(before, col);
    const nextCol = patch[col];
    return (liveCol ?? null) !== (nextCol ?? null);
  });
  const clientsChanged = Array.isArray(input.clientIds)
    && before && !sameSet(input.clientIds, before.clientIds);
  if (accessChanged || clientsChanged) {
    patch.session_invalidated_at = new Date().toISOString();
  }

  await dbUpdate("users", "id", id, patch);

  // Client linkage is a separate M-to-N table — diff & apply if present.
  if (Array.isArray(input.clientIds)) {
    await syncUserClients(id, input.clientIds);
  }
  return getAccessUser(id);
}

// Map a column name back to the camelCase getAccessUser field for the
// before/after comparison. Mirrors FIELD_MAP inverted.
function beforeColValue(user, col) {
  switch (col) {
    case "factoryos_role":  return user.factoryosRole || null;
    case "calculator_role": return user.calculatorRole || null;
    case "rate_cards_role": return user.rateCardsRole || null;
    case "hr_role":         return user.hrRole || null;
    case "payouts_role":    return user.payoutsRole || null;
    case "active":          return user.active === false ? false : true;
    case "vendor_id":       return user.vendorId || null;
    default: return null;
  }
}

function sameSet(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  const sa = new Set(a); for (const x of b) if (!sa.has(x)) return false;
  return true;
}

// Replace this user's client links with `desiredIds`. Rebuild approach
// (delete-all then insert-desired) keeps the code tiny — `user_clients`
// is just (user_id, client_id, created_at), no FK side-effects, and the
// table is small (one row per (user, company) pair). Avoids a 2-column
// DELETE which dbDelete can't express today.
export async function syncUserClients(userId, desiredIds) {
  const desired = [...new Set((desiredIds || []).filter(Boolean))];
  await dbDelete("user_clients", "user_id", userId);
  if (desired.length) {
    await dbInsert(
      "user_clients",
      desired.map((cid) => ({ user_id: userId, client_id: cid })),
    );
  }
}
