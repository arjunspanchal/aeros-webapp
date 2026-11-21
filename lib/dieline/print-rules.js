// PRINTABILITY + PRODUCTION RULES — can this die be printed and made on Aeros routes? Pure arithmetic on the blank and the
// bag/box size; every rule carries the id from the extracted rule book (scratch print-limits.yaml, 21-Nov-2026: sources =
// aeros-flexo-plates, aeros-kld-artwork, aeros-custom-costing, aeros-bag-calculator, aeros-dieline skills + cortex).
// Result items: { id, ok, severity: "block"|"warn"|"info", title, detail }. A "block" that fails stops the download.
//
// Arjun's rulings 21-Nov-2026: Blueline max sheet = 24.5 x 35.5 in; Lucky (max 27.5 x 38 in) is a normal second press ("We have
// Lucky printer too") - a die passes if it fits either; machine envelope stays a block (HOB 254x178x255 is a
// special case to avoid, not a pattern); bags wider than Viana's 950 web are printed elsewhere (warn, Arjun's call);
// D-cut bags are MANUAL (hand-made on offset) and follow the Aeros Listing sizes, so the machine-only W - G >= 92 is gone.
// Older notes, kept for reference:
//   machine tube envelope (BM-03/04, derived from a chart photo) fails HOB 254 x 178 x 255, which we make -> WARN
//   Viana web 950 (FX-05) fails SOS-011 300 x 178 x 315 (deckle 976) -> BLOCK kept, open question
//   Blueline sheet: 25 x 36 in max (OS-01) vs 24.5 x 35.5 "max/std" (cortex) -> sheet 25 x 36, PRINT block <= 622.3 x 901.7
//   gripper/margins: several sets quoted -> boxes 12 + 6 side + 3 gap (OS-08); bags 12 + 5 + 5 side + 3 gap (OS-09)
//   gusset: 178 (BM-01) vs chart 180 -> 178
//   D-cut W - G >= 92 (BM-12) fails live DCB-001 (210 x 140 = 70) -> WARN, not block, until ruled

const IN = 25.4;
export const STANDARD_SHEETS_IN = [[18, 23], [20, 30], [22, 28], [24.5, 35.5], [23, 36], [25, 36]]; // OS-16; 23 x 36 / 25 x 36 run on Lucky
export const PRESSES = {
  blueline: { name: "Blueline", maxSheetMm: [622.3, 901.7] }, // 24.5 x 35.5 in (Arjun 21-Nov-2026)
  lucky: { name: "Lucky", maxSheetMm: [698.5, 965] }, // OS-03
};
export const VIANA_CYLINDERS = { 83: 2, 86: 2, 88: 2, 92: 2, 96: 4, 97: 4, 98: 4, 100: 3, 102: 5, 104: 4, 106: 2, 109: 5, 112: 4, 113: 5, 115: 4,
  116: 4, 117: 4, 121: 4, 124: 2, 126: 3, 129: 4, 130: 1, 134: 4, 135: 4, 144: 4, 147: 2, 151: 3, 155: 4 }; // FX-02 (teeth: count)
export const TOOTH_PITCH = 3.175; // FX-01
const MARGINS = {
  bag: { gripper: 12, tail: 5, side: 5, gap: 3, pairTops: true, rule: "OS-09 + HM-08 (tops butted, 3 mm bottom to bottom)" },
  box: { gripper: 12, tail: 6, side: 6, gap: 3, rule: "OS-08" },
  foodbox: { gripper: 12, tail: 6, side: 6, gap: 5, rule: "OS-08 + OS-13" },
  mailer: { gripper: 12, tail: 6, side: 6, gap: 6, rule: "OS-08 + OS-13" },
};

const item = (id, ok, severity, title, detail) => ({ id, ok, severity, title, detail });

