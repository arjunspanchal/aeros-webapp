// ARTWORK -> TRUE VECTOR PDF. Every placed vector logo is written as PDF paths (no rasterising), every ink as its own
// plate: on a Pantone job each colour is a /Separation colour space named with its Pantone name, so the printer's RIP
// makes one plate per colour; on a CMYK job colours are DeviceCMYK. White = no ink (knocks out what is under it).
// Raster items are embedded as images (with their transparency). Output ops are in blank coordinates, points, y-DOWN
// (the same frame as the die and as SVG), ready for toPdf({ vector }) and the sheet layout writer.
// The SVG walker is DOM-agnostic: pass nodes from DOMParser (browser) or from parseXml below (tests).
import { toHex, recolourSvg, BLEED } from "./model.js";

export const K = 72 / 25.4;
const f = (v) => (Math.abs(v) < 1e-6 ? "0" : (+v.toFixed(4)).toString());

// ---------------------------------------------------------------- tiny XML reader (tests / no-DOM environments)
export function parseXml(text) {
  const root = { tagName: "#root", attrs: {}, children: [] }, stack = [root];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>/g;
  let m;
  while ((m = re.exec(text))) {
    if (m[1]) { if (stack.length > 1) stack.pop(); continue; }
    if (!m[2]) continue;
    const attrs = {}, ar = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let a;
    while ((a = ar.exec(m[3] || ""))) attrs[a[1]] = a[2] ?? a[3];
    const node = { tagName: m[2], attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (!m[4]) stack.push(node);
  }
  return root.children.find((c) => /(^|:)svg$/i.test(c.tagName)) || root.children[0];
}
const tagOf = (n) => String(n.tagName || n.nodeName || "").replace(/^.*:/, "").toLowerCase();
const attr = (n, k) => (n.getAttribute ? n.getAttribute(k) : n.attrs?.[k]) ?? null;
const kids = (n) => (n.attrs ? n.children : [...n.children]);

// ---------------------------------------------------------------- transforms (SVG matrix order a b c d e f)
const mulM = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const applyM = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
export function parseTransform(t) {
  let M = [1, 0, 0, 1, 0, 0];
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(t || ""))) {
    const v = m[2].split(/[\s,]+/).filter(Boolean).map(Number), rad = (d) => (d * Math.PI) / 180;
    let N = [1, 0, 0, 1, 0, 0];
    if (m[1] === "matrix" && v.length === 6) N = v;
    else if (m[1] === "translate") N = [1, 0, 0, 1, v[0] || 0, v[1] || 0];
    else if (m[1] === "scale") N = [v[0], 0, 0, v[1] ?? v[0], 0, 0];
    else if (m[1] === "rotate") { const c = Math.cos(rad(v[0])), s = Math.sin(rad(v[0])); N = [c, s, -s, c, 0, 0]; if (v.length === 3) N = mulM(mulM([1, 0, 0, 1, v[1], v[2]], N), [1, 0, 0, 1, -v[1], -v[2]]); }
    else if (m[1] === "skewX") N = [1, 0, Math.tan(rad(v[0])), 1, 0, 0];
    else if (m[1] === "skewY") N = [1, Math.tan(rad(v[0])), 0, 1, 0, 0];
    M = mulM(M, N);
  }
  return M;
}

