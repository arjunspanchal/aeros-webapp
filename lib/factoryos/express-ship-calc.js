// DHL Express landed-cost calculator. Goods move India→USA or China→USA via
// DHL Express, palletised, door-to-door. Pure helpers, no I/O.
//
// Cost model:
//
//   Product cost (qty × ex_factory INR/pc, → USD via FX)
//   + DHL freight (rate × chargeable kg, optionally + fuel %, → USD)
//   + Duty on entered value (FOB-equivalent in USD):
//       · MFN  (HTSUS family → %)
//       · Section 301  (China-origin only, HTSUS family → %)
//       · Section 122  (10% reciprocal — applies if dispatch < sunset)
//   + MPF (0.3464% of entered value, floored at $32.71, capped at $634.62)
//   ─────────────────────────────────────────────
//   = Total Landed Cost (USD)
//   + Margin (markup on landed)
//   ─────────────────────────────────────────────
//   = Total Selling Price (USD)
//
// All percentages are inputs you can override per quote. The HTSUS / 301 /
// 122 / MPF defaults are the calculator's *starting point* — duty regimes
// move, so the UI should always let you see and edit them before saving.

export const ORIGINS = [
  { id: "IN", label: "India",  defaultPostcode: "421302", city: "Bhiwandi" },
  { id: "CN", label: "China",  defaultPostcode: "518000", city: "Shenzhen" },
];

export function getOrigin(id) {
  return ORIGINS.find((o) => o.id === id) || ORIGINS[0];
}

export const DEFAULTS = {
  fxRate: 95,                       // ₹/USD — editable per quote
  marginPct: 30,                    // markup on landed (Aeros default)
  fuelPct: 0,                       // DHL fuel surcharge, optional
  dhlRateCurrency: "INR",           // INR | USD
  dhlRateUnit: "perKg",             // perKg | perShipment
  // Section 122 reciprocal duty. Set to false in the override or wait until
  // dispatch falls past the sunset — whichever comes first.
  section122Pct: 10,
  section122Sunset: "2026-07-24",
  // MPF — Merchandise Processing Fee. Ad valorem with a floor and a ceiling.
  // CBP rates as of 2026. Override constants if CBP re-publishes.
  mpfPct: 0.3464,
  mpfMinUsd: 32.71,
  mpfMaxUsd: 634.62,
  // Pallet geometry. GMA pallet is US default for export pallets.
  palletLengthCm: 121.9,
  palletWidthCm: 101.6,
  palletBaseHeightCm: 14,           // pallet wood deck height
  maxCargoHeightCm: 120,            // double-tier limit; cartons taller than
                                    // 60 cm fall back to a single tier.
  singleTierLayers: 3,              // assume 3 layers when cartons > 60 cm
                                    // (matches container-stuffing rule)
  dimDivisor: 5000,                 // DHL air dim divisor (kg = L×W×H cm / 5000)
  cartonTareKg: 1.5,                // fallback corrugated tare per carton
                                    // when gross_weight_kg is NULL
};

// HTSUS → MFN rate. Keyed off the first 4 digits of `hts_code_us` so a SKU
// with a longer code (e.g. 4823.69.00.40) still resolves. Add entries as we
// classify new categories — but never *guess*: an unknown family surfaces a
// warning instead of silently defaulting to 0.
export const MFN_BY_HTSUS_FAMILY = {
  "4823": 0.00,    // Other converted paper (paper cups, paper lids)
  "4819": 0.00,    // Sacks and bags of paper
  "3924": 0.034,   // Tableware and kitchenware of plastics (PET cups)
  "3923": 0.053,   // Articles for conveyance — incl. plastic closures (PP lids)
};

// Category → suggested HTSUS code. master_products.hts_code_us is currently
// NULL for every row, so the UI seeds this from the SKU's category and the
// user can override before the quote is saved. Update as new categories ship.
export const HTSUS_BY_CATEGORY = {
  "Paper Cups":  "4823.69.00.40",
  "Paper Bags":  "4819.40.00.40",
  "PET Cups":    "3924.10.40.00",
  "Cold Cups":   "3924.10.40.00",
  "PP Cups":     "3924.10.40.00",
  "Lids":        "3923.50.00.00",   // covers PP + PET lids by default
  "Paper Lids":  "4823.69.00.40",
};

