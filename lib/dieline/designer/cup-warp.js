// BEND VECTOR ARTWORK ONTO THE CUP. On the flat fan a straight logo reads wrong on the formed cup: its baseline must be a
// true arc and its widths constant arc length (artwork cortex 2a). The item keeps its flat definition (x, y = centre on
// the fan, w, h, colours); this returns what is drawn and printed: every path point (u right, v down from the centre, mm)
// goes to radius r = R0 - v and angle a = a0 + u / r about the cone centre. Curves are cut into short pieces first, so
// the bent outline stays within a few hundredths of a millimetre of the exact mapping.
import { recolourSvg } from "./model.js";
import { svgShapes, vectorBlocker } from "./vector-pdf.js";
import { toPolar, fromPolar } from "../cup.js";

const STEP = 1.5; // mm - longest piece after subdivision
const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
function splitCubic(p0, p1, p2, p3, t) {
  const a = lerp(p0, p1, t), b = lerp(p1, p2, t), c = lerp(p2, p3, t), d = lerp(a, b, t), e = lerp(b, c, t), m = lerp(d, e, t);
  return [[p0, a, d, m], [m, e, c, p3]];
}
const cache = new Map();

/** null when the item can be curved, else the reason it cannot */
export function curveBlocker(it, parse) {
  if (it.kind !== "svg") return "Only vector artwork can be curved.";
  const why = vectorBlocker(parse(it.svgText));
  return why ? `This file has ${why}.` : null;
}

/** flat item + cup geometry -> the item as it is drawn / printed (an absolute-position SVG item) */
export function curveItem(it, g, parse) {
  const key = [it.id, it.x, it.y, it.w, it.h, it.flip ? 1 : 0, it.svgText.length, JSON.stringify(it.colours || []), g.id].join("|");
  if (cache.has(key)) return cache.get(key);
  const root = parse(recolourSvg(it.svgText, it.colours || [])), shapes = svgShapes(root);
  const vb = (root.getAttribute ? root.getAttribute("viewBox") : root.attrs.viewBox || `0 0 ${it.natW} ${it.natH}`).split(/[\s,]+/).map(Number);
  const kx = it.w / vb[2], ky = it.h / vb[3], c = toPolar(g, [it.x, it.y]);
  const sg0 = it.flip ? -1 : 1; // flip = set upside down on the arc (the maker's line in a single-wall cup's lip)
  const map = ([x, y]) => { const u = sg0 * ((x - vb[0]) * kx - it.w / 2), v = sg0 * ((y - vb[1]) * ky - it.h / 2), r = c.r - v; return fromPolar(g, r, c.a + u / r); };
  const flatLen = (p, q) => Math.hypot((q[0] - p[0]) * kx, (q[1] - p[1]) * ky);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const paths = shapes.map((sh) => {
    const d = [];
    let cur = [0, 0], start = [0, 0];
    const put = (cmd, pts) => { const m = pts.map(map); for (const p of m) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); } d.push(cmd + m.map((p) => `${p[0].toFixed(3)} ${p[1].toFixed(3)}`).join(" ")); };
    for (const sg of sh.segs) {
      if (sg[0] === "M") { cur = [sg[1], sg[2]]; start = cur; put("M", [cur]); }
      else if (sg[0] === "L" || sg[0] === "Z") {
        const to = sg[0] === "Z" ? start : [sg[1], sg[2]], n = Math.max(1, Math.ceil(flatLen(cur, to) / STEP));
        for (let k = 1; k <= n; k++) put("L", [lerp(cur, to, k / n)]);
        cur = to;
        if (sg[0] === "Z") d.push("Z");
      } else if (sg[0] === "C") {
        let rest = [cur, [sg[1], sg[2]], [sg[3], sg[4]], [sg[5], sg[6]]];
        const n = Math.max(1, Math.ceil((flatLen(rest[0], rest[1]) + flatLen(rest[1], rest[2]) + flatLen(rest[2], rest[3])) / STEP));
        for (let k = n; k >= 1; k--) { const [a, b] = k === 1 ? [rest, null] : splitCubic(...rest, 1 / k); put("C", a.slice(1)); rest = b; }
        cur = [sg[5], sg[6]];
      }
    }
    return { d: d.join(""), sh };
  });
  if (!isFinite(x0)) { cache.set(key, it); return it; }
  const w = +(x1 - x0).toFixed(3), h = +(y1 - y0).toFixed(3), k = (kx + ky) / 2;
  const body = paths.map(({ d, sh }) => `<path d="${d}" fill="${sh.fill || "none"}"${sh.evenodd ? ' fill-rule="evenodd"' : ""}${sh.stroke ? ` stroke="${sh.stroke}" stroke-width="${(sh.sw * k).toFixed(3)}"` : ""}/>`).join("");
  const svgText = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0.toFixed(3)} ${y0.toFixed(3)} ${w} ${h}" width="${w}" height="${h}">${body}</svg>`;
  const out = { ...it, svgText, colours: (it.colours || []).map((cc) => ({ from: cc.to, to: cc.to, name: cc.name })), natW: w, natH: h, x: x0 + w / 2, y: y0 + h / 2, w, h, rot: 0,
    crop: { l: 0, t: 0, r: 0, b: 0 }, href: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`, curve: false, curved: true };
  if (cache.size > 60) cache.clear();
  cache.set(key, out);
  return out;
}
