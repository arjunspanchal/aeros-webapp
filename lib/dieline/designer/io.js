// ARTWORK DESIGNER — browser side: read customer files into items, and paint the artwork to a canvas (for the 3D model
// and the print files). PDF logos are read with Mozilla pdf.js (vendored in /public/vendor/pdfjs, Apache-2.0): pages
// come in as VECTOR (SVG) whenever the PDF is vector, so they stay sharp at any size and can be recoloured.
import { newId, svgColours, recolourSvg, BLEED } from "./model.js";

const readAs = (file, how) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r[how](file); });
const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Could not read the image")); i.src = src; });
export const parseSvgDom = (text) => new DOMParser().parseFromString(text, "image/svg+xml").documentElement;
export const svgUrl = (text) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;

let pdfjsPromise = null;
function pdfjs() {
  if (!pdfjsPromise) pdfjsPromise = new Promise((res, rej) => {
    if (window.pdfjsLib) return res(window.pdfjsLib);
    const s = document.createElement("script");
    s.src = "/vendor/pdfjs/pdf.min.js";
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.js"; res(window.pdfjsLib); };
    s.onerror = () => rej(new Error("Could not load the PDF reader"));
    document.head.appendChild(s);
  });
  return pdfjsPromise;
}

// make implicit black explicit and give the root a size, so recolour and scaling always work
function normaliseSvg(text) {
  let t = text.replace(/<\?xml[^>]*\?>/g, "").replace(/<!DOCTYPE[^>]*>/gi, "").trim();
  const doc = new DOMParser().parseFromString(t, "image/svg+xml"), root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase().replace(/^svg:/, "") !== "svg") throw new Error("Not an SVG file");
  let vb = (root.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
  const num = (v) => parseFloat(v) || 0;
  if (vb.length !== 4 || vb.some(isNaN)) { vb = [0, 0, num(root.getAttribute("width")) || 300, num(root.getAttribute("height")) || 150]; root.setAttribute("viewBox", vb.join(" ")); }
  root.setAttribute("width", vb[2]); root.setAttribute("height", vb[3]);
  // shapes with no fill of their own (or from a parent) print black by default: say so on the root, so it can be recoloured
  const hasFill = (n) => { for (let e = n; e && e.nodeType === 1; e = e.parentNode) { if (e.getAttribute("fill") || /fill\s*:/.test(e.getAttribute("style") || "")) return true; } return false; };
  const bare = [...root.querySelectorAll("path, rect, circle, ellipse, polygon, polyline, text")].some((n) => !n.closest("defs, clipPath, mask") && !hasFill(n));
  const styled = root.querySelector("style"); // class-based fills: leave alone
  if (bare && !styled && !root.getAttribute("fill")) root.setAttribute("fill", "#000000");
  if (!root.getAttribute("xmlns")) root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  root.querySelectorAll("script, foreignObject").forEach((n) => n.remove()); // never run anything from a customer file
  return { text: new XMLSerializer().serializeToString(root), w: vb[2], h: vb[3] };
}

function svgItem(text, name, startW) {
  const n = normaliseSvg(text), cols = svgColours(n.text);
  const w = Math.round(startW * 10) / 10, h = Math.round(((startW * n.h) / n.w) * 10) / 10;
  return { id: newId(), kind: "svg", name, role: "content", x: 0, y: 0, w, h, rot: 0, crop: { l: 0, t: 0, r: 0, b: 0 }, natW: n.w, natH: n.h,
    svgText: n.text, colours: cols.map((c) => ({ from: c, to: c, name: "" })), href: svgUrl(n.text),
    embedded: (n.text.match(/<image[\s>]/g) || []).length || undefined }; // pictures inside a "vector" file are still pictures
}

