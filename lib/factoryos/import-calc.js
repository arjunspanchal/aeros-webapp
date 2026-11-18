// China → India landed-cost calculator. Pure helpers, no I/O.
//
// Model mirrors the cost components Aeros uses on quotation sheets
// (Thee Packaging-style breakdown):
//
//   FOB (per line, in chosen FX currency)
//   + Ocean Freight (shipment-wide, allocated to each line)
//   ─────────────────────────────────────────────
//   = CIF (assessable value)
//   + Import Duty + GST (single combined % of CIF, default 38%)
//   + Inland Transport (port → destination)
//   + Unofficial Clearance
//   + Handling + Storage + Cargo
//   ─────────────────────────────────────────────
//   = Total Landed Cost (Ex-GST)
//   + Margin
//   ─────────────────────────────────────────────
//   = Selling Price (Ex-GST)
//   + Output GST (default 18%)
//   = Final Selling Price (Incl. GST)
//
// Insurance is rolled into freight (the source quotation does not break it
// out separately). If you ever need to split it, add a new row — the math
// is identical to freight.
//
// ---------------------------------------------------------------------------
// Allocating shipment-wide costs
// ---------------------------------------------------------------------------
// Ocean freight is bought by VOLUME (or chargeable weight), never by value, so
// splitting it by FOB share silently cross-subsidises: on a cup + lid shipment
// the lid is cheap but bulky, so a value split hands the cup the lid's freight
// and makes the lid look cheaper than it can ever be sold for.
//
// Each item therefore carries its outer-carton spec, and shipment costs are
// allocated on a chosen basis — CBM, gross weight, chargeable W/M, or (the old
// behaviour) FOB value. Carton dims are in CENTIMETRES, because that is how
// Chinese vendor spec sheets read.
//
// CBM per carton is always computed from the geometry (L × W × H ÷ 1e6). A
// vendor's own stated CBM is accepted as a cross-check and flagged when the two
// disagree by more than CBM_TOLERANCE_PCT — understated CBM is common and it is
// the buyer who pays for it at the forwarder's tape measure.

export const CURRENCIES = [
  { id: "USD", label: "USD ($)", symbol: "$", defaultRate: 88 },
  { id: "CNY", label: "CNY (¥)", symbol: "¥", defaultRate: 12.2 },
  { id: "INR", label: "INR (₹)", symbol: "₹", defaultRate: 1 },
];

// Capacities are loose planning ceilings — usable CBM, not nameplate. Match the
// values used on the Container Stuffing tool so quotes line up. LCL has no
// hard cap; ocean lines bill by chargeable W/M (greater of CBM or metric tons).
export const SHIPMENT_TYPES = [
  { id: "lcl",     label: "LCL",      capCBM: null, capKg: null,  capLabel: "billed by chargeable W/M (greater of CBM or metric tons)" },
  { id: "20ft",    label: "20ft FCL", capCBM: 28,   capKg: 28000, capLabel: "~28 usable CBM · ~28 t payload" },
  { id: "40ft",    label: "40ft FCL", capCBM: 58,   capKg: 28000, capLabel: "~58 usable CBM · ~28 t payload" },
  { id: "40ft_hc", label: "40ft HC",  capCBM: 68,   capKg: 28000, capLabel: "~68 usable CBM · ~28 t payload" },
];

// How a shipment-wide cost is split across lines.
export const ALLOC_BASES = [
  { id: "cbm",        label: "CBM",            hint: "Split by each line's volume. The honest default for ocean freight." },
  { id: "weight",     label: "Gross weight",   hint: "Split by each line's gross kg. Use for dense cargo billed on weight." },
  { id: "chargeable", label: "Chargeable W/M", hint: "Ocean W/M — whichever of total CBM or total metric tons is greater wins, then split on that." },
  { id: "fob",        label: "FOB value",      hint: "Split by value. Only right for value-driven costs (insurance, some agent fees)." },
];

