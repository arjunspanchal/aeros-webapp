// ARTWORK DESIGNER — the maths. Artwork is a list of items placed on the FLAT DIE in millimetres (die frame: x right,
// y down), so a logo at (x, y) prints exactly there and shows exactly there on the folded 3D model.
//   item = { id, kind: "raster" | "svg" | "flood", name, role: "content" | "wrap" | "background",
//            x, y (centre, mm), w, h (placed size, mm), rot (deg), crop: { l, t, r, b } (fractions of the source),
//            natW, natH (source pixels / units), href (what is drawn), svgText, colours: [{ from, to, name }], colour (flood) }
// Roles: content = logo / text, must sit inside the safe zone of one panel; wrap = a band or pattern that may run across
// folds; background = full-bleed ground. Guards are the artwork rules from lib/dieline/rules (kld-artwork-spec.yaml):
// bleed 3 mm; bags 10 mm from the top cut and 5 mm from every fold; boxes 3 mm safe per panel; raster >= 300 dpi at size;
// Pantone <= 4; glue zones never printed.

export const BLEED = 3;
export const SAFE = { bag: { cut: 5, topCut: 10, fold: 5 }, box: { cut: 3, topCut: 3, fold: 3 } };
export const MIN_DPI = 300;

const item = (id, ok, severity, title, detail) => ({ id, ok, severity, title, detail });
let seq = 1;
export const newId = () => `a${Date.now().toString(36)}${seq++}`;

/** corners of a placed item, clockwise from top-left, in die mm */
export function corners(it) {
  const a = ((it.rot || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), hw = it.w / 2, hh = it.h / 2;
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [it.x + x * c - y * s, it.y + x * s + y * c]);
}
export const bboxOf = (pts) => [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];

const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
function segSegDist(p1, p2, q1, q2) {
  const d1 = cross(q1, q2, p1), d2 = cross(q1, q2, p2), d3 = cross(p1, p2, q1), d4 = cross(p1, p2, q2);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  const pd = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-12;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  };
  return Math.min(pd(p1, q1, q2), pd(p2, q1, q2), pd(q1, p1, p2), pd(q2, p1, p2));
}
const inConvex = (p, poly) => { let s = 0; for (let i = 0; i < poly.length; i++) { const c = cross(poly[i], poly[(i + 1) % poly.length], p); if (c !== 0) { if (s && Math.sign(c) !== s) return false; s = Math.sign(c); } } return true; };
/** distance from a placed rectangle to a die edge; 0 when the edge crosses or lies inside the rectangle */
export function rectEdgeDist(cs, e) {
  if (inConvex(e.a, cs) || inConvex(e.b, cs)) return 0;
  let d = Infinity;
  for (let i = 0; i < 4; i++) d = Math.min(d, segSegDist(cs[i], cs[(i + 1) % 4], e.a, e.b));
  return d;
}

/** effective resolution of a raster at its placed size */
export function effectiveDpi(it) {
  if (it.kind !== "raster") return Infinity;
  const c = it.crop || { l: 0, t: 0, r: 0, b: 0 };
  return (it.natW * (1 - c.l - c.r)) / (it.w / 25.4);
}

/** ink colours an item puts down: svg = its (recoloured) fills, flood = its colour, raster = process (CMYK) */
export function itemColours(it) {
  if (it.kind === "flood") return [{ hex: it.colour, name: it.pantone || "" }];
  if (it.kind === "svg") return (it.colours || []).filter((c) => !isWhite(c.to)).map((c) => ({ hex: c.to, name: c.name || "" }));
  return [{ process: true }];
}
const isWhite = (h) => /^#?f{3,6}$/i.test(String(h).trim()) || String(h).toLowerCase() === "white" || String(h).toLowerCase() === "none";

/**
 * Check the artwork. ctx = { edges:[{a,b,layer}] (die, mm), blankBox:[x0,y0,x1,y1], family:"bag"|"box", topCutY,
 * noInk:[[x0,y0,x1,y1]], print:{ process, colours } }
 */
