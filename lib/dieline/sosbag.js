// HAND-MADE (sheet-punched) SOS BAG — JS port of Aeros Artworks/_tools/sos_handmade.py (Torta Haus, Nawaabs, Pasay,
// Food Monkey, Perfume Gallery dies). Pure geometry from W x G x H:
//   panels  glue SEAM | FRONT W | GUSSET G | BACK W | GUSSET G   (pth: glue | GUSSET | FRONT | GUSSET | BACK)
//   top     STRAIGHT cut (hand-made bags never get the serrated top); optional fold-over top (hem) TOP mm
//   bottom  Aeros DRNK hand-made bottom: one flap per panel G/2 + 29.6 deep, sides taper 4.7, R7.7 corners;
//           seam stops at the bottom fold with a 20 mm chamfer; cross crease at fold - G/2; SOS diamond in each gusset
//   half    2-piece: half blank = SEAM | W | G, two per bag
//   holes   handle holes on FRONT + BACK, `holes` mm apart, `holeDrop` below the top fold and mirrored above it
// Output in points, y-down.
import { PT_PER_MM } from "./cakebox.js";

const K = 0.5522847498, LAP = 29.6, TAP = 4.7, CR = 7.7, CH = 20.0;

export function buildSosbagDieline({ W, G, H, seam = 20, top = 0, half = false, pth = false, holes = 0, holeDrop = 20, holeD = 8, units = "mm" }) {
  const toMm = units === "in" ? (v) => v * 25.4 : (v) => v;
  const Wm = toMm(W), Gm = toMm(G), Hm = toMm(H), SEAM = +seam, TOP = +top;
  if (![Wm, Gm, Hm].every((v) => v > 0)) return { segments: [], blank: null, warnings: ["Enter W, G and H."], valid: false };
  const warnings = [];
  const panels = half ? ["front", "gusset1"] : pth ? ["gusset1", "front", "gusset2", "back"] : ["front", "gusset1", "back", "gusset2"];
  const xs = {};
  let x = 0;
  for (const [n, w] of [["seam", SEAM], ...panels.map((p) => [p, p.startsWith("gusset") ? Gm : Wm])]) { xs[n] = [x, x + w]; x += w; }
  const X1 = x, YT = 0, YH = TOP, YB = TOP + Hm, YA = YB - Gm / 2, YBOT = YB + Gm / 2 + LAP;
  if (YA <= YH) warnings.push("Gusset too deep for this height: the bottom cross crease lands above the top fold.");

  const segs = [];
  const line = (layer, a, b) => segs.push({ layer, kind: "l", pts: [a, b] });
  const bez = (layer, a, b, c, d) => segs.push({ layer, kind: "c", pts: [a, b, c, d] });
  line("cut", [0, YT], [X1, YT]);
  line("cut", [0, YT], [0, YB - CH]);
  line("cut", [0, YB - CH], [SEAM, YB]);
  line("cut", [X1, YT], [X1, YB]);
  for (const n of panels) {
    const [xa, xb] = xs[n], l1 = xa + TAP, r1 = xb - TAP, yC = YBOT - CR;
    line("cut", [xa, YB], [l1, yC]);
    line("cut", [xb, YB], [r1, yC]);
    bez("cut", [l1, yC], [l1, yC + K * CR], [l1 + CR - K * CR, YBOT], [l1 + CR, YBOT]);
    line("cut", [l1 + CR, YBOT], [r1 - CR, YBOT]);
    bez("cut", [r1 - CR, YBOT], [r1 - CR + K * CR, YBOT], [r1, yC + K * CR], [r1, yC]);
  }
  for (const n of panels) line("crease", [xs[n][0], YT], [xs[n][0], YB]);
  if (TOP > 0) line("crease", [0, YH], [X1, YH]);
  line("crease", [SEAM, YB], [X1, YB]);
  line("crease", [0, YA], [X1, YA]);
  for (const n of panels.filter((p) => p.startsWith("gusset"))) {
    const [xa, xb] = xs[n], xm = (xa + xb) / 2;
    line("crease", [xm, YT], [xm, YBOT]);
    line("crease", [xa, YB], [xm, YA]);
    line("crease", [xm, YA], [xb, YB]);
  }
  if (holes > 0) {
    if (!(TOP > holeDrop)) return { segments: [], blank: null, warnings: ["Handle holes need a top fold deeper than the hole drop."], valid: false };
    const r = holeD / 2, q = K * r;
    for (const n of panels.filter((p) => !p.startsWith("gusset"))) {
      const xc = (xs[n][0] + xs[n][1]) / 2;
      for (const hx of [xc - holes / 2, xc + holes / 2]) for (const hy of [YH - holeDrop, YH + holeDrop]) {
        bez("cut", [hx - r, hy], [hx - r, hy - q], [hx - q, hy - r], [hx, hy - r]);
        bez("cut", [hx, hy - r], [hx + q, hy - r], [hx + r, hy - q], [hx + r, hy]);
        bez("cut", [hx + r, hy], [hx + r, hy + q], [hx + q, hy + r], [hx, hy + r]);
        bez("cut", [hx, hy + r], [hx - q, hy + r], [hx - r, hy + q], [hx - r, hy]);
      }
    }
  }

  const S = PT_PER_MM;
  const segments = segs.map((s) => ({ ...s, pts: s.pts.map(([px, py]) => [px * S, py * S]) }));
  const blank = { widthPt: X1 * S, heightPt: YBOT * S, flapDepthPt: (Gm / 2 + LAP) * S, style: "sosbag",
    check: { blankMm: [+X1.toFixed(1), +YBOT.toFixed(1)], bottomFlap: +(Gm / 2 + LAP).toFixed(1), crossCreaseFromFold: Gm / 2, half, pth } };
  const label = { seam: "glue", front: half ? "FRONT / BACK" : "FRONT", gusset1: "GUSSET", back: "BACK", gusset2: "GUSSET" };
  const dims = [
    ...Object.entries(xs).map(([n, [xa, xb]]) => ({ x1: xa * S, y1: -8 * S, x2: xb * S, y2: -8 * S, valuePt: (xb - xa) * S, label: n === "seam" ? "{v}" : `${label[n]} {v}`, rotated: false })),
    { x1: (X1 + 8) * S, y1: YH * S, x2: (X1 + 8) * S, y2: YB * S, valuePt: Hm * S, label: "H {v}", rotated: true },
    { x1: (X1 + 8) * S, y1: YB * S, x2: (X1 + 8) * S, y2: YBOT * S, valuePt: (YBOT - YB) * S, label: "bottom {v}", rotated: true },
    { x1: 0, y1: (YBOT + 9) * S, x2: X1 * S, y2: (YBOT + 9) * S, valuePt: X1 * S, label: "blank {v}", rotated: false }, // clear of the 3 mm bleed
    { x1: (X1 + 20) * S, y1: 0, x2: (X1 + 20) * S, y2: YBOT * S, valuePt: YBOT * S, label: "blank {v}", rotated: true }, // 12 mm clear of the H dimension (they overlapped with mm + inch labels)
  ];
  if (TOP > 0) dims.push({ x1: (X1 + 8) * S, y1: 0, x2: (X1 + 8) * S, y2: YH * S, valuePt: TOP * S, label: "top fold {v}", rotated: true });
  return { segments, blank, dims, warnings, valid: true };
}
