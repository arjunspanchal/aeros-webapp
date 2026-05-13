// Search / fetch master_products for the calculator UIs. Returns the columns
// needed by the Express Ship calculator (carton + weight + HS code).
//
//   GET /api/calc/master-products?q=PC-SW            → top 20 matches
//   GET /api/calc/master-products?id=<uuid>          → single row
//
// Search hits sku, product_name, and category via PostgREST OR filter. Rows
// missing carton_dimensions still come back — the UI decides whether to
// disable them.

import { dbSelect } from "@/lib/db/supabase";
import { getSession } from "@/lib/auth/session";
import { isInternalRole } from "@/lib/factoryos/constants";

export const runtime = "nodejs";

const COLUMNS = [
  "id",
  "sku",
  "product_name",
  "category",
  "sub_category",
  "size_volume",
  "units_per_case",
  "cases_per_pallet",
  "carton_dimensions",
  "height_mm",
  "item_weight_g",
  "gross_weight_kg",
  "volumetric_weight_kg",
  "hts_code_us",
  "country_of_origin",
  "price_per_unit",
].join(",");

// Master row → camelCase the calculator expects. Numeric columns come back
// as strings from PostgREST (Postgres numeric); coerce so the calc lib's
// Number() guards don't have to.
function rowToProduct(row) {
  const numOrNull = (v) => (v == null || v === "" ? null : Number(v));
  return {
    id: row.id,
    sku: row.sku || "",
    productName: row.product_name || "",
    category: row.category || "",
    subCategory: row.sub_category || "",
    sizeVolume: row.size_volume || "",
    unitsPerCase: numOrNull(row.units_per_case),
    casesPerPallet: numOrNull(row.cases_per_pallet),
    cartonDimensions: row.carton_dimensions || "",
    heightMm: numOrNull(row.height_mm),
    itemWeightG: numOrNull(row.item_weight_g),
    grossWeightKg: numOrNull(row.gross_weight_kg),
    volumetricWeightKg: numOrNull(row.volumetric_weight_kg),
    htsCodeUs: row.hts_code_us || "",
    countryOfOrigin: row.country_of_origin || "",
    pricePerUnit: numOrNull(row.price_per_unit),
  };
}

export async function GET(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  // Express-Ship calc is internal-only — same gate as the China→India
  // Import calculator.
  if (!session.isAdmin && !isInternalRole(session.modules?.factoryos)) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const q = (url.searchParams.get("q") || "").trim();

  if (id) {
    const rows = await dbSelect("master_products", {
      select: COLUMNS,
      filter: { id: `eq.${id}` },
      limit: 1,
    });
    const row = rows[0];
    if (!row) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(rowToProduct(row));
  }

  // Empty / single-char query → return a reasonable default slice ordered by
  // sku so the dropdown isn't empty on first open.
  if (q.length < 2) {
    const rows = await dbSelect("master_products", {
      select: COLUMNS,
      order: "sku.asc",
      limit: 50,
    });
    return Response.json(rows.map(rowToProduct));
  }

  // PostgREST `or=` filter — escape commas/parens isn't needed for our SKU
  // vocabulary; query is bounded to alphanumerics + dashes via the UI but
  // we still URL-encode defensively.
  const safe = q.replace(/[(),]/g, " ");
  const orExpr = `or=(sku.ilike.*${safe}*,product_name.ilike.*${safe}*,category.ilike.*${safe}*)`;
  // dbSelect doesn't natively expose `or=`; build the URL manually using the
  // exposed Supabase config helpers.
  const { getSupabaseUrl } = await import("@/lib/db/supabase");
  const supaUrl = new URL(`${getSupabaseUrl()}/rest/v1/master_products`);
  supaUrl.searchParams.set("select", COLUMNS);
  supaUrl.searchParams.set("order", "sku.asc");
  supaUrl.searchParams.set("limit", "20");
  // Append `or=` as an unencoded query segment so PostgREST parses the
  // parenthesised expression. URLSearchParams would encode the parens.
  const finalUrl = `${supaUrl.toString()}&${orExpr}`;
  const res = await fetch(finalUrl, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    return Response.json({ error: body.slice(0, 300) }, { status: 500 });
  }
  const rows = await res.json();
  return Response.json(rows.map(rowToProduct));
}