export function checkArtwork(items, ctx) {
  const out = [], S = SAFE[ctx.family] || SAFE.box;
  const cuts = ctx.edges.filter((e) => e.layer === "cut"), folds = ctx.edges.filter((e) => e.layer === "crease");
  const tops = ctx.topCutY == null ? [] : [].concat(ctx.topCutY);
  const isTop = (e) => tops.some((y) => Math.abs(e.a[1] - y) < 0.1 && Math.abs(e.b[1] - y) < 0.1);
  const [bx0, by0, bx1, by1] = ctx.blankBox;
  if (!items.length) return [item("ART-NONE", true, "info", "No artwork placed", "Plain item - nothing to check.")];

  for (const it of items) {
    const tag = it.name || it.kind;
    if (it.kind === "flood") continue; // drawn by the tool with its own 3 mm bleed
    if (it.house === "mark") { // the Aeros mark: hidden in the fold, in one of the job's own inks; none of the logo rules apply
      const inks = new Set(items.filter((o) => o !== it).flatMap(itemColours).filter((c) => !c.process).map((c) => c.hex.toLowerCase())), mine = itemColours(it).map((c) => c.hex.toLowerCase());
      const own = !inks.size || mine.every((c) => inks.has(c)) || (ctx.print?.process === "cmyk" && mine.every((c) => c === "#000000"));
      out.push(item("ART-MARK-INK", own, "block", `"${tag}" prints in one of the job's own inks`, own ? "It adds no colour to the job." : "The Aeros mark may never add a colour. Set it to the darkest ink the artwork already prints (and give it the same Pantone name)."));
      for (const c of ctx.houseGeometry ? ctx.houseGeometry(it) : []) out.push(c);
      continue;
    }
    if (it.missing) { out.push(item("ART-FILE", false, "block", `"${tag}" needs its file again`, "Large images are not kept in saved designs. Select it and press Replace file.")); continue; }
    const cs = corners(it), bb = bboxOf(cs);
    if (ctx.customGeometry) out.push(...ctx.customGeometry(it)); // cups: polar rules about the cone centre
    else if (it.role === "content") {
      let dCut = Infinity, dTop = Infinity, dFold = Infinity;
      for (const e of cuts) { const d = rectEdgeDist(cs, e); if (isTop(e)) dTop = Math.min(dTop, d); else dCut = Math.min(dCut, d); }
      for (const e of folds) dFold = Math.min(dFold, rectEdgeDist(cs, e));
      const inside = bb[0] >= bx0 && bb[2] <= bx1 && bb[1] >= by0 && bb[3] <= by1;
      const okCut = inside && dCut >= S.cut - 0.01 && dTop >= S.topCut - 0.01;
      out.push(item("ART-SAFE-CUT", okCut, "block", `"${tag}" clear of the cut`,
        !inside ? "Hangs off the blank. A logo must sit inside a panel (use Background for full-bleed art)."
          : okCut ? `${Math.min(dCut, dTop).toFixed(1)} mm from the nearest cut (needs ${S.cut}${S.topCut !== S.cut ? `, ${S.topCut} from the top cut` : ""}).`
            : dTop < S.topCut ? `${dTop.toFixed(1)} mm from the top cut - needs ${S.topCut} mm.` : `${dCut.toFixed(1)} mm from a cut - needs ${S.cut} mm.`));
      out.push(item("ART-SAFE-FOLD", dFold >= S.fold - 0.01, "block", `"${tag}" clear of folds`,
        dFold === 0 ? "Sits across a fold. Move it onto one panel, or set its role to Wrap if it is meant to run round the fold."
          : dFold >= S.fold ? `${isFinite(dFold) ? dFold.toFixed(1) : "-"} mm from the nearest fold (needs ${S.fold}).` : `${dFold.toFixed(1)} mm from a fold - needs ${S.fold} mm.`));
    } else {
      // wrap / background: an edge of the art may end ON the board, or must run >= 3 mm past the blank
      const gaps = [["left", bb[0] - bx0], ["top", bb[1] - by0], ["right", bx1 - bb[2]], ["bottom", by1 - bb[3]]];
      const bad = gaps.filter(([, g]) => g < 0 && g > -BLEED + 0.01), covers = gaps.every(([, g]) => g <= -BLEED + 0.01);
      if (it.role === "background") out.push(item("ART-BLEED", covers, "block", `"${tag}" covers the blank with ${BLEED} mm bleed`,
        covers ? "Runs past every edge." : `Short on the ${gaps.filter(([, g]) => g > -BLEED + 0.01).map(([n]) => n).join(", ")} - use "Fit to blank + bleed".`));
      else out.push(item("ART-BLEED", !bad.length, "block", `"${tag}" bleeds ${BLEED} mm where it leaves the board`,
        bad.length ? `Runs off the ${bad.map(([n, g]) => `${n} by only ${(-g).toFixed(1)} mm`).join(", ")} - needs ${BLEED} mm past the cut.` : "OK."));
    }
    // vector or not: a logo should be the customer's vector file. A picture prints soft at the edges, cannot be given a
    // Pantone plate and cannot be recoloured - so it is always called out, even when it is sharp enough to print.
    if (it.kind === "raster" && it.role === "content") out.push(item("ART-VECTOR", false, "warn", `"${tag}" is a picture, not a vector logo`,
      `${it.source === "pdf-raster" ? "This PDF carries photos or live text, so it came in as a picture. " : ""}Ask the customer for the logo as AI / PDF / SVG / CDR with the text outlined. If there is none, "Trace to vector" redraws it (the customer must approve the redraw).`));
    if (it.kind === "svg" && it.embedded) out.push(item("ART-VECTOR", false, "warn", `"${tag}" has ${it.embedded} picture${it.embedded === 1 ? "" : "s"} inside a vector file`,
      "A picture saved inside an AI / PDF / SVG is still a picture. Ask for the real vector logo."));
    if (it.kind === "svg" && it.source === "trace") out.push(item("ART-TRACED", false, "warn", `"${tag}" is a trace of a picture`,
      "Redrawn from a picture by this tool: check it against the customer's original and get their approval before printing."));
    if (it.kind === "raster") {
      const dpi = effectiveDpi(it);
      out.push(item("ART-DPI", dpi >= MIN_DPI, "block", `"${tag}" is sharp enough to print (${MIN_DPI} dpi at size)`,
        dpi >= MIN_DPI ? `${Math.round(dpi)} dpi.` : `${Math.round(dpi)} dpi at ${it.w.toFixed(0)} mm wide. Make it ${((it.natW * (1 - it.crop.l - it.crop.r)) / MIN_DPI * 25.4).toFixed(0)} mm or smaller, or get the vector / a larger file from the customer.`));
    }
  }

  // inks
  const all = items.flatMap(itemColours), spots = [...new Set(all.filter((c) => !c.process).map((c) => c.hex.toLowerCase()))], hasProcess = all.some((c) => c.process);
  const proc = ctx.print?.process || "cmyk";
  if (proc === "plain") out.push(item("ART-INK", false, "block", "Print is set to Plain", "Artwork is placed but the job is Plain. Set Print to Pantone or CMYK."));
  else if (proc === "pantone") {
    out.push(item("ART-INK", !hasProcess, "block", "Pantone job: no photo / raster art", hasProcess ? "A raster image prints in CMYK. Use the vector logo, or set Print to CMYK." : "Vector spot colours only."));
    out.push(item("ART-INK-COUNT", spots.length <= 4, "block", "Pantone colours: 4 at most", `${spots.length} colour${spots.length === 1 ? "" : "s"} in the artwork${spots.length > 4 ? " - a 5th colour moves the job to CMYK." : "."}`));
    const named = new Map(all.filter((c) => !c.process).map((c) => [c.hex.toLowerCase(), ""]));
    for (const c of all) if (!c.process && c.name && c.name.trim()) named.set(c.hex.toLowerCase(), c.name.trim());
    const unnamed = [...named.entries()].filter(([, n]) => !n).map(([h]) => h);
    if (spots.length) out.push(item("ART-INK-NAME", !unnamed.length, "block", "Every colour has its Pantone name", unnamed.length ? `No Pantone name on ${unnamed.join(", ")}. Type it beside the colour (PANTONE … U): the printer makes one plate per name.` : [...named.values()].join(", ")));
    const notU = [...named.values()].filter((n) => n && !/\bU$/i.test(n) && !/\bwhite\b/i.test(n)); // "Opaque White" is not a guide colour
    if (notU.length) out.push(item("ART-INK-GUIDE", false, "warn", "Pantone names from the U (uncoated) guide", `${notU.join(", ")} - we name spots from the U guide on uncoated board (C only for stickers).`));
    const want = +ctx.print.colours || 0;
    if (spots.length && want && spots.length !== want) out.push(item("ART-INK-MATCH", false, "warn", "Colours match the job", `Artwork uses ${spots.length}, the job says ${want}. Change one so the plates match.`));
  } else out.push(item("ART-INK", true, "info", "CMYK job", `${spots.length} flat colour${spots.length === 1 ? "" : "s"}${hasProcess ? " + raster images" : ""} print as process.`));

  if ((ctx.noInk || []).length) out.push(item("ART-GLUE", true, "info", "Glue areas stay unprinted", "The tool knocks all ink out of the glue seam on screen, in 3D and in the print files."));
  return out;
}