// ---------------------------------------------------------------- picture -> vector (trace.js: arithmetic, no AI)
/** trace a picture item into a vector item in the same place. opts = traceImage options. Returns { item, info } */
export async function traceItem(it, opts = {}) {
  const { traceImage } = await import("./trace.js");
  const img = await loadImg(it.href), c = it.crop || { l: 0, t: 0, r: 0, b: 0 };
  let src = img;
  if (c.l || c.t || c.r || c.b) { // trace what is shown, not what is cropped away
    const cv = document.createElement("canvas"), W0 = img.naturalWidth, H0 = img.naturalHeight;
    cv.width = Math.round(W0 * (1 - c.l - c.r)); cv.height = Math.round(H0 * (1 - c.t - c.b));
    cv.getContext("2d").drawImage(img, -Math.round(W0 * c.l), -Math.round(H0 * c.t));
    src = cv;
  }
  const t = traceImage(src, opts), n = svgItem(t.svg, it.name.replace(/ \(traced\)$/, "") + " (traced)", it.w);
  return { item: { ...n, id: it.id, role: it.role, x: it.x, y: it.y, rot: it.rot, w: it.w, h: Math.round(((it.w * t.h) / t.w) * 10) / 10, source: "trace" }, info: t };
}

/** customer file -> items (a PDF gives one item per page, first 4 pages) */
export async function importFile(file, { startW = 80 } = {}) {
  const name = file.name.replace(/\.[^.]+$/, "");
  const type = (file.type || "").toLowerCase(), ext = file.name.split(".").pop().toLowerCase();
  if (type === "image/svg+xml" || ext === "svg") return [svgItem(await readAs(file, "readAsText"), name, startW)];
  if (type === "application/pdf" || ext === "pdf" || ext === "ai") {
    const lib = await pdfjs();
    const pdf = await lib.getDocument({ data: new Uint8Array(await readAs(file, "readAsArrayBuffer")) }).promise;
    const out = [];
    for (let p = 1; p <= Math.min(4, pdf.numPages); p++) {
      const page = await pdf.getPage(p), vp = page.getViewport({ scale: 1 });
      const label = pdf.numPages > 1 ? `${name} p${p}` : name;
      let done = false;
      try { // vector first
        const ops = await page.getOperatorList();
        const hasImage = ops.fnArray.some((f) => f === lib.OPS.paintImageXObject || f === lib.OPS.paintInlineImageXObject || f === lib.OPS.paintImageMaskXObject);
        const hasText = ops.fnArray.some((f) => f === lib.OPS.showText || f === lib.OPS.showSpacedText);
        if (!hasImage && !hasText && lib.SVGGraphics) {
          const gfx = new lib.SVGGraphics(page.commonObjs, page.objs);
          gfx.embedFonts = true;
          const el = await gfx.getSVG(ops, vp);
          const it = svgItem(new XMLSerializer().serializeToString(el).replace(/svg:/g, "").replace(/xmlns:svg=/g, "xmlns="), label, startW);
          it.source = "pdf-vector";
          out.push(it); done = true;
        }
      } catch { /* fall through to raster */ }
      if (!done) { // raster at 600 dpi of the page size (photos, live text, anything the vector path cannot carry safely)
        const scale = Math.min(600 / 72, 6000 / Math.max(vp.width, vp.height));
        const v2 = page.getViewport({ scale }), cv = document.createElement("canvas");
        cv.width = Math.round(v2.width); cv.height = Math.round(v2.height);
        await page.render({ canvasContext: cv.getContext("2d"), viewport: v2, background: "rgba(0,0,0,0)" }).promise;
        const wMm = Math.floor(Math.min(startW, (vp.width / 72) * 25.4) * 10) / 10;
        out.push({ id: newId(), kind: "raster", name: label, role: "content", x: 0, y: 0, w: wMm, h: Math.round(((wMm * cv.height) / cv.width) * 10) / 10, rot: 0, crop: { l: 0, t: 0, r: 0, b: 0 },
          natW: cv.width, natH: cv.height, href: cv.toDataURL("image/png"), source: "pdf-raster" });
      }
    }
    return out;
  }
  if (/^image\/(png|jpe?g|webp)$/.test(type) || ["png", "jpg", "jpeg", "webp"].includes(ext)) {
    const href = await readAs(file, "readAsDataURL"), img = await loadImg(href);
    const w = Math.floor(Math.min(startW, (img.naturalWidth / 300) * 25.4) * 10) / 10; // start no bigger than its 300 dpi size
    return [{ id: newId(), kind: "raster", name, role: "content", x: 0, y: 0, w, h: Math.round(((w * img.naturalHeight) / img.naturalWidth) * 10) / 10, rot: 0, crop: { l: 0, t: 0, r: 0, b: 0 },
      natW: img.naturalWidth, natH: img.naturalHeight, href }];
  }
  throw new Error("Use a PDF, AI (PDF-compatible), SVG, PNG or JPG file.");
}

