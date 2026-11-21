// DIE -> PANELS. Turns a die (cut + crease segments, beziers included) into the real panels of the blank, exactly as the
// knives and creasing rules divide the board: a planar arrangement (every line split where it meets another), a half-edge
// walk for the faces, holes assigned to the panel that holds them, and panels = faces joined to the main body by creases.
// Pure maths, no dependencies. Units: mm, die frame (x right, y down, as drawn on the KLD).
import { PT_PER_MM } from "../cakebox.js";

const SNAP = 0.005; // mm - vertices closer than this are one vertex
const FLAT = 0.01; // mm - bezier flattening tolerance (chord error)

function flattenBezier(p0, p1, p2, p3, out, depth = 0) {
  // flat enough when both control points sit within FLAT of the chord
  const dx = p3[0] - p0[0], dy = p3[1] - p0[1], len = Math.hypot(dx, dy) || 1e-9;
  const d1 = Math.abs((p1[0] - p0[0]) * dy - (p1[1] - p0[1]) * dx) / len;
  const d2 = Math.abs((p2[0] - p0[0]) * dy - (p2[1] - p0[1]) * dx) / len;
  if ((d1 <= FLAT && d2 <= FLAT) || depth > 12) { out.push(p3); return; }
  const m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const p01 = m(p0, p1), p12 = m(p1, p2), p23 = m(p2, p3), p012 = m(p01, p12), p123 = m(p12, p23), mid = m(p012, p123);
  flattenBezier(p0, p01, p012, mid, out, depth + 1);
  flattenBezier(mid, p123, p23, p3, out, depth + 1);
}

/** die doc (points) -> straight edges in mm: [{ a, b, layer }] */
export function dieEdges(doc) {
  const S = 1 / PT_PER_MM, edges = [];
  for (const s of doc.segments) {
    if (s.layer !== "cut" && s.layer !== "crease") continue;
    const P = s.pts.map(([x, y]) => [x * S, y * S]);
    if (s.kind === "l") edges.push({ a: P[0], b: P[1], layer: s.layer });
    else {
      const pts = [P[0]];
      flattenBezier(P[0], P[1], P[2], P[3], pts);
      for (let i = 1; i < pts.length; i++) edges.push({ a: pts[i - 1], b: pts[i], layer: s.layer });
    }
  }
  return edges.filter((e) => Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) > SNAP);
}

// TRACED DIES (burger box, mailer: production dies redrawn from a die maker's file) carry gaps of 0.1-0.2 mm where a
// rule should meet another. A knife does not care, but a gap that small opens a panel's outline, so the panel "leaks" into
// the outside and is lost. healGaps closes them: an end that touches NOTHING (further than SNAP from every other rule) but
// sits within HEAL of one is moved onto it. Ends that already touch are never moved, so exact dies come out unchanged.
const HEAL = 0.3; // mm - far below a rule's own thickness (0.7 mm)
export function healGaps(edges) {
  const out = edges.map((e) => ({ a: [...e.a], b: [...e.b], layer: e.layer }));
  const box = out.map((e) => [Math.min(e.a[0], e.b[0]) - HEAL, Math.min(e.a[1], e.b[1]) - HEAL, Math.max(e.a[0], e.b[0]) + HEAL, Math.max(e.a[1], e.b[1]) + HEAL]);
  const closest = (p, e) => { // nearest point of e to p, preferring e's own ends when they are within HEAL
    const dx = e.b[0] - e.a[0], dy = e.b[1] - e.a[1], L2 = dx * dx + dy * dy || 1e-12;
    const t = Math.max(0, Math.min(1, ((p[0] - e.a[0]) * dx + (p[1] - e.a[1]) * dy) / L2));
    const q = [e.a[0] + t * dx, e.a[1] + t * dy], d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    for (const end of [e.a, e.b]) if (Math.hypot(end[0] - p[0], end[1] - p[1]) <= HEAL) return { q: [...end], d };
    return { q, d };
  };
  let healed = 0;
  // up to 3 passes: moving one end can leave a neighbour that was snapped to it a hair off
  for (let pass = 0, moved = 1; pass < 3 && moved; pass++) { moved = 0;
  for (let i = 0; i < out.length; i++) for (const key of ["a", "b"]) {
    const p = out[i][key];
    let best = null;
    for (let j = 0; j < out.length; j++) {
      if (j === i || p[0] < box[j][0] || p[0] > box[j][2] || p[1] < box[j][1] || p[1] > box[j][3]) continue;
      const c = closest(p, out[j]);
      if (!best || c.d < best.d) best = c;
      if (best.d <= SNAP) break;
    }
    if (best && best.d > SNAP && best.d <= HEAL) { out[i][key] = best.q; healed++; moved++; }
  } }
  out.healed = healed;
  return out.filter((e) => Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) > SNAP);
}