// rectangle grid fit of one blank on one sheet, gripper on either edge, blank either way round (no interlock counted:
// conservative - interlocked nests can only add ups)
export function gridFit(blankW, blankH, sheetW, sheetH, m) {
  // Arjun 21-Nov-2026: Blueline and Lucky grip the SHORT edge "mostly". So the short-edge layout is the default; the
  // long-edge layout is used only when the blank does not fit short-edge at all, and is offered as a note when it
  // would give more ups (ask the printer first).
  const per = {};
  for (const [sw, sh] of [[sheetW, sheetH], [sheetH, sheetW]]) { // gripper runs along the edge of length sw
    const edge = sw <= sh ? "short" : "long";
    let best = { ups: 0 };
    const useW = sw - 2 * m.side, useH = sh - m.gripper - m.tail;
    // HM-08 (bags): rows along the bag's HEIGHT pair top-to-top with no gap; bottom-to-bottom joins keep m.gap
    const span = (n, size, pairs) => n * size + (pairs ? Math.floor((n - 1) / 2) : n - 1) * m.gap;
    const count = (use, size, pairs) => { let n = 0; while (span(n + 1, size, pairs) <= use) n++; return n; };
    for (const [bw, bh, rot] of [[blankW, blankH, false], [blankH, blankW, true]]) {
      const pairX = !!m.pairTops && rot, pairY = !!m.pairTops && !rot; // bag height runs along y unless rotated
      const nx = count(useW, bw, pairX), ny = count(useH, bh, pairY);
      const ups = nx * ny;
      if (ups > best.ups) best = { ups, nx, ny, rotated: rot, gripperOn: edge, blockW: span(nx, bw, pairX), blockH: span(ny, bh, pairY),
        yield: (ups * blankW * blankH) / (sheetW * sheetH), sw, sh, pairX, pairY, margins: m };
    }
    if (!per[edge] || best.ups > per[edge].ups) per[edge] = best;
  }
  const short = per.short || { ups: 0 }, long = per.long || { ups: 0 };
  if (short.ups > 0) return long.ups > short.ups ? { ...short, longEdgeUps: long.ups } : short;
  return long;
}

/**
 * Where every up sits on the sheet. fit = one result of gridFit / sheetFit. Sheet frame: x along the gripper edge (0..sw),
 * y away from the gripper (0 = gripper edge, 0..sh), mm. Each up: { cx, cy (centre), rot (deg clockwise: 0 = as drawn,
 * top of the blank towards the gripper), bleed: { top, right, bottom, left } in the BLANK's own sides } - bleed is the
 * full `bleed` on outside edges, half the gap towards a neighbour, and 0 where two tops are butted (HM-08).
 */
export function layoutUps(fit, blankW, blankH, bleed = 3) {
  if (!fit || !fit.ups) return [];
  const { nx, ny, rotated, sw, pairX, pairY, margins: m, blockW } = fit;
  const bw = rotated ? blankH : blankW, bh = rotated ? blankW : blankH;
  const off = (i, size, pairs) => i * size + (pairs ? Math.floor(i / 2) : i) * m.gap;
  const x0 = (sw - blockW) / 2, y0 = m.gripper, ups = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    // rot: unrotated blanks keep their top towards the gripper (0) or away (180, the first of a butted pair);
    // rotated blanks point their top along +x (90) or -x (270)
    const rot = rotated ? (pairX ? (i % 2 === 0 ? 90 : 270) : 90) : pairY ? (j % 2 === 0 ? 180 : 0) : 0;
    // gap to the neighbour on each SHEET side (null = sheet edge side)
    const gapX = (a, b2) => (b2 < 0 || b2 >= nx ? null : pairX && Math.floor(a / 2) === Math.floor(b2 / 2) ? 0 : m.gap);
    const gapY = (a, b2) => (b2 < 0 || b2 >= ny ? null : pairY && Math.floor(a / 2) === Math.floor(b2 / 2) ? 0 : m.gap);
    const side = { left: gapX(i, i - 1), right: gapX(i, i + 1), up: gapY(j, j - 1), down: gapY(j, j + 1) };
    const ext = (g) => (g == null ? bleed : Math.min(bleed, g / 2));
    // which sheet side each side of the blank faces after the turn
    const facing = { 0: { top: "up", right: "right", bottom: "down", left: "left" }, 90: { top: "right", right: "down", bottom: "left", left: "up" },
      180: { top: "down", right: "left", bottom: "up", left: "right" }, 270: { top: "left", right: "up", bottom: "right", left: "down" } }[rot];
    ups.push({ i, j, rot, cx: x0 + off(i, bw, pairX) + bw / 2, cy: y0 + off(j, bh, pairY) + bh / 2,
      bleed: { top: ext(side[facing.top]), right: ext(side[facing.right]), bottom: ext(side[facing.bottom]), left: ext(side[facing.left]) } });
  }
  return ups;
}

