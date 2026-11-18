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

export function buildCartonDieline({ L, W, H, cartonType = "rte", thickness, windowW, windowH, glue, glueSide = "left", holes = 1, notch = false, thumbNotch = true, tuck, units = "mm" }) {
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
  // tuck depth: explicit `tuck` (mm) wins — cup-holder cartons use 10 mm (Arjun
  // 29-Sep-2026, "The tuck ends are 10 mm"); else the ~20 mm friction-lock default
  const dT = +tuck > 0 ? toMm(+tuck) : Math.max(10, Math.min(20, Wm - 4));
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
  // crash-lock (auto) bottom — calibrated to the Papierus production dieboard
  // P042775 (205 x 115 x 100, 18-Oct-2026): L flaps reach W/2 + 19.5, W flaps W/2
  const dCL = Wm / 2 + 19.5; // crash-lock L (lock) flap depth — 77.0 at W 115
  const dCS = Wm / 2; // crash-lock W flap depth — 57.5 at W 115
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
  // glue flap, on whichever end it lives: ONE straight slant cut at each end
  // (fold corner -> outer edge), then a straight outer edge. Slant = 15 deg
  // off square (standard carton glue-flap angle): drop = g x tan 15 (~2.7 mm
  // on a 10 mm flap). Arjun 28-Sep: "make it one slant cut" then "too sharp"
  // (the first 45 deg / 10 mm version).
  const gc = Math.min(g * Math.tan((15 * Math.PI) / 180), Hm / 4); // chamfer drop
  // crash-lock end of the glue flap is cut at 45 deg (drop = glue width) so it clears
  // the auto-bottom flaps — Papierus die: 15 mm glue, 15 mm drop at the crash-lock end,
  // 4 mm (15 deg) at the tuck end
  const gcB = botTuck ? gc : Math.min(g, Hm / 4);
  if (gR) {
    const xo = xE;
    line("cut", xGlue, y0, xo, y0 + gc);
    line("cut", xo, y0 + gc, xo, y1 - gcB);
    line("cut", xo, y1 - gcB, xGlue, y1);
    line("cut", 0, y0, 0, y1); // free edge of the first side panel
  } else {
    line("cut", xF, y0, x0, y0 + gc);
    line("cut", x0, y0 + gc, x0, y1 - gcB);
    line("cut", x0, y1 - gcB, xF, y1);
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
    // tuck is FLUSH with the panel edges (per Arjun's production sample,
    // IMG_3224-3227). Friction lock = a cut SLIT along the tuck fold at each
    // corner, running in from the panel edge, set ~1 mm OUT toward the tuck
    // with a small jog back to the crease — so the top panel keeps a tiny lip
    // at each corner that hooks behind the dust flaps when the tuck goes in.
    const xl = xa, xr = xa + Lm;
    const sl = Math.min(7, Lm * 0.08); // slit length from the corner — MEASURED 7 mm (IMG_3228 ruler, 91 mm panel)
    const jg = Math.max(0.7, 2 * t); // slit offset toward the tuck — MEASURED ~0.7 mm on 350 gsm kraft
    const yS = yPanel + dir * jg; // slit line
    line("crease", xa, yFold, xa + Lm, yFold);
    // panel side edges run on into the tuck sides (continuous cut)
    line("cut", xa, yFold, xa, yS);
    line("cut", xa + Lm, yFold, xa + Lm, yS);
    // corner slits + jogs back to the fold
    line("cut", xl, yS, xl + sl, yS);
    line("cut", xl + sl, yS, xl + sl, yPanel);
    line("cut", xr, yS, xr - sl, yS);
    line("cut", xr - sl, yS, xr - sl, yPanel);
    // tuck fold, with an optional centred thumb notch (a "U" cut into the panel).
    // thumbNotch=false gives a plain straight tuck fold — Arjun 29-Sep-2026
    // ("Can we remove the U cuts?") on the cup-holder carton, where the tuck is
    // never thumbed open: the cup is dropped through the front-panel hole instead.
    if (thumbNotch) {
      const nR = Math.min(9, Lm * 0.12);
      const cx = xa + Lm / 2;
      line("crease", xl + sl, yPanel, cx - nR, yPanel);
      line("crease", cx + nR, yPanel, xr - sl, yPanel);
      bez("cut", [cx - nR, yPanel], [cx - nR, yPanel - dir * nR * 1.1], [cx + nR, yPanel - dir * nR * 1.1], [cx + nR, yPanel]);
    } else {
      line("crease", xl + sl, yPanel, xr - sl, yPanel);
    }
    // tuck sides (parallel), rounded tip corners, tip edge
    line("cut", xl, yS, xl, yTuck - dir * rT);
    line("cut", xr, yS, xr, yTuck - dir * rT);
    const K = 0.5523;
    bez("cut", [xl, yTuck - dir * rT], [xl, yTuck - dir * rT * (1 - K)], [xl + rT * (1 - K), yTuck], [xl + rT, yTuck]);
    line("cut", xl + rT, yTuck, xr - rT, yTuck);
    bez("cut", [xr - rT, yTuck], [xr - rT * (1 - K), yTuck], [xr, yTuck - dir * rT * (1 - K)], [xr, yTuck - dir * rT]);
  };

  // dust flap on a side panel [xa, xa+Wm] (Arjun's production sample,
  // IMG_3216, 28-Sep): the edge that faces the TUCK panel is straight (square
  // to the fold, 2 mm gap via a 45 deg root chamfer); the edge AWAY from the tuck panel runs
  // straight for a short root, then slants in to the tip. Square tip corners.
  // Which edge faces the tuck panel depends on the tube order, so the flap is
  // mirrored per side panel (was always slanted on the left = wrong on one side).
  const tube = gR ? [xS1, xF, xS2, xB] : [xF, xS1, xB, xS2]; // cyclic panel order
  const dustFlap = (xa, dir, tuckX) => {
    const yFold = dir === -1 ? y0 : y1;
    const tip = yFold + dir * dD;
    const i = tube.indexOf(xa);
    const faceRight = tube[(i + 1) % 4] === tuckX; // tuck panel sits on this panel's right
    const root = Math.min(8, 0.22 * dD); // straight run before the slant
    const tap = Math.min(0.2 * Wm, 0.3 * dD); // slant inset at the tip
    // local u: 0 = edge facing the tuck panel -> Wm = far edge
    const X = (u) => (faceRight ? xa + Wm - u : xa + u);
    // clearance to the tuck panel: 45 deg chamfer from the fold corner into a
    // parallel 2 mm gap (ruler-measured on the sample, IMG_3220, 28-Sep) so the
    // flap folds in without binding on the lid panel edge.
    const cl = 2;
    line("crease", xa, yFold, xa + Wm, yFold);
    line("cut", X(0), yFold, X(cl), yFold + dir * cl); // 45 deg root chamfer
    line("cut", X(cl), yFold + dir * cl, X(cl), tip); // straight edge (tuck side)
    line("cut", X(cl), tip, X(Wm - tap), tip); // tip edge
    line("cut", X(Wm - tap), tip, X(Wm), yFold + dir * root); // slant
    line("cut", X(Wm), yFold + dir * root, X(Wm), yFold); // straight root, flush
  };

  // plain edge (no closure) across a panel
  const plainEdge = (xa, wid, dir) => {
    const yFold = dir === -1 ? y0 : y1;
    line("cut", xa, yFold, xa + wid, yFold);
  };

  // ---- top: tuck always on FRONT ----
  tuckClosure(xF, -1);
  dustFlap(xS1, -1, xF);
  plainEdge(xB, Lm, -1);
  dustFlap(xS2, -1, xF);

  // ---- bottom ----
  if (botTuck) {
    const xa = cartonType === "ste" ? xF : xB; // STE same panel, RTE opposite
    tuckClosure(xa, +1);
    dustFlap(xS1, +1, xa);
    dustFlap(xS2, +1, xa);
    plainEdge(cartonType === "ste" ? xB : xF, Lm, +1);
  } else {
    // crash-lock (auto) bottom, PRODUCTION geometry from the Papierus dieboard
    // P042775 (205 x 115 x 100 mm, 18-Oct-2026). Both L panels carry the LOCK flap
    // with the glued gusset: a 45 deg CUT-CREASE (10 mm crease / 10 mm cut, alternating,
    // crease at both ends) runs from the leading corner to (W/2, W/2); the area behind
    // it is glued to the neighbouring W flap when the carton is glued flat. Lock edge:
    // flat at depth W/2 to L/2, a 3.5 mm step, a 16 mm rise over 44 mm to full depth
    // (W/2 + 19.5), flat, then a steep run back to the trailing corner. Both W panels
    // carry a plain trapezoid: 45 deg leading edge, flat tip at W/2, slant back.
    // Locking dims (step 3.5, rise 16 over 44, nick, insets) are ABSOLUTE — never scaled.
    const CC = 10.05; // cut-crease dash length along the diagonal
    for (const xa of [xF, xB]) {
      const dx = (u) => xa + u;
      line("crease", xa, y1, xa + Lm, y1);
      // leading corner: 45 deg nick out to 7.4 and back to the 2 mm inset edge
      line("cut", dx(0.7), y1, dx(8.1), y1 + 7.4);
      line("cut", dx(8.1), y1 + 7.4, dx(2), y1 + 13.6);
      line("cut", dx(2), y1 + 13.6, dx(2), y1 + dCL);
      const xc = Math.max(2, Wm / 2 - (dCL - Wm / 2)); // start of the 45 deg chamfer (38 at W 115)
      line("cut", dx(2), y1 + dCL, dx(xc), y1 + dCL);
      line("cut", dx(xc), y1 + dCL, dx(Wm / 2), y1 + Wm / 2);
      const xm = Math.max(Wm / 2 + 2, Lm / 2); // lock step at the panel centre
      line("cut", dx(Wm / 2), y1 + Wm / 2, dx(xm), y1 + Wm / 2);
      line("cut", dx(xm), y1 + Wm / 2, dx(xm), y1 + Wm / 2 + 3.5);
      const xr = Math.min(Lm - 8, xm + 44); // 16 mm rise over 44 mm to full depth
      line("cut", dx(xm), y1 + Wm / 2 + 3.5, dx(xr), y1 + dCL);
      line("cut", dx(xr), y1 + dCL, dx(Lm - 7.7), y1 + dCL);
      line("cut", dx(Lm - 7.7), y1 + dCL, dx(Lm - 1), y1 + 0.4);
      line("cut", dx(Lm - 1), y1 + 0.4, dx(Lm), y1);
      line("cut", xa, y1, dx(0.7), y1);
      // 45 deg cut-crease, crease at both ends
      const a0 = 7.8, a1 = Wm / 2, len = (a1 - a0) * Math.SQRT2;
      const n = Math.max(1, Math.round(len / CC)), step = (a1 - a0) / n;
      for (let k = 0; k < n; k++) {
        const u0 = a0 + k * step, u1 = u0 + step;
        line(k % 2 === 0 ? "crease" : "cut", dx(u0), y1 + u0, dx(u1), y1 + u1);
      }
    }
    for (const xa of [xS1, xS2]) {
      const dx = (u) => xa + u;
      const run = 0.24 * Wm; // trailing slant run (27.6 at W 115)
      line("crease", xa, y1, xa + Wm, y1);
      line("cut", dx(xa === 0 ? 0 : 0.7), y1, dx(dCS + (xa === 0 ? 0 : 0.7)), y1 + dCS);
      line("cut", dx(dCS + (xa === 0 ? 0 : 0.7)), y1 + dCS, dx(Wm - run), y1 + dCS);
      line("cut", dx(Wm - run), y1 + dCS, dx(Wm - 0.7), y1);
      line("cut", dx(Wm - 0.7), y1, dx(Wm), y1);
      if (xa !== 0) line("cut", xa, y1, dx(0.7), y1);
    }
  }

  const S = PT_PER_MM;
  // optional CUP HOLE(S) in the FRONT panel (the tuck panel on STE): petal cut
  // — opening cut under size, 12 slits out to a crease ring, so the tabs fold
  // down and grip the cup. windowW = crease-ring Ø, windowH = cut Ø.
  // holes = cups in a row along the panel HEIGHT (between the two tuck ends),
  // evenly pitched (pitch = H / holes, each centred in its share) — 2 = double
  // holder: same tube as the single (L x W), H grows (Arjun's sample IMG_3253-55).
  const ringD = +windowW > 0 ? toMm(+windowW) : 0;
  const cutD = +windowH > 0 ? toMm(+windowH) : ringD > 0 ? ringD - 24 : 0;
  const nH = Math.max(1, Math.round(+holes || 1));
  const pitch = Hm / nH;
  const holeDims = [];
  if (ringD > 0) {
    const K = 0.5522847498, SLITS = 12, SLIT_W = 1.2;
    const cx = xF + Lm / 2, rO = ringD / 2, rI = Math.max(4, cutD / 2);
    if (ringD > Math.min(Lm, pitch) - 16) warnings.push(`Cup hole ring Ø${ringD} leaves under 8 mm of front-panel board ${nH > 1 ? "between/beside the holes" : "each side"} — reduce the hole or enlarge the carton.`);
    for (let h = 0; h < nH; h++) {
      const cy = y0 + pitch * (h + 0.5);
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
      if (h === 0) {
        holeDims.push(
          // ring dim below a single hole; above the first hole when several (keeps the gap between holes clear)
          { x1: (cx - rO) * S, y1: (nH > 1 ? cy - rO - 6 : cy + rO + 6) * S, x2: (cx + rO) * S, y2: (nH > 1 ? cy - rO - 6 : cy + rO + 6) * S, valuePt: ringD * S, label: "cup hole ring \u00d8 {v}", rotated: false },
          { x1: (cx - rI) * S, y1: (cy + 8) * S, x2: (cx + rI) * S, y2: (cy + 8) * S, valuePt: 2 * rI * S, label: "cut \u00d8 {v}", rotated: false },
        );
      }
    }
    // CENTRE NOTCH between neighbouring holes (Arjun's double-holder sample,
    // IMG_3253/3257/3258, ruler-measured 29-Sep): an I-cut push-in tab — 25 mm
    // cut slit along the tube direction with 12 mm cross-cuts at both ends,
    // creases on the two long sides — set 12 mm in from the front panel's
    // fold to the side panel that leads to the back.
    if (notch && nH > 1) {
      const NL = 25, NW = 12, NOFF = 12;
      const nx1 = xF + Lm - NOFF, nx0 = nx1 - NL;
      for (let h = 1; h < nH; h++) {
        const yc = y0 + pitch * h;
        line("cut", nx0, yc, nx1, yc);
        line("cut", nx0, yc - NW / 2, nx0, yc + NW / 2);
        line("cut", nx1, yc - NW / 2, nx1, yc + NW / 2);
        line("crease", nx0, yc - NW / 2, nx1, yc - NW / 2);
        line("crease", nx0, yc + NW / 2, nx1, yc + NW / 2);
        if (h === 1) {
          holeDims.push(
            { x1: nx0 * S, y1: (yc - NW / 2 - 5) * S, x2: nx1 * S, y2: (yc - NW / 2 - 5) * S, valuePt: NL * S, label: "notch {v}", rotated: false },
            { x1: nx1 * S, y1: (yc + NW / 2 + 5) * S, x2: (xF + Lm) * S, y2: (yc + NW / 2 + 5) * S, valuePt: NOFF * S, label: "{v}", rotated: false },
          );
        }
      }
    }
    if (nH > 1) {
      const c0 = y0 + pitch / 2, xd = cx - rO - 6;
      holeDims.push({ x1: xd * S, y1: c0 * S, x2: xd * S, y2: (c0 + pitch) * S, valuePt: pitch * S, label: "hole pitch {v}", rotated: true });
    }
  }

  const segments = segs.map((s) => ({ ...s, pts: s.pts.map(([x, y]) => [x * S, y * S]) }));
  const blank = { widthPt: xE * S, heightPt: BH * S, flapDepthPt: topP * S, style: "carton" };
  const dims = [
    { x1: xB * S, y1: (y0 + Hm / 2) * S, x2: (xB + Lm) * S, y2: (y0 + Hm / 2) * S, valuePt: Lm * S, rotated: false },
    { x1: xS1 * S, y1: (y0 + Hm / 2) * S, x2: (xS1 + Wm) * S, y2: (y0 + Hm / 2) * S, valuePt: Wm * S, rotated: false },
    { x1: (gR ? xGlue : 0) * S, y1: (y0 + gc + 8) * S, x2: (gR ? xE : g) * S, y2: (y0 + gc + 8) * S, valuePt: g * S, label: "glue {v}", rotated: false },
    { x1: (xE + 6) * S, y1: y0 * S, x2: (xE + 6) * S, y2: y1 * S, valuePt: Hm * S, rotated: true },
    { x1: 0, y1: BH * S + 17, x2: xE * S, y2: BH * S + 17, valuePt: xE * S, rotated: false },
    ...holeDims,
    // tuck depth on the sheet when it was set explicitly (top tuck, left of the lid)
    ...(+tuck > 0 ? [{ x1: (xF - 4) * S, y1: (y0 - topP - dT) * S, x2: (xF - 4) * S, y2: (y0 - topP) * S, valuePt: dT * S, label: "tuck {v}", rotated: true }] : []),
  ];
  return { segments, blank, dims, warnings, valid: true };
}
