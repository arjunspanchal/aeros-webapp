// FOLD THE REAL DIE. Every panel is the exact polygon the die cuts; every hinge is the exact crease line; the board has its
// real thickness (caliper from the material library). Folding is rigid rotation of each panel about its crease, chained
// from the root panel along a spanning tree of creases. Then we MEASURE the folded model:
//   - outside and inside size (to 0.1 mm) against what was ordered,
//   - loop closure: creases that are not in the tree must still line up after folding (else the die cannot be folded),
//   - glue / lock joins named by the fold program: the free edge must land on its partner panel.
// Frame: die frame (x right, y down, mm); +z = away from the printed side = INTO the box. The printed (outside) skin is
// at z = -t on every panel, the inside skin at z = 0. Inward folds (+angle) hinge on the inside skin, outward folds on
// the outside skin, so a 90 deg corner has inside = crease-to-crease and outside = inside + 2t, as on a real box.

const ease = (v) => (v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v));

// 4x4 affine as { r:[9], t:[3] }
const I = () => ({ r: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] });
const mul = (a, b) => {
  const r = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a.r[i * 3] * b.r[j] + a.r[i * 3 + 1] * b.r[3 + j] + a.r[i * 3 + 2] * b.r[6 + j];
  return { r, t: [0, 1, 2].map((i) => a.r[i * 3] * b.t[0] + a.r[i * 3 + 1] * b.t[1] + a.r[i * 3 + 2] * b.t[2] + a.t[i]) };
};
export { rotAbout, mul };
export const apply = (m, p) => [0, 1, 2].map((i) => m.r[i * 3] * p[0] + m.r[i * 3 + 1] * p[1] + m.r[i * 3 + 2] * (p[2] || 0) + m.t[i]);
const applyDir = (m, d) => [0, 1, 2].map((i) => m.r[i * 3] * d[0] + m.r[i * 3 + 1] * d[1] + m.r[i * 3 + 2] * d[2]);
// rotation by deg about the axis through point o with unit direction u (Rodrigues)
function rotAbout(o, u, deg) {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), C = 1 - c, [x, y, z] = u;
  const r = [c + x * x * C, x * y * C - z * s, x * z * C + y * s, y * x * C + z * s, c + y * y * C, y * z * C - x * s, z * x * C - y * s, z * y * C + x * s, c + z * z * C];
  const ro = [0, 1, 2].map((i) => r[i * 3] * o[0] + r[i * 3 + 1] * o[1] + r[i * 3 + 2] * o[2]);
  return { r, t: [o[0] - ro[0], o[1] - ro[1], o[2] - ro[2]] };
}

/**
 * Fold a die. geom = panelsFromDie(doc); program = { angle(crease, ctx) -> { deg, t0, t1 } | null, joins?: [...] };
 * thickness in mm. t = 0..1 fold progress (1 = formed). Returns transforms per panel plus world polygons.
 */
