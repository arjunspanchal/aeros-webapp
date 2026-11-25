// Turning a priced spec into the rows we save. Pure (no database, no clock of
// its own), so the rules about price basis, dates and references can be tested.

// Anything from the request that should be text is forced to text: an object must never reach a cell or a key.
const text = (v) => (typeof v === "string" ? v : v === undefined || v === null || typeof v === "object" ? "" : String(v));
const slug = (s) => text(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/** India date and time for a quote, whatever timezone the server runs in. */
export function indiaStamp(now = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
      .formatToParts(now).map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === "24" ? "00" : p.hour}${p.minute}${p.second}` };
}

/** Rates flagged on every quote of a family; they say nothing about this quote. */
const BASELINE_FLAGGED = new Set(["bag.glue.gsm", "cup.coat.two_side"]);

function describe(spec, result) {
  const printedColours = (on) => (on ? Math.max(1, spec.print?.colours ?? 1) : 0);
  if (spec.family === "bag") {
    const { W, G, H } = result.size;
    const colour = slug(spec.paper?.colour || "kraft");
    return {
      // print coverage and route are part of what the item is: a logo bag and a full-patch bag are two options
      itemKey: `${spec.type}-bag-${W}x${G}x${H}-${spec.gsm}gsm-${colour}${spec.print?.slab && spec.print.slab !== "none" ? `-${slug(spec.print.slab)}` : ""}${result.route === "handmade" ? "-handmade" : result.route === "vendor" ? "-vendor" : ""}`,
      dims: `${W}x${G}x${H}`,
      material: `${spec.gsm}GSM-${colour.toUpperCase()}-KRAFT`,
      colours: printedColours(spec.print?.slab && spec.print.slab !== "none"),
    };
  }
  if (spec.family === "cup") {
    return {
      itemKey: `${slug(spec.wall)}-${slug(spec.size)}-${spec.gsm ?? 280}gsm${spec.print?.mode && spec.print.mode !== "none" ? `-${slug(spec.print.mode)}` : ""}`,
      dims: null,
      material: `${spec.gsm ?? 280}GSM`,
      colours: printedColours(spec.print?.mode && spec.print.mode !== "none"),
    };
  }
  const sh = result.geometry?.sheet;
  return {
    itemKey: `box-${slug(spec.name || "custom")}${spec.size ? `-${slug(spec.size)}` : ""}-${slug(spec.board?.label || "board")}-${spec.board?.gsm}gsm${sh ? `-${Math.round(sh.w)}x${Math.round(sh.h)}-${result.geometry.ups}up` : ""}`,
    dims: sh ? `${Math.round(sh.w)}x${Math.round(sh.h)}-sheet-${result.geometry.ups}up` : null,
    material: `${slug(spec.board?.label || "board")}-${spec.board?.gsm}`,
    colours: spec.print?.mode === "ink_flat" ? 4 : printedColours(spec.print?.mode && spec.print.mode !== "none"),
  };
}

/**
 * The price a saved quote carries, and its basis.
 *   bags  — FOB is ex-factory sell + port charges, so an export bag saves the FOB figure;
 *   cups  — port charges are inside the cost, so `sell` already IS the FOB price.
 * Either way, a quote with an export block is FOB and one without is ex-factory.
 */
export function quotedPrice(spec, result) {
  if (!result.export) return { rate: result.sell, basis: "EXW_BHIWANDI" };
  return { rate: spec.family === "bag" ? result.export.fob : result.sell, basis: "FOB" };
}

/** One reference for a whole quote, however many lines it has. */
export function newQuoteRef(customer, now = new Date()) {
  const { date, time } = indiaStamp(now);
  return `CALC-${date.replace(/-/g, "")}-${(slug(customer) || "internal").toUpperCase()}-${time}`;
}

/**
 * @param lineNo  position in a multi-line quote (1-based); every line shares quoteRef
 * @param ref     the customer's own name for the line, kept for the reply to their RFQ
 */
export function buildRecords({ spec, result, customer, customerSlug = null, clientId = null, brand, notes, by, now = new Date(), engineVersion, quoteRef: givenRef, lineNo = 1, ref = "" }) {
  const d = describe(spec, result);
  const { date } = indiaStamp(now);
  const quoteRef = givenRef ?? newQuoteRef(customer, now);
  const qty = result.qty ?? spec.qty ?? null;
  const { rate, basis } = quotedPrice(spec, result);
  const flagged = result.ratesUsed.some((u) => (u.status === "assumed" || u.status === "disputed") && !BASELINE_FLAGGED.has(u.key));
  const caution = result.warnings.some((w) => w.level === "warn");

  const quote = {
    quote_type: spec.family,
    quote_ref: quoteRef,
    quote_date: date,
    generated_by: by,
    notes: notes || null,
    mfg_cost_inr: Number(result.cost.toFixed(4)),
    selling_price_inr: round2(rate),
    order_qty: qty,
    order_total_inr: qty ? round2(round2(rate) * qty) : null,
    margin_pct: result.marginPct,
    payload: {
      engine: "v2",
      engine_version: engineVersion,
      item: result.title,
      brand: brand || customer || "",
      customer: customer || "",
      client_id: clientId,
      customer_ref: ref || "",
      line_no: lineNo,
      price_basis: basis,
      spec,
      result: {
        title: result.title, route: result.route, cost: result.cost, sell: result.sell, margin_mode: result.marginMode,
        lines: result.lines, one_time: result.oneTime, ladder: result.ladder, packing: result.packing,
        export: result.export, warnings: result.warnings,
      },
      rates_used: result.ratesUsed,
    },
  };

  const line = customer
    ? {
        quote_ref: quoteRef, quote_date: date, line_no: String(lineNo), source: "calculator", is_current: true,
        customer, customer_id: customerSlug, brand: brand || null,
        item_key: d.itemKey, item_name: result.title, print_colours: d.colours,
        material_key: d.material, dims_key: d.dims,
        price_basis: basis, currency: "INR",
        qty, rate: round2(rate), uom: "pc", cost: Number(result.cost.toFixed(4)), margin_pct: result.marginPct,
        plate_charge: result.oneTime?.find((o) => o.key === "plates")?.value ?? null,
        moq: result.moq ?? null, status: "quoted",
        confidence: flagged || caution ? "low" : "high",
        notes: `Calculator v2. Margin is ${result.marginPct}% ${result.marginMode === "on_sell" ? "of the selling price" : "markup on cost"}. WORKING COSTING, not yet sent. quotes_v2 ${quoteRef}.${ref ? ` Customer ref: ${ref}.` : ""}`,
      }
    : null;

  return { quoteRef, quote, line, key: line ? [line.item_key, line.print_colours, line.price_basis, line.qty].join("|") : null };
}
