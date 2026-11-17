// Parametric dieline (KLD) for the Aeros one-piece lock-corner cake / snack box.
//
// Geometry reverse-engineered from the reference die "SNACC Samosa Box"
// (5in L x 5in W x 3in H, blank 16.59in x 10.06in). The blank is a wrap-around
// tube  [tuck flap | lid L | side H | base L | side H]  with a band W tall;
// both open ends close with a slit-and-tab lock: the base panel throws a
// rectangular flap with a slit at H/2, the lid panel throws a curved tab whose
// barbs push through that slit, and the two side panels throw angled dust flaps.
//
// Every vertical feature of the closure scales with box height H (scale s =
// H / 3in); horizontal tab/shoulder features also scale with s and the panel
// middles stretch with L. This exactly reproduces the reference die at
// 5 x 5 x 3 and keeps the lock proportions (and clearances) correct at other
// sizes. The tuck flap is a fixed 15 mm with an 8 mm corner radius.
//
// All internal maths is in PDF points (72 pt = 1 inch). Output coordinates are
// y-down with the blank's top-left corner at (0,0).

export const PT_PER_IN = 72;
export const PT_PER_MM = 72 / 25.4;

const REF_H = 216; // reference box height, 3in in points

const TUCK_DEPTH = 42.52; // 15 mm
const TUCK_RADIUS = 22.68; // 8 mm
const KAPPA = 0.5522847498;

// Sample-derived closure constants (at s = 1, i.e. H = 3in). See file header.
const FLAP_AC = 181.98; // lid + base flap depth  (H/2 + tab)
const FLAP_BD = 176.31; // side dust-flap depth   (FLAP_AC - 2mm clearance)
const SLIT_INSET = 87.16; // slit starts this far in from each base-panel crease

export function inchesToPt(v) {
  return v * PT_PER_IN;
}
export function mmToPt(v) {
  return v * PT_PER_MM;
}

/**
 * Build the dieline. Dimensions are internal box dims of the finished box.
 * @param {object} opts
 * @param {number} opts.L length (the dimension across the locking ends)
 * @param {number} opts.W width  (the wrap-around band / tube length)
 * @param {number} opts.H height
 * @param {"in"|"mm"} [opts.units]
 * @returns {{segments: Array, blank: object, warnings: string[], valid: boolean}}
 */