export function sheetFit(blankW, blankH, kind = "box") {
  const m = MARGINS[kind] || MARGINS.box;
  return STANDARD_SHEETS_IN.map(([a, b]) => {
    const f = gridFit(blankW, blankH, a * IN, b * IN, m);
    return { sheet: `${a} x ${b} in`, sheetMm: [a * IN, b * IN], ...f };
  });
}

export function checkOffsetSheet({ blankW, blankH, kind = "box", colours = 0, process = "cmyk" }) {
  const out = [], m = MARGINS[kind] || MARGINS.box;
  const fits = sheetFit(blankW, blankH, kind);
  const onPress = (press) => fits.filter((f) => f.ups > 0 && Math.min(...f.sheetMm) <= press.maxSheetMm[0] + 0.01 && Math.max(...f.sheetMm) <= press.maxSheetMm[1] + 0.01)
    .map((f) => ({ ...f, press: press.name }));
  const pick = (list) => [...list].sort((p, q) => q.ups - p.ups || q.yield - p.yield)[0];
  const blue = pick(onPress(PRESSES.blueline)), lucky = pick(onPress(PRESSES.lucky));
  const best = blue || lucky || null;
  out.push(item("OS-01/16", !!best, "block", "Fits a standard sheet on our presses (Blueline 24.5 x 35.5 in, Lucky 27.5 x 38 in)",
    best ? `${blue ? "Blueline" : "Lucky"}: ${best.sheet}, ${best.ups}-up (${Math.round(best.yield * 100)}% used), gripper ${m.gripper} on the ${best.gripperOn} edge (${m.rule}).`
      : `Blank ${blankW.toFixed(1)} x ${blankH.toFixed(1)} mm plus ${m.gripper} gripper and ${m.side} mm sides fits no standard sheet on either press - needs 2-piece or a different construction.`));
  if (best && best.gripperOn === "long") out.push(item("OS-GRIP", false, "warn", "Needs the long edge in the gripper", `${best.sheet}: this blank only fits with the gripper on the long edge. We mostly grip the short edge - confirm with the printer.`));
  else if (best && best.longEdgeUps) out.push(item("OS-GRIP", true, "info", "Long-edge grip would give more", `${best.sheet}: ${best.ups}-up with the gripper on the short edge (our normal way); ${best.longEdgeUps}-up if the printer can grip the long edge.`));
  if (blue && lucky && lucky.ups > blue.ups) out.push(item("OS-03", true, "info", "Lucky gets more per sheet", `${lucky.sheet} on Lucky: ${lucky.ups}-up vs ${blue.ups}-up on Blueline.`));
  const bestOverall = blue && lucky && lucky.ups > blue.ups ? lucky : best;
  if (process === "pantone") out.push(item("OS-23", colours <= 4, "block", "Pantone colours: 4 at most", colours > 4 ? `${colours} Pantones - a 5th colour moves the job to CMYK.` : `${colours} Pantone.`));
  return { items: out, fits, best: bestOverall };
}

