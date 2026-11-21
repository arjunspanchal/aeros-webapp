// NORMALISE a die before it is audited or exported — the clean-up a die maker does by hand, done by rule:
//   1. drop zero-length segments (< 0.05 mm);
//   2. merge straight rules of the SAME layer that lie on the same line and overlap or touch (one knife, not two);
//   3. split a crease where a cut runs along the same line (the cut wins; the crease stops at the cut).
// Curves are left untouched. Pure geometry; the output draws exactly the same board.
// Input / output: engine doc { segments: [{ layer, kind, pts }] } in points.
import { PT_PER_MM } from "./cakebox.js";

const ZERO = 0.05; // mm
const COLLINEAR = 0.15; // mm
const JOIN = 0.05; // mm — touching ends merge
const ANGLE = 0.035; // rad (~2 deg) — two rules this close in direction and within COLLINEAR are one knife (traced dies carry 0.1 mm doubles)

export function normalizeDie(doc) {
  const S = PT_PER_MM;
  const toMm = (p) => [p[0] / S, p[1] / S];
  const segs = doc.segments.filter((s) => {
    const a = toMm(s.pts[0]), b = toMm(s.pts[s.pts.length - 1]);
    return s.kind !== "l" || Math.hypot(b[0] - a[0], b[1] - a[1]) >= ZERO;
  });
  const curves = segs.filter((s) => s.kind !== "l");
  const lines = segs.filter((s) => s.kind === "l").map((s) => ({ layer: s.layer, a: toMm(s.pts[0]), b: toMm(s.pts[1]), extra: s }));

  // group straight lines by layer and by the infinite line they lie on
  const groups = [];
  for (const l of lines) {
    const vx = l.b[0] - l.a[0], vy = l.b[1] - l.a[1], n = Math.hypot(vx, vy);
    const u = [vx / n, vy / n];
    let g = groups.find((G) => G.layer === l.layer && Math.abs(u[0] * G.u[1] - u[1] * G.u[0]) < ANGLE &&
      Math.abs((l.a[0] - G.o[0]) * G.u[1] - (l.a[1] - G.o[1]) * G.u[0]) < COLLINEAR &&
      Math.abs((l.b[0] - G.o[0]) * G.u[1] - (l.b[1] - G.o[1]) * G.u[0]) < COLLINEAR);
    if (!g) { g = { layer: l.layer, u, o: l.a, spans: [] }; groups.push(g); }
    const s1 = (l.a[0] - g.o[0]) * g.u[0] + (l.a[1] - g.o[1]) * g.u[1], s2 = (l.b[0] - g.o[0]) * g.u[0] + (l.b[1] - g.o[1]) * g.u[1];
    g.spans.push([Math.min(s1, s2), Math.max(s1, s2), l.extra]);
  }
  // 2. union overlapping spans of the same layer; a span that is untouched keeps its original segment (and orientation)
  for (const g of groups) {
    g.spans.sort((p, q) => p[0] - q[0]);
    const out = [];
    for (const sp of g.spans) {
      const last = out[out.length - 1];
      if (last && sp[0] <= last[1] + JOIN && (sp[0] < last[1] - JOIN || sp[1] <= last[1] + JOIN)) {
        last[1] = Math.max(last[1], sp[1]); last[2] = null; // merged: rebuild from the span
      } else out.push([...sp]);
    }
    g.merged = out;
  }
  // 3. creases minus the cuts on the same line
  const cutGroups = groups.filter((g) => g.layer === "cut");
  for (const g of groups.filter((G) => G.layer === "crease")) {
    let spans = g.merged.map((s) => [...s]);
    for (const c of cutGroups) {
      if (Math.abs(c.u[0] * g.u[1] - c.u[1] * g.u[0]) > ANGLE) continue;
      if (Math.abs((c.o[0] - g.o[0]) * g.u[1] - (c.o[1] - g.o[1]) * g.u[0]) > COLLINEAR) continue;
      const shift = (c.o[0] - g.o[0]) * g.u[0] + (c.o[1] - g.o[1]) * g.u[1], dot = c.u[0] * g.u[0] + c.u[1] * g.u[1];
      for (const cs of c.merged) {
        const lo = Math.min(shift + dot * cs[0], shift + dot * cs[1]), hi = Math.max(shift + dot * cs[0], shift + dot * cs[1]);
        spans = spans.flatMap((s) => {
          if (hi <= s[0] + JOIN || lo >= s[1] - JOIN) return [s];
          const parts = [];
          if (lo - s[0] > ZERO) parts.push([s[0], lo, null]);
          if (s[1] - hi > ZERO) parts.push([hi, s[1], null]);
          return parts;
        });
      }
    }
    g.merged = spans;
  }
  const pt = (g, t) => [(g.o[0] + g.u[0] * t) * S, (g.o[1] + g.u[1] * t) * S];
  const out = [...curves];
  for (const g of groups) for (const [lo, hi, orig] of g.merged) {
    out.push(orig || { layer: g.layer, kind: "l", pts: [pt(g, lo), pt(g, hi)] });
  }
  return { ...doc, segments: out };
}
