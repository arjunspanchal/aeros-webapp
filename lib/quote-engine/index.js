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

export function price(spec, rateOverrides = {}) {
  const fn = FAMILIES[spec?.family];
  if (!fn) return { ok: false, errors: [`Unknown product family "${spec?.family}".`] };
  const result = fn(spec, createRates(rateOverrides));
  return { engineVersion: ENGINE_VERSION, ...result };
}

export { FAMILY_MARGIN_MODE, MARGIN_MODES, applyMargin, marginFor } from "./core/pricing.js";
export { DEFAULT_RATES } from "./rates/defaults.js";