// hand-made bag on offset: one-piece width limit, then the sheet fit
export function checkHandmadeBag({ W, G, H, half = false, seam = 20, blankW, blankH, colours = 0, process = "pantone" }) {
  const out = [];
  // HM-03 (890 mm one-piece limit) came from 25 x 36 sheets only; with Lucky's 27.5 x 38 the sheet fit below decides.
  out.push(item("HM-05", true, "info", "Straight top, no serration (hand-made rule)", "Drawn by the engine."));
  const sheet = checkOffsetSheet({ blankW, blankH, kind: "bag", colours, process });
  if (!half && blankW > 890) out.push(item("HM-03", true, "info", "Wide one-piece blank",
    `One-piece ${blankW.toFixed(1)} mm wide${sheet.best ? ` - fits only ${sheet.best.press} ${sheet.best.sheet}` : " - fits no sheet"}; tick 2-piece to halve it.`));
  return { items: [...out, ...sheet.items], fits: sheet.fits, best: sheet.best };
}

// machine-made bag (FJ11(13)S) + flexo plate on Viana's cylinders. dcut = D-cut handle bag.
export function checkMachineBag({ W, G, H, colours = 1 }) {
  const out = [];
  out.push(item("BM-01", G <= 178, "block", "Gusset 178 mm at most on the bag machine", `Gusset ${G} mm.`));
  out.push(item("BM-02", G >= 70, "block", "Gusset 70 mm at least (machine chart)", `Gusset ${G} mm.`));
  const tube = H + G / 2 + 40, minTube = G <= 104 ? 270 : 270 + 1.95 * (G - 104);
  // derived from a photo of the machine chart; HOB 254 x 178 x 255 runs on our machine yet fails it -> WARN until Arjun rules
  out.push(item("BM-03/04", tube >= minTube && tube <= 530, "block", "Tube length inside the machine envelope",
    `Tube = H + G/2 + 40 = ${tube.toFixed(1)} mm; needs ${minTube.toFixed(1)}-530 at G ${G}. (HOB 254x178x255 runs below it as a one-off special case - avoid.)`));
  out.push(item("BM-05", H >= 200 && H <= 480, H < 180 ? "block" : "warn", "Bag height 200-480 mm (chart)", `H ${H} mm.`));
  const lap = W <= 100 ? 15 : W <= 300 ? 20 : 25, deckle = 2 * W + 2 * G + lap;
  out.push(item("BM-08/09", true, "info", "Reel width", `Deckle 2W + 2G + ${lap} = ${deckle} mm; order a reel ${deckle}-${deckle + 50} mm (never wider).`));
  out.push(item("FX-05", deckle <= 950, "warn", "Web 950 mm at most on Viana's flexo", deckle <= 950 ? `Deckle ${deckle} mm.` : `Deckle ${deckle} mm - not on Viana; printed with the other printer (Arjun's call).`));
  // FX-01/03/08: a cylinder whose repeat leaves a bottom of G/2 + 13 .. G/2 + 25 after H
  const lo = G / 2 + 13, hi = G / 2 + 25;
  const options = Object.entries(VIANA_CYLINDERS).map(([t, n]) => ({ teeth: +t, count: n, repeat: +t * TOOTH_PITCH }))
    .map((c) => ({ ...c, bottom: c.repeat - H })).filter((c) => c.bottom >= lo && c.bottom <= hi);
  const enough = options.filter((c) => c.count >= colours);
  out.push(item("FX-01/08", enough.length > 0, "block", "A Viana cylinder fits (bottom = repeat - H within G/2 + 13 .. G/2 + 25)",
    options.length ? options.map((c) => `${c.teeth} T = ${c.repeat.toFixed(1)} mm repeat, bottom ${c.bottom.toFixed(1)} mm, ${c.count} cylinder${c.count > 1 ? "s" : ""}${c.count < colours ? ` (fewer than ${colours} colours)` : ""}`).join("; ")
      : `No cylinder gives a bottom between ${lo.toFixed(1)} and ${hi.toFixed(1)} mm at H ${H}. Change H by a few mm.`));
  out.push(item("BM-10", true, "info", "Machine bags: MOQ 15,000 per size", "Smaller runs go hand-made on offset."));
  return { items: out, cylinders: enough, deckle };
}

export const blocked = (items) => items.some((i) => i.severity === "block" && !i.ok);
