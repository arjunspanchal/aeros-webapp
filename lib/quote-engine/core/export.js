// Export price layer. FOB = ex-factory sell + port charges ÷ units loaded.
// Port charges go in at cost, with no margin on them (exports skill).
// All Aeros export quotes are for full container loads.

// 40 ft high-cube inside dimensions, mm.
export const CONTAINER_40HC = { l: 12032, w: 2352, h: 2698 };

/**
 * Loose-fill count for one carton size: the best of the six carton
 * orientations, then capped by payload. A geometric stack, not a CBM rule of
 * thumb (the old 60.9 CBM rule under-loaded by 15–17%; replaced 14-Nov-2026).
 */
export function casesPerContainer(carton, { grossKg, payloadKg = 26000, wallMm = 0, box = CONTAINER_40HC } = {}) {
  // carton.w/l/h are INSIDE sizes; the container is filled with outside sizes.
  const d = [carton.w + wallMm, carton.l + wallMm, carton.h + wallMm];
  const perms = [
    [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
  ];
  let best = { cases: 0 };
  for (const [i, j, k] of perms) {
    const nl = Math.floor(box.l / d[i]);
    const nw = Math.floor(box.w / d[j]);
    const nh = Math.floor(box.h / d[k]);
    const cases = nl * nw * nh;
    if (cases > best.cases) best = { cases, along: nl, across: nw, high: nh };
  }
  let limitedBy = "volume";
  if (grossKg > 0 && best.cases * grossKg > payloadKg) {
    best.cases = Math.floor(payloadKg / grossKg);
    limitedBy = "weight";
  }
  return { ...best, limitedBy };
}

/** Port charges for one container, ₹. */
export function fobCharges(rates, { us = false, palletised = false } = {}) {
  let c = rates.get("export.fob.charges_40hc");
  if (us) c += rates.get("export.fob.ams_us");
  if (palletised) c += rates.get("export.fob.palletised_extra");
  return c;
}