// ---------------------------------------------------------------- path data -> absolute M / L / C / Z
function arcToCubics(x1, y1, rx, ry, phi, fa, fs, x2, y2) {
  if (!rx || !ry) return [["L", x2, y2]];
  const sp = Math.sin(phi), cp = Math.cos(phi), dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
  rx = Math.abs(rx); ry = Math.abs(ry);
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p, den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const co = (fa === fs ? -1 : 1) * Math.sqrt(Math.max(0, num / (den || 1e-12)));
  const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx;
  const cx = cp * cxp - sp * cyp + (x1 + x2) / 2, cy = sp * cxp + cp * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dt > 0) dt -= 2 * Math.PI; else if (fs && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2))), d = dt / n, k = (4 / 3) * Math.tan(d / 4), out = [];
  for (let i = 0; i < n; i++) {
    const a = t1 + i * d, b = a + d;
    const P = (t) => [cx + rx * Math.cos(t) * cp - ry * Math.sin(t) * sp, cy + rx * Math.cos(t) * sp + ry * Math.sin(t) * cp];
    const D = (t) => [-rx * Math.sin(t) * cp - ry * Math.cos(t) * sp, -rx * Math.sin(t) * sp + ry * Math.cos(t) * cp];
    const p0 = P(a), p3 = P(b), d0 = D(a), d3 = D(b);
    out.push(["C", p0[0] + k * d0[0], p0[1] + k * d0[1], p3[0] - k * d3[0], p3[1] - k * d3[1], p3[0], p3[1]]);
  }
  return out;
}
export function parsePath(d) {
  const tok = String(d || "").match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || [];
  const out = [];
  let i = 0, cmd = "", x = 0, y = 0, sx = 0, sy = 0, px = 0, py = 0, prev = "";
  const num = () => +tok[i++];
  while (i < tok.length) {
    if (/[a-zA-Z]/.test(tok[i])) cmd = tok[i++];
    else if (!cmd) { i++; continue; }
    const rel = cmd === cmd.toLowerCase(), c = cmd.toUpperCase(), ox = rel ? x : 0, oy = rel ? y : 0;
    if (c === "M") { x = num() + ox; y = num() + oy; sx = x; sy = y; out.push(["M", x, y]); cmd = rel ? "l" : "L"; }
    else if (c === "L") { x = num() + ox; y = num() + oy; out.push(["L", x, y]); }
    else if (c === "H") { x = num() + ox; out.push(["L", x, y]); }
    else if (c === "V") { y = num() + oy; out.push(["L", x, y]); }
    else if (c === "C") { const a = num() + ox, b = num() + oy; px = num() + ox; py = num() + oy; x = num() + ox; y = num() + oy; out.push(["C", a, b, px, py, x, y]); }
    else if (c === "S") { const a = /[CS]/.test(prev) ? 2 * x - px : x, b = /[CS]/.test(prev) ? 2 * y - py : y; px = num() + ox; py = num() + oy; x = num() + ox; y = num() + oy; out.push(["C", a, b, px, py, x, y]); }
    else if (c === "Q" || c === "T") {
      let qx, qy;
      if (c === "Q") { qx = num() + ox; qy = num() + oy; } else { qx = /[QT]/.test(prev) ? 2 * x - px : x; qy = /[QT]/.test(prev) ? 2 * y - py : y; }
      const ex = num() + ox, ey = num() + oy;
      out.push(["C", x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey]);
      px = qx; py = qy; x = ex; y = ey;
    }
    else if (c === "A") { const rx = num(), ry = num(), ph = (num() * Math.PI) / 180, fa = num(), fs = num(), ex = num() + ox, ey = num() + oy; out.push(...arcToCubics(x, y, rx, ry, ph, fa, fs, ex, ey)); x = ex; y = ey; }
    else if (c === "Z") { out.push(["Z"]); x = sx; y = sy; }
    else { i++; }
    prev = c;
  }
  return out;
}
const KAP = 0.5522847498;
function shapePath(n) {
  const t = tagOf(n), v = (k, d = 0) => parseFloat(attr(n, k)) || d;
  if (t === "path") return parsePath(attr(n, "d"));
  if (t === "rect") {
    const x = v("x"), y = v("y"), w = v("width"), h = v("height");
    let rx = attr(n, "rx") != null ? v("rx") : v("ry"), ry = attr(n, "ry") != null ? v("ry") : rx;
    rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
    if (!(w > 0 && h > 0)) return [];
    if (!rx || !ry) return [["M", x, y], ["L", x + w, y], ["L", x + w, y + h], ["L", x, y + h], ["Z"]];
    return parsePath(`M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`);
  }
  if (t === "circle" || t === "ellipse") {
    const cx = v("cx"), cy = v("cy"), rx = t === "circle" ? v("r") : v("rx"), ry = t === "circle" ? v("r") : v("ry"), kx = rx * KAP, ky = ry * KAP;
    if (!(rx > 0 && ry > 0)) return [];
    return [["M", cx + rx, cy], ["C", cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry], ["C", cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy], ["C", cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry], ["C", cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy], ["Z"]];
  }
  if (t === "line") return [["M", v("x1"), v("y1")], ["L", v("x2"), v("y2")]];
  if (t === "polygon" || t === "polyline") {
    const p = (attr(n, "points") || "").split(/[\s,]+/).filter(Boolean).map(Number), out = [];
    for (let k = 0; k + 1 < p.length; k += 2) out.push([k ? "L" : "M", p[k], p[k + 1]]);
    if (t === "polygon" && out.length) out.push(["Z"]);
    return out;
  }
  return null;
}
const pathOps = (segs, M = null) => segs.map((s) => {
  if (s[0] === "Z") return "h";
  const pts = []; for (let k = 1; k < s.length; k += 2) pts.push(M ? applyM(M, [s[k], s[k + 1]]) : [s[k], s[k + 1]]);
  return pts.map((p) => `${f(p[0])} ${f(p[1])}`).join(" ") + (s[0] === "M" ? " m" : s[0] === "L" ? " l" : " c");
}).join(" ");

