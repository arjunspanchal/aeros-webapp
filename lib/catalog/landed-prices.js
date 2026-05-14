// Public-catalog landed price computation.
//
// Surfaces two indicative numbers per product so the catalogue card can show:
//   • Landed in India (INR) — what an Indian buyer pays per piece. Pulls
//     straight from `pricePerUnit` (already the rate-card price, includes
//     our margin).
//   • Landed in USA (USD) — all-in delivered cost per piece for a US buyer,
//     including DHL Express air freight and US import duty. Reuses the
//     Express Ship calculator (lib/factoryos/express-ship-calc.js) with a
//     fixed set of defaults so the catalogue page doesn't have to model
//     freight + duty itself.
//
// The defaults below are deliberately conservative for a public surface.
// When a buyer actually requests a quote the rep can dial them in via the
// /calculator/express-ship calculator (same code path, editable inputs).
//
// Returns { landedInr, landedUsd, available, ... } where `available` is
// false when the calc couldn't run (missing carton dims, no gross weight,
// no pricePerUnit). The card falls back to "Price on request" in that case.

import {
  DEFAULTS as EXP_DEFAULTS,
  defaultHtsusForCategory,
  calcExpressShip,
} from "../factoryos/express-ship-calc.js";

// Catalog-front defaults. Picked so the number that shows up at the top of
// /catalog/[id] approximates what the buyer would see on /calculator/
// express-ship with the standard "small DHL Express air, FOB Mumbai" inputs.
// Tweak here if DHL rates or fuel surcharges move significantly.
const CATALOG_DEFAULTS = {
  fxRate: 83.5,         // ₹/USD
  dhlRate: 7,           // USD per kg, all-in commercial rate
  dhlRateCurrency: "USD",
  dhlRateUnit: "perKg",
  fuelPct: 18,          // typical DHL Express fuel surcharge
  marginPct: 0,         // landed cost, not selling — buyer-facing number
  section122Mode: "auto",
};

function fmtInr(value) {
  if (value == null || !Number.isFinite(value)) return null;
  // Indian numbering with two decimals — matches how the rate cards print.
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

function fmtUsd(value) {
  if (value == null || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function computeLandedPrices(product) {
  if (!product) return { available: false };

  const pricePerUnit = typeof product.pricePerUnit === "number" ? product.pricePerUnit : null;
  if (pricePerUnit == null) {
    return { available: false, reason: "no_price" };
  }

  // INR side is trivial — the rate-card price is what an Indian buyer pays.
  const landedInr = pricePerUnit;

  // USD side. Need carton dims + units_per_case + gross weight for the calc
  // to compute a chargeable weight; without those we degrade to a simple
  // FX conversion with a flat 40% uplift (rough freight + duty allowance)
  // rather than hiding the price entirely.
  let landedUsdPerUnit = null;
  let usdSource = null;
  let usdWarning = null;

  const canRunCalc =
    !!product.cartonDimensions &&
    product.unitsPerCase &&
    product.grossWeightKg;

  if (canRunCalc) {
    const result = calcExpressShip(
      {
        origin: "IN",
        fxRate: CATALOG_DEFAULTS.fxRate,
        dhlRate: CATALOG_DEFAULTS.dhlRate,
        dhlRateCurrency: CATALOG_DEFAULTS.dhlRateCurrency,
        dhlRateUnit: CATALOG_DEFAULTS.dhlRateUnit,
        fuelPct: CATALOG_DEFAULTS.fuelPct,
        marginPct: CATALOG_DEFAULTS.marginPct,
        section122Mode: CATALOG_DEFAULTS.section122Mode,
        htsus: product.htsCodeUs || defaultHtsusForCategory(product.category),
        master: {
          sku: product.sku,
          productName: product.productName,
          category: product.category,
          htsCodeUs: product.htsCodeUs || defaultHtsusForCategory(product.category),
          countryOfOrigin: "India",
          cartonDimensions: product.cartonDimensions,
          unitsPerCase: product.unitsPerCase,
          casesPerPallet: product.casesPerPallet,
          grossWeightKg: product.grossWeightKg,
          itemWeightG: product.itemWeightG,
          heightMm: product.heightMm,
        },
        // Quote a single case so chargeableKg scales sanely; the per-unit
        // breakdown is what we surface.
        qtyMode: "pcs",
        qtyPcs: product.unitsPerCase,
        exFactoryInrPerUnit: pricePerUnit,
      },
      EXP_DEFAULTS,
    );
    if (!result.error && Number.isFinite(result.pricing?.perUnitLandedUsd)) {
      landedUsdPerUnit = result.pricing.perUnitLandedUsd;
      usdSource = "calc";
    } else {
      usdWarning = result.error || "calc_returned_no_value";
    }
  }

  if (landedUsdPerUnit == null) {
    // Fallback: FX-converted price + flat 40% uplift covering freight + duty
    // + handling. Marked `fallback` so the UI can tone-down the number.
    landedUsdPerUnit = (pricePerUnit / CATALOG_DEFAULTS.fxRate) * 1.40;
    usdSource = "fallback";
  }

  return {
    available: true,
    landedInr,
    landedInrFormatted: fmtInr(landedInr),
    landedUsd: landedUsdPerUnit,
    landedUsdFormatted: fmtUsd(landedUsdPerUnit),
    usdSource,                  // "calc" | "fallback"
    usdWarning,
    fxRate: CATALOG_DEFAULTS.fxRate,
  };
}