// ---------------------------------------------------------------- text (always turned into outlines: print files carry no fonts)
export const FONTS = [
  { id: "inter-bold", label: "Inter Bold", url: "/vendor/fonts/Inter-Bold.ttf" },
  { id: "inter", label: "Inter Regular", url: "/vendor/fonts/Inter-Regular.ttf" },
  { id: "jakarta-xbold", label: "Plus Jakarta Sans ExtraBold", url: "/vendor/fonts/PlusJakartaSans-ExtraBold.ttf" },
  { id: "jakarta-semi", label: "Plus Jakarta Sans SemiBold", url: "/vendor/fonts/PlusJakartaSans-SemiBold.ttf" },
  { id: "dejavu-bold", label: "DejaVu Sans Bold", url: "/vendor/fonts/DejaVuSans-Bold.ttf" },
  { id: "dejavu", label: "DejaVu Sans", url: "/vendor/fonts/DejaVuSans.ttf" },
  { id: "liberation-bold", label: "Liberation Sans Bold (Arial metrics)", url: "/vendor/fonts/LiberationSans-Bold.ttf" },
];
let otPromise = null;
const fontCache = new Map();
function opentypeLib() {
  if (!otPromise) otPromise = new Promise((res, rej) => {
    if (window.opentype) return res(window.opentype);
    const sc = document.createElement("script");
    sc.src = "/vendor/opentype/opentype.min.js";
    sc.onload = () => res(window.opentype); sc.onerror = () => rej(new Error("Could not load the font reader"));
    document.head.appendChild(sc);
  });
  return otPromise;
}
/** a customer's own font file (TTF / OTF) -> font id usable in text items for this session */
export async function addCustomFont(file) {
  const ot = await opentypeLib(), font = ot.parse(await readAs(file, "readAsArrayBuffer"));
  const id = `custom:${file.name}`;
  fontCache.set(id, Promise.resolve(font));
  if (!FONTS.some((f) => f.id === id)) FONTS.push({ id, label: `${file.name.replace(/\.[^.]+$/, "")} (uploaded)` });
  return id;
}
async function fontFor(id) {
  if (!fontCache.has(id)) {
    const def = FONTS.find((f) => f.id === id) || FONTS[0];
    if (!def.url) throw new Error("That uploaded font is not loaded in this session. Upload it again, or pick another font.");
    fontCache.set(id, opentypeLib().then(async (ot) => ot.parse(await (await fetch(def.url)).arrayBuffer())));
  }
  return fontCache.get(id);
}
/** text -> outlined SVG markup + size (units = 100 per em) */
async function textSvg({ content, fontId, colour = "#000000", align = "center" }) {
  const font = await fontFor(fontId), lines = String(content || " ").split("\n"), SZ = 100, LEAD = 118;
  const widths = lines.map((l) => font.getAdvanceWidth(l || " ", SZ)), maxW = Math.max(...widths, 1);
  let d = "", x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  lines.forEach((l, k) => {
    const ox = align === "left" ? 0 : align === "right" ? maxW - widths[k] : (maxW - widths[k]) / 2;
    const path = font.getPath(l, ox, k * LEAD, SZ), bb = path.getBoundingBox();
    d += path.toPathData(2);
    if (l.trim()) { x0 = Math.min(x0, bb.x1); y0 = Math.min(y0, bb.y1); x1 = Math.max(x1, bb.x2); y1 = Math.max(y1, bb.y2); }
  });
  if (!isFinite(x0)) { x0 = 0; y0 = -70; x1 = 50; y1 = 0; }
  const w = +(x1 - x0).toFixed(2), h = +(y1 - y0).toFixed(2);
  return { text: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0.toFixed(2)} ${y0.toFixed(2)} ${w} ${h}" width="${w}" height="${h}"><path d="${d}" fill="${colour}"/></svg>`, w, h };
}
/** new text item, capital height about capMm */
export async function textItem({ content = "Your text", fontId = FONTS[0].id, colour = "#000000", align = "center" } = {}, mmPerUnit = 0.12) {
  const t = await textSvg({ content, fontId, colour, align });
  return { id: newId(), kind: "svg", name: content.split("\n")[0].slice(0, 24) || "Text", role: "content", x: 0, y: 0, w: Math.round(t.w * mmPerUnit * 10) / 10, h: Math.round(t.h * mmPerUnit * 10) / 10, rot: 0,
    crop: { l: 0, t: 0, r: 0, b: 0 }, natW: t.w, natH: t.h, svgText: t.text, colours: [{ from: colour, to: colour, name: "" }], href: svgUrl(t.text), source: "text", text: { content, fontId, align } };
}
/** re-set a text item's wording / font, keeping its letter size, colour and place */
export async function retext(it, patch) {
  const text = { ...it.text, ...patch }, colour = it.colours?.[0]?.to || "#000000", k = it.w / it.natW;
  const t = await textSvg({ ...text, colour });
  return { ...it, text, name: text.content.split("\n")[0].slice(0, 24) || "Text", natW: t.w, natH: t.h, w: Math.round(t.w * k * 10) / 10, h: Math.round(t.h * k * 10) / 10,
    svgText: t.text, colours: [{ from: colour, to: colour, name: it.colours?.[0]?.name || "" }], href: svgUrl(t.text) };
}

