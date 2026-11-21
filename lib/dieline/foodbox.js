// Parametric dieline (KLD) for the Aeros leakproof folded FOOD BOX.
//
// Reverse-engineered from the reference die "500 mL Food Box - AEROS -
// (144 x 104 x 40 mm)" (drawn at exact 1:1, 72 dpi). Construction: a tapered
// one-piece tray — base (L-14) x (W-14), four flared walls (7 mm taper per
// side), sealed corners via rounded gusset webs, top/bottom walls carry
// rounded lips with a centre slot + two locking holes, the free side wall
// carries four locking teeth, and the lid (L x W) hinges off the opposite
// wall with two V-notches per edge and an 18 mm rounded lip whose two
// bracket slots catch the teeth.
//
// Scaling rules (validated against the reference):
//   - taper T = 7 mm fixed; base = (L-2T) x (W-2T)
//   - teeth / lip-slot positions scale with base length (Lb/130)
//   - gusset web scales with wall height (H/40)
//   - lips, slots, holes, notch sizes are fixed functional sizes
//
// Dimensions are the INTERNAL TOP OPENING (L x W) and wall height H — same
// convention as the reference title block. All output in points, y-down,
// blank top-left at (0,0).

import { PT_PER_MM } from "./cakebox.js";

const DEFAULT_TAPER = 7; // wall taper per side (mm)
const REF_LB = 130; // reference base length
const REF_H = 40; // reference wall height

// fixed functional sizes (mm)
const LIP_LID = 18; // lid lip depth
const LIP_TB = 15.5; // top/bottom wall lip depth
const TOOTH_HALF = 3.5;
const TOOTH_TIP = 7;
const SLOT_W = 30; // wall-lip slot width
const HOLE_R = 2.5;
const NOTCH_HALF = 3.5; // lid V-notch

const HINGE_SLIT = 10;