// parameters along each edge where another edge meets it (crossings, T-junctions, collinear overlaps)
function splitParams(edges) {
  const n = edges.length, ts = edges.map(() => [0, 1]);
  const box = edges.map((e) => [Math.min(e.a[0], e.b[0]) - SNAP, Math.min(e.a[1], e.b[1]) - SNAP, Math.max(e.a[0], e.b[0]) + SNAP, Math.max(e.a[1], e.b[1]) + SNAP]);
  const order = [...Array(n).keys()].sort((i, j) => box[i][0] - box[j][0]);
  const onSeg = (p, e) => { // param of p on e if p lies on e (within SNAP), else null
    const dx = e.b[0] - e.a[0], dy = e.b[1] - e.a[1], L2 = dx * dx + dy * dy;
    const t = ((p[0] - e.a[0]) * dx + (p[1] - e.a[1]) * dy) / L2;
    if (t < -1e-9 || t > 1 + 1e-9) return null;
    const qx = e.a[0] + t * dx - p[0], qy = e.a[1] + t * dy - p[1];
    return qx * qx + qy * qy <= SNAP * SNAP ? Math.min(1, Math.max(0, t)) : null;
  };
  for (let oi = 0; oi < n; oi++) {
    const i = order[oi], A = edges[i], bi = box[i];
    for (let oj = oi + 1; oj < n; oj++) {
      const j = order[oj], bj = box[j];
      if (bj[0] > bi[2]) break;
      if (bj[1] > bi[3] || bj[3] < bi[1]) continue;
      const B = edges[j];
      // endpoints touching the other edge (T-junctions and collinear overlaps)
      for (const [p, e, k] of [[B.a, A, i], [B.b, A, i], [A.a, B, j], [A.b, B, j]]) { const t = onSeg(p, e); if (t != null) ts[k].push(t); }
      // proper crossing
      const rx = A.b[0] - A.a[0], ry = A.b[1] - A.a[1], sx = B.b[0] - B.a[0], sy = B.b[1] - B.a[1];
      const den = rx * sy - ry * sx;
      if (Math.abs(den) < 1e-12) continue;
      const qx = B.a[0] - A.a[0], qy = B.a[1] - A.a[1];
      const t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
      if (t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9) { ts[i].push(t); ts[j].push(u); }
    }
  }
  return ts;
}