// ---------------------------------------------------------------- shapes + pen (drawn here, always vector)
// A shape item is an SVG item whose markup is rebuilt from `shape` whenever its size or settings change, in real
// millimetres (viewBox = the item's size), so a 0.7 mm line stays 0.7 mm however the box is stretched.
//   shape = { type: "rect" | "ellipse" | "line" | "triangle" | "star" | "path", filled, strokeMm, radius, pts, closed, smooth }
// pts (pen paths) are fractions of the box, so the outline follows the box when it is resized.
export const SHAPES = [["rect", "Rectangle"], ["ellipse", "Ellipse"], ["line", "Line"], ["triangle", "Triangle"], ["star", "Star"]];
const n2 = (v) => +(+v).toFixed(3);
function smoothPath(P, closed) { // Catmull-Rom through the points -> cubic beziers
  const n = P.length, at = (i) => (closed ? P[(i + n) % n] : P[Math.max(0, Math.min(n - 1, i))]);
  let d = `M${n2(P[0][0])} ${n2(P[0][1])}`;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    d += `C${n2(p1[0] + (p2[0] - p0[0]) / 6)} ${n2(p1[1] + (p2[1] - p0[1]) / 6)} ${n2(p2[0] - (p3[0] - p1[0]) / 6)} ${n2(p2[1] - (p3[1] - p1[1]) / 6)} ${n2(p2[0])} ${n2(p2[1])}`;
  }
  return d + (closed ? "Z" : "");
}
function shapeMarkup(shape, w, h, fill, stroke) {
  const sw = Math.max(0, +shape.strokeMm || 0), hs = sw / 2, f = shape.filled === false ? "none" : fill, st = sw > 0 ? ` stroke="${stroke}" stroke-width="${n2(sw)}" stroke-linejoin="round" stroke-linecap="round"` : "";
  let body;
  if (shape.type === "ellipse") body = `<ellipse cx="${n2(w / 2)}" cy="${n2(h / 2)}" rx="${n2(Math.max(0.05, w / 2 - hs))}" ry="${n2(Math.max(0.05, h / 2 - hs))}" fill="${f}"${st}/>`;
  else if (shape.type === "line") body = `<rect x="0" y="0" width="${n2(w)}" height="${n2(h)}" fill="${fill}"/>`; // a line is a thin solid bar: its height is its weight
  else if (shape.type === "triangle") body = `<polygon points="${n2(w / 2)},${n2(hs)} ${n2(w - hs)},${n2(h - hs)} ${n2(hs)},${n2(h - hs)}" fill="${f}"${st}/>`;
  else if (shape.type === "star") {
    const pts = []; for (let k = 0; k < 10; k++) { const r = k % 2 ? 0.2 : 0.5, a = -Math.PI / 2 + (k * Math.PI) / 5; pts.push(`${n2(w / 2 + (w - sw) * r * Math.cos(a))},${n2(h / 2 + (h - sw) * r * Math.sin(a) * 1.05 + h * 0.025)}`); }
    body = `<polygon points="${pts.join(" ")}" fill="${f}"${st}/>`;
  } else if (shape.type === "path") {
    const P = shape.pts.map(([fx, fy]) => [hs + fx * (w - sw), hs + fy * (h - sw)]);
    const d = shape.smooth && P.length > 2 ? smoothPath(P, shape.closed) : `M${P.map((q) => `${n2(q[0])} ${n2(q[1])}`).join("L")}${shape.closed ? "Z" : ""}`;
    body = `<path d="${d}" fill="${shape.closed ? f : "none"}"${st}/>`;
  } else body = `<rect x="${n2(hs)}" y="${n2(hs)}" width="${n2(Math.max(0.05, w - sw))}" height="${n2(Math.max(0.05, h - sw))}" rx="${n2(Math.min(+shape.radius || 0, (w - sw) / 2, (h - sw) / 2))}" fill="${f}"${st}/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n2(w)} ${n2(h)}" width="${n2(w)}" height="${n2(h)}">${body}</svg>`;
}
/** (re)build a shape item's markup from its settings, size and current colours */
export function reshape(it, patch = {}) {
  const shape = { ...it.shape, ...(patch.shape || {}) };
  const w = Math.max(0.3, +(patch.w ?? it.w)), h = Math.max(0.3, +(patch.h ?? it.h));
  const old = it.colours || [], fill = patch.fill || old[0]?.to || "#1d1d1b", stroke = patch.stroke || old[1]?.to || old[0]?.to || "#1d1d1b";
  const text = shapeMarkup(shape, w, h, fill, stroke), found = svgColours(text);
  const names = new Map(old.map((c) => [c.to.toLowerCase(), c.name]));
  return { ...it, shape, w: Math.round(w * 10) / 10, h: Math.round(h * 10) / 10, natW: w, natH: h, svgText: text, svgSource: undefined, hidden: undefined,
    colours: found.map((c) => ({ from: c, to: c, name: names.get(c.toLowerCase()) || "" })), href: svgUrl(text) };
}
export function shapeItem(type, { w = 40, h = 25 } = {}) {
  const size = type === "line" ? { w: 60, h: 0.7 } : type === "ellipse" || type === "star" ? { w: 30, h: 30 } : type === "triangle" ? { w: 34, h: 30 } : { w, h };
  const label = (SHAPES.find((s) => s[0] === type) || [0, "Shape"])[1];
  return reshape({ id: newId(), kind: "svg", name: label, role: "content", x: 0, y: 0, rot: 0, crop: { l: 0, t: 0, r: 0, b: 0 }, source: "shape", colours: [],
    shape: { type, filled: true, strokeMm: 0, radius: 0 }, ...size });
}
/** pen: points in die mm -> an item sitting exactly where it was drawn */
export function penItem(points, closed) {
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]), sw = closed ? 0 : 0.7;
  const x0 = Math.min(...xs), y0 = Math.min(...ys), bw = Math.max(0.01, Math.max(...xs) - x0), bh = Math.max(0.01, Math.max(...ys) - y0);
  const it = { id: newId(), kind: "svg", name: closed ? "Drawn shape" : "Drawn line", role: "content", x: x0 + bw / 2, y: y0 + bh / 2, rot: 0, crop: { l: 0, t: 0, r: 0, b: 0 }, source: "shape", colours: [],
    shape: { type: "path", pts: points.map(([x, y]) => [(x - x0) / bw, (y - y0) / bh]), closed, smooth: false, filled: closed, strokeMm: sw } };
  return reshape({ ...it, w: bw + sw, h: bh + sw });
}

