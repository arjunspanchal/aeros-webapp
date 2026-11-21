// TRACE A PICTURE OF A LOGO INTO VECTOR ART - arithmetic only, no AI, same picture + same settings = same outline.
//   1. the picture is drawn at a working size (small pictures are enlarged, so edges have room to be smooth)
//   2. its colours are sorted into N flat inks + the paper (median cut, then a few rounds of nearest-mean)
//   3. for each ink a coverage map is made, softened a little, and its 50 % line is followed with sub-pixel points
//      (marching squares) - so an anti-aliased edge gives a smooth line, not a staircase
//   4. each outline is thinned (points that add less than `detail` px are dropped), then drawn as curves, with real
//      corners kept as corners
// Result: one SVG path per ink, even-odd filled (holes stay holes). A trace is a REDRAW of a picture - it is never the
// customer's own logo file - so the screen says so and asks for the original to be compared.
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const hex = (c) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

/** flat inks of a picture: [{ rgb, count }] incl. the paper, most used first. data = ImageData */
export function quantise(data, n) {
  const { data: d, width: w, height: h } = data, step = Math.max(1, Math.floor(Math.sqrt((w * h) / 60000)));
  const px = [];
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) { const i = (y * w + x) * 4; if (d[i + 3] >= 128) px.push([d[i], d[i + 1], d[i + 2]]); }
  if (!px.length) return [];
  // median cut -> starting colours
  let boxes = [px];
  while (boxes.length < n) {
    let best = -1, bestR = 0, ax = 0;
    boxes.forEach((b, k) => { for (let c = 0; c < 3; c++) { let lo = 255, hi = 0; for (const p of b) { if (p[c] < lo) lo = p[c]; if (p[c] > hi) hi = p[c]; } if ((hi - lo) * Math.sqrt(b.length) > bestR) { bestR = (hi - lo) * Math.sqrt(b.length); best = k; ax = c; } } });
    if (best < 0 || bestR < 1) break;
    const b = boxes[best].slice().sort((p, q) => p[ax] - q[ax]), m = b.length >> 1;
    boxes.splice(best, 1, b.slice(0, m), b.slice(m));
  }
  let means = boxes.filter((b) => b.length).map((b) => [0, 1, 2].map((c) => b.reduce((s, p) => s + p[c], 0) / b.length));
  for (let it = 0; it < 8; it++) { // nearest-mean rounds
    const sum = means.map(() => [0, 0, 0, 0]);
    for (const p of px) { let k = 0, bd = Infinity; means.forEach((m, j) => { const dd = (p[0] - m[0]) ** 2 + (p[1] - m[1]) ** 2 + (p[2] - m[2]) ** 2; if (dd < bd) { bd = dd; k = j; } }); const s = sum[k]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++; }
    means = means.map((m, j) => (sum[j][3] ? [sum[j][0] / sum[j][3], sum[j][1] / sum[j][3], sum[j][2] / sum[j][3]] : m));
  }
  return means;
}