export function defaultHtsusForCategory(category) {
  if (!category) return "";
  return HTSUS_BY_CATEGORY[category] || "";
}

// Section 301 List rates (China-origin only). Same family keying as MFN.
// These rates move with policy — flag a warning whenever a 301 row is hit.
export const SECTION_301_BY_HTSUS_FAMILY = {
  "4823": 0.075,   // List 4A — converted paper articles
  "4819": 0.075,   // List 4A — paper bags
  "3924": 0.25,    // List 3 — plastic tableware
  "3923": 0.25,    // List 3 — plastic closures
};

// DHL Express transit-day estimates, door-to-door, business days. Keyed off
// the first digit of the US destination ZIP. China runs a day faster than
// India on average. These are eyeball figures — always confirm with DHL.
const TRANSIT_BY_ORIGIN = {
  IN: {
    coast: { east: 5, central: 4, west: 3 },
    label: "DHL Express India → US (Bhiwandi origin)",
  },
  CN: {
    coast: { east: 4, central: 3, west: 2 },
    label: "DHL Express China → US (Shenzhen origin)",
  },
};

// Map ZIP-1st-digit → coast bucket. Loose, good enough for transit estimates.
function zipToCoast(zip) {
  const d = String(zip || "").trim().charAt(0);
  if (d === "9") return "west";
  if (d === "5" || d === "6" || d === "7" || d === "8") return "central";
  if (d === "0" || d === "1" || d === "2" || d === "3" || d === "4") return "east";
  return null;
}

// ----- helpers --------------------------------------------------------------

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const toIsoDate = (d) => {
  if (!d) return null;
  if (typeof d === "string") return d.slice(0, 10);
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return null;
};

function addBusinessDays(iso, days) {
  const d = new Date(iso + "T00:00:00Z");
  let added = 0;
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) added += 1;
  }
  return d.toISOString().slice(0, 10);
}