/** distinct colours in SVG markup (fills, strokes, stop-colors) */
export function svgColours(svgText) {
  const found = new Map();
  const re = /(fill|stroke|stop-color)\s*[:=]\s*["']?\s*(#[0-9a-fA-F]{3,8}|rgb\([^)]*\)|[a-zA-Z]+)\b/g;
  let m;
  while ((m = re.exec(svgText))) {
    const v = m[2];
    if (/^(none|transparent|currentColor|inherit|url)$/i.test(v)) continue;
    const hex = toHex(v);
    if (hex) found.set(hex, (found.get(hex) || 0) + 1);
  }
  return [...found.keys()];
}
const NAMED = { black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000", blue: "#0000ff", yellow: "#ffff00", gray: "#808080", grey: "#808080", orange: "#ffa500" };
export function toHex(v) {
  v = String(v).trim();
  if (v[0] === "#") { const h = v.slice(1); return ("#" + (h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6))).toLowerCase(); }
  const m = /^rgb\(\s*([\d.]+)%?\s*[, ]\s*([\d.]+)%?\s*[, ]\s*([\d.]+)%?/.exec(v);
  if (m) { const pct = /%/.test(v); return "#" + [1, 2, 3].map((i) => Math.round(pct ? +m[i] * 2.55 : +m[i]).toString(16).padStart(2, "0")).join(""); }
  return NAMED[v.toLowerCase()] || null;
}
/** swap colours in SVG markup: map = [{ from, to }] (hex) */
export function recolourSvg(svgText, map) {
  const lut = new Map(map.filter((c) => c.to && c.to.toLowerCase() !== c.from.toLowerCase()).map((c) => [c.from.toLowerCase(), c.to]));
  if (!lut.size) return svgText;
  return svgText.replace(/(fill|stroke|stop-color)(\s*[:=]\s*["']?\s*)(#[0-9a-fA-F]{3,8}|rgb\([^)]*\)|[a-zA-Z]+)\b/g, (all, k, sep, v) => {
    const hex = toHex(v);
    return hex && lut.has(hex) ? `${k}${sep}${lut.get(hex)}` : all;
  });
}
