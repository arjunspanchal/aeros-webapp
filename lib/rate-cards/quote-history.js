// Unified read across every quote_type in `quotes_v2` for a given client.
// Used by the rate-cards "Past Quotes" tab so a customer can review every
// rate they've ever been quoted in one place — no manual import needed,
// the list updates the moment a new quote is saved in the calculator.
//
// Currently surfaces bag + cup quotes (the two types clients can have).
// Box / PP / Import quotes are admin-internal and intentionally excluded
// from the client-facing aggregator. The same helper, called for an
// admin session with an explicit `clientEmail`, returns the same shape so
// the admin view can pivot to any client.

import { dbSelect } from "@/lib/db/supabase";

const CLIENT_FACING_TYPES = ["bag", "cup"];

// Build a single, type-aware row for the unified history table. Each type
// puts its identifying detail in `payload` under a slightly different key
// shape; we flatten the most useful fields here so the UI renders without
// branching per type.
function rowToHistoryEntry(row) {
  const p = row.payload || {};
  const type = row.quote_type;

  // Resolve a human-friendly product label per type.
  const productLabel = (() => {
    if (type === "bag") {
      const bagType = p.bag_type || "";
      const dims = [p.width_mm, p.gusset_mm, p.height_mm].filter(Boolean).join(" × ");
      return [bagType, dims && `${dims} mm`].filter(Boolean).join(" · ") || "Paper bag";
    }
    if (type === "cup") {
      const wall = p.wall_type || "";
      const size = p.size || "";
      return [size, wall].filter(Boolean).join(" · ") || "Paper cup";
    }
    return p.item || "Quote";
  })();

  // Spec line — surface the most relevant material details per type.
  const specLine = (() => {
    if (type === "bag") {
      return [p.gsm && `${p.gsm} GSM`, p.bf && `${p.bf} BF`, p.paper_type, p.mill]
        .filter(Boolean).join(" · ");
    }
    if (type === "cup") {
      const inner = p.inner || {};
      const outer = p.outer || {};
      return [
        inner.gsm && `Inner ${inner.gsm} GSM ${inner.coating || ""}`.trim(),
        outer.gsm && `Outer ${outer.gsm} GSM ${outer.coating || ""}`.trim(),
      ].filter(Boolean).join(" · ");
    }
    return "";
  })();

  return {
    id: row.id,
    type,
    quoteRef: row.quote_ref || "",
    date: row.quote_date || row.created_at || "",
    brand: p.brand || "",
    productLabel,
    specLine,
    plainPrinted: p.plain_printed || (p.inner?.print || p.outer?.print ? "Printed" : ""),
    casePack: p.case_pack ?? null,
    orderQty: row.order_qty ?? null,
    sellingPrice: row.selling_price_inr ?? null,
    orderTotal: row.order_total_inr ?? null,
    clientEmail: row.client_email || "",
    notes: row.notes || "",
  };
}

// Fetch every client-facing quote for one customer email (or for everyone if
// `clientEmail` is empty — admin-only call site). Returns sorted desc by date.
export async function listClientQuoteHistory({ clientEmail = null } = {}) {
  const filter = {
    quote_type: `in.(${CLIENT_FACING_TYPES.join(",")})`,
  };
  if (clientEmail) {
    filter.client_email = `eq.${clientEmail.toLowerCase()}`;
  }
  const rows = await dbSelect("quotes_v2", {
    select:
      "id,quote_type,quote_ref,quote_date,created_at,client_email,order_qty," +
      "selling_price_inr,order_total_inr,notes,payload",
    filter,
    order: "quote_date.desc.nullslast,created_at.desc",
    range: "0-999",
  });
  return rows.map(rowToHistoryEntry);
}
