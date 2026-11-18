// Warehouse categories follow the product master (master_products.category /
// sub_category), the same taxonomy as the Aeros Listing. Arjun, 18-Nov-2026:
// "Product category should be as per DB and Aeros listing. Eventually we will
// match Zoho to this."
//
// An item linked to a master SKU (inventory_items.parent_sku) takes the
// master's category and sub-category. Older items from the July count carry a
// free-text category; those are mapped here onto the master's names without
// changing any data. Anything that fits no listing category is "Not in the
// listing" until it is linked to a master SKU.

import { dbSelect } from "../db/supabase.js";
import { quoteIn } from "./zohoItems.js";

const key = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

// Old warehouse category → [master category, master sub-category or null].
const LEGACY = {
  "paper bag": ["Paper Bags", null], "paper bags": ["Paper Bags", null],
  "paper cup": ["Paper Cups", null], "paper cups": ["Paper Cups", null],
  "ripple cup": ["Paper Cups", "Ripple Paper Cup"],
  "take out containers": ["Take Out Containers", null],
  "food box": ["Take Out Containers", "Food Boxes"],
  "paper tub": ["Take Out Containers", "Tubs"],
  "salad bowl": ["Take Out Containers", null],
  "lids": ["Lids", null], "paper cup lids": ["Lids", "Flat Paper Lid"], "paper cup lid": ["Lids", "Flat Paper Lid"],
  "paper tub lid": ["Lids", null], "salad bowl lid": ["Lids", null],
  "pp cups": ["PP Cups", null], "sipper cups & lids": ["PP Cups", null],
  "pet cup": ["PET Cups", null], "pet cups & lids": ["PET Cups", null],
  "cutlery": ["Cutlery", null], "straws": ["Straws", null], "tissue": ["Tissue", null],
  "bagasse": ["Bagasse Tableware", null], "cup holder": ["Cup Carriers & Holders", null],
  "burger box": ["Burger Boxes", null], "pizza box": ["Pizza Boxes", null],
  "thin wall containers": ["Thin Wall Containers", null], "pp meal trays": ["Thermoformed Containers", "Meal Trays"],
  "label": ["Labels", null], "labels": ["Labels", null], "wrap paper": ["Wraps", null],
  "pet bottle": ["PET Bottles", null], "pet bottles": ["PET Bottles", null],
  "beverage cup accessories": ["Beverage Cup Accessories", null],
};
export const NOT_IN_LISTING = "Not in the listing";

// The master's category list, biggest first, for pickers.
export async function masterCategories() {
  const rows = await dbSelect("master_products", { select: "category,sub_category", limit: 20000 }).catch(() => []);
  const m = new Map();
  for (const r of rows) {
    if (!r.category) continue;
    if (!m.has(r.category)) m.set(r.category, { name: r.category, count: 0, subs: new Set() });
    const g = m.get(r.category); g.count++; if (r.sub_category) g.subs.add(r.sub_category);
  }
  return [...m.values()].sort((a, b) => b.count - a.count).map((g) => ({ name: g.name, subs: [...g.subs].sort() }));
}

// items: [{ parent_sku, category }] → Map(index → { category, subCategory, linked })
export async function listingCategoryFor(items) {
  const skus = [...new Set(items.map((i) => i.parent_sku).filter(Boolean))];
  const master = skus.length
    ? await dbSelect("master_products", { select: "sku,category,sub_category", filter: { sku: quoteIn(skus) }, limit: 5000 }).catch(() => [])
    : [];
  const bySku = new Map(master.map((m) => [m.sku, m]));
  const names = new Map((await masterCategories()).map((c) => [key(c.name), c.name]));
  return items.map((i) => {
    const m = i.parent_sku ? bySku.get(i.parent_sku) : null;
    if (m?.category) return { category: m.category, subCategory: m.sub_category || null, linked: true };
    const legacy = LEGACY[key(i.category)];
    if (legacy) return { category: legacy[0], subCategory: legacy[1], linked: false };
    const exact = names.get(key(i.category));
    if (exact) return { category: exact, subCategory: null, linked: false };
    return { category: NOT_IN_LISTING, subCategory: null, linked: false };
  });
}
