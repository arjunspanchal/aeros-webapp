// Brand kits of the staff dieline tool (table dieline_brand_kits, migration 2026_11_21_dieline_brand_kits.sql):
// a customer's vector logos and Pantone colours, saved once and reused on every item.
import { dbSelect, dbInsert, dbUpdate } from "../db/supabase.js";

const clean = (v, n = 200) => (typeof v === "string" ? v.trim().slice(0, n) : "") || "";
const MAX_LOGO = 600_000, MAX_KIT = 4_000_000, MAX_LOGOS = 24;
const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); };

// only what is needed to place the logo again; never a picture, never a position
function logo(it) {
  if (!it || it.kind !== "svg" || typeof it.svgText !== "string" || !it.svgText) return null;
  if (it.svgText.length > MAX_LOGO) throw new Error(`"${clean(it.name, 60) || "A logo"}" is too heavy for the brand kit. Simplify the file and save again.`);
  const colours = (Array.isArray(it.colours) ? it.colours : []).slice(0, 12).map((c) => ({ from: clean(c.from, 30), to: clean(c.to, 30), name: clean(c.name, 60) }));
  return { key: `${hash(it.svgText)}-${it.svgText.length}`, kind: "svg", name: clean(it.name, 80) || "Logo", role: "content", w: +it.w || 40, h: +it.h || 20, natW: +it.natW || 100, natH: +it.natH || 50,
    crop: { l: 0, t: 0, r: 0, b: 0 }, svgText: it.svgText, colours, ...(it.source === "trace" ? { source: "trace" } : {}) };
}
const inks = (list) => (Array.isArray(list) ? list : []).map((c) => ({ hex: clean(c.hex || c.to, 9).toLowerCase(), name: clean(c.name, 60) })).filter((c) => /^#[0-9a-f]{6}$/.test(c.hex) && c.hex !== "#ffffff").slice(0, 16);
const summary = (r) => ({ id: r.id, customer: r.customer, logo_names: r.logo_names || [], colours: r.colours || [], updated_by: r.updated_by, updated_at: r.updated_at });

export async function listKits() {
  return (await dbSelect("dieline_brand_kits", { select: "id,customer,logo_names,colours,updated_by,updated_at", filter: { archived: "eq.false" }, order: "customer.asc", limit: 500 })).map(summary);
}
export async function getKit(id) { return (await dbSelect("dieline_brand_kits", { select: "*", filter: { id: `eq.${id}`, archived: "eq.false" }, limit: 1 }))[0] || null; }

/** add this job's logos and colours to the customer's kit (made if it is not there yet); same logo again = replaced */
export async function saveKit(body, email) {
  const customer = clean(body.customer);
  if (!customer) throw new Error("Type the customer / brand name first: the kit is saved under it.");
  const add = (Array.isArray(body.logos) ? body.logos : []).map(logo).filter(Boolean), addInks = inks(body.colours);
  if (!add.length && !addInks.length) throw new Error("Nothing to save: place a vector logo first.");
  const all = await dbSelect("dieline_brand_kits", { select: "id,customer", filter: { archived: "eq.false" }, limit: 500 });
  const hit = all.find((r) => r.customer.trim().toLowerCase() === customer.toLowerCase());
  const old = hit ? await getKit(hit.id) : null;
  const logos = [...(old?.logos || []).filter((l) => !add.some((n) => n.key === l.key)), ...add].slice(-MAX_LOGOS);
  const colours = [...(old?.colours || [])];
  for (const c of addInks) { const k = colours.findIndex((q) => q.hex === c.hex); if (k < 0) colours.push(c); else if (c.name) colours[k] = c; }
  if (JSON.stringify(logos).length > MAX_KIT) throw new Error("This brand kit is full. Remove a logo from it first.");
  const row = { customer: old?.customer || customer, logos, logo_names: logos.map((l) => l.name), colours, updated_by: email || null, updated_at: new Date().toISOString() };
  return old ? dbUpdate("dieline_brand_kits", "id", old.id, row) : dbInsert("dieline_brand_kits", { ...row, created_by: email || null });
}
/** take one logo out of a kit */
export async function dropLogo(id, key, email) {
  const kit = await getKit(id);
  if (!kit) throw new Error("Not found");
  const logos = (kit.logos || []).filter((l) => l.key !== key);
  return dbUpdate("dieline_brand_kits", "id", id, { logos, logo_names: logos.map((l) => l.name), updated_by: email || null, updated_at: new Date().toISOString() });
}
export const archiveKit = (id, email) => dbUpdate("dieline_brand_kits", "id", id, { archived: true, updated_by: email || null, updated_at: new Date().toISOString() });