// ---------------------------------------------------------------- parts of a vector logo (switch shapes off, e.g. a white box or a tagline)
const SHAPE_SEL = "path, rect, circle, ellipse, polygon, polyline, line";
export function svgParts(it) {
  const root = parseSvgDom(it.svgSource || it.svgText);
  return [...root.querySelectorAll(SHAPE_SEL)].filter((n) => !n.closest("defs, clipPath, mask")).map((n, k) => {
    let fill = null; for (let e = n; e && e.nodeType === 1 && !fill; e = e.parentNode) fill = e.getAttribute("fill") || (/(?:^|;)\s*fill\s*:\s*([^;]+)/.exec(e.getAttribute("style") || "") || [])[1] || null;
    return { k, tag: n.tagName.replace(/^.*:/, ""), fill: fill || "#000000" };
  });
}
/** hide the shapes whose indexes are in `hidden` -> item with new markup + colour list */
export function hideParts(it, hidden) {
  const source = it.svgSource || it.svgText, root = parseSvgDom(source);
  const nodes = [...root.querySelectorAll(SHAPE_SEL)].filter((n) => !n.closest("defs, clipPath, mask"));
  for (const k of hidden) nodes[k]?.remove();
  const text = new XMLSerializer().serializeToString(root), cols = svgColours(text);
  const old = new Map((it.colours || []).map((c) => [c.from, c]));
  return refreshSvg({ ...it, svgSource: source, hidden: [...hidden], svgText: text, colours: cols.map((c) => old.get(c) || { from: c, to: c, name: "" }) });
}

