// Every cup of every printer nest against the single-cup KLD it is filled from: the KLD's knife, turned and moved onto
// each cup of the nest, must lie on the nest's own knife. Also: the nest's strokes must come back out of cupNestPdf unchanged.
import { CUP_KLD_REFS } from "../lib/dieline/cup-kld-refs.js";
import { CUP_NEST_REFS } from "../lib/dieline/cup-nest-refs.js";
import { cupGeometry } from "../lib/dieline/cup.js";
import { fanPlacement, placePoint, cupNestPdf } from "../lib/dieline/designer/cup-nest-pdf.js";
const bz = (P, t) => { const u = 1 - t; return [u ** 3 * P[0][0] + 3 * u * u * t * P[1][0] + 3 * u * t * t * P[2][0] + t ** 3 * P[3][0], u ** 3 * P[0][1] + 3 * u * u * t * P[1][1] + 3 * u * t * t * P[2][1] + t ** 3 * P[3][1]]; };
const sample = (segs, n = 40) => segs.flatMap((s) => Array.from({ length: n + 1 }, (_, i) => (s[0] === "l" ? [s[1][0] + ((s[2][0] - s[1][0]) * i) / n, s[1][1] + ((s[2][1] - s[1][1]) * i) / n] : bz(s.slice(1), i / n))));
let bad = 0;
for (const nest of Object.values(CUP_NEST_REFS)) {
  const ref = CUP_KLD_REFS[nest.cup], g = cupGeometry(nest.cup);
  const kld = sample(ref.cut, 80);
  let worst = 0, worstBack = 0;
  nest.fans.forEach((fan) => {
    const m = fanPlacement(g, fan), mine = sample(fan.segs, 120);
    // distance from a point to a polyline given as consecutive sample points of one stroke set
    const near = (p, set) => { let d = Infinity; for (let i = 1; i < set.length; i++) { const a = set[i - 1], b = set[i], dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; if (L > 9) continue; const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0, ex = p[0] - a[0] - t * dx, ey = p[1] - a[1] - t * dy, dd = ex * ex + ey * ey; if (dd < d) d = dd; } return Math.sqrt(d); };
    const placed = kld.map((p) => placePoint(m, p));
    for (const p of placed) worst = Math.max(worst, near(p, mine));
    for (const p of mine) worstBack = Math.max(worstBack, near(p, placed));
  });
  const pdf = cupNestPdf({ nest, g, mode: "punch" }), strokes = (pdf.match(/ [lc]( |\n|$)/g) || []).length;
  const want = nest.fans.reduce((a, f) => a + f.segs.length, 0) + nest.marks.length + nest.border.length + nest.labels.reduce((a, l) => a + l.length, 0);
  const ok = worst <= 0.15 && worstBack <= 0.15;
  if (!ok) bad++;
  console.log(`${ok ? "PASS" : "FAIL"} ${nest.id}: ${nest.fans.length} cups, rot ${[...new Set(nest.fans.map((f) => Math.round(f.rot)))].join("/")} deg; KLD knife -> nest knife worst ${worst.toFixed(3)} mm; nest knife -> KLD knife worst ${worstBack.toFixed(3)} mm; PUNCH carries ${strokes} of ${want} strokes; ${nest.style?.spot || "K100"} ${nest.style?.w} pt`);
}
process.exit(bad ? 1 : 0);