/** Planar arrangement + faces. Returns { verts, edges:[{u,v,layer}], faces:[{loop:[vi], area}], halfEdges } */
export function arrange(edgesIn) {
  const ts = splitParams(edgesIn);
  const verts = [], grid = new Map();
  const vid = (p) => { // snap
    const gx = Math.round(p[0] / SNAP / 2), gy = Math.round(p[1] / SNAP / 2);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const list = grid.get(`${gx + dx},${gy + dy}`);
      if (list) for (const k of list) if (Math.hypot(verts[k][0] - p[0], verts[k][1] - p[1]) <= SNAP) return k;
    }
    verts.push([p[0], p[1]]);
    const key = `${gx},${gy}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(verts.length - 1);
    return verts.length - 1;
  };
  const edgeMap = new Map(); // "u,v" -> layer (cut wins over crease)
  edgesIn.forEach((e, i) => {
    const list = [...new Set(ts[i].map((t) => Math.round(t * 1e9) / 1e9))].sort((a, b) => a - b);
    let prev = vid(e.a);
    for (let k = 1; k < list.length; k++) {
      const t = list[k], p = [e.a[0] + t * (e.b[0] - e.a[0]), e.a[1] + t * (e.b[1] - e.a[1])];
      const cur = k === list.length - 1 ? vid(e.b) : vid(p);
      if (cur !== prev) {
        const key = prev < cur ? `${prev},${cur}` : `${cur},${prev}`;
        if (!edgeMap.has(key) || e.layer === "cut") edgeMap.set(key, e.layer);
      }
      prev = cur;
    }
  });
  const edges = [...edgeMap.entries()].map(([k, layer]) => { const [u, v] = k.split(",").map(Number); return { u, v, layer }; });

  // half-edges: 2k = u->v, 2k+1 = v->u
  const out = verts.map(() => []);
  edges.forEach((e, k) => { out[e.u].push(2 * k); out[e.v].push(2 * k + 1); });
  const from = (h) => (h & 1 ? edges[h >> 1].v : edges[h >> 1].u), to = (h) => (h & 1 ? edges[h >> 1].u : edges[h >> 1].v);
  const ang = (h) => { const a = verts[from(h)], b = verts[to(h)]; return Math.atan2(b[1] - a[1], b[0] - a[0]); };
  for (const list of out) list.sort((p, q) => ang(p) - ang(q));
  const pos = new Map();
  out.forEach((list) => list.forEach((h, i) => pos.set(h, i)));
  const next = (h) => { // face on the left in a y-up sense; we only need consistency, the area sign tells inside/outside
    const tw = h ^ 1, v = to(h), list = out[v], i = pos.get(tw);
    return list[(i - 1 + list.length) % list.length];
  };
  const faceOf = new Int32Array(edges.length * 2).fill(-1), faces = [];
  for (let h = 0; h < edges.length * 2; h++) {
    if (faceOf[h] >= 0) continue;
    const loop = [], hs = [];
    let g = h, guard = 0;
    while (faceOf[g] < 0 && guard++ < 1e6) { faceOf[g] = faces.length; loop.push(from(g)); hs.push(g); g = next(g); }
    let area = 0;
    for (let i = 0; i < loop.length; i++) { const a = verts[loop[i]], b = verts[loop[(i + 1) % loop.length]]; area += a[0] * b[1] - b[0] * a[1]; }
    faces.push({ loop, hs, area: area / 2 });
  }
  return { verts, edges, faces, faceOf, from, to };
}

function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export { pointInPoly };

// drop zero-width spikes (a dangling slit walks out and back: ... A B A ...)
function cleanLoop(loop) {
  let L = loop.slice(), changed = true;
  while (changed && L.length > 3) {
    changed = false;
    for (let i = 0; i < L.length; i++) {
      const a = L[(i - 1 + L.length) % L.length], c = L[(i + 1) % L.length];
      if (a === c) { L.splice(i, 1); L.splice(i % L.length, 1); changed = true; break; }
    }
  }
  return L;
}

/**
 * Panels of a die. rootPoint (mm, die frame) picks the panel the model stands on; default = the largest panel.
 * Returns { panels:[{ id, outline:[[x,y]], holes:[[[x,y]]], area, centroid }], creases:[{ p, q, a, b, len }] (p,q = panel ids), waste }
 */
export function panelsFromDie(doc, { rootPoint } = {}) {
  // blank.hingeLines (pt): cut rules that are really perforations (a traced die that draws its hinge as a cut): on those
  // lines a cut still joins two panels, so it is treated as a crease here
  const hinges = (doc.blank?.hingeLines || []).map((h) => h.map(([x, y]) => [x / PT_PER_MM, y / PT_PER_MM]));
  const onHinge = (p) => hinges.some(([a, b]) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (L * L); return t >= 0 && t <= 1 && Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / L <= 0.1; });
  const A = arrange(healGaps(dieEdges(doc)).map((e) => (e.layer === "cut" && hinges.length && onHinge(e.a) && onHinge(e.b) ? { ...e, layer: "crease" } : e)));
  const { verts, edges, faces, faceOf } = A;
  // with this walk bounded faces come out POSITIVE (checked on real dies: the outside loop is the one negative face)
  const bounded = faces.map((f) => f.area > 0);
  const poly = (f) => f.loop.map((k) => verts[k]);
  // crease adjacency between bounded faces
  const adj = new Map();
  edges.forEach((e, k) => {
    if (e.layer !== "crease") return;
    const f1 = faceOf[2 * k], f2 = faceOf[2 * k + 1];
    if (f1 === f2 || !bounded[f1] || !bounded[f2]) return;
    for (const [x, y] of [[f1, f2], [f2, f1]]) { if (!adj.has(x)) adj.set(x, []); adj.get(x).push({ f: y, e: k }); }
  });
  // root: the bounded face containing rootPoint, else the largest bounded face
  const cand = faces.map((f, i) => i).filter((i) => bounded[i]);
  let root = cand.reduce((m, i) => (Math.abs(faces[i].area) > Math.abs(faces[m].area) ? i : m), cand[0]);
  if (rootPoint) {
    const hit = cand.filter((i) => pointInPoly(rootPoint, poly(faces[i]))).sort((i, j) => Math.abs(faces[i].area) - Math.abs(faces[j].area));
    if (hit.length) root = hit[0];
  }
  // material = faces reachable from root across creases
  const seen = new Set([root]), queue = [root];
  while (queue.length) { const f = queue.shift(); for (const { f: g } of adj.get(f) || []) if (!seen.has(g)) { seen.add(g); queue.push(g); } }
  const material = [...seen];
  const idOf = new Map(material.map((f, i) => [f, i]));
  const panels = material.map((f, i) => {
    const outline = cleanLoop(faces[f].loop).map((k) => verts[k]);
    let cx = 0, cy = 0, a2 = 0;
    for (let k = 0; k < outline.length; k++) {
      const [x0, y0] = outline[k], [x1, y1] = outline[(k + 1) % outline.length], c = x0 * y1 - x1 * y0;
      a2 += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c;
    }
    return { id: i, face: f, outline, holes: [], area: Math.abs(a2 / 2), centroid: [cx / (3 * a2), cy / (3 * a2)] };
  });
  // holes: unbounded-type loops (positive here) that sit inside a material panel and are not that panel's own boundary
  faces.forEach((f, i) => {
    if (bounded[i] || seen.has(i) || f.loop.length < 3 || Math.abs(f.area) < 1e-4) return;
    const p = verts[f.loop[0]];
    const own = panels.filter((P) => pointInPoly([p[0] + 1e-4, p[1] + 1e-4], P.outline) || pointInPoly([p[0] - 1e-4, p[1] - 1e-4], P.outline));
    if (!own.length) return; // the blank's own outside
    // the hole must not share vertices with the panel outline (otherwise it IS the outline from the outside)
    const host = own.sort((a, b) => a.area - b.area)[0];
    const hostSet = new Set(faces[host.face].loop);
    if (f.loop.some((k) => hostSet.has(k))) return;
    host.holes.push(f.loop.map((k) => verts[k]));
    host.area -= Math.abs(f.area);
  });
  // creases between material panels, merged per panel pair and per line
  const creases = [];
  edges.forEach((e, k) => {
    if (e.layer !== "crease") return;
    const f1 = faceOf[2 * k], f2 = faceOf[2 * k + 1];
    if (!idOf.has(f1) || !idOf.has(f2) || f1 === f2) return;
    const p = idOf.get(f1), q = idOf.get(f2), a = verts[e.u], b = verts[e.v];
    creases.push({ p: Math.min(p, q), q: Math.max(p, q), a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]) });
  });
  const merged = new Map();
  for (const c of creases) {
    const key = `${c.p},${c.q}`;
    const m = merged.get(key);
    if (!m) { merged.set(key, { ...c, parts: [c] }); continue; }
    m.parts.push(c);
    // extend to the farthest pair of points along the (collinear) line
    const pts = [m.a, m.b, c.a, c.b];
    let best = [m.a, m.b], bl = 0;
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) { const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]); if (d > bl) { bl = d; best = [pts[i], pts[j]]; } }
    m.a = best[0]; m.b = best[1]; m.len = bl;
  }
  const rootId = idOf.get(root);
  const wasteArea = cand.filter((i) => !seen.has(i)).reduce((s, i) => s + Math.abs(faces[i].area), 0);
  return { panels, creases: [...merged.values()], root: rootId, wasteArea };
}
