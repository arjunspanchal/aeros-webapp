// PAPER CUP FAN dieline — the annular-sector sidewall unwrap, calibrated to
// Aeros production dies (circle-fit of the vector KLDs):
//
//   8 oz DW OUTER wall:  top Ø 75.68 | bottom Ø 59.94 | slant 86.44
//   12 oz DW OUTER wall: top Ø 83.71 | bottom Ø 62.80 | slant 105.37
//   shared constants: 7.5 mm glue seam flap, 5 mm bottom crimp band
//
// Maths: slant S, R_bottom = S·Db/(Dt−Db), R_top = R_bottom + S,
// wedge θ = π·Dt/R_top — verified against both dies (θ 0.5722 / 0.6236 rad).
// NOTE: wall dims ≠ cup dims. The DB lists the CUP (rim TD / base BD / H);
// the outer wall sits under the rim curl and flares over the base crimp.
// Die-exact only where a production die was calibrated (per-oz presets).
// Layers: cut (red), crease (green, crimp line), safe (orange dash — keep
// artwork inside; bleed to the cut).

import { PT_PER_MM } from "./cakebox.js";
import { CUP_REF_DIES } from "./cup-refs.js";

export const SEAM = 7.5, CRIMP = 5, SAFE_IN = 5;

// die-exact WALL dims per calibrated reference (outer wall of DW cups)
export const CUP_DIES = {
  "dw8-outer": { label: "8 oz DW — outer wall (die-exact)", Dt: 75.68, Db: 59.94, S: 86.44 },
  "dw12-outer": { label: "12 oz DW — outer wall (die-exact)", Dt: 83.71, Db: 62.8, S: 105.37 },
  "dw16-outer": { label: "16 oz DW — outer wall (die-exact)", Dt: 84.65, Db: 63.99, S: 126.19 },
};

function buildFromRef(id, die, ref, fit) {
  const S = PT_PER_MM;
  const segments = [];
  for (const [tag, list] of [["cut", ref.cut], ["safe", ref.safe]]) {
    for (const s of list) {
      segments.push({ layer: tag, kind: s[0], pts: s.slice(1).map(([x, y]) => [x * S, y * S]) });
    }
  }
  // 8/12 oz files carry the red safe line as raster only — synthesise the
  // standard inset for artwork guidance (clearly generator-added, dashed)
  const synthSafe = ref.safe.length === 0;
  if (synthSafe) {
    const { Rt, Rb, th } = fit;
    const hA = th / 2, aIn = SAFE_IN / Rt;
    // rebuild in the same normalised frame: centre x at ref.w minus flap side
    // — approximate by anchoring the arc chord centre to the blank centre of
    // the arc corners (left corner at x≈0)
    const P = (R, a) => [R * Math.sin(a), R * Math.cos(a)];
    const raw = [];
    const n = 24;
    for (let i = 0; i <= n; i++) raw.push([P(Rt - SAFE_IN, -hA + aIn + (i / n) * (th - 2 * aIn)), 0]);
    // map centre coords -> ref frame: x + chordHalf, y' = apexY - y
    const chordHalf = Rt * Math.sin(hA);
    const apex = Rt;
    const seg = (a, b) => segments.push({ layer: "safe", kind: "l", pts: [a, b].map(([x, y]) => [(x + chordHalf) * S, (apex - y) * S]) });
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const a = -hA + aIn + (i / n) * (th - 2 * aIn);
      const pTop = P(Rt - SAFE_IN, a);
      if (prev) seg(prev, pTop);
      prev = pTop;
    }
    let prevB = null;
    for (let i = 0; i <= n; i++) {
      const a = -hA + aIn + (i / n) * (th - 2 * aIn);
      const pBot = P(Rb + CRIMP + 1, a);
      if (prevB) seg(prevB, pBot);
      prevB = pBot;
    }
    seg(P(Rt - SAFE_IN, -hA + aIn), P(Rb + CRIMP + 1, -hA + aIn));
    seg(P(Rt - SAFE_IN, hA - aIn), P(Rb + CRIMP + 1, hA - aIn));
  }
  const blank = { widthPt: ref.w * S, heightPt: ref.h * S, flapDepthPt: SEAM * S, style: "papercup" };
  const chord = 2 * fit.Rt * Math.sin(fit.th / 2);
  const dims = [
    { x1: 0, y1: -15, x2: ref.w * S, y2: -15, valuePt: ref.w * S, rotated: false },
    { x1: (ref.w + 6) * S, y1: 0, x2: (ref.w + 6) * S, y2: ref.h * S, valuePt: ref.h * S, rotated: true },
  ];
  return {
    segments, blank, dims,
    warnings: [`${die.label} — reference die vectors emitted VERBATIM (flap, corner caps and marks exactly as the production file).${synthSafe ? " Red safe line was raster in the file — the dashed orange boundary is generator-synthesised." : ""}`],
    valid: true,
    meta: { Rt: +fit.Rt.toFixed(2), Rb: +fit.Rb.toFixed(2), theta: +fit.th.toFixed(4), slant: +fit.S.toFixed(2), chord: +chord.toFixed(2), seam: SEAM, crimp: CRIMP, verbatim: id },
  };
}

