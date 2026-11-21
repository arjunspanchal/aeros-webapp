// Saved designs of the staff dieline tool (table dieline_designs, migration 2026_11_21_dieline_designs.sql).
import { dbSelect, dbInsert, dbUpdate } from "../db/supabase.js";

const LIST = "id,name,customer,job_ref,template,checks_ok,created_by,updated_by,updated_at";
const clean = (v, n = 200) => (typeof v === "string" ? v.trim().slice(0, n) : null) || null;
const MAX_BYTES = 6_000_000; // one design; the client already drops big raster pixels

function row(body, email, isNew) {
  const artwork = Array.isArray(body.artwork) ? body.artwork : [];
  const recipe = body.recipe && typeof body.recipe === "object" ? body.recipe : null;
  if (!recipe || !recipe.template) throw new Error("Nothing to save: the die recipe is missing.");
  if (JSON.stringify(artwork).length > MAX_BYTES) throw new Error("This artwork is too heavy to save. Remove the largest image and add it again after opening.");
  const out = { name: clean(body.name) || "Untitled design", customer: clean(body.customer), job_ref: clean(body.job_ref, 80), template: String(recipe.template), recipe, artwork,
    checks_ok: !!body.checks_ok, updated_by: email || null, updated_at: new Date().toISOString() };
  if (isNew) out.created_by = email || null;
  return out;
}

export const listDesigns = () => dbSelect("dieline_designs", { select: LIST, filter: { archived: "eq.false" }, order: "updated_at.desc", limit: 300 });
export async function getDesign(id) { return (await dbSelect("dieline_designs", { select: "*", filter: { id: `eq.${id}`, archived: "eq.false" }, limit: 1 }))[0] || null; }
export const createDesign = (body, email) => dbInsert("dieline_designs", row(body, email, true));
export const updateDesign = (id, body, email) => dbUpdate("dieline_designs", "id", id, row(body, email, false));
export const archiveDesign = (id, email) => dbUpdate("dieline_designs", "id", id, { archived: true, updated_by: email || null, updated_at: new Date().toISOString() });