export function buildFoodboxDieline({ L, W, H, taper, units = "mm" }) {
  const toMm = units === "in" ? (v) => v * 25.4 : (v) => v;
  const Lmm = toMm(L);
  const Wmm = toMm(W);
  const Hmm = toMm(H);
  const T = +taper > 0 ? +taper : DEFAULT_TAPER;

  const warnings = [];
  if (!(Lmm > 0) || !(Wmm > 0) || !(Hmm > 0)) {
    return { segments: [], blank: null, warnings: ["All dimensions must be positive."], valid: false };
  }
  const Lb = Lmm - 2 * T;
  const Wb = Wmm - 2 * T;
  if (Lb < 40 || Wb < 40) {
    return { segments: [], blank: null, warnings: [`Too small — internal top opening must be at least ${40 + 2 * T} mm each way (${T} mm taper per side).`], valid: false };
  }
  if (Wb < SLOT_W + 14) warnings.push("Width is tight for the lip slot — check the lock before cutting a die.");
  if (Hmm < 25 || Hmm > 80) warnings.push("Height is outside the proven 25–80 mm range — gusset proportions are extrapolated.");
  if (Lmm < Wmm) warnings.push("Length is smaller than width — the lid hinges on a long side; check orientation.");

  const sL = Lb / REF_LB; // tooth / slot spread scale
  const g = Hmm / REF_H; // gusset scale
  const d1 = 19 * sL; // inner tooth-tip offset from centre
  const d2 = 49 * sL; // outer tooth-tip offset from centre
  const cy = Lb / 2; // vertical centre (base frame)
  const cx = Wb / 2;

  // Work in mm with origin at the BASE panel top-left; translate at the end.
  const segs = [];
  const line = (layer, x1, y1, x2, y2) => segs.push({ layer, kind: "l", pts: [[x1, y1], [x2, y2]] });
  const bez = (layer, p0, p1, p2, p3) => segs.push({ layer, kind: "c", pts: [p0, p1, p2, p3] });

  // ---- creases ----
  line("crease", 0, 0, Wb, 0);
  line("crease", Wb, 0, Wb, Lb);
  line("crease", Wb, Lb, 0, Lb);
  line("crease", 0, Lb, 0, 0);
  line("crease", -T, -Hmm, Wb + T, -Hmm); // top wall rim -> lip
  line("crease", -T, Lb + Hmm, Wb + T, Lb + Hmm); // bottom wall rim -> lip
  // lid hinge (with centre slit cut out)
  line("crease", Wb + Hmm, -T, Wb + Hmm, cy - HINGE_SLIT / 2);
  line("crease", Wb + Hmm, cy + HINGE_SLIT / 2, Wb + Hmm, Lb + T);
  line("cut", Wb + Hmm, cy - HINGE_SLIT / 2, Wb + Hmm, cy + HINGE_SLIT / 2);
  line("crease", Wb + Hmm + Wmm, -T, Wb + Hmm + Wmm, Lb + T); // lid -> lid lip
  // gusset diagonals (full folds against left/right walls)
  line("crease", 0, 0, -Hmm, -T);
  line("crease", 0, Lb, -Hmm, Lb + T);
  line("crease", Wb, 0, Wb + Hmm, -T);
  line("crease", Wb, Lb, Wb + Hmm, Lb + T);

  // ---- top & bottom walls + lips + gussets (mirrored about y = cy) ----
  for (const dir of [-1, +1]) {
    // dir -1 = top wall field (negative y), +1 = bottom
    const m = (y) => (dir === -1 ? y : Lb - y); // mirror helper on reference coords
    // wall flare edges: shared-with-gusset fold for the first stretch, cut above
    const k = { x: (-5.82 * g * T) / Hmm, y: -5.82 * g }; // kink sits on the flare line (slope T/H)
    line("crease", 0, m(0), k.x, m(k.y));
    line("cut", k.x, m(k.y), -T, m(-Hmm));
    line("crease", Wb, m(0), Wb - k.x, m(k.y));
    line("cut", Wb - k.x, m(k.y), Wb + T, m(-Hmm));
    // wall lip (rounded trapezoid) — fixed depth, radius scaled from reference
    const yr = m(-Hmm); // rim y
    const yo = m(-Hmm - 12.03); // corner curve start
    const yl = m(-Hmm - LIP_TB); // lip outer edge
    line("cut", -T, yr, -T + 3.88, yo);
    bez("cut", [-T + 3.88, yo], [-T + 4.55, m(-Hmm - 14.1)], [-T + 6.47, yl], [-T + 8.64, yl]);
    line("cut", -T + 8.64, yl, Wb + T - 8.64, yl);
    bez("cut", [Wb + T - 8.64, yl], [Wb + T - 6.47, yl], [Wb + T - 4.55, m(-Hmm - 14.1)], [Wb + T - 3.88, yo]);
    line("cut", Wb + T - 3.88, yo, Wb + T, yr);
    // lip slot (three cut sides, opening outward)
    const ys1 = m(-Hmm - 6);
    const ys2 = m(-Hmm - 11);
    line("cut", cx + SLOT_W / 2, ys2, cx + SLOT_W / 2, ys1);
    line("cut", cx + SLOT_W / 2, ys1, cx - SLOT_W / 2, ys1);
    line("cut", cx - SLOT_W / 2, ys1, cx - SLOT_W / 2, ys2);
    // locking holes at wall mid-height
    for (const hx of [cx - 15.6, cx + 15.6]) circle(segs, hx, m(-Hmm / 2), HOLE_R);
    // gussets, left and right of this wall
    for (const side of [-1, +1]) {
      // side -1 = left, +1 = right; reference gusset (top-left) scaled by g
      const gx = (x) => (side === -1 ? x : Wb - x);
      line("cut", gx(k.x), m(k.y), gx(-5.02 * g), m(-7.82 * g));
      line("cut", gx(-5.02 * g), m(-7.82 * g), gx(-13.85 * g), m(-26.78 * g));
      bez(
        "cut",
        [gx(-13.85 * g), m(-26.78 * g)],
        [gx(-14.57 * g), m(-28.32 * g)],
        [gx(-16.03 * g), m(-29.39 * g)],
        [gx(-17.71 * g), m(-29.62 * g)],
      );
      bez(
        "cut",
        [gx(-17.71 * g), m(-29.62 * g)],
        [gx(-19.4 * g), m(-29.85 * g)],
        [gx(-21.09 * g), m(-29.21 * g)],
        [gx(-22.19 * g), m(-27.91 * g)],
      );
      line("cut", gx(-22.19 * g), m(-27.91 * g), gx(-Hmm), m(-T));
    }
  }

  // ---- left (free) wall with locking teeth ----
  line("cut", -Hmm, -T, -Hmm, cy - d2 - TOOTH_HALF);
  tooth(line, -Hmm, cy - d2);
  line("cut", -Hmm, cy - d2 + TOOTH_HALF, -Hmm, cy - d1 - TOOTH_HALF);
  tooth(line, -Hmm, cy - d1);
  line("cut", -Hmm, cy - d1 + TOOTH_HALF, -Hmm, cy + d1 - TOOTH_HALF);
  tooth(line, -Hmm, cy + d1);
  line("cut", -Hmm, cy + d1 + TOOTH_HALF, -Hmm, cy + d2 - TOOTH_HALF);
  tooth(line, -Hmm, cy + d2);
  line("cut", -Hmm, cy + d2 + TOOTH_HALF, -Hmm, Lb + T);

  // ---- lid (hinges on the right wall) ----
  const lx0 = Wb + Hmm; // hinge x
  const lx1 = lx0 + Wmm; // lip fold x
  for (const dir of [-1, +1]) {
    const ye = dir === -1 ? -T : Lb + T; // lid edge y
    const yv = dir === -1 ? 0 : Lb; // notch tip y (taper deep = on the base line)
    const c1 = lx0 + Wmm / 2 - 15;
    const c2 = lx0 + Wmm / 2 + 15;
    line("cut", lx0, ye, c1 - NOTCH_HALF, ye);
    line("cut", c1 - NOTCH_HALF, ye, c1, yv);
    line("cut", c1, yv, c1 + NOTCH_HALF, ye);
    line("cut", c1 + NOTCH_HALF, ye, c2 - NOTCH_HALF, ye);
    line("cut", c2 - NOTCH_HALF, ye, c2, yv);
    line("cut", c2, yv, c2 + NOTCH_HALF, ye);
    line("cut", c2 + NOTCH_HALF, ye, lx1, ye);
  }

  // ---- lid lip (rounded, with two bracket slots that catch the teeth) ----
  const r = 2.25;
  line("cut", lx1, -T, lx1 + 14.34, -T + 3.98);
  bez("cut", [lx1 + 14.34, -T + 3.98], [lx1 + 16.5, -T + 4.58], [lx1 + LIP_LID, -T + 6.55 + r * 0], [lx1 + LIP_LID, -T + 8.8]);
  line("cut", lx1 + LIP_LID, -T + 8.8, lx1 + LIP_LID, Lb + T - 8.8);
  bez("cut", [lx1 + LIP_LID, Lb + T - 8.8], [lx1 + LIP_LID, Lb + T - 6.55], [lx1 + 16.5, Lb + T - 4.58], [lx1 + 14.34, Lb + T - 3.98]);
  line("cut", lx1 + 14.34, Lb + T - 3.98, lx1, Lb + T);
  for (const dir of [-1, +1]) {
    const s1 = cy + dir * d1;
    const s2 = cy + dir * d2;
    const [ya, yb] = dir === -1 ? [s2, s1] : [s1, s2];
    line("cut", lx1 + 11.5, ya, lx1 + 6.5, ya);
    line("cut", lx1 + 6.5, ya, lx1 + 6.5, yb);
    line("cut", lx1 + 6.5, yb, lx1 + 11.5, yb);
  }

  // ---- translate to blank origin & convert to points ----
  const minX = -Hmm - 0; // teeth wall rim
  const minY = -Hmm - LIP_TB;
  const maxX = lx1 + LIP_LID;
  const maxY = Lb + Hmm + LIP_TB;
  const S = PT_PER_MM;
  const segments = segs.map((s) => ({
    ...s,
    pts: s.pts.map(([x, y]) => [(x - minX) * S, (y - minY) * S]),
  }));

  const blank = {
    widthPt: (maxX - minX) * S,
    heightPt: (maxY - minY) * S,
    flapDepthPt: Hmm * S,
    style: "foodbox",
    // frame (mm) for the 3D fold program: blank origin offset of the base panel's top-left corner, base size, taper, sizes
    frame: { ox: -minX, oy: -minY, Wb, Lb, T, H: Hmm, W: Wmm, L: Lmm, g, d1, lipLid: LIP_LID, lipWall: LIP_TB },
  };

  // dimension annotations (pt, blank frame)
  const X = (x) => (x - minX) * S;
  const Y = (y) => (y - minY) * S;
  const dims = [
    { x1: X(-T), y1: Y(minY) - 15, x2: X(Wb + T), y2: Y(minY) - 15, valuePt: Wmm * S, rotated: false }, // W across top wall rim
    { x1: X(0), y1: Y(cy), x2: X(-Hmm), y2: Y(cy), valuePt: Hmm * S, rotated: false }, // H across left wall
    { x1: X(lx0), y1: Y(cy), x2: X(lx1), y2: Y(cy), valuePt: Wmm * S, rotated: false }, // W across lid
    { x1: X(lx1 + LIP_LID) + 17, y1: Y(-T), x2: X(lx1 + LIP_LID) + 17, y2: Y(Lb + T), valuePt: Lmm * S, rotated: true }, // L down the lid
    { x1: X(minX), y1: Y(maxY) + 17, x2: X(maxX), y2: Y(maxY) + 17, valuePt: (maxX - minX) * S, rotated: false }, // overall
  ];

  return { segments, blank, dims, warnings, valid: true };
}

function tooth(line, xr, yTip) {
  // locking tooth on the free wall rim: rim -> tip (7 mm inward) -> rim
  line("cut", xr, yTip - 3.5, xr + TOOTH_TIP, yTip);
  line("cut", xr + TOOTH_TIP, yTip, xr, yTip + 3.5);
}

function circle(segs, cxm, cym, r) {
  const k = 0.5523 * r;
  const p = (x, y) => [x, y];
  segs.push(
    { layer: "cut", kind: "c", pts: [p(cxm, cym - r), p(cxm + k, cym - r), p(cxm + r, cym - k), p(cxm + r, cym)] },
    { layer: "cut", kind: "c", pts: [p(cxm + r, cym), p(cxm + r, cym + k), p(cxm + k, cym + r), p(cxm, cym + r)] },
    { layer: "cut", kind: "c", pts: [p(cxm, cym + r), p(cxm - k, cym + r), p(cxm - r, cym + k), p(cxm - r, cym)] },
    { layer: "cut", kind: "c", pts: [p(cxm - r, cym), p(cxm - r, cym - k), p(cxm - k, cym - r), p(cxm, cym - r)] },
  );
}
