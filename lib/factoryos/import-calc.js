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

export const CURRENCIES = [
  { id: "USD", label: "USD ($)", symbol: "$", defaultRate: 88 },
  { id: "CNY", label: "CNY (¥)", symbol: "¥", defaultRate: 12.2 },
  { id: "INR", label: "INR (₹)", symbol: "₹", defaultRate: 1 },
];

// Capacities are loose planning ceilings — usable CBM, not nameplate. Match the
// values used on the Container Stuffing tool so quotes line up. LCL has no
// hard cap; ocean lines bill by chargeable W/M (greater of CBM or metric tons).
export const SHIPMENT_TYPES = [
  { id: "lcl",     label: "LCL",      capCBM: null,  capLabel: "billed by chargeable W/M (greater of CBM or metric tons)" },
  { id: "20ft",    label: "20ft FCL", capCBM: 28,    capLabel: "~28 usable CBM · ~28 t payload" },
  { id: "40ft",    label: "40ft FCL", capCBM: 58,    capLabel: "~58 usable CBM · ~28 t payload" },
  { id: "40ft_hc", label: "40ft HC",  capCBM: 68,    capLabel: "~68 usable CBM · ~28 t payload" },
];

export function getShipmentType(id) {
  return SHIPMENT_TYPES.find((s) => s.id === id) || SHIPMENT_TYPES[0];
}

export function getCurrency(id) {
  return CURRENCIES.find((c) => c.id === id) || CURRENCIES[0];
}

// Default rates / percentages reflect the worked example shared by the team
// (CCD comparison sheet). Override per-shipment as needed.
export const DEFAULTS = {
  fxRate: 95,                 // ₹ per USD
  dutyPct: 38,                // BCD + SWS + IGST as a single combined %
  marginPct: 5,
  outputGstPct: 18,
};

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Allocate a shipment-wide cost to each line.
//   mode = "total" → split by FOB-INR share
//   mode = "perUnit" → each line gets (qty × perUnit) and total is the sum
function allocate(cost, mode, totalFobINR, lines) {
  if (mode === "perUnit") {
    const perUnit = num(cost);
    return lines.map((l) => ({
      total: perUnit * num(l.qty),
      perUnit,
    }));
  }
  const total = num(cost);
  if (totalFobINR <= 0) {
    return lines.map(() => ({ total: 0, perUnit: 0 }));
  }
  return lines.map((l) => {
    const share = (l._fobINR || 0) / totalFobINR;
    const lineTotal = total * share;
    const qty = num(l.qty);
    return {
      total: lineTotal,
      perUnit: qty > 0 ? lineTotal / qty : 0,
    };
  });
}

// Main entry point. Input shape:
//   {
//     fxRate, currency, dutyPct, outputGstPct, marginPct,
//     freight: { amount, mode },         // mode = "total" | "perUnit"
//     inland:  { amount, mode },
//     unofficial: { amount, mode },
//     handling:   { amount, mode },
//     freightCurrency: "USD" | "CNY" | "INR",   // freight only
//     items: [{ name, qty, fobUnit, marginPctOverride? }]
//   }
//
// Returns: { lines: [...perLineBreakdown], totals: {...} }
export function calcImport(input) {
  const fx = num(input.fxRate) || 1;
  const dutyPct = num(input.dutyPct);
  const outputGstPct = num(input.outputGstPct);
  const defaultMarginPct = num(input.marginPct);

  // Step 1 — compute FOB (INR) for every line so we can allocate by share.
  const itemCurrency = getCurrency(input.currency || "USD");
  const fobMultiplier = itemCurrency.id === "INR" ? 1 : fx;
  const lines = (input.items || []).map((it) => {
    const qty = num(it.qty);
    const fobUnitFx = num(it.fobUnit);
    const fobUnitINR = fobUnitFx * fobMultiplier;
    const fobTotalINR = fobUnitINR * qty;
    return {
      ...it,
      qty,
      fobUnitFx,
      fobUnitINR,
      fobTotalINR,
      _fobINR: fobTotalINR,
    };
  });
  const totalFobINR = lines.reduce((s, l) => s + l.fobTotalINR, 0);

  // Step 2 — convert freight to INR if entered in foreign currency.
  const freightCurrency = getCurrency(input.freightCurrency || "INR");
  const freightFxMul = freightCurrency.id === "INR" ? 1 : fx;
  const freightInputINR = {
    amount: num(input.freight?.amount) * freightFxMul,
    mode: input.freight?.mode || "total",
  };

  // Step 3 — allocate every shipment-wide cost.
  const freightAlloc = allocate(freightInputINR.amount, freightInputINR.mode, totalFobINR, lines);
  const inlandAlloc  = allocate(num(input.inland?.amount),     input.inland?.mode     || "total", totalFobINR, lines);
  const unoffAlloc   = allocate(num(input.unofficial?.amount), input.unofficial?.mode || "total", totalFobINR, lines);
  const handAlloc    = allocate(num(input.handling?.amount),   input.handling?.mode   || "total", totalFobINR, lines);

  // Step 4 — per-line breakdown.
  const out = lines.map((l, i) => {
    const qty = l.qty;
    const fobUnit = l.fobUnitINR;
    const freightUnit = freightAlloc[i].perUnit;
    const cifUnit = fobUnit + freightUnit;

    const dutyUnit = cifUnit * (dutyPct / 100);
    const inlandUnit = inlandAlloc[i].perUnit;
    const unoffUnit  = unoffAlloc[i].perUnit;
    const handUnit   = handAlloc[i].perUnit;

    const landedUnit = cifUnit + dutyUnit + inlandUnit + unoffUnit + handUnit;

    const lineMarginPct = l.marginPctOverride != null && l.marginPctOverride !== ""
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

      freightUnit,
      freightTotal: freightAlloc[i].total,

      cifUnit,
      cifTotal: cifUnit * qty,

      dutyPct,
      dutyUnit,
      dutyTotal: dutyUnit * qty,

      inlandUnit,
      inlandTotal: inlandAlloc[i].total,

      unofficialUnit: unoffUnit,
      unofficialTotal: unoffAlloc[i].total,

      handlingUnit: handUnit,
      handlingTotal: handAlloc[i].total,

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

  // Step 5 — shipment totals (sum of per-line totals).
  const sum = (key) => out.reduce((s, l) => s + l[key], 0);
  const totals = {
    qty: sum("qty"),
    fob: sum("fobTotal"),
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
  };

  return { lines: out, totals, totalFobINR };
}
