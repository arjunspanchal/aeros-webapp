// AEROS HOUSE MARKS - never redrawn, never retyped. Everything here is assembled from public/house/bag-footers.json, which
// scripts/extract-house-marks.py lifts from the house files (Aeros Artworks / KLD Templates / Paper Bags / SOS / footer,
// made by _tools/sos_footer.py). Rule (artwork cortex 2c, Arjun 24-Sep-2026): the CHANNEL decides IF a mark goes on -
// sold DIRECT to the end customer = the Aeros mark goes on the pack; sold through a DEALER = no Aeros branding at all.
// A per-job choice, never a default. WHERE: hidden in the folding profile, never over the artwork:
//   bags  = the locked footer block of that SKU, on the front's bottom flap
//   DW cup wrap = one line on a true arc in the white strip of the hem (baseline 1.5 mm above the bottom cut)
//   SW cup = the same line in the fold-in lip under the base, upside down
// INK: the mark never adds a colour - it prints in one of the job's own inks (the darkest).
let cache = null;
export const loadHouse = () => (cache ||= fetch("/house/bag-footers.json").then((r) => { if (!r.ok) throw new Error("Could not load the Aeros house marks."); return r.json(); }));

const INK = "#000000";
const shape = (s) => (s.stroke ? `<path d="${s.d}" fill="none" stroke="${INK}" stroke-width="${s.stroke}"/>` : `<path d="${s.d}" fill="${INK}"${s.rule === "evenodd" ? ' fill-rule="evenodd"' : ""}/>`);

/** the footers on file for a bag size (W x G x H mm, +/- 1 mm) */
export const footersFor = (H, W, G, Ht) => H.skus.filter((s) => Math.abs(s.W - W) <= 1 && Math.abs(s.G - G) <= 1 && Math.abs(s.H - Ht) <= 1);

/** the footer block of one SKU -> { svg, w, h } (mm): shared drawings + that SKU's letters + its QR */
export function footerSvg(H, sku) {
  const s = H.skus.find((q) => q.sku === sku);
  if (!s) return null;
  const letters = s.t.map(([g, ...m]) => `<path d="${H.glyphs[g]}" transform="matrix(${m.join(" ")})" fill="${INK}"/>`).join("");
  let qr = "";
  for (let i = 0; i < s.qr.n; i++) for (let j = 0; j < s.qr.n; j++) if (s.qr.bits[i * s.qr.n + j] === "1") qr += `M${+(s.qr.x + j * s.qr.m).toFixed(3)} ${+(s.qr.y + i * s.qr.m).toFixed(3)}h${s.qr.m}v${s.qr.m}h${-s.qr.m}Z`;
  const [pw, ph] = H.page, k = 25.4 / 72;
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pw} ${ph}" width="${pw}" height="${ph}">${H.base.map(shape).join("")}${letters}<path d="${qr}" fill="${INK}"/></svg>`, w: +(pw * k).toFixed(2), h: +(ph * k).toFixed(2), size: s.size };
}

/** a ready symbol cut from the house footer (recycle mark, food-safe mark, ...) -> { svg, w, h, label } */
export function symbolSvg(H, key) {
  const s = H.symbols.find((q) => q.key === key);
  if (!s) return null;
  const [x0, y0, x1, y1] = s.box, k = 25.4 / 72, w = x1 - x0, h = y1 - y0;
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${+w.toFixed(3)} ${+h.toFixed(3)}" width="${+w.toFixed(3)}" height="${+h.toFixed(3)}">${s.paths.map((i) => shape(H.base[i])).join("")}</svg>`, w: +(w * k).toFixed(2), h: +(h * k).toFixed(2), label: s.label };
}

/** the cup maker's line, as the house generators word it */
export const cupMarkText = (label, wall) => `MADE BY AEROS · ${(label.match(/\((\d+\s*mL)\)/) || [0, ""])[1]} ${wall === "double" ? "DOUBLE WALL" : "SINGLE WALL"} CUP · aeros-x.com`.replace(/\s+/g, " ");
export const MARK_CAP_MM = 0.99; // 2.8 pt line: cap height, as on the house files

/** where the cup line sits: { r (centre of the caps), a, flip } - DW in the hem's white strip, SW upside down in the lip */
export function cupMarkSpot(g) {
  const strip = g.bleed.rMin - g.rBot, a = g.aLeft + g.wrap / 2;
  return g.wall === "double" ? { r: g.rBot + 1.5 + MARK_CAP_MM / 2, a, flip: false, strip } : { r: g.rBot + strip / 2, a, flip: true, strip };
}