// A stated-vs-geometry CBM gap above this (%) is worth flagging.
export const CBM_TOLERANCE_PCT = 2;

export function getShipmentType(id) {
  return SHIPMENT_TYPES.find((s) => s.id === id) || SHIPMENT_TYPES[0];
}

export function getCurrency(id) {
  return CURRENCIES.find((c) => c.id === id) || CURRENCIES[0];
}

export function getAllocBasis(id) {
  return ALLOC_BASES.find((b) => b.id === id) || ALLOC_BASES[0];
}

// Default rates / percentages reflect the worked example shared by the team
// (CCD comparison sheet). Override per-shipment as needed.
export const DEFAULTS = {
  fxRate: 95,                 // ₹ per USD
  dutyPct: 38,                // BCD + SWS + IGST as a single combined %
  marginPct: 5,
  outputGstPct: 18,
  allocBasis: "cbm",          // ocean freight is volume-driven, not value-driven
};

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ---------------------------------------------------------------------------
// Carton geometry
// ---------------------------------------------------------------------------

// Per-carton volume from outer dims in CM → m³. Returns 0 unless all three are
// present, so a half-filled spec never yields a confident-looking number.
export function cbmFromCm(l, w, h) {
  const L = num(l), W = num(w), H = num(h);
  if (L <= 0 || W <= 0 || H <= 0) return 0;
  return (L * W * H) / 1_000_000;
}

// Resolve one item's carton spec into the volume / weight figures the
// allocator needs. Pure — safe to call from render for the inline readout.
export function cartonMetrics(item) {
  const qty = num(item?.qty);
  // `unitsPerCarton` is an alias found in a few early saved payloads; accept it
  // so those quotes light up rather than silently reading as "not measured".
  const pcsPerCtn = num(item?.pcsPerCtn ?? item?.unitsPerCarton);
  const kgPerCtn = num(item?.kgPerCtn);

  const cbmGeom = cbmFromCm(item?.cartonL, item?.cartonW, item?.cartonH);
  const cbmStated = num(item?.cbmPerCtnStated);

  // Geometry is the basis whenever we have it: the forwarder measures cartons,
  // it does not read the vendor's spec sheet.
  const cbmPerCtn = cbmGeom > 0 ? cbmGeom : cbmStated;
  const cbmBasis = cbmGeom > 0 ? "geometry" : cbmStated > 0 ? "stated" : null;

  // Cross-check, only meaningful when both figures exist.
  const variancePct =
    cbmGeom > 0 && cbmStated > 0 ? ((cbmStated - cbmGeom) / cbmGeom) * 100 : null;
  const cbmMismatch = variancePct != null && Math.abs(variancePct) > CBM_TOLERANCE_PCT;

  // You ship whole cartons, so round up — that is what gets measured and billed.
  const cartonsExact = pcsPerCtn > 0 ? qty / pcsPerCtn : 0;
  const cartons = cartonsExact > 0 ? Math.ceil(cartonsExact) : 0;
  const partialCarton = cartons > 0 && Math.abs(cartons - cartonsExact) > 1e-9;

  return {
    qty,
    pcsPerCtn,
    kgPerCtn,
    cbmPerCtnGeom: cbmGeom,
    cbmPerCtnStated: cbmStated,
    cbmPerCtn,
    cbmBasis,
    cbmVariancePct: variancePct,
    cbmMismatch,
    cartonsExact,
    cartons,
    partialCarton,
    cbmTotal: cartons * cbmPerCtn,
    weightTotalKg: cartons * kgPerCtn,
    hasVolume: pcsPerCtn > 0 && cbmPerCtn > 0,
    hasWeight: pcsPerCtn > 0 && kgPerCtn > 0,
  };
}

// ---------------------------------------------------------------------------
// Allocation
// ---------------------------------------------------------------------------

