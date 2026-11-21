// BOARD-ON-BOARD CHECK of a folded model. Two things a real box can never do, and a model must never show:
//   "same space"     two boards drawn in the same layer (a glue lap that was not moved one caliper off its partner)
//   "passes through" one board crossing through another
// Works on the placed panels only (solidModel().world), so copies of a 2-piece bag are checked against each other too.
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };
const inPoly = (p, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const edgeDist = (p, P) => { let m = Infinity; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[j], b = P[i], dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1e-9; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)); m = Math.min(m, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)); } return m; };

// each placed panel as a plane patch: origin, in-plane axes, inside normal, 2D outline + holes
function patches(world) {
  return world.map((w) => {
    const o = w.inner[0], n = unit(w.normalIn);
    let k = 1; while (k < w.inner.length - 1 && Math.hypot(...sub(w.inner[k], o)) < 1) k++;
    const e1 = unit(sub(w.inner[k], o)), e2 = cross(n, e1);
    const to2 = (p) => { const d = sub(p, o); return [dot(d, e1), dot(d, e2)]; };
    const poly = w.inner.map(to2), holes = w.holes.map((h) => h.inner.map(to2));
    const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
    const all = [...w.inner, ...w.outer];
    return { w, o, n, e1, e2, to2, poly, holes, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
      lo: [0, 1, 2].map((i) => Math.min(...all.map((p) => p[i]))), hi: [0, 1, 2].map((i) => Math.max(...all.map((p) => p[i]))) };
  });
}

/** world = solidModel().world; t = caliper (mm). Returns [{ kind, a, b, mm2 | mm, depth }] with a, b = world entries. */
export function boardClashes(world, t, { grid = 900 } = {}) {
  const P = patches(world), inset = Math.max(1.5, 3 * t), out = [];
  for (const a of P) { // sample grid on each patch: points well inside the board, on its mid-plane
    const [x0, y0, x1, y1] = a.box, step = Math.max(1.5, Math.sqrt(((x1 - x0) * (y1 - y0)) / grid));
    a.rows = []; a.step = step;
    for (let y = y0 + step / 2; y < y1; y += step) {
      const row = [];
      for (let x = x0 + step / 2; x < x1; x += step) {
        const q = [x, y], ok = inPoly(q, a.poly) && edgeDist(q, a.poly) > inset && !a.holes.some((h) => inPoly(q, h) || edgeDist(q, h) < inset);
        row.push(ok ? [0, 1, 2].map((i) => a.o[i] + x * a.e1[i] + y * a.e2[i] - (t / 2) * a.n[i]) : null);
      }
      a.rows.push(row);
    }
  }
  for (let i = 0; i < P.length; i++) for (let j = 0; j < P.length; j++) {
    if (i === j) continue;
    const a = P[i], b = P[j];
    if ([0, 1, 2].some((k) => a.lo[k] > b.hi[k] + 0.5 || a.hi[k] < b.lo[k] - 0.5)) continue;
    const zOf = (p) => dot(sub(p, b.o), b.n); // 0 = b's inside skin, -t = its outside skin
    const inB = (p) => { const q = b.to2(p); return inPoly(q, b.poly) && edgeDist(q, b.poly) > inset && !b.holes.some((h) => inPoly(q, h)); };
    let same = 0, through = 0, far = 0, out2 = 0;
    a.rows.forEach((row, r) => row.forEach((p, c) => {
      if (!p) return;
      const z = zOf(p);
      if (Math.abs(z + t / 2) < 0.4 * t && inB(p)) same++;
      for (const q of [row[c + 1], a.rows[r + 1]?.[c]]) {
        if (!q) continue;
        const z2 = zOf(q);
        if ((z > 0.01 && z2 < -t - 0.01) || (z2 > 0.01 && z < -t - 0.01)) { const f = z / (z - z2), m = [0, 1, 2].map((k) => p[k] + f * (q[k] - p[k])); if (inB(m)) through++; }
      }
      if (inB(p)) { far = Math.max(far, z); out2 = Math.max(out2, -t - z); } // a's reach past b's inside skin / past its outside skin
    }));
    if (i < j && same >= 3) out.push({ kind: "same", a: a.w, b: b.w, mm2: same * a.step * a.step });
    if (through >= 2) out.push({ kind: "through", a: a.w, b: b.w, mm: through * a.step, depth: Math.min(far, out2) }); // the shorter side of the crossing = how far the boards would have to give
  }
  return out;
}
