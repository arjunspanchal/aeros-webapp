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

// Numbers that count things: whole, and at least 1.
const WHOLE = new Set(["qty", "colours", "ups", "casePack", "unitsPerContainer", "sides", "per"]);
// The only numbers allowed below zero: a margin (selling under cost is a
// decision, and is warned about) and an extra line used as a credit.
const MAY_BE_NEGATIVE = new Set(["marginPct", "perBag", "perPc"]);
const words = (k) => String(k).replace(/([A-Z])/g, " $1").replace(/_/g, " ").toLowerCase();

/** Every number in a spec is checked before pricing: a rate, a size or a count is never negative, absurd or fractional where it counts things. */
function checkNumbers(node, path, errors) {
  if (errors.length >= 3 || node === null || node === undefined) return;
  if (typeof node === "number") {
    const key = path[path.length - 1];
    const name = path.filter((k) => typeof k === "string").map(words).join(" ") || "a number";
    if (!Number.isFinite(node)) errors.push(`Check ${name}: it is not a number.`);
    else if (node < 0 && !MAY_BE_NEGATIVE.has(key)) errors.push(`Check ${name}: ${node} is below zero.`);
    else if (Math.abs(node) > 1e8) errors.push(`Check ${name}: ${node} is far too large.`);
    else if (WHOLE.has(key) && (!Number.isInteger(node) || node < 1)) errors.push(`Check ${name}: it must be a whole number, 1 or more.`);
    else if (key === "fx" && node < 1) errors.push("The exchange rate must be 1 or more.");
    return;
  }
  if (Array.isArray(node)) node.forEach((v, i) => checkNumbers(v, [...path, i], errors));
  else if (typeof node === "object") for (const [k, v] of Object.entries(node)) checkNumbers(v, [...path, k], errors);
}

export function price(spec, rateOverrides = {}) {
  const fn = FAMILIES[spec?.family];
  if (!fn) return { ok: false, errors: [`Unknown product family "${spec?.family}".`] };
  const numberErrors = [];
  checkNumbers(spec, [], numberErrors);
  if (numberErrors.length) return { engineVersion: ENGINE_VERSION, ok: false, family: spec.family, errors: numberErrors };
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
  if (result.lines) {
    // A price at or below zero is an input mistake, never a quote.
    if (!(result.cost > 0) || !(result.sell > 0)) {
      return {
        engineVersion: ENGINE_VERSION, ok: false, family: spec.family, title: result.title,
        errors: ["The price comes out at zero or below. Check the rates and the margin entered."],
        warnings: result.warnings ?? [],
      };
    }
    const m = result.marginPct;
    const high = result.marginMode === "on_sell" ? 60 : 150;
    result.warnings = result.warnings ?? [];
    if (m < 0) result.warnings.push({ level: "warn", code: "below_cost", message: `A margin of ${m}% sells this below cost.` });
    else if (m > high) result.warnings.push({ level: "warn", code: "margin_high", message: `A margin of ${m}% is unusually high. Check it.` });
  }
  return { engineVersion: ENGINE_VERSION, ...result };
}

export { FAMILY_MARGIN_MODE, MARGIN_MODES, applyMargin, marginFor } from "./core/pricing.js";
export { DEFAULT_RATES } from "./rates/defaults.js";