export function buildPapercupDieline({ L, W, H, units = "mm" }) {
  const toMm = units === "in" ? (v) => v * 25.4 : (v) => v;
  const Dt = toMm(L); // wall top Ø
  const Db = toMm(W); // wall bottom Ø
  const Hw = toMm(H); // wall vertical height

  const warnings = [
    "Fan of the cup WALL (not the cup's rim/base spec) — die-exact for the calibrated presets; for other sizes verify the wall dims against a production die before cutting.",
  ];
  if (!(Dt > 0) || !(Db > 0) || !(Hw > 0)) {
    return { segments: [], blank: null, warnings: ["All dimensions must be positive."], valid: false };
  }
  if (Db >= Dt) {
    return { segments: [], blank: null, warnings: ["Top Ø must exceed bottom Ø (cups taper)."], valid: false };
  }

  const S = Math.sqrt(Hw * Hw + ((Dt - Db) / 2) ** 2); // slant height
  const Rb = (S * Db) / (Dt - Db);
  const Rt = Rb + S;
  const th = (Math.PI * Dt) / Rt; // wedge angle
  if (th > 2.4) warnings.push("Very wide fan (shallow taper) — check the wall dims.");

  // dims matching a calibrated production die -> emit the reference vectors
  // VERBATIM (flap shape, corner caps, centre marks — exactly as the file)
  for (const [id, die] of Object.entries(CUP_DIES)) {
    if (Math.abs(Dt - die.Dt) < 0.15 && Math.abs(Db - die.Db) < 0.15 && Math.abs(S - die.S) < 0.3) {
      const ref = CUP_REF_DIES[id];
      if (ref) return buildFromRef(id, die, ref, { Rt, Rb, th, S });
    }
  }

  // fan centred on x = 0, centre of the arcs at (0, 0), fan opens downward
  // (apex of the top arc at y = Rt); build in y-down screen space later by
  // keeping y positive downward from the centre.
  const segs = [];
  const line = (layer, a, b) => segs.push({ layer, kind: "l", pts: [a, b] });
  const P = (R, a) => [R * Math.sin(a), R * Math.cos(a)]; // a from vertical
  // arc from a1..a2 at radius R, split into ≤30° beziers
  const arc = (layer, R, a1, a2) => {
    const n = Math.max(1, Math.ceil(Math.abs(a2 - a1) / (Math.PI / 6)));
    const dt = (a2 - a1) / n;
    const k = (4 / 3) * Math.tan(dt / 4);
    for (let i = 0; i < n; i++) {
      const a = a1 + i * dt, b = a + dt;
      const p0 = P(R, a), p3 = P(R, b);
      const t0 = [Math.cos(a), -Math.sin(a)], t1 = [Math.cos(b), -Math.sin(b)];
      segs.push({ layer, kind: "c", pts: [p0, [p0[0] + k * R * t0[0], p0[1] + k * R * t0[1]], [p3[0] - k * R * t1[0], p3[1] - k * R * t1[1]], p3] });
    }
  };

  const hA = th / 2;
  // cut outline: top arc, right radial, bottom arc, left radial
  arc("cut", Rt, -hA, hA);
  arc("cut", Rb, -hA, hA);
  line("cut", P(Rt, -hA), P(Rb, -hA)); // left radial
  line("cut", P(Rt, hA), P(Rb, hA)); // right radial (flap base)
  // crimp crease
  arc("crease", Rb + CRIMP, -hA, hA);
  // seam flap: right radial offset 7.5 mm along the outward normal
  const nx = Math.cos(hA), ny = -Math.sin(hA); // normal to the right radial
  const fT = [Rt * Math.sin(hA) + SEAM * nx, Rt * Math.cos(hA) + SEAM * ny];
  const fB = [Rb * Math.sin(hA) + SEAM * nx, Rb * Math.cos(hA) + SEAM * ny];
  line("cut", P(Rt, hA), fT);
  line("cut", fT, fB);
  line("cut", fB, P(Rb, hA));
  // glue hatch marks on the flap
  for (const t of [0.3, 0.5, 0.7]) {
    const a = [P(Rt, hA)[0] * (1 - t) + P(Rb, hA)[0] * t, P(Rt, hA)[1] * (1 - t) + P(Rb, hA)[1] * t];
    line("crease", a, [a[0] + SEAM * 0.85 * nx, a[1] + SEAM * 0.85 * ny]);
  }
  // artwork safe boundary: inset from top/left, above the crimp, before the flap
  const aIn = SAFE_IN / Rt; // angular inset ~5 mm
  arc("safe", Rt - SAFE_IN, -hA + aIn, hA - aIn);
  arc("safe", Rb + CRIMP + 1, -hA + aIn, hA - aIn);
  line("safe", P(Rt - SAFE_IN, -hA + aIn), P(Rb + CRIMP + 1, -hA + aIn));
  line("safe", P(Rt - SAFE_IN, hA - aIn), P(Rb + CRIMP + 1, hA - aIn));

  // normalise: bbox from arc extremes (apex at a=0 -> y = R)
  const xs = [], ys = [];
  for (const s of segs) for (const p of s.pts) { xs.push(p[0]); ys.push(p[1]); }
  ys.push(Rt); // top arc apex (y max in centre coords)
  const minX = Math.min(...xs), maxY = Math.max(...ys), minY = Math.min(...ys);
  // screen y-down: y' = maxY - y  (apex of top arc becomes the TOP)
  const SC = PT_PER_MM;
  const segments = segs.map((s) => ({ ...s, pts: s.pts.map(([x, y]) => [(x - minX) * SC, (maxY - y) * SC]) }));
  const BW = Math.max(...xs) - minX, BH = maxY - minY;
  const blank = { widthPt: BW * SC, heightPt: BH * SC, flapDepthPt: SEAM * SC, style: "papercup" };
  const chord = 2 * Rt * Math.sin(hA);
  const dims = [
    { x1: (P(Rt, -hA)[0] - minX) * SC, y1: (maxY - Rt * Math.cos(hA)) * SC - 15, x2: (P(Rt, hA)[0] - minX) * SC, y2: (maxY - Rt * Math.cos(hA)) * SC - 15, valuePt: chord * SC, rotated: false },
    { x1: 0, y1: BH * SC + 17, x2: BW * SC, y2: BH * SC + 17, valuePt: BW * SC, rotated: false },
    { x1: (BW + 6) * SC, y1: 0, x2: (BW + 6) * SC, y2: S * SC, valuePt: S * SC, rotated: true },
  ];
  return {
    segments, blank, dims, warnings, valid: true,
    meta: { Rt: +Rt.toFixed(2), Rb: +Rb.toFixed(2), theta: +th.toFixed(4), slant: +S.toFixed(2), chord: +chord.toFixed(2), seam: SEAM, crimp: CRIMP },
  };
}