// Pick the per-line weights a basis allocates on, or explain why it can't.
// Anything unusable degrades to FOB value rather than handing a line ₹0 of
// freight in silence — a saved quote from before carton specs existed still
// prices exactly as it did.
function resolveBasis(requested, lines, chargeableWinner) {
  const basis = getAllocBasis(requested).id;
  const active = lines.filter((l) => l.qty > 0);

  const fob = { basis: "fob", requested, weights: lines.map((l) => l.fobTotalINR) };
  if (basis === "fob") return fob;
  if (active.length === 0) return { ...fob, fallback: true, reason: "no quantities entered yet" };

  const effective = basis === "chargeable" ? chargeableWinner : basis;
  const needsWeight = effective === "weight";
  const missing = active.filter((l) => (needsWeight ? !l._m.hasWeight : !l._m.hasVolume));
  if (missing.length > 0) {
    return {
      ...fob,
      fallback: true,
      reason: needsWeight
        ? "missing pcs/carton or kg/carton"
        : "missing carton dimensions or pcs/carton",
      missingNames: missing.map((l) => l.name || "unnamed line"),
    };
  }

  const weights = lines.map((l) => (needsWeight ? l._m.weightTotalKg : l._m.cbmTotal));
  if (weights.reduce((s, w) => s + w, 0) <= 0) {
    return { ...fob, fallback: true, reason: "carton data totals zero" };
  }
  return { basis, requested, effective, weights };
}

// Allocate a shipment-wide cost to each line.
//   mode = "total"   → split by the resolved basis weights
//   mode = "perUnit" → each line gets (qty × perUnit) and total is the sum
function allocate(cost, mode, lines, weights) {
  if (mode === "perUnit") {
    const perUnit = num(cost);
    return lines.map((l) => ({ total: perUnit * num(l.qty), perUnit }));
  }
  const total = num(cost);
  const totalWeight = weights.reduce((s, w) => s + num(w), 0);
  if (totalWeight <= 0) return lines.map(() => ({ total: 0, perUnit: 0 }));
  return lines.map((l, i) => {
    const lineTotal = total * (num(weights[i]) / totalWeight);
    const qty = num(l.qty);
    return { total: lineTotal, perUnit: qty > 0 ? lineTotal / qty : 0 };
  });
}

