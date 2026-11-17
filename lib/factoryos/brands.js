// Brands previously recorded on jobs, keyed by customer, so the New Job
// form can offer them as suggestions instead of relying on free typing
// (which is how "COFFEE CUP", "Black GENERIC" and friends crept in).

import { dbSelect } from "@/lib/db/supabase";

// Returns { byClient: { <client public id>: [brand, ...] }, all: [brand, ...] }.
// Client key matches listClients() ids (airtable_id when present, else uuid).
export async function listBrandsByClient() {
  const rows = await dbSelect("jobs", {
    select: "brand,client_id,clients(airtable_id)",
    filter: { brand: "not.is.null" },
    range: "0-9999",
  }).catch((e) => {
    console.error("listBrandsByClient failed:", e);
    return [];
  });
  // Tally spellings case-insensitively so "zepto" and "Zepto" collapse to
  // one option. A spelling with a capital letter wins (someone typed it
  // deliberately); among those, the most-used.
  const byClient = {};
  const all = {};
  const tally = (bucket, brand) => {
    const k = brand.toLowerCase();
    const slot = (bucket[k] ||= {});
    slot[brand] = (slot[brand] || 0) + 1;
  };
  for (const r of rows) {
    const brand = String(r.brand || "").trim();
    if (!brand) continue;
    tally(all, brand);
    const key = r.clients?.airtable_id || r.client_id;
    if (!key) continue;
    tally((byClient[key] ||= {}), brand);
  }
  const hasCap = (v) => v !== v.toLowerCase();
  const pick = (slot) => Object.entries(slot)
    .sort((a, b) => (hasCap(b[0]) - hasCap(a[0])) || (b[1] - a[1]))[0][0];
  const resolve = (bucket) => Object.values(bucket).map(pick);
  const sortCI = (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" });
  return {
    byClient: Object.fromEntries(Object.entries(byClient).map(([k, v]) => [k, resolve(v).sort(sortCI)])),
    all: resolve(all).sort(sortCI),
  };
}