// Parse `master_products.carton_dimensions` ("415 × 330 × 390" mm) → cm.
// Accepts ×, x, *, and stray whitespace. Returns null on unparseable input
// so the caller can surface the right warning.
export function parseCartonDims(text) {
  if (!text || typeof text !== "string") return null;
  const parts = text
    .replace(/[×x*]/gi, "|")
    .split("|")
    .map((p) => Number(p.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (parts.length < 3) return null;
  const [L, W, H] = parts;
  return { L_cm: L / 10, W_cm: W / 10, H_cm: H / 10 };
}

// Try both carton orientations on the pallet footprint; take the better one.
export function palletMath(carton, opts = DEFAULTS) {
  const { L_cm: L, W_cm: W, H_cm: H } = carton;
  const PL = opts.palletLengthCm;
  const PW = opts.palletWidthCm;
  const a = Math.floor(PL / L) * Math.floor(PW / W);
  const b = Math.floor(PL / W) * Math.floor(PW / L);
  const perLayer = Math.max(a, b, 0);
  let layersPerPallet;
  let singleTier = false;
  if (H <= 60) {
    layersPerPallet = Math.max(1, Math.floor(opts.maxCargoHeightCm / H));
  } else {
    layersPerPallet = opts.singleTierLayers;
    singleTier = true;
  }
  const cartonsPerPallet = perLayer * layersPerPallet;
  const totalHeightCm = opts.palletBaseHeightCm + H * layersPerPallet;
  return {
    perLayer,
    layersPerPallet,
    cartonsPerPallet,
    singleTier,
    palletFootprintCm: { L: PL, W: PW },
    palletTotalHeightCm: totalHeightCm,
  };
}

// ----- shipment specs -------------------------------------------------------

// Compute cartons / pallets / weights / CBM. The caller decides whether qty
// drives pallets ("pcs" mode) or pallets drive qty ("palletised" mode).
export function shipmentSpecs(input, opts = DEFAULTS) {
  const warnings = [];
  const master = input.master || {};
  const unitsPerCase = num(master.unitsPerCase);
  const grossWeightKg = master.grossWeightKg != null ? num(master.grossWeightKg) : null;
  const itemWeightG = master.itemWeightG != null ? num(master.itemWeightG) : null;

  if (!unitsPerCase) {
    return { error: "Master record missing units_per_case — cannot compute cartons." };
  }

  const carton = parseCartonDims(master.cartonDimensions);
  if (!carton) {
    return { error: "Master record missing carton_dimensions — please confirm L × W × H in mm." };
  }

  const pm = palletMath(carton, opts);
  if (pm.singleTier) {
    warnings.push(
      `Carton height ${carton.H_cm.toFixed(1)} cm exceeds 60 cm — using single-tier ${opts.singleTierLayers} layers.`,
    );
  }
  if (pm.cartonsPerPallet <= 0) {
    return { error: "Carton does not fit on a GMA pallet — check dimensions." };
  }

  // Quantity resolution. "pcs" → user gives qty, we round cartons up.
  // "palletised" → user gives pallets, we back-compute pcs.
  let qtyPcs;
  let cartons;
  let pallets;
  let derivedFromPallets = false;
  if (input.qtyMode === "palletised") {
    pallets = Math.max(1, Math.ceil(num(input.palletsRequested) || 1));
    cartons = pallets * pm.cartonsPerPallet;
    qtyPcs = cartons * unitsPerCase;
    derivedFromPallets = true;
  } else {
    qtyPcs = Math.max(0, num(input.qtyPcs));
    if (qtyPcs <= 0) {
      return { error: "Quantity (pieces) must be > 0." };
    }
    cartons = Math.ceil(qtyPcs / unitsPerCase);
    if (cartons === 1 && qtyPcs < unitsPerCase) {
      warnings.push(`Quantity rounded up to one full carton (${unitsPerCase} pcs).`);
    }
    pallets = Math.ceil(cartons / pm.cartonsPerPallet);
  }

  if (pallets > 4) {
    warnings.push(`Shipment exceeds 4 pallets — consider LCL sea instead of Express air.`);
  }

  // Weight.
  let actualWeightKg;
  if (grossWeightKg && grossWeightKg > 0) {
    actualWeightKg = cartons * grossWeightKg;
  } else if (itemWeightG && itemWeightG > 0) {
    actualWeightKg = cartons * (itemWeightG * unitsPerCase / 1000 + opts.cartonTareKg);
    warnings.push(`gross_weight_kg missing — using item_weight_g × ${unitsPerCase} + ${opts.cartonTareKg} kg tare per carton.`);
  } else {
    return { error: "Master record missing both gross_weight_kg and item_weight_g — cannot compute weight." };
  }

  // CBM (cartons-summed) and DHL dim weight (pallet footprint × total height).
  const cartonCBM = (carton.L_cm * carton.W_cm * carton.H_cm) / 1_000_000;
  const cargoCBM = cartons * cartonCBM;

  // Dim weight: DHL bills palletised air on pallet footprint × total height /
  // 5000. Same divisor as the parcel rate.
  const palletDimWeight =
    (pm.palletFootprintCm.L * pm.palletFootprintCm.W * pm.palletTotalHeightCm) / opts.dimDivisor;
  const dimWeightKg = palletDimWeight * pallets;
  const chargeableKg = Math.max(actualWeightKg, dimWeightKg);

  return {
    carton,
    pallet: pm,
    qtyPcs,
    cartons,
    pallets,
    unitsPerCase,
    cartonsPerPallet: pm.cartonsPerPallet,
    derivedFromPallets,
    actualWeightKg,
    dimWeightKg,
    chargeableKg,
    cargoCBM,
    warnings,
  };
}

// ----- duty -----------------------------------------------------------------

export function htsusFamily(code) {
  return String(code || "").replace(/[^0-9]/g, "").slice(0, 4);
}

export function dutyStack(input, opts = DEFAULTS) {
  const warnings = [];
  const origin = (input.origin || "IN").toUpperCase();
  const htsus = String(input.htsus || "").trim();
  const family = htsusFamily(htsus);
  const dispatchIso = toIsoDate(input.dispatchDate);
  const enteredValueUsd = Math.max(0, num(input.enteredValueUsd));

  // MFN — explicit override wins.
  let mfnPct;
  if (input.mfnPctOverride != null && input.mfnPctOverride !== "") {
    mfnPct = num(input.mfnPctOverride) / 100;
  } else if (family in MFN_BY_HTSUS_FAMILY) {
    mfnPct = MFN_BY_HTSUS_FAMILY[family];
  } else {
    mfnPct = 0;
    warnings.push(`HTSUS family ${family || "?"} not in MFN table — confirm rate before quoting.`);
  }

  // Section 301 — China-origin only.
  let section301Pct = 0;
  if (origin === "CN") {
    if (input.section301PctOverride != null && input.section301PctOverride !== "") {
      section301Pct = num(input.section301PctOverride) / 100;
    } else if (family in SECTION_301_BY_HTSUS_FAMILY) {
      section301Pct = SECTION_301_BY_HTSUS_FAMILY[family];
      warnings.push(`Section 301 (China) applied at ${(section301Pct * 100).toFixed(1)}% — verify list assignment is current.`);
    } else {
      warnings.push(`HTSUS family ${family || "?"} has no Section 301 default — set rate manually if applicable.`);
    }
  }

  // Section 122 — applies pre-sunset by default. UI can force on/off.
  let section122Applied;
  if (input.section122Mode === "on") {
    section122Applied = true;
  } else if (input.section122Mode === "off") {
    section122Applied = false;
  } else {
    section122Applied = dispatchIso && dispatchIso < opts.section122Sunset;
  }
  const section122Pct = section122Applied ? opts.section122Pct / 100 : 0;
  if (dispatchIso && dispatchIso >= opts.section122Sunset) {
    warnings.push(`Dispatch date is on or after Section 122 sunset (${opts.section122Sunset}) — verify current duty regime.`);
  }

  const mfnUsd = enteredValueUsd * mfnPct;
  const s301Usd = enteredValueUsd * section301Pct;
  const s122Usd = enteredValueUsd * section122Pct;

  // MPF.
  let mpfUsd = enteredValueUsd * (opts.mpfPct / 100);
  let mpfFloored = false;
  let mpfCapped = false;
  if (mpfUsd < opts.mpfMinUsd) { mpfUsd = opts.mpfMinUsd; mpfFloored = true; }
  if (mpfUsd > opts.mpfMaxUsd) { mpfUsd = opts.mpfMaxUsd; mpfCapped = true; }

  const dutyUsd = mfnUsd + s301Usd + s122Usd;

  return {
    origin,
    htsus,
    htsusFamily: family,
    mfnPct,
    section301Pct,
    section122Applied,
    section122Pct,
    enteredValueUsd,
    mfnUsd,
    s301Usd,
    s122Usd,
    dutyUsd,
    mpfUsd,
    mpfFloored,
    mpfCapped,
    warnings,
  };
}

// ----- transit --------------------------------------------------------------

export function estimateTransit(input, opts = DEFAULTS) {
  const origin = (input.origin || "IN").toUpperCase();
  const dispatch = toIsoDate(input.dispatchDate);
  const table = TRANSIT_BY_ORIGIN[origin] || TRANSIT_BY_ORIGIN.IN;
  const coast = zipToCoast(input.destinationZip);
  const days = coast ? table.coast[coast] : null;
  const deliveryDate = dispatch && days ? addBusinessDays(dispatch, days) : null;
  return {
    origin,
    dispatchDate: dispatch,
    destinationZip: String(input.destinationZip || ""),
    coast,
    days,
    deliveryDate,
    label: table.label,
  };
}

// ----- main -----------------------------------------------------------------

// Input shape (everything optional unless noted):
//   {
//     origin: "IN" | "CN",
//     originPostcode: string,
//     destinationZip: string,
//     dispatchDate: ISO date,
//     fxRate: number (₹/USD),
//
//     // DHL rate
//     dhlRate: number,
//     dhlRateCurrency: "INR" | "USD",
//     dhlRateUnit: "perKg" | "perShipment",
//     fuelPct: number,
//
//     // Product master (resolved by caller from master_products)
//     master: {
//       sku, productName, category, htsCodeUs, countryOfOrigin,
//       cartonDimensions, unitsPerCase, casesPerPallet,
//       grossWeightKg, itemWeightG, heightMm,
//     },
//
//     // Quantity
//     qtyMode: "pcs" | "palletised",
//     qtyPcs: number,
//     palletsRequested: number,
//
//     // Pricing
//     exFactoryInrPerUnit: number,
//     marginPct: number,
//
//     // Duty overrides
//     htsus: string (defaults to master.htsCodeUs),
//     mfnPctOverride: number,
//     section301PctOverride: number,
//     section122Mode: "auto" | "on" | "off",
//   }
export function calcExpressShip(input, opts = DEFAULTS) {
  const warnings = [];
  const fxRate = num(input.fxRate) || opts.fxRate;
  const origin = (input.origin || "IN").toUpperCase();

  // 1) Shipment specs.
  const specs = shipmentSpecs(input, opts);
  if (specs.error) return { error: specs.error, warnings };
  warnings.push(...(specs.warnings || []));

  // 2) Product cost.
  const exFactoryInrPerUnit = num(input.exFactoryInrPerUnit);
  const productInr = exFactoryInrPerUnit * specs.qtyPcs;
  const productUsd = productInr / fxRate;

  // 3) Freight.
  const rate = num(input.dhlRate);
  const rateCurrency = input.dhlRateCurrency || opts.dhlRateCurrency;
  const rateUnit = input.dhlRateUnit || opts.dhlRateUnit;
  const fuelPct = num(input.fuelPct);

  let freightBaseInr;
  if (rateUnit === "perShipment") {
    freightBaseInr = rateCurrency === "USD" ? rate * fxRate : rate;
  } else {
    const ratePerKgInr = rateCurrency === "USD" ? rate * fxRate : rate;
    freightBaseInr = ratePerKgInr * specs.chargeableKg;
  }
  const fuelInr = freightBaseInr * (fuelPct / 100);
  const freightInr = freightBaseInr + fuelInr;
  const freightUsd = freightInr / fxRate;

  // 4) Duty. Entered value = product cost USD (FOB-equivalent).
  const duty = dutyStack(
    {
      origin,
      htsus: input.htsus || input.master?.htsCodeUs,
      dispatchDate: input.dispatchDate,
      enteredValueUsd: productUsd,
      mfnPctOverride: input.mfnPctOverride,
      section301PctOverride: input.section301PctOverride,
      section122Mode: input.section122Mode,
    },
    opts,
  );
  warnings.push(...(duty.warnings || []));

  // 5) Total landed.
  const dutyUsd = duty.dutyUsd;
  const mpfUsd = duty.mpfUsd;
  const totalLandedUsd = productUsd + freightUsd + dutyUsd + mpfUsd;

  // 6) Margin (markup).
  const marginPct = input.marginPct != null && input.marginPct !== "" ? num(input.marginPct) : opts.marginPct;
  const marginUsd = totalLandedUsd * (marginPct / 100);
  const totalSellingUsd = totalLandedUsd + marginUsd;

  // 7) Per-unit.
  const qty = specs.qtyPcs;
  const perUnitLandedUsd = qty > 0 ? totalLandedUsd / qty : 0;
  const perUnitSellingUsd = qty > 0 ? totalSellingUsd / qty : 0;

  // 8) Transit.
  const transit = estimateTransit(input, opts);

  return {
    origin,
    fxRate,
    shipmentSpecs: {
      cartons: specs.cartons,
      pallets: specs.pallets,
      qtyPcs: specs.qtyPcs,
      unitsPerCase: specs.unitsPerCase,
      cartonsPerPallet: specs.cartonsPerPallet,
      derivedFromPallets: specs.derivedFromPallets,
      cartonDimsCm: specs.carton,
      perLayer: specs.pallet.perLayer,
      layersPerPallet: specs.pallet.layersPerPallet,
      palletFootprintCm: specs.pallet.palletFootprintCm,
      palletTotalHeightCm: specs.pallet.palletTotalHeightCm,
      actualWeightKg: specs.actualWeightKg,
      dimWeightKg: specs.dimWeightKg,
      chargeableKg: specs.chargeableKg,
      cargoCBM: specs.cargoCBM,
    },
    freight: {
      rateInput: rate,
      rateCurrency,
      rateUnit,
      fuelPct,
      freightBaseInr,
      fuelInr,
      freightInr,
      freightUsd,
      billedOnKg: rateUnit === "perKg" ? specs.chargeableKg : null,
    },
    duty,
    transit,
    pricing: {
      productInr,
      productUsd,
      freightInr,
      freightUsd,
      dutyUsd,
      mpfUsd,
      totalLandedUsd,
      totalLandedInr: totalLandedUsd * fxRate,
      marginPct,
      marginUsd,
      totalSellingUsd,
      totalSellingInr: totalSellingUsd * fxRate,
      perUnitLandedUsd,
      perUnitLandedInr: perUnitLandedUsd * fxRate,
      perUnitSellingUsd,
      perUnitSellingInr: perUnitSellingUsd * fxRate,
      qty,
    },
    warnings,
  };
}
