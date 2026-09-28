// Folding CARTON dielines — the product-box family:
//   - Straight Tuck End (STE): top and bottom tucks on the same panel
//   - Reverse Tuck End (RTE): tucks on opposite panels
//   - Crash-lock bottom (snap/auto bottom) with tuck top
// Standard industry construction (no Aeros reference die yet) — the engine
// warns to prototype the first cut. Internal dims L (face width) x W (depth)
// x H (height); tuck/dust proportions follow common practice.

import { PT_PER_MM } from "./cakebox.js";

export const CARTON_TYPES = [
  { id: "ste", label: "Straight tuck end" },
  { id: "rte", label: "Reverse tuck end" },
  { id: "crashlock", label: "Tuck top + crash-lock bottom" },
];

export function buildCartonDieline({ L, W, H, cartonType = "rte", thickness, windowW, windowH, glue, glueSide = "left", units = "mm" }) {
  const toMm = units === "in" ? (v) => v * 25.4 : (v) => v;
  const Lm = toMm(L);
  const Wm = toMm(W);
  const Hm = toMm(H);
  const t = +thickness > 0 ? +thickness : 0.5;

  const warnings = [];
  if (!(Lm > 0) || !(Wm > 0) || !(Hm > 0)) {
    return { segments: [], blank: null, warnings: ["All dimensions must be positive."], valid: false };
  }
  if (Wm < 15) warnings.push("Depth under 15 mm — tucks and dust flaps get very tight.");
  warnings.push("Standard carton construction (no Aeros production reference) — prototype the first cut.");

  const g = +glue > 0 ? toMm(+glue) : Math.max(12, Math.min(20, 0.2 * Lm)); // glue flap
  // standard RTE/STE proportions: the tuck is a ~20 mm friction-lock flap
  // (fixed — it only needs to grip, not reach the bottom; capped for shallow
  // boxes); dust flaps are ~W deep and TAPER INWARD from the fold so they
  // clear each other; the tuck's shoulders sit just inside the panel edges
  const dT = Math.max(10, Math.min(20, Wm - 4)); // tuck depth
  const rT = Math.min(6, dT / 3); // tuck corner radius
  const dD = Math.max(10, Wm - 3); // dust flap depth
  const topP = Wm; // top/bottom panel depth

  // panel x-positions. glueSide "left":  glue | FRONT | SIDE | BACK | SIDE
  //                   glueSide "right": SIDE | FRONT | SIDE | BACK | glue
  // (right = glue seam lands on the back corner, away from the front panel)
  const gR = glueSide === "right";
  const x0 = 0;
  const xF = gR ? Wm : g;
  const xS1 = gR ? 0 : xF + Lm;
  const xS2 = gR ? Wm + Lm : xF + Lm + Wm + Lm;
  const xB = gR ? 2 * Wm + Lm : xF + Lm + Wm;
  const xGlue = gR ? xB + Lm : 0; // glue-flap fold line
  const xE = gR ? xB + Lm + g : xS2 + Wm;

  // closure row extents
  const topH = topP + dT;
  const botTuck = cartonType !== "crashlock";
  const dCL = Wm / 2 + 14; // crash-lock main flap depth
  const dCS = Wm / 2 + 8; // crash-lock side flap depth
  const botH = botTuck ? topP + dT : dCL;
  const y0 = topH; // body top
  const y1 = y0 + Hm; // body bottom
  const BH = y1 + botH;

  const segs = [];
  const line = (layer, xx1, yy1, xx2, yy2) => segs.push({ layer, kind: "l", pts: [[xx1, yy1], [xx2, yy2]] });
  const bez = (layer, p0, p1, p2, p3) => segs.push({ layer, kind: "c", pts: [p0, p1, p2, p3] });

  // ---- body creases (every panel fold, incl. the glue-flap fold) ----
  const folds = gR ? [xF, xS2, xB, xGlue] : [xF, xS1, xB, xS2];
  for (const x of folds) line("crease", x, y0, x, y1);
  // glue flap (chamfered), on whichever end it lives
  if (gR) {
    const xo = xE;
    line("cut", xGlue, y0, xo - 3, y0 + 3);
    line("cut", xo - 3, y0 + 3, xo, y0 + 10);
    line("cut", xo, y0 + 10, xo, y1 - 10);
    line("cut", xo, y1 - 10, xo - 3, y1 - 3);
    line("cut", xo - 3, y1 - 3, xGlue, y1);
    line("cut", 0, y0, 0, y1); // free edge of the first side panel
  } else {
    line("cut", xF, y0, x0 + 3, y0 + 3);
    line("cut", x0 + 3, y0 + 3, x0, y0 + 10);
    line("cut", x0, y0 + 10, x0, y1 - 10);
    line("cut", x0, y1 - 10, x0 + 3, y1 - 3);
    line("cut", x0 + 3, y1 - 3, xF, y1);
    line("cut", xE, y0, xE, y1); // free edge of the last side panel (was missing)
  }

  // tuck closure on a panel [xa, xa+Lm], dir -1 = top, +1 = bottom.
  // Standard RTE geometry: top panel (depth W) then a tuck flap that steps
  // in by a small shoulder (so it slides between the dust flaps), runs
  // parallel down to a rounded tip, with a thumb notch centred on the
  // panel/tuck fold and friction-lock nicks at the shoulders.
  const tuckClosure = (xa, dir) => {
    const yFold = dir === -1 ? y0 : y1;
    const yPanel = yFold + dir * topP;
    const yTuck = yPanel + dir * dT;
    const sh = Math.max(1, Math.min(3, t + 1)); // shoulder inset per side
    const xl = xa + sh, xr = xa + Lm - sh;
    line("crease", xa, yFold, xa + Lm, yFold);
    // panel side edges
    line("cut", xa, yFold, xa, yPanel);
    line("cut", xa + Lm, yFold, xa + Lm, yPanel);
    // shoulders: short horizontal step in from the panel corner
    line("cut", xa, yPanel, xl, yPanel);
    line("cut", xa + Lm, yPanel, xr, yPanel);
    // tuck fold with a centred thumb notch (semicircle into the panel)
    const nR = Math.min(9, Lm * 0.12);
    const cx = xa + Lm / 2;
    line("crease", xl, yPanel, cx - nR, yPanel);
    line("crease", cx + nR, yPanel, xr, yPanel);
    bez("cut", [cx - nR, yPanel], [cx - nR, yPanel - dir * nR * 1.1], [cx + nR, yPanel - dir * nR * 1.1], [cx + nR, yPanel]);
    // friction-lock nicks: tiny slits into the tuck edge just below the shoulders
    const nk = Math.min(1.5, dT * 0.08);
    line("cut", xl, yPanel, xl - nk, yPanel + dir * nk * 1.4);
    line("cut", xl - nk, yPanel + dir * nk * 1.4, xl, yPanel + dir * nk * 2.8);
    line("cut", xr, yPanel, xr + nk, yPanel + dir * nk * 1.4);
    line("cut", xr + nk, yPanel + dir * nk * 1.4, xr, yPanel + dir * nk * 2.8);
    // tuck sides (parallel), rounded tip corners, tip edge
    line("cut", xl, yPanel + dir * nk * 2.8, xl, yTuck - dir * rT);
    line("cut", xr, yPanel + dir * nk * 2.8, xr, yTuck - dir * rT);
    const K = 0.5523;
    bez("cut", [xl, yTuck - dir * rT], [xl, yTuck - dir * rT * (1 - K)], [xl + rT * (1 - K), yTuck], [xl + rT, yTuck]);
    line("cut", xl + rT, yTuck, xr - rT, yTuck);
    bez("cut", [xr - rT, yTuck], [xr - rT * (1 - K), yTuck], [xr, yTuck - dir * rT * (1 - K)], [xr, yTuck - dir * rT]);
  };

  // dust flap on a side panel [xa, xa+Wm]: full width at the fold, TAPERING
  // INWARD toward the tip (both edges lean in), rounded outer corners so the
  // two flaps clear each other and the tuck slides over them.
  const dustFlap = (xa, dir) => {
    const yFold = dir === -1 ? y0 : y1;
    const tip = yFold + dir * dD;
    const inL = Math.min(0.28 * Wm, 0.55 * dD); // taper on the glue-side edge
    const inR = Math.min(0.12 * Wm, 4); // slight taper on the outer edge
    const r = Math.min(5, dD * 0.25);
    line("crease", xa + 1, yFold, xa + Wm - 1, yFold);
    line("cut", xa, yFold, xa + 1, yFold);
    line("cut", xa + Wm - 1, yFold, xa + Wm, yFold);
    // leaning edges
    line("cut", xa + 1, yFold, xa + inL, tip - dir * r);
    line("cut", xa + Wm - 1, yFold, xa + Wm - inR, tip - dir * r);
    // rounded tip corners + tip edge
    bez("cut", [xa + inL, tip - dir * r], [xa + inL, tip - dir * r * 0.45], [xa + inL + r * 0.55, tip], [xa + inL + r, tip]);
    line("cut", xa + inL + r, tip, xa + Wm - inR - r, tip);
    bez("cut", [xa + Wm - inR - r, tip], [xa + Wm - inR - r * 0.45, tip], [xa + Wm - inR, tip - dir * r * 0.55], [xa + Wm - inR, tip - dir * r]);
  };

  // plain edge (no closure) across a panel
  const plainEdge = (xa, wid, dir) => {
    const yFold = dir === -1 ? y0 : y1;
    line("cut", xa, yFold, xa + wid, yFold);
  };

  // ---- top: tuck always on FRONT ----
  tuckClosure(xF, -1);
  dustFlap(xS1, -1);
  plainEdge(xB, Lm, -1);
  dustFlap(xS2, -1);

  // ---- bottom ----
  if (botTuck) {
    const xa = cartonType === "ste" ? xF : xB; // STE same panel, RTE opposite
    tuckClosure(xa, +1);
    dustFlap(xS1, +1);
    dustFlap(xS2, +1);
    plainEdge(cartonType === "ste" ? xB : xF, Lm, +1);
  } else {
    // crash-lock (auto) bottom — L panels carry the lock flaps, W panels the
    // glued triangles with 45° creases.
    for (const xa of [xF, xB]) {
      line("crease", xa, y1, xa + Lm, y1);
      // stepped lock flap: leading half deep with rounded corner, trailing half shallow
      line("cut", xa + 2, y1, xa + 2, y1 + dCL - 6);
      bez("cut", [xa + 2, y1 + dCL - 6], [xa + 2, y1 + dCL - 1.5], [xa + 6, y1 + dCL], [xa + 10, y1 + dCL]);
      line("cut", xa + 10, y1 + dCL, xa + Lm * 0.5, y1 + dCL);
      line("cut", xa + Lm * 0.5, y1 + dCL, xa + Lm * 0.5 + 4, y1 + Wm * 0.45); // lock step
      line("cut", xa + Lm * 0.5 + 4, y1 + Wm * 0.45, xa + Lm - 3, y1 + Wm * 0.45);
      line("cut", xa + Lm - 3, y1 + Wm * 0.45, xa + Lm, y1);
      line("cut", xa, y1, xa + 2, y1); // inset nick
      line("crease", xa + 2, y1, xa + 2 + (dCL - 2), y1 + dCL - 2); // 45° forming crease
    }
    for (const xa of [xS1, xS2]) {
      line("crease", xa, y1, xa + Wm, y1);
      line("cut", xa + 1, y1, xa + 1, y1 + dCS);
      line("cut", xa + 1, y1 + dCS, xa + 1 + dCS, y1 + dCS);
      line("cut", xa + 1 + dCS, y1 + dCS, xa + Wm - 1, y1);
      line("crease", xa + 1, y1, xa + 1 + dCS, y1 + dCS); // 45° forming crease (inside the flap)
    }
  }

  const S = PT_PER_MM;
  // optional CUP HOLE in the FRONT panel (the tuck panel on STE): petal cut —
  // opening cut under size, 12 slits out to a crease ring, so the tabs fold
  // down and grip the cup. windowW = crease-ring Ø, windowH = cut Ø.
  const ringD = +windowW > 0 ? toMm(+windowW) : 0;
  const cutD = +windowH > 0 ? toMm(+windowH) : ringD > 0 ? ringD - 24 : 0;
  const holeDims = [];
  if (ringD > 0) {
    const K = 0.5522847498, SLITS = 12, SLIT_W = 1.2;
    const cx = xF + Lm / 2, cy = y0 + Hm / 2, rO = ringD / 2, rI = Math.max(4, cutD / 2);
    if (ringD > Math.min(Lm, Hm) - 16) warnings.push(`Cup hole ring Ø${ringD} leaves under 8 mm of front-panel board each side — reduce the hole or enlarge the carton.`);
    const circ = (layer, r) => {
      const k = K * r;
      bez(layer, [cx + r, cy], [cx + r, cy - k], [cx + k, cy - r], [cx, cy - r]);
      bez(layer, [cx, cy - r], [cx - k, cy - r], [cx - r, cy - k], [cx - r, cy]);
      bez(layer, [cx - r, cy], [cx - r, cy + k], [cx - k, cy + r], [cx, cy + r]);
      bez(layer, [cx, cy + r], [cx + k, cy + r], [cx + r, cy + k], [cx + r, cy]);
    };
    circ("cut", rI);
    circ("crease", rO);
    for (let i = 0; i < SLITS; i++) {
      const a = (i / SLITS) * 2 * Math.PI + Math.PI / SLITS, dd = SLIT_W / 2 / rI;
      for (const sg of [-1, 1]) {
        const t = a + sg * dd;
        line("cut", cx + rI * Math.cos(t), cy + rI * Math.sin(t), cx + rO * Math.cos(a), cy + rO * Math.sin(a));
      }
    }
    holeDims.push(
      { x1: (cx - rO) * S, y1: (cy + rO + 6) * S, x2: (cx + rO) * S, y2: (cy + rO + 6) * S, valuePt: ringD * S, label: "cup hole ring \u00d8 {v}", rotated: false },
      { x1: (cx - rI) * S, y1: (cy + 8) * S, x2: (cx + rI) * S, y2: (cy + 8) * S, valuePt: 2 * rI * S, label: "cut \u00d8 {v}", rotated: false },
    );
  }

  const segments = segs.map((s) => ({ ...s, pts: s.pts.map(([x, y]) => [x * S, y * S]) }));
  const blank = { widthPt: xE * S, heightPt: BH * S, flapDepthPt: topP * S, style: "carton" };
  const dims = [
    { x1: xB * S, y1: (y0 + Hm / 2) * S, x2: (xB + Lm) * S, y2: (y0 + Hm / 2) * S, valuePt: Lm * S, rotated: false },
    { x1: xS1 * S, y1: (y0 + Hm / 2) * S, x2: (xS1 + Wm) * S, y2: (y0 + Hm / 2) * S, valuePt: Wm * S, rotated: false },
    { x1: (gR ? xGlue : 0) * S, y1: (y0 + 12) * S, x2: (gR ? xE : g) * S, y2: (y0 + 12) * S, valuePt: g * S, label: "glue {v}", rotated: false },
    { x1: (xE + 6) * S, y1: y0 * S, x2: (xE + 6) * S, y2: y1 * S, valuePt: Hm * S, rotated: true },
    { x1: 0, y1: BH * S + 17, x2: xE * S, y2: BH * S + 17, valuePt: xE * S, rotated: false },
    ...holeDims,
  ];
  return { segments, blank, dims, warnings, valid: true };
}
