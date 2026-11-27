// DRAWER BOX regression: at the reference size the three dies must reproduce the Zepto condiment box production die
// (scripts/data/drawerbox-zepto-condiment-ref.json = the one-ups lifted from "Condiment Box_ver14.pdf", mm).
// Every reference line must lie on an engine line and every engine line on a reference line, within TOL.
//   node scripts/check-drawerbox.mjs
import { readFileSync } from "node:fs";
import { buildDrawerSleeveDieline, buildDrawerTrayDieline, buildDrawerInsertDieline, DRAWER_REF } from "../lib/dieline/drawerbox.js";
const ref = JSON.parse(readFileSync(new URL("./data/drawerbox-zepto-condiment-ref.json", import.meta.url)));
const S = 72 / 25.4, TOL = 0.12; // the Corel file is drawn to 0.1 mm
const sample = (kind, P, step = 0.5) => {
  const out = [];
  if (kind === "l") { const n = Math.max(1, Math.ceil(Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]) / step)); for (let i = 0; i <= n; i++) out.push([P[0][0] + ((P[1][0] - P[0][0]) * i) / n, P[0][1] + ((P[1][1] - P[0][1]) * i) / n]); }
  else for (let i = 0; i <= 40; i++) { const t = i / 40, a = (1 - t) ** 3, b = 3 * (1 - t) ** 2 * t, c = 3 * (1 - t) * t * t, d = t ** 3; out.push([a * P[0][0] + b * P[1][0] + c * P[2][0] + d * P[3][0], a * P[0][1] + b * P[1][1] + c * P[2][1] + d * P[3][1]]); }
  return out;
};
const polys = (segs, layer) => segs.filter((s) => s[0] === layer).map((s) => sample(s[1], s[2], s[1] === "l" ? 1e9 : 0.5)); // a line = its two ends
const cloud = (segs, layer) => segs.filter((s) => s[0] === layer).flatMap((s) => sample(s[1], s[2]));
const dSeg = (p, a, b) => { const vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy, u = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l2)) : 0; return Math.hypot(p[0] - a[0] - u * vx, p[1] - a[1] - u * vy); };
// worst distance from any sampled point of A to the nearest LINE of B (not to B's sample points)
const worst = (A, B) => A.reduce((m, p) => Math.max(m, B.reduce((d, poly) => { for (let i = 0; i + 1 < poly.length; i++) d = Math.min(d, dSeg(p, poly[i], poly[i + 1])); return d; }, 1e9)), 0);
let fail = 0;
for (const [name, build] of [["sleeve", buildDrawerSleeveDieline], ["tray", buildDrawerTrayDieline], ["insert", buildDrawerInsertDieline]]) {
  const d = build(DRAWER_REF);
  const mine = d.segments.map((s) => [s.layer, s.kind, s.pts.map(([x, y]) => [x / S, y / S])]);
  const row = []; let bad = 0;
  for (const layer of ["cut", "crease"]) {
    const a = worst(cloud(mine, layer), polys(ref[name], layer)), b = worst(cloud(ref[name], layer), polys(mine, layer));
    if (a > TOL || b > TOL) bad++;
    row.push(`${layer}: engine->die ${a.toFixed(3)} mm, die->engine ${b.toFixed(3)} mm`);
  }
  fail += bad;
  console.log(`${bad ? "FAIL" : "PASS"} ${name}: blank ${(d.blank.widthPt / S).toFixed(1)} x ${(d.blank.heightPt / S).toFixed(1)} mm; ${mine.length} lines vs ${ref[name].length} in the die; ${row.join("; ")}`);
}
process.exit(fail ? 1 : 0);