export function foldDie(geom, program, { thickness = 0.4, t = 1 } = {}) {
  const { panels, creases, root } = geom;
  // annotate every crease with the program's angle (in die terms) once
  const ctx = { panels, root };
  const ann = creases.map((c) => ({ ...c, spec: program.angle(c, ctx) || { deg: 0 } }));
  // spanning tree (BFS from root, prefer the longest crease between a pair - already merged per pair)
  const byPanel = panels.map(() => []);
  ann.forEach((c, k) => { byPanel[c.p].push(k); byPanel[c.q].push(k); });
  const M = panels.map(() => null), parentCrease = panels.map(() => -1);
  M[root] = I();
  const queue = [root], inTree = new Set();
  while (queue.length) {
    const p = queue.shift();
    for (const k of byPanel[p].sort((x, y) => ann[y].len - ann[x].len)) {
      const c = ann[k], q = c.p === p ? c.q : c.p;
      if (M[q] || c.spec.free) continue; // free = a web / lock that bends or crumples: never a rigid hinge
      inTree.add(k);
      parentCrease[q] = k;
      const { deg = 0, t0 = 0, t1 = 1 } = c.spec;
      const ang = deg * ease((t - t0) / ((t1 - t0) || 1));
      // axis direction: rotating the child by +ang must lift it towards +z (into the box)
      const u0 = [c.b[0] - c.a[0], c.b[1] - c.a[1], 0], L = Math.hypot(u0[0], u0[1]);
      let u = [u0[0] / L, u0[1] / L, 0];
      const cc = panels[q].centroid, v = [cc[0] - c.a[0], cc[1] - c.a[1]];
      if (u[0] * v[1] - u[1] * v[0] < 0) u = [-u[0], -u[1], 0];
      const hingeZ = deg >= 0 ? 0 : -thickness; // inside skin for inward folds, outside skin for outward folds
      // stack: this flap closes over `stack` layers already folded under it, so it sits that many calipers further out
      // liftMm: a fixed extra offset in mm (negative = towards the inside) for flaps the die creases short of where they end up
      const lift = ((c.spec.stack || 0) * thickness + (c.spec.liftMm || 0)) * ease((t - t0) / ((t1 - t0) || 1));
      M[q] = mul(mul(M[p], rotAbout([c.a[0], c.a[1], hingeZ], u, ang)), { r: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, -lift] });
      queue.push(q);
    }
  }
  // loop closure: every crease outside the tree must coincide when seen from both panels
  const closure = [];
  ann.forEach((c, k) => {
    if (inTree.has(k) || !M[c.p] || !M[c.q] || c.spec.free) return;
    const hz = (c.spec.deg || 0) >= 0 ? 0 : -thickness;
    const err = Math.max(...[c.a, c.b].map((pt) => {
      const A = apply(M[c.p], [pt[0], pt[1], hz]), B = apply(M[c.q], [pt[0], pt[1], hz]);
      return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
    }));
    closure.push({ p: c.p, q: c.q, errMm: err, at: [(c.a[0] + c.b[0]) / 2, (c.a[1] + c.b[1]) / 2] });
  });
  const world = panels.map((P, i) => {
    if (!M[i]) return null;
    const inner = P.outline.map(([x, y]) => apply(M[i], [x, y, 0]));
    const outer = P.outline.map(([x, y]) => apply(M[i], [x, y, -thickness]));
    const normalIn = applyDir(M[i], [0, 0, 1]);
    return { inner, outer, normalIn, holes: P.holes.map((h) => ({ inner: h.map(([x, y]) => apply(M[i], [x, y, 0])), outer: h.map(([x, y]) => apply(M[i], [x, y, -thickness])) })) };
  });
  return { M, world, creases: ann, closure, parentCrease, thickness };
}

/** Outside and inside size of the folded model, in the root panel's frame (x, y in the base plane, z = height).
 *  inside = between the main walls (largest panels facing the cavity on each side); clear = the narrowest gap anywhere
 *  (hems, liners and stacked flaps included). */
export function measure(folded) {
  const W = folded.world.filter(Boolean);
  const pts = W.flatMap((w) => [...w.inner, ...w.outer]);
  const lo = [0, 1, 2].map((k) => Math.min(...pts.map((p) => p[k]))), hi = [0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k])));
  const outside = [0, 1, 2].map((k) => hi[k] - lo[k]);
  const centre = [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2);
  // true area of a (planar) panel skin - Newell's formula, independent of where the model's centre is
  const area = (P) => { const n = [0, 0, 0]; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; n[0] += (p[1] - q[1]) * (p[2] + q[2]); n[1] += (p[2] - q[2]) * (p[0] + q[0]); n[2] += (p[0] - q[0]) * (p[1] + q[1]); } return Math.hypot(...n) / 2; };
  const inside = [], clear = [];
  for (let k = 0; k < 3; k++) {
    const low = [], high = []; // skins facing the cavity centre, on each side
    for (const w of W) {
      if (Math.abs(w.normalIn[k]) < 0.999) continue;
      const A = area(w.inner);
      for (const [skin, n] of [[w.inner, w.normalIn[k]], [w.outer, -w.normalIn[k]]]) {
        const c = skin.reduce((s, p) => s + p[k], 0) / skin.length;
        if (n > 0 && c < centre[k]) low.push({ c, A });
        if (n < 0 && c > centre[k]) high.push({ c, A });
      }
    }
    const innerPts = W.flatMap((w) => w.inner);
    const main = (list, fallback, pickMax) => {
      if (!list.length) return fallback;
      const big = Math.max(...list.map((s) => s.A));
      const walls = list.filter((s) => s.A >= big * 0.5);
      return pickMax ? Math.max(...walls.map((s) => s.c)) : Math.min(...walls.map((s) => s.c));
    };
    const a = main(low, Math.min(...innerPts.map((p) => p[k])), true), b = main(high, Math.max(...innerPts.map((p) => p[k])), false);
    inside.push(b - a);
    const a2 = low.length ? Math.max(...low.map((s) => s.c)) : a, b2 = high.length ? Math.min(...high.map((s) => s.c)) : b;
    clear.push(b2 - a2);
  }
  return { outside, inside, clear, lo, hi };
}

/** Point on panel i (die frame) -> world. */
export const worldPoint = (folded, i, [x, y], z = 0) => apply(folded.M[i], [x, y, z]);
