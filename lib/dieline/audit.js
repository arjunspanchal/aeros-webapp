// DIE AUDIT — the geometry checks every die passes before it leaves Aeros (JS port of Aeros Artworks/_tools/die_audit.py).
// Pure maths on the engine's own segments; no tolerance is guessed per job. Rules:
//   1. OPEN CUT  — a cut end that touches nothing (no other cut, no crease, not on another line) means the piece will not
//                  come free. Perforation dashes (cut segments <= 2 mm) are open by design and only counted.
//   2. DOUBLE    — two rules of the same kind lying on each other for > 0.5 mm (the die would carry two knives).
//   3. CUT OVER CREASE — a cut and a crease on the same line for > 0.5 mm.
//   4. ZERO      — a segment shorter than 0.05 mm.
// Input: { segments: [{ layer: "cut"|"crease", kind: "l"|"c", pts: [[x,y],...] }] } in points (engine output).
// Output: { ok, issues: [{ code, message, at }], stats: { segments, perforationDashes, extentsMm } }.
import { PT_PER_MM } from "./cakebox.js";

const SNAP = 0.5; // mm — endpoints closer than this are the same node
const ON_LINE = 0.3; // mm — a T-junction: the end lands on another straight line
const COLLINEAR = 0.15; // mm — offset under which two straight lines are on the same line
const MIN_OVERLAP = 0.5; // mm

export function auditDie(doc) {
  const S = PT_PER_MM;
  const segs = (doc.segments || []).filter((s) => s.layer === "cut" || s.layer === "crease").map((s) => ({
    layer: s.layer,
    kind: s.kind,
    a: [s.pts[0][0] / S, s.pts[0][1] / S],
    b: [s.pts[s.pts.length - 1][0] / S, s.pts[s.pts.length - 1][1] / S],
  }));
  const issues = [];
  const add = (code, message, at) => issues.push({ code, message, at: at && at.map((v) => Math.round(v * 10) / 10) });
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const key = (p) => `${Math.round(p[0] / SNAP) * SNAP},${Math.round(p[1] / SNAP) * SNAP}`;

  const deg = new Map();
  const bump = (p, layer) => {
    const k = key(p);
    if (!deg.has(k)) deg.set(k, { cut: 0, crease: 0, p });
    deg.get(k)[layer] += 1;
  };
  for (const s of segs) {
    if (dist(s.a, s.b) < 0.05) add("ZERO", `zero-length ${s.layer}`, s.a);
    bump(s.a, s.layer);
    bump(s.b, s.layer);
  }

  const isPerf = (s) => s.layer === "cut" && s.kind === "l" && dist(s.a, s.b) <= 2.0;
  const perfEnds = new Set();
  let nPerf = 0;
  for (const s of segs) if (isPerf(s)) { nPerf += 1; perfEnds.add(key(s.a)); perfEnds.add(key(s.b)); }

  const straight = segs.filter((s) => s.kind === "l");
  const onOther = (p) => straight.some((s) => {
    const vx = s.b[0] - s.a[0], vy = s.b[1] - s.a[1], n2 = vx * vx + vy * vy;
    if (n2 < 1e-6) return false;
    const t = Math.max(0, Math.min(1, ((p[0] - s.a[0]) * vx + (p[1] - s.a[1]) * vy) / n2));
    const dx = s.a[0] + t * vx - p[0], dy = s.a[1] + t * vy - p[1];
    return dx * dx + dy * dy < ON_LINE * ON_LINE && t > 0.02 && t < 0.98;
  });
  for (const [k, d] of deg) {
    if (d.cut === 1 && d.crease === 0 && !perfEnds.has(k) && !onOther(d.p)) {
      add("OPEN_CUT", "Cut stops in the middle of the board — the piece will not come free (unless it is a slit by design).", d.p);
    }
  }

  const overlap = (p, q) => {
    const vx = p.b[0] - p.a[0], vy = p.b[1] - p.a[1], n = Math.hypot(vx, vy);
    if (n < 0.5) return 0;
    const ux = vx / n, uy = vy / n;
    for (const r of [q.a, q.b]) if (Math.abs((r[0] - p.a[0]) * uy - (r[1] - p.a[1]) * ux) > COLLINEAR) return 0;
    const s1 = (q.a[0] - p.a[0]) * ux + (q.a[1] - p.a[1]) * uy, s2 = (q.b[0] - p.a[0]) * ux + (q.b[1] - p.a[1]) * uy;
    return Math.max(0, Math.min(n, Math.max(s1, s2)) - Math.max(0, Math.min(s1, s2)));
  };
  for (let i = 0; i < straight.length; i++) {
    for (let j = i + 1; j < straight.length; j++) {
      const ov = overlap(straight[i], straight[j]);
      if (ov > MIN_OVERLAP) {
        const same = straight[i].layer === straight[j].layer;
        add(same ? "DOUBLE" : "CUT_OVER_CREASE",
          same ? `Two ${straight[i].layer} rules on top of each other for ${ov.toFixed(1)} mm.` : `Cut and crease on the same line for ${ov.toFixed(1)} mm.`,
          straight[i].a);
      }
    }
  }

  const xs = segs.flatMap((s) => [s.a[0], s.b[0]]), ys = segs.flatMap((s) => [s.a[1], s.b[1]]);
  const seen = new Set();
  const unique = issues.filter((i) => { const k = i.code + i.message + i.at; if (seen.has(k)) return false; seen.add(k); return true; });
  return {
    ok: unique.length === 0,
    issues: unique,
    stats: {
      segments: segs.length,
      perforationDashes: nPerf,
      extentsMm: segs.length ? [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)].map((v) => Math.round(v * 10) / 10) : null,
    },
  };
}