// ---------------------------------------------------------------- save / open
const RASTER_KEEP = 700_000; // characters of base64 (about 500 KB of image): bigger pixels are not stored in the database
/** items -> what is saved: vectors in full (they are text), small rasters in full, big rasters as a placeholder */
export function packArtwork(items) {
  return items.map((it) => {
    if (it.kind === "svg") { const { href, ...rest } = it; return rest; }
    if (it.kind === "raster" && (it.href || "").length > RASTER_KEEP) return { ...it, href: null, missing: true };
    return it;
  });
}
export function unpackArtwork(items) {
  return (items || []).map((it) => (it.kind === "svg" ? refreshSvg(it) : it));
}
/** swap the file behind a placed item (a better logo from the customer, or an image the database did not keep) */
export async function replaceFile(it, file) {
  const [n] = await importFile(file, { startW: it.w });
  if (!n) throw new Error("Could not read that file.");
  const w = it.w, h = Math.round(((w * n.natH) / n.natW) * 10) / 10;
  return { ...n, id: it.id, name: it.name, role: it.role, x: it.x, y: it.y, rot: it.rot, w, h, missing: false };
}

/** apply an svg item's colour swaps -> fresh href */
export function refreshSvg(it) { return { ...it, href: svgUrl(recolourSvg(it.svgText, it.colours || [])) }; }

const cache = new Map();
async function imgFor(it, minPx) {
  // SVGs are re-rasterised by the browser at the size they are drawn, so give them a big intrinsic size first
  let src = it.href;
  if (it.kind === "svg") {
    const k = Math.max(1, Math.ceil(minPx / it.natW));
    src = svgUrl(recolourSvg(it.svgText, it.colours || []).replace(/(<svg[^>]*?)\swidth="[^"]*"/, `$1 width="${it.natW * k}"`).replace(/(<svg[^>]*?)\sheight="[^"]*"/, `$1 height="${it.natH * k}"`));
  }
  if (!cache.has(src)) { if (cache.size > 40) cache.clear(); cache.set(src, loadImg(src)); }
  return cache.get(src);
}

