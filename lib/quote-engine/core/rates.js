// Rate book. Every rate the engine uses is looked up by key so that
//   1. values can come from Supabase (calc_rates) without a code change,
//   2. a saved quote can snapshot exactly which rates priced it,
//   3. the UI can badge anything that is assumed or disputed.

import { DEFAULT_RATES } from "../rates/defaults.js";
import { isNum } from "./num.js";

/**
 * @param {Record<string, number | {value:number,status?:string,source?:string}>} overrides
 *   keyed like the defaults; a bare number is treated as a per-quote override.
 */
export function createRates(overrides = {}) {
  const used = new Map();

  function entry(key) {
    const o = overrides[key];
    if (isNum(o)) return { value: o, status: "override", source: "set for this quote" };
    if (o && isNum(o.value)) return { status: "confirmed", ...o };
    const d = DEFAULT_RATES[key];
    if (!d) throw new Error(`quote-engine: unknown rate "${key}"`);
    return d;
  }

  return {
    /** Numeric value of a rate; records that it was used. */
    get(key) {
      const e = entry(key);
      used.set(key, e);
      return e.value;
    },
    /** A per-quote value from the spec wins over the rate book. */
    pick(specValue, key) {
      if (isNum(specValue)) {
        used.set(key, { value: specValue, status: "override", source: "set for this quote" });
        return specValue;
      }
      return this.get(key);
    },
    status(key) {
      return entry(key).status;
    },
    /** Snapshot of every rate touched, for saving with the quote. */
    used() {
      return [...used.entries()].map(([key, e]) => ({
        key,
        value: e.value,
        unit: e.unit ?? DEFAULT_RATES[key]?.unit ?? null,
        status: e.status ?? "confirmed",
        source: e.source ?? null,
      }));
    },
  };
}
