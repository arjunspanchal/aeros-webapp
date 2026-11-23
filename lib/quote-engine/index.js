// Aeros quote engine: pure pricing, no React, no network. One entry point.
//
//   price({ family: "bag", ... }, rateOverrides) → result
//
// `rateOverrides` is the calc_rates table from Supabase (key → value/status/source),
// merged over rates/defaults.js. The result carries `ratesUsed`, so a saved
// quote can be reproduced exactly.

import { createRates } from "./core/rates.js";
import { priceBag } from "./families/bag.js";
import { priceCup } from "./families/cup.js";
import { priceBox } from "./families/box.js";

export const ENGINE_VERSION = "2.0.0";

const FAMILIES = {
  bag: priceBag,
  cup: priceCup,
  box: priceBox,
};

/** Label of the first number in a result that is not a real, finite number. */
function firstBadNumber(result) {
  const bad = (v) => typeof v !== "number" || !Number.isFinite(v);
  for (const l of result.lines ?? []) if (bad(l.value)) return l.label;
  if (bad(result.cost)) return "cost";
  if (bad(result.sell)) return "selling price";
  for (const row of result.ladder ?? []) if (bad(row.sell)) return `the ${row.qty} quantity row`;
  return null;
}

export function price(spec, rateOverrides = {}) {
  const fn = FAMILIES[spec?.family];
  if (!fn) return { ok: false, errors: [`Unknown product family "${spec?.family}".`] };
  let result;
  try {
    result = fn(spec, createRates(rateOverrides));
  } catch (e) {
    return { engineVersion: ENGINE_VERSION, ok: false, family: spec.family, errors: [`This spec could not be priced: ${e.message}`] };
  }
  // Safety net: a price is either a real number or an error, never NaN or
  // Infinity. The family validators should catch bad input first; this
  // catches whatever they miss (a zero in the rate book, for example).
  if (result.lines) {
    const bad = firstBadNumber(result);
    if (bad) {
      return {
        engineVersion: ENGINE_VERSION, ok: false, family: spec.family, title: result.title,
        errors: [`This spec does not give a valid number for ${bad}. Check the quantity, case pack and the rate book.`],
        warnings: result.warnings ?? [],
      };
    }
  }
  return { engineVersion: ENGINE_VERSION, ...result };
}

export { FAMILY_MARGIN_MODE, MARGIN_MODES, applyMargin, marginFor } from "./core/pricing.js";
export { DEFAULT_RATES } from "./rates/defaults.js";