export function buildCakeboxDieline({ L, W, H, windowW, windowH, units = "in" }) {
  const toPt = units === "mm" ? mmToPt : inchesToPt;
  const P = toPt(L); // lid / base panel width
  const Q = toPt(H); // side panel width
  const B = toPt(W); // band height
  const s = Q / REF_H;

  const warnings = [];
  if (!(P > 0) || !(Q > 0) || !(B > 0)) {
    return { segments: [], blank: null, warnings: ["All dimensions must be positive."], valid: false };
  }
  // The lock tab needs room between the two shoulder curves.
  const minP = 263.21 * s;
  // Horizontal lock scale. Normally = s (reference proportions). When the length
  // is short for the height (e.g. a cube), the lid-tab shoulders and the slit
  // inset scale with the LENGTH instead, keeping a 10 mm flat on the tab top;
  // vertical features (slit at H/2, flap depths) stay on s. Default-preserving:
  // any box with P >= minP is unchanged. Mog Mog 100 mm cube, 29-Oct-2026.
  let sh = s;
  if (P < minP) {
    sh = (P - 10 * PT_PER_MM) / 263.21;
    if (sh < 0.6) {
      warnings.push(
        `Length is too small for this height — the lock tab does not fit. ` +
          `Minimum length at this height is ${fmtDim(263.21 * 0.6 + 10 * PT_PER_MM, units)}.`,
      );
    } else {
      warnings.push(
        `Short length for this height: lock tab narrowed to the length (horizontal lock scale ` +
          `${(sh / s).toFixed(2)} of the height scale) — not die-proven, prototype first.`,
      );
    }
  }
  const rT = Math.min(TUCK_RADIUS, B / 2 - 0.5);
  if (rT < TUCK_RADIUS) warnings.push("Width is very small — tuck-flap corners were tightened to fit.");
  if (rT <= 0) {
    return { segments: [], blank: null, warnings: ["Width is too small for the tuck flap."], valid: false };
  }

  // Side (dust) flap DEPTH runs across the end, i.e. along the box LENGTH. Normally = s (reference). On a narrowed
  // lock (short length, e.g. the 100 mm cube) depth-by-H made the two side flaps cover the slit and block the lid
  // tab - the Mog Mog sample would not shut (31-Oct-2026). Then: k = min(sh, (P - 2 mm) / (2 x 176.31)) so the
  // flaps clear the tab at the slit (gap >= tab root, as the reference) and stop 2 mm short of each other.
  // 31-Oct-2026 (closure check): the same cap on EVERY box - a box 1.25-1.63 x as long as tall (e.g. the 8 x 8 x 5 in preset)
  // had side flaps crossing too. The cap only bites when the flaps would cross, so every non-crossing die is unchanged.
  const sideCap = (P - 2 * PT_PER_MM) / (2 * FLAP_BD);
  const k = Math.min(P >= minP ? s : sh, sideCap);
  const F = FLAP_AC * s;
  const F2 = FLAP_BD * k;

  // Blank frame
  const xA = TUCK_DEPTH; // tuck | lid crease
  const xB = xA + P; //  lid | side crease
  const xC = xB + Q; // side | base crease
  const xD = xC + P; // base | side crease
  const xE = xD + Q; // right cut edge
  const yT = F; // top band crease
  const yB = F + B; // bottom band crease

  const segments = [];
  const line = (layer, x1, y1, x2, y2) => segments.push({ layer, kind: "l", pts: [[x1, y1], [x2, y2]] });
  const bez = (layer, pts) => segments.push({ layer, kind: "c", pts });

  // ---- creases (fold lines) ----
  for (const x of [xA, xB, xC, xD]) line("crease", x, yT, x, yB);
  line("crease", xA, yT, xE, yT);
  line("crease", xA, yB, xE, yB);

  // ---- tuck flap (left of lid panel, spans the band) ----
  line("cut", xA, yT, xA - (TUCK_DEPTH - rT), yT);
  arc90(bez, xA - (TUCK_DEPTH - rT), yT, xA - TUCK_DEPTH, yT + rT, "tl");
  line("cut", xA - TUCK_DEPTH, yT + rT, xA - TUCK_DEPTH, yB - rT);
  arc90(bez, xA - TUCK_DEPTH, yB - rT, xA - (TUCK_DEPTH - rT), yB, "bl");
  line("cut", xA - (TUCK_DEPTH - rT), yB, xA, yB);

  // ---- right cut edge of the band ----
  line("cut", xE, yT, xE, yB);

  // ---- end-closure flaps, top half then mirrored bottom half ----
  // Local flap coords: x rightward from the panel's left crease, y upward from
  // the band crease. `emit` maps them to page coords for either half.
  const halves = [
    { y0: yT, dir: -1 }, // top flap field (y decreases away from the band)
    { y0: yB, dir: +1 }, // bottom flap field (pure vertical mirror, as sampled)
  ];

  for (const { y0, dir } of halves) {
    const map = (x0) => ([lx, ly]) => [x0 + lx, y0 + dir * ly];

    // Lid (A) flap — curved tab with lock barbs.
    emitPath(segments, map(xA), [
      ["m", [0, 0]],
      ["c", [0.32 * sh, 52.88 * s], [38.04 * sh, 98.14 * s], [90 * sh, 108 * s]],
      ["l", [97.42 * sh, 127.37 * s]],
      ["c", [110.02 * sh, 160.26 * s], [141.6 * sh, 181.98 * s], [176.83 * sh, 181.98 * s]],
      ["l", [P - 86.38 * sh, 181.98 * s]],
      ["c", [P - 80.78 * sh, 181.98 * s], [P - 75.54 * sh, 179.23 * s], [P - 72.37 * sh, 174.61 * s]],
      ["c", [P - 69.2 * sh, 169.99 * s], [P - 68.5 * sh, 164.12 * s], [P - 70.5 * sh, 158.89 * s]],
      ["l", [P - 90 * sh, 108 * s]],
      ["c", [P - 38.04 * sh, 98.14 * s], [P - 0.33 * sh, 52.88 * s], [P, 0]],
    ]);

    // Side (B) flap — straight edge toward the lid, diagonal toward the base.
    const bFlap = [
      ["m", [0, 0]],
      ["l", [0, 176.31 * k]],
      ["l", [135.47 * s, 176.31 * k]],
      ["c", [141.27 * s, 176.31 * k], [146.68 * s, 173.36 * k], [149.8 * s, 168.47 * k]],
      ["c", [152.93 * s, 163.58 * k], [153.35 * s, 157.44 * k], [150.91 * s, 152.17 * k]],
      ["l", [122.17 * s, 90 * k]],
      ["l", [108 * s, 90 * k]],
      ["l", [216 * s, 0]],
    ];
    emitPath(segments, map(xB), bFlap);

    // Side (D) flap — mirror image of B.
    emitPath(segments, (pt) => map(xD)([Q - pt[0], pt[1]]), bFlap);

    // Base (C) flap — rectangle with the lock slit at H/2.
    emitPath(segments, map(xC), [
      ["m", [0, 0]],
      ["l", [0, F]],
      ["l", [P, F]],
      ["l", [P, 0]],
    ]);
    line("cut", ...map(xC)([SLIT_INSET * sh, 108 * s]), ...map(xC)([P - SLIT_INSET * sh, 108 * s]));
  }

  // optional display WINDOW cut in the lid panel (panel A, between xA..xB)
  const wW = +windowW > 0 ? toPt(+windowW) : 0;
  const wH = +windowH > 0 ? toPt(+windowH) : 0;
  if (wW > 0 && wH > 0) {
    const margin = 12 * PT_PER_MM;
    if (wW > P - 2 * margin || wH > B - 2 * margin) {
      warnings.push("Window too large — keep at least 12 mm of board around it; window skipped.");
    } else {
      const cxw = xA + P / 2;
      const cyw = (yT + yB) / 2;
      const rw = Math.min(6 * PT_PER_MM, wW / 4, wH / 4);
      const k = KAPPA * rw;
      const x1 = cxw - wW / 2, x2 = cxw + wW / 2, ya = cyw - wH / 2, yb = cyw + wH / 2;
      line("cut", x1 + rw, ya, x2 - rw, ya);
      bez("cut", [[x2 - rw, ya], [x2 - rw + k, ya], [x2, ya + rw - k], [x2, ya + rw]]);
      line("cut", x2, ya + rw, x2, yb - rw);
      bez("cut", [[x2, yb - rw], [x2, yb - rw + k], [x2 - rw + k, yb], [x2 - rw, yb]]);
      line("cut", x2 - rw, yb, x1 + rw, yb);
      bez("cut", [[x1 + rw, yb], [x1 + rw - k, yb], [x1, yb - rw + k], [x1, yb - rw]]);
      line("cut", x1, yb - rw, x1, ya + rw);
      bez("cut", [[x1, ya + rw], [x1, ya + rw - k], [x1 + rw - k, ya], [x1 + rw, ya]]);
    }
  }

  // ---- END-PANEL CLOSURE CHECK (31-Oct-2026, Mog Mog cube sample "box is not shutting") ----
  // Folded, each end is a P x Q panel: two side flaps come in from the walls, the base flap (lock slit at H/2) and the
  // lid flap (tab) close over them. The proven reference has the side flaps MEET (2.6 mm gap) with their angled corners
  // on the slit ends (1.0 mm inside). Crossing flaps or corners well inside the slit = the tab cannot lock.
  const slitInset = SLIT_INSET * sh;
  const closure = {
    endWidthPt: P,
    endHeightPt: Q,
    sideFlapDepthPt: F2,
    sideFlapGapPt: P - 2 * F2, // < 0 = the two side flaps cross
    sideCornerAtSlitPt: 90 * k, // side-flap depth at the slit level
    cornerOutsideSlitPt: slitInset - 90 * k, // < 0 = corner sits inside the slit opening
    slitPt: P - 2 * slitInset,
    tabRootPt: P - 180 * sh,
    lockScale: { s, sh, k },
  };
  if (closure.sideFlapGapPt < 0) {
    warnings.push(
      `Side flaps CROSS by ${fmtDim(-closure.sideFlapGapPt, units)} on the end panel — the box will not shut (Mog Mog 100 mm cube sample). ` +
        `Make the box longer for its height, or shorten the side flaps.`,
    );
  }
  // the reference itself has the corner (90 - 87.16) x s inside the slit; warn only when > 1 mm worse than that
  if (closure.cornerOutsideSlitPt < (SLIT_INSET - 90) * s - PT_PER_MM) {
    warnings.push(
      `Side-flap corners sit ${fmtDim(-closure.cornerOutsideSlitPt, units)} inside the lock slit — the lid tab will hit them.`,
    );
  }

  const blank = {
    widthPt: xE,
    heightPt: B + 2 * F,
    panels: { xA, xB, xC, xD, xE, yT, yB },
    flapDepthPt: F,
    sideFlapDepthPt: F2,
    tuckDepthPt: TUCK_DEPTH,
    closure,
  };

  return { segments, blank, warnings, valid: warnings.length === 0 || P >= minP || sh >= 0.6 };
}