// follow the 50 % line of a coverage map f (w x h floats, 0..1) -> closed loops of [x, y] in pixel units
function contours(f, w, h) {
  const W = w + 2, H = h + 2, g = new Float32Array(W * H); // one pixel of empty border so every loop closes
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[(y + 1) * W + x + 1] = f[y * w + x];
  const v = (x, y) => g[y * W + x], T = 0.5;
  // an edge point is keyed by its grid edge: horizontal edge (x,y)-(x+1,y) = 2 * (y * W + x), vertical (x,y)-(x,y+1) = that + 1
  const pt = new Map(), next = new Map();
  const P = (x, y, horiz) => {
    const key = 2 * (y * W + x) + (horiz ? 0 : 1);
    if (!pt.has(key)) { const a = v(x, y), b = horiz ? v(x + 1, y) : v(x, y + 1), t = (T - a) / (b - a || 1e-9); pt.set(key, horiz ? [x + t - 1, y - 1] : [x - 1, y + t - 1]); }
    return key;
  };
  const link = (a, b) => { next.set(a, b); };
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
    const a = v(x, y) >= T, b = v(x + 1, y) >= T, c = v(x + 1, y + 1) >= T, d = v(x, y + 1) >= T, k = (a ? 8 : 0) | (b ? 4 : 0) | (c ? 2 : 0) | (d ? 1 : 0);
    if (k === 0 || k === 15) continue;
    const top = () => P(x, y, true), bot = () => P(x, y + 1, true), lef = () => P(x, y, false), rig = () => P(x + 1, y, false);
    // loops run with the ink on their left
    switch (k) {
      case 1: link(bot(), lef()); break; case 2: link(rig(), bot()); break; case 3: link(rig(), lef()); break;
      case 4: link(top(), rig()); break; case 6: link(top(), bot()); break; case 7: link(top(), lef()); break;
      case 8: link(lef(), top()); break; case 9: link(bot(), top()); break; case 11: link(rig(), top()); break;
      case 12: link(lef(), rig()); break; case 13: link(bot(), rig()); break; case 14: link(lef(), bot()); break;
      case 5: { const mid = (v(x, y) + v(x + 1, y) + v(x + 1, y + 1) + v(x, y + 1)) / 4 >= T; if (mid) { link(top(), lef()); link(bot(), rig()); } else { link(top(), rig()); link(bot(), lef()); } break; }
      case 10: { const mid = (v(x, y) + v(x + 1, y) + v(x + 1, y + 1) + v(x, y + 1)) / 4 >= T; if (mid) { link(lef(), bot()); link(rig(), top()); } else { link(lef(), top()); link(rig(), bot()); } break; }
      default: break;
    }
  }
  const loops = [], seen = new Set();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop = []; let k = start, guard = 0;
    while (k != null && !seen.has(k) && guard++ < 4e6) { seen.add(k); loop.push(pt.get(k)); k = next.get(k); }
    if (k === start && loop.length >= 4) loops.push(loop);
  }
  return loops;
}
const areaOf = (L) => { let a = 0; for (let i = 0, j = L.length - 1; i < L.length; j = i++) a += (L[j][0] - L[i][0]) * (L[j][1] + L[i][1]); return a / 2; };