/**
 * Paint the artwork. box = [x0, y0, x1, y1] in die mm (normally the blank + bleed); pxPerMm; noInk = rects knocked out;
 * background = CSS colour or null (transparent). Returns a canvas.
 */
export async function paintArtwork(items, { box, pxPerMm, noInk = [], background = null, clipPoly = null }) {
  const [x0, y0, x1, y1] = box, cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.round((x1 - x0) * pxPerMm)); cv.height = Math.max(1, Math.round((y1 - y0) * pxPerMm));
  const g = cv.getContext("2d");
  if (background) { g.fillStyle = background; g.fillRect(0, 0, cv.width, cv.height); }
  g.imageSmoothingQuality = "high";
  if (clipPoly) { g.save(); g.beginPath(); clipPoly.forEach(([x, y], k) => g[k ? "lineTo" : "moveTo"]((x - x0) * pxPerMm, (y - y0) * pxPerMm)); g.closePath(); g.clip(); }
  for (const it of items) {
    g.save();
    g.scale(pxPerMm, pxPerMm); g.translate(-x0, -y0);
    if (it.kind === "flood") { g.fillStyle = it.colour; g.fillRect(x0, y0, x1 - x0, y1 - y0); g.restore(); continue; }
    if (it.missing || !it.href) { g.restore(); continue; }
    const img = await imgFor(it, it.w * pxPerMm), c = it.crop || { l: 0, t: 0, r: 0, b: 0 };
    g.translate(it.x, it.y); g.rotate(((it.rot || 0) * Math.PI) / 180);
    const sw = img.naturalWidth * (1 - c.l - c.r), sh = img.naturalHeight * (1 - c.t - c.b);
    g.drawImage(img, img.naturalWidth * c.l, img.naturalHeight * c.t, sw, sh, -it.w / 2, -it.h / 2, it.w, it.h);
    g.restore();
  }
  if (clipPoly) g.restore();
  // glue areas: no ink, ever
  g.save(); g.scale(pxPerMm, pxPerMm); g.translate(-x0, -y0);
  for (const [a, b, c, d] of noInk) { if (background) { g.fillStyle = background; g.fillRect(a, b, c - a, d - b); } else g.clearRect(a, b, c - a, d - b); }
  g.restore();
  return cv;
}

/** one item, cropped, on its own transparent canvas: native pixels for rasters, `dpi` at placed size for vectors */
export async function rasteriseItem(it, dpi) {
  const c = it.crop || { l: 0, t: 0, r: 0, b: 0 };
  const wantW = it.kind === "svg" ? (it.w / 25.4) * (dpi || 600) : it.natW * (1 - c.l - c.r);
  const k = Math.min(1, 6000 / Math.max(wantW, (wantW * it.h) / it.w));
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.round(wantW * k)); cv.height = Math.max(1, Math.round(((wantW * it.h) / it.w) * k));
  const img = await imgFor(it, cv.width / (1 - c.l - c.r));
  const sw = img.naturalWidth * (1 - c.l - c.r), sh = img.naturalHeight * (1 - c.t - c.b);
  cv.getContext("2d").drawImage(img, img.naturalWidth * c.l, img.naturalHeight * c.t, sw, sh, 0, 0, cv.width, cv.height);
  return cv;
}

/** canvas -> { jpegHex, widthPx, heightPx } for the PDF underlay */
export async function canvasToJpegHex(cv, quality = 0.92) {
  const blob = await new Promise((r) => cv.toBlob(r, "image/jpeg", quality));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const H = "0123456789abcdef"; let hex = "";
  const parts = [];
  for (let i = 0; i < bytes.length; i++) { hex += H[bytes[i] >> 4] + H[bytes[i] & 15]; if (hex.length > 65536) { parts.push(hex); hex = ""; } }
  parts.push(hex);
  return { jpegHex: parts.join(""), widthPx: cv.width, heightPx: cv.height };
}
export { BLEED };