// Main entry point. Input shape:
//   {
//     fxRate, currency, dutyPct, outputGstPct, marginPct,
//     allocBasis: "cbm" | "weight" | "chargeable" | "fob",   // shipment default
//     shipmentType: "lcl" | "20ft" | "40ft" | "40ft_hc",     // capacity checks
//     freight: { amount, mode, basis? },   // mode = "total" | "perUnit"
//     inland:  { amount, mode, basis? },   // basis omitted → allocBasis
//     unofficial: { amount, mode, basis? },
//     handling:   { amount, mode, basis? },
//     freightCurrency: "USD" | "CNY" | "INR",   // freight only
//     items: [{
//       name, qty, fobUnit, marginPctOverride?,
//       cartonL, cartonW, cartonH,       // outer carton, CM
//       pcsPerCtn, kgPerCtn,             // pack + gross weight
//       cbmPerCtnStated?,                // vendor's figure, cross-checked
//     }]
//   }
//
// Returns: { lines: [...perLineBreakdown], totals: {...}, shipment: {...} }
export function calcImport(input) {
  const fx = num(input.fxRate) || 1;
  const dutyPct = num(input.dutyPct);
  const outputGstPct = num(input.outputGstPct);
  const defaultMarginPct = num(input.marginPct);
  const requestedBasis = getAllocBasis(input.allocBasis || DEFAULTS.allocBasis).id;

  // Step 1 — FOB (INR) and carton metrics for every line.
  const itemCurrency = getCurrency(input.currency || "USD");
  const fobMultiplier = itemCurrency.id === "INR" ? 1 : fx;
  const lines = (input.items || []).map((it) => {
    const qty = num(it.qty);
    const fobUnitFx = num(it.fobUnit);
    const fobUnitINR = fobUnitFx * fobMultiplier;
    return {
      ...it,
      qty,
      fobUnitFx,
      fobUnitINR,
      fobTotalINR: fobUnitINR * qty,
      _m: cartonMetrics({ ...it, qty }),
    };
  });

  // Step 2 — shipment volume / weight, and which one ocean W/M would bill on.
  const totalCbm = lines.reduce((s, l) => s + l._m.cbmTotal, 0);
  const totalKg = lines.reduce((s, l) => s + l._m.weightTotalKg, 0);
  const totalTonnes = totalKg / 1000;
  const chargeableWinner = totalTonnes > totalCbm ? "weight" : "cbm";
  const chargeableUnits = Math.max(totalCbm, totalTonnes);

  // Step 3 — convert freight to INR if entered in foreign currency.
  const freightCurrency = getCurrency(input.freightCurrency || "INR");
  const freightFxMul = freightCurrency.id === "INR" ? 1 : fx;

  // Step 4 — allocate every shipment-wide cost on its own basis (default: the
  // shipment basis). Each row reports which basis actually applied so the UI
  // can say so out loud when a fallback kicked in.
  const rowFor = (row, amountINR) => {
    const mode = row?.mode || "total";
    const resolved = resolveBasis(row?.basis || requestedBasis, lines, chargeableWinner);
    return {
      amountINR,
      mode,
      resolved,
      alloc: allocate(amountINR, mode, lines, resolved.weights),
    };
  };

  const freightRow = rowFor(input.freight, num(input.freight?.amount) * freightFxMul);
  const inlandRow = rowFor(input.inland, num(input.inland?.amount));
  const unoffRow = rowFor(input.unofficial, num(input.unofficial?.amount));
  const handRow = rowFor(input.handling, num(input.handling?.amount));

  // Step 5 — per-line breakdown.
  const out = lines.map((l, i) => {
    const qty = l.qty;
    const m = l._m;
    const fobUnit = l.fobUnitINR;
    const freightUnit = freightRow.alloc[i].perUnit;
    const cifUnit = fobUnit + freightUnit;

    const dutyUnit = cifUnit * (dutyPct / 100);
    const inlandUnit = inlandRow.alloc[i].perUnit;
    const unoffUnit = unoffRow.alloc[i].perUnit;
    const handUnit = handRow.alloc[i].perUnit;

    const landedUnit = cifUnit + dutyUnit + inlandUnit + unoffUnit + handUnit;

    const lineMarginPct =
      l.marginPctOverride != null && l.marginPctOverride !== ""
        ? num(l.marginPctOverride)
        : defaultMarginPct;
    const marginUnit = landedUnit * (lineMarginPct / 100);
    const sellingExGstUnit = landedUnit + marginUnit;
    const outputGstUnit = sellingExGstUnit * (outputGstPct / 100);
    const finalSellingUnit = sellingExGstUnit + outputGstUnit;

    return {
      name: l.name || `Item ${i + 1}`,
      qty,
      fobUnit,
      fobTotal: fobUnit * qty,
      fobUnitFx: l.fobUnitFx,
      currency: itemCurrency.id,

      // Carton / volumetric figures, surfaced for the UI readout.
      carton: m,
      cbmTotal: m.cbmTotal,
      weightTotalKg: m.weightTotalKg,
      cartons: m.cartons,
      cbmShare: totalCbm > 0 ? m.cbmTotal / totalCbm : 0,
      weightShare: totalKg > 0 ? m.weightTotalKg / totalKg : 0,
      fobShare: 0, // filled after totals are known

      freightUnit,
      freightTotal: freightRow.alloc[i].total,

      cifUnit,
      cifTotal: cifUnit * qty,

      dutyPct,
      dutyUnit,
      dutyTotal: dutyUnit * qty,

      inlandUnit,
      inlandTotal: inlandRow.alloc[i].total,

      unofficialUnit: unoffUnit,
      unofficialTotal: unoffRow.alloc[i].total,

      handlingUnit: handUnit,
      handlingTotal: handRow.alloc[i].total,

      landedUnit,
      landedTotal: landedUnit * qty,

      marginPct: lineMarginPct,
      marginUnit,
      marginTotal: marginUnit * qty,

      sellingExGstUnit,
      sellingExGstTotal: sellingExGstUnit * qty,

      outputGstPct,
      outputGstUnit,
      outputGstTotal: outputGstUnit * qty,

      finalSellingUnit,
      finalSellingTotal: finalSellingUnit * qty,
    };
  });

  // Step 6 — shipment totals (sum of per-line totals).
  const sum = (key) => out.reduce((s, l) => s + l[key], 0);
  const totalFobINR = sum("fobTotal");
  out.forEach((l) => {
    l.fobShare = totalFobINR > 0 ? l.fobTotal / totalFobINR : 0;
  });

  const totals = {
    qty: sum("qty"),
    fob: totalFobINR,
    freight: sum("freightTotal"),
    cif: sum("cifTotal"),
    duty: sum("dutyTotal"),
    inland: sum("inlandTotal"),
    unofficial: sum("unofficialTotal"),
    handling: sum("handlingTotal"),
    landed: sum("landedTotal"),
    margin: sum("marginTotal"),
    sellingExGst: sum("sellingExGstTotal"),
    outputGst: sum("outputGstTotal"),
    finalSelling: sum("finalSellingTotal"),
    cbm: totalCbm,
    weightKg: totalKg,
    cartons: lines.reduce((s, l) => s + l._m.cartons, 0),
  };

  // Step 7 — shipment-level volume/weight sanity checks.
  const type = getShipmentType(input.shipmentType || "lcl");
  const warnings = [];
  lines.forEach((l) => {
    if (l.qty > 0 && l._m.cbmMismatch) {
      warnings.push({
        kind: "cbm_mismatch",
        line: l.name || "unnamed line",
        statedCbm: l._m.cbmPerCtnStated,
        geomCbm: l._m.cbmPerCtnGeom,
        variancePct: l._m.cbmVariancePct,
      });
    }
  });
  if (type.capCBM && totalCbm > type.capCBM) {
    warnings.push({ kind: "over_cbm", cbm: totalCbm, cap: type.capCBM, label: type.label });
  }
  if (type.capKg && totalKg > type.capKg) {
    warnings.push({ kind: "over_weight", kg: totalKg, cap: type.capKg, label: type.label });
  }
  // Only shout about a fallback on a row that actually carries money on the
  // affected basis — an empty cost row allocating nothing needs no warning.
  [
    ["Ocean Freight", freightRow],
    ["Inland Transport", inlandRow],
    ["Unofficial Clearance", unoffRow],
    ["Handling + Storage", handRow],
  ].forEach(([label, row]) => {
    if (!row.resolved.fallback || row.mode !== "total" || row.amountINR === 0) return;
    warnings.push({
      kind: "basis_fallback",
      row: label,
      requested: row.resolved.requested,
      reason: row.resolved.reason,
      missingNames: row.resolved.missingNames || [],
    });
  });

  const shipment = {
    type: type.id,
    typeLabel: type.label,
    cbm: totalCbm,
    weightKg: totalKg,
    tonnes: totalTonnes,
    cartons: totals.cartons,
    chargeableUnits,
    chargeableWinner,
    capCBM: type.capCBM,
    capKg: type.capKg,
    cbmUtilPct: type.capCBM ? (totalCbm / type.capCBM) * 100 : null,
    weightUtilPct: type.capKg ? (totalKg / type.capKg) * 100 : null,
    requestedBasis,
    freightBasis: freightRow.resolved,
    warnings,
  };

  return { lines: out, totals, totalFobINR, shipment };
}