// ---------------------------------------------------------------- inks
const isWhiteHex = (h) => /^#f{6}$/i.test(h);
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
export function cmykOf(hex) { const [r, g, b] = rgb(hex), k = 1 - Math.max(r, g, b); return k >= 0.999 ? [0, 0, 0, 1] : [(1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k]; }
const pdfName = (s) => "/" + [...String(s)].map((ch) => (/[A-Za-z0-9._-]/.test(ch) ? ch : "#" + ch.charCodeAt(0).toString(16).padStart(2, "0"))).join("");
export function inkBook({ spot, names = {} }) {
  const byHex = new Map(), colorSpaces = {};
  const get = (hex) => {
    hex = hex.toLowerCase();
    if (!byHex.has(hex)) {
      const n = byHex.size + 1, c = cmykOf(hex).map(f).join(" "), label = (names[hex] || "").trim() || `Spot ${n} ${hex}`;
      if (spot) colorSpaces[`CS${n}`] = `[/Separation ${pdfName(label)} /DeviceCMYK << /FunctionType 2 /Domain [0 1] /C0 [0 0 0 0] /C1 [${c}] /N 1 >>]`;
      byHex.set(hex, { cs: `CS${n}`, label, hex, cmyk: c });
    }
    return byHex.get(hex);
  };
  return {
    fill: (hex) => (isWhiteHex(hex) ? "0 0 0 0 k" : spot ? `/${get(hex).cs} cs 1 scn` : `${get(hex).cmyk} k`),
    stroke: (hex) => (isWhiteHex(hex) ? "0 0 0 0 K" : spot ? `/${get(hex).cs} CS 1 SCN` : `${get(hex).cmyk} K`),
    colorSpaces, list: () => [...byHex.values()],
  };
}

// ---------------------------------------------------------------- SVG -> ops
const OK_TAGS = new Set(["svg", "g", "a", "path", "rect", "circle", "ellipse", "line", "polygon", "polyline", "defs", "clippath", "title", "desc", "metadata"]);
/** null when the SVG is plain flat-colour vector; otherwise the reason it cannot be written as paths */
export function vectorBlocker(root) {
  let why = null;
  const visit = (n) => {
    const t = tagOf(n);
    if (!OK_TAGS.has(t)) why = why || (t === "text" || t === "tspan" ? "live text (not outlined)" : t === "image" ? "an embedded picture" : /gradient|pattern/.test(t) ? "gradients" : t === "style" ? "style-sheet colours" : `<${t}>`);
    for (const k of ["fill", "stroke"]) if (/url\(/.test(attr(n, k) || "")) why = why || "gradients";
    if (/url\(/.test((attr(n, "style") || "").replace(/clip-path\s*:[^;]*/g, ""))) why = why || "gradients";
    for (const c of kids(n)) visit(c);
  };
  visit(root);
  return why;
}
function styleOf(n, inh) {
  const st = { ...inh }, decl = {};
  for (const k of ["fill", "stroke", "stroke-width", "fill-rule", "display", "visibility"]) { const v = attr(n, k); if (v != null) decl[k] = v; }
  for (const part of (attr(n, "style") || "").split(";")) { const [k, v] = part.split(":").map((s) => (s || "").trim()); if (k && v) decl[k] = v; }
  if (decl.fill) st.fill = /^none|transparent$/i.test(decl.fill) ? null : toHex(decl.fill) || st.fill;
  if (decl.stroke) st.stroke = /^none|transparent$/i.test(decl.stroke) ? null : toHex(decl.stroke) || st.stroke;
  if (decl["stroke-width"]) st.sw = parseFloat(decl["stroke-width"]) || st.sw;
  if (decl["fill-rule"]) st.evenodd = decl["fill-rule"] === "evenodd";
  if (decl.display === "none" || decl.visibility === "hidden") st.hidden = true;
  return st;
}
function svgOps(root, ink, out) {
  const byId = new Map();
  const index = (n) => { const id = attr(n, "id"); if (id) byId.set(id, n); for (const c of kids(n)) index(c); };
  index(root);
  const clipFor = (n) => {
    const m = /url\(\s*["']?#([^"')]+)/.exec(attr(n, "clip-path") || (/(?:^|;)\s*clip-path\s*:\s*([^;]+)/.exec(attr(n, "style") || "") || [])[1] || "");
    const cp = m && byId.get(m[1]);
    if (!cp) return "";
    const parts = [];
    for (const c of kids(cp)) { const segs = shapePath(c); if (segs && segs.length) parts.push(pathOps(segs, mulM(parseTransform(attr(cp, "transform")), parseTransform(attr(c, "transform"))))); }
    return parts.length ? `${parts.join(" ")} W n` : "";
  };
  const visit = (n, inh, isRoot) => {
    const t = tagOf(n);
    if (t === "defs" || t === "clippath" || t === "title" || t === "desc" || t === "metadata") return;
    const st = styleOf(n, inh);
    if (st.hidden) return;
    const tr = isRoot ? null : attr(n, "transform"), clip = clipFor(n);
    const open = tr || clip;
    if (open) { out.push("q"); if (tr) out.push(`${parseTransform(tr).map(f).join(" ")} cm`); if (clip) out.push(clip); }
    if (t === "svg" || t === "g" || t === "a") for (const c of kids(n)) visit(c, st, false);
    else {
      const segs = shapePath(n);
      if (segs && segs.length && (st.fill || st.stroke)) {
        const open2 = t === "line" || t === "polyline";
        const fillIt = st.fill && !open2, strokeIt = !!st.stroke;
        if (fillIt) out.push(ink.fill(st.fill));
        if (strokeIt) out.push(ink.stroke(st.stroke), `${f(st.sw)} w`);
        if (fillIt || strokeIt) out.push(pathOps(segs), fillIt && strokeIt ? (st.evenodd ? "B*" : "B") : fillIt ? (st.evenodd ? "f*" : "f") : "S");
      }
    }
    if (open) out.push("Q");
  };
  visit(root, { fill: "#000000", stroke: null, sw: 1, evenodd: false }, true);
}

/** every drawable shape of an SVG as absolute segments in the SVG's own user units: [{ segs, fill, stroke, sw, evenodd }] */
export function svgShapes(root) {
  const out = [];
  const visit = (n, inh, M, isRoot) => {
    const t = tagOf(n);
    if (t === "defs" || t === "clippath" || t === "title" || t === "desc" || t === "metadata") return;
    const st = styleOf(n, inh);
    if (st.hidden) return;
    const M2 = isRoot ? M : mulM(M, parseTransform(attr(n, "transform")));
    if (t === "svg" || t === "g" || t === "a") { for (const c of kids(n)) visit(c, st, M2, false); return; }
    const segs = shapePath(n);
    if (!segs || !segs.length || (!st.fill && !st.stroke)) return;
    const open = t === "line" || t === "polyline", scale = Math.sqrt(Math.abs(M2[0] * M2[3] - M2[1] * M2[2]));
    out.push({ fill: open ? null : st.fill, stroke: st.stroke, sw: st.sw * scale, evenodd: st.evenodd,
      segs: segs.map((sg) => { if (sg[0] === "Z") return sg; const o = [sg[0]]; for (let k = 1; k < sg.length; k += 2) o.push(...applyM(M2, [sg[k], sg[k + 1]])); return o; }) });
  };
  visit(root, { fill: "#000000", stroke: null, sw: 1, evenodd: false }, [1, 0, 0, 1, 0, 0], true);
  return out;
}

const hexOf = (bytes) => { const H = "0123456789abcdef", parts = []; let s = ""; for (let i = 0; i < bytes.length; i++) { s += H[bytes[i] >> 4] + H[bytes[i] & 15]; if (s.length > 65536) { parts.push(s); s = ""; } } parts.push(s); return parts.join(""); };
async function deflate(bytes) {
  if (typeof CompressionStream === "undefined") return null;
  const cs = new CompressionStream("deflate"), w = cs.writable.getWriter();
  w.write(bytes); w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}
/** canvas -> PDF image XObject body (JPEG) + soft mask for its transparency */
export async function imageXObject(cv) {
  const g = cv.getContext("2d"), px = g.getImageData(0, 0, cv.width, cv.height).data, n = cv.width * cv.height;
  let hasAlpha = false; const alpha = new Uint8Array(n);
  for (let i = 0; i < n; i++) { alpha[i] = px[i * 4 + 3]; if (alpha[i] < 255) hasAlpha = true; }
  const flat = document.createElement("canvas"); flat.width = cv.width; flat.height = cv.height;
  const fg = flat.getContext("2d"); fg.fillStyle = "#ffffff"; fg.fillRect(0, 0, flat.width, flat.height); fg.drawImage(cv, 0, 0);
  const jpg = new Uint8Array(await (await new Promise((r) => flat.toBlob(r, "image/jpeg", 0.93))).arrayBuffer()), jh = hexOf(jpg) + ">";
  const body = `<< /Type /XObject /Subtype /Image /Width ${cv.width} /Height ${cv.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 @@SMASK@@ /Filter [/ASCIIHexDecode /DCTDecode] /Length ${jh.length} >>\nstream\n${jh}\nendstream`;
  let smask = null;
  if (hasAlpha) {
    const z = await deflate(alpha), ah = hexOf(z || alpha) + ">";
    smask = `<< /Type /XObject /Subtype /Image /Width ${cv.width} /Height ${cv.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter [/ASCIIHexDecode${z ? " /FlateDecode" : ""}] /Length ${ah.length} >>\nstream\n${ah}\nendstream`;
  }
  return { body, smask };
}

/**
 * Artwork -> { ops, colorSpaces, images, inks, notes }. box = [x0, y0, x1, y1] mm the art is clipped to (blank + bleed);
 * spot = true on Pantone jobs; rasterise(item, dpi) -> canvas for items that cannot be vector (supplied by the browser side);
 * parse(svgText) -> root node (DOMParser in the browser).
 */
export async function artworkToPdf(items, { box, noInk = [], spot, rasterise, parse = parseXml, clipPoly = null }) {
  const names = {};
  for (const it of items) { if (it.kind === "flood" && it.pantone) names[it.colour.toLowerCase()] = it.pantone; if (it.kind === "svg") for (const c of it.colours || []) if (c.name) names[toHex(c.to) || c.to] = c.name; }
  const ink = inkBook({ spot, names }), out = [], images = [], notes = [];
  const [x0, y0, x1, y1] = box.map((v) => v * K);
  out.push("q", `${f(x0)} ${f(y0)} ${f(x1 - x0)} ${f(y1 - y0)} re W n`);
  if (clipPoly) out.push(clipPoly.map(([x, y], k) => `${f(x * K)} ${f(y * K)} ${k ? "l" : "m"}`).join(" ") + " h W n"); // cups: no ink past the KLD's bleed line
  for (const it of items) {
    if (it.kind === "flood") { out.push(ink.fill(it.colour.toLowerCase()), `${f(x0)} ${f(y0)} ${f(x1 - x0)} ${f(y1 - y0)} re f`); continue; }
    const c = it.crop || { l: 0, t: 0, r: 0, b: 0 }, a = ((it.rot || 0) * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a);
    const place = `${f(cs)} ${f(sn)} ${f(-sn)} ${f(cs)} ${f(it.x * K)} ${f(it.y * K)} cm`;
    let done = false;
    if (it.kind === "svg") {
      const root = parse(recolourSvg(it.svgText, it.colours || [])), why = vectorBlocker(root);
      if (!why) {
        const vb = (attr(root, "viewBox") || `0 0 ${it.natW} ${it.natH}`).split(/[\s,]+/).map(Number);
        const cw = vb[2] * (1 - c.l - c.r), ch = vb[3] * (1 - c.t - c.b), cx = vb[0] + vb[2] * c.l, cy = vb[1] + vb[3] * c.t;
        out.push("q", place, `${f((it.w * K) / cw)} 0 0 ${f((it.h * K) / ch)} ${f((-it.w / 2) * K)} ${f((-it.h / 2) * K)} cm`, `1 0 0 1 ${f(-cx)} ${f(-cy)} cm`, `${f(cx)} ${f(cy)} ${f(cw)} ${f(ch)} re W n`);
        svgOps(root, ink, out);
        out.push("Q");
        done = true;
      } else notes.push(`"${it.name}" has ${why}: placed as a 600 dpi image, not vector.`);
    }
    if (!done) {
      const cv = await rasterise(it, it.kind === "svg" ? 600 : null), name = `Im${images.length + 2}`;
      images.push({ name, ...(await imageXObject(cv)) });
      out.push("q", place, `${f(it.w * K)} 0 0 ${f(-it.h * K)} ${f((-it.w / 2) * K)} ${f((it.h / 2) * K)} cm`, `/${name} Do`, "Q");
    }
  }
  for (const [a, b, c2, d] of noInk) { // glue areas: knock every plate out
    const rx0 = Math.max(a * K, x0), ry0 = Math.max(b * K, y0), rx1 = Math.min(c2 * K, x1), ry1 = Math.min(d * K, y1);
    if (rx1 > rx0 && ry1 > ry0) out.push("0 0 0 0 k", `${f(rx0)} ${f(ry0)} ${f(rx1 - rx0)} ${f(ry1 - ry0)} re f`);
  }
  out.push("Q");
  return { ops: out.join("\n"), colorSpaces: ink.colorSpaces, images, inks: ink.list(), notes, spot: !!spot };
}
export { BLEED };