// drop points that move the line by less than eps (closed loop, Ramer-Douglas-Peucker from the two far ends)
function thin(L, eps) {
  if (L.length < 8) return L;
  let far = 0, fd = 0; for (let i = 1; i < L.length; i++) { const dd = (L[i][0] - L[0][0]) ** 2 + (L[i][1] - L[0][1]) ** 2; if (dd > fd) { fd = dd; far = i; } }
  const run = (pts) => {
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const st = [[0, pts.length - 1]];
    while (st.length) {
      const [a, b] = st.pop(); if (b - a < 2) continue;
      const ax = pts[a][0], ay = pts[a][1], dx = pts[b][0] - ax, dy = pts[b][1] - ay, L2 = dx * dx + dy * dy || 1e-9;
      let m = -1, md = eps * eps;
      for (let i = a + 1; i < b; i++) { const t = Math.max(0, Math.min(1, ((pts[i][0] - ax) * dx + (pts[i][1] - ay) * dy) / L2)), ex = pts[i][0] - ax - t * dx, ey = pts[i][1] - ay - t * dy, dd = ex * ex + ey * ey; if (dd > md) { md = dd; m = i; } }
      if (m > 0) { keep[m] = 1; st.push([a, m], [m, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  };
  const A = run(L.slice(0, far + 1)), B = run([...L.slice(far), L[0]]);
  return [...A.slice(0, -1), ...B.slice(0, -1)];
}

// closed loop -> SVG path: straight into and out of a real corner, a smooth curve everywhere else
function toPath(L, cornerDeg, k) {
  const n = L.length, f = (v) => +(v * k).toFixed(2);
  const isCorner = L.map((p, i) => {
    const a = L[(i - 1 + n) % n], b = L[(i + 1) % n], ux = p[0] - a[0], uy = p[1] - a[1], vx = b[0] - p[0], vy = b[1] - p[1];
    const c = (ux * vx + uy * vy) / ((Math.hypot(ux, uy) * Math.hypot(vx, vy)) || 1e-9);
    return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI > cornerDeg;
  });
  let d = `M${f(L[0][0])} ${f(L[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = L[(i - 1 + n) % n], p1 = L[i], p2 = L[(i + 1) % n], p3 = L[(i + 2) % n];
    // Catmull-Rom tangents; at a corner the tangent on that side is dropped so the corner stays sharp
    const t1 = isCorner[i] ? [0, 0] : [(p2[0] - p0[0]) / 6, (p2[1] - p0[1]) / 6], t2 = isCorner[(i + 1) % n] ? [0, 0] : [(p3[0] - p1[0]) / 6, (p3[1] - p1[1]) / 6];
    d += isCorner[i] && isCorner[(i + 1) % n] ? `L${f(p2[0])} ${f(p2[1])}` : `C${f(p1[0] + t1[0])} ${f(p1[1] + t1[1])} ${f(p2[0] - t2[0])} ${f(p2[1] - t2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + "Z";
}

/**
 * source = HTMLImageElement | canvas. opts: colours 1..6 (inks, not counting the paper), detail (px of the working
 * picture a point may be off - smaller = closer, more points), minArea (px^2 specks dropped), keepPaper (trace the paper
 * colour too), size (working long side). Returns { svg, colours: [hex], points, w, h, paper }.
 */
export function traceImage(source, { colours = 1, detail = 0.9, minArea = 12, keepPaper = false, size = 1400, cornerDeg = 50 } = {}) {
  const sw = source.naturalWidth || source.width, sh = source.naturalHeight || source.height;
  const k = Math.min(4, size / Math.max(sw, sh)), w = Math.max(8, Math.round(sw * k)), h = Math.max(8, Math.round(sh * k));
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = "high";
  cx.drawImage(source, 0, 0, w, h);
  const img = cx.getImageData(0, 0, w, h), d = img.data;
  const means = quantise(img, Math.max(2, colours + 1));
  if (means.length < 2) throw new Error("This picture is one flat colour - there is nothing to trace.");
  // which colour is the paper: the one most seen along the picture's border (see-through pixels always count as paper)
  const idx = new Uint8Array(w * h), border = means.map(() => 0);
  let clear = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (d[i + 3] < 128) { idx[y * w + x] = 255; clear++; continue; }
    let b = 0, bd = Infinity; for (let j = 0; j < means.length; j++) { const m = means[j], dd = (d[i] - m[0]) ** 2 + (d[i + 1] - m[1]) ** 2 + (d[i + 2] - m[2]) ** 2; if (dd < bd) { bd = dd; b = j; } }
    idx[y * w + x] = b;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border[b]++;
  }
  const hasClear = clear > w * h * 0.02;
  const paper = hasClear ? -1 : border.indexOf(Math.max(...border));
  const order = means.map((m, j) => j).filter((j) => keepPaper || j !== paper).sort((a, b) => lum(...means[b]) - lum(...means[a])); // light inks first, dark on top
  const out = [], f = new Float32Array(w * h), s = new Float32Array(w * h);
  let points = 0;
  for (const j of order) {
    for (let i = 0; i < w * h; i++) f[i] = idx[i] === j ? 1 : 0;
    // soften: 3 x 3 box, twice (close to a small gaussian) - the 50 % line of the softened map is the smooth edge
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const a = x > 0 ? f[y * w + x - 1] : 0, c = x < w - 1 ? f[y * w + x + 1] : 0; s[y * w + x] = (a + f[y * w + x] + c) / 3; }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const a = y > 0 ? s[(y - 1) * w + x] : 0, c = y < h - 1 ? s[(y + 1) * w + x] : 0; f[y * w + x] = (a + s[y * w + x] + c) / 3; }
    }
    const loops = contours(f, w, h).filter((L) => Math.abs(areaOf(L)) >= minArea).map((L) => thin(L, detail)).filter((L) => L.length >= 3);
    if (!loops.length) continue;
    points += loops.reduce((a, L) => a + L.length, 0);
    out.push({ colour: hex(means[j]), d: loops.map((L) => toPath(L, cornerDeg, 1)).join("") });
  }
  if (!out.length) throw new Error("Nothing was found to trace. Try more colours.");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${out.map((o) => `<path fill="${o.colour}" fill-rule="evenodd" d="${o.d}"/>`).join("")}</svg>`;
  return { svg, colours: out.map((o) => o.colour), points, w, h, paper: paper >= 0 ? hex(means[paper]) : null };
}