// Emit a chain of ["m"|"l"|"c", ...points] into cut segments via `map`.
function emitPath(segments, map, ops) {
  let cur = null;
  for (const op of ops) {
    const kind = op[0];
    if (kind === "m") {
      cur = op[1];
      continue;
    }
    if (kind === "l") {
      segments.push({ layer: "cut", kind: "l", pts: [map(cur), map(op[1])] });
      cur = op[1];
    } else if (kind === "c") {
      segments.push({ layer: "cut", kind: "c", pts: [map(cur), map(op[1]), map(op[2]), map(op[3])] });
      cur = op[3];
    }
  }
}

// Quarter-circle as a cubic bezier between two points on the arc.
// corner: which corner of the rounded rectangle ("tl" | "bl" here).
function arc90(bez, x1, y1, x2, y2, corner) {
  const r = Math.abs(y2 - y1);
  const k = KAPPA * r;
  if (corner === "tl") {
    // going left then curving down
    bez("cut", [[x1, y1], [x1 - k, y1], [x2, y2 - k], [x2, y2]]);
  } else {
    // "bl": coming down the left edge then curving right
    bez("cut", [[x1, y1], [x1, y1 + k], [x2 - k, y2], [x2, y2]]);
  }
}

export function fmtDim(pt, units) {
  return units === "mm" ? `${(pt / PT_PER_MM).toFixed(0)} mm` : `${(pt / PT_PER_IN).toFixed(2)}"`;
}
