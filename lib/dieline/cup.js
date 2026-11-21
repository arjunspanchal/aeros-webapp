// PAPER CUPS in the staff tool. A cup die is never drawn by formula here: its cut, fold, bleed and limit lines come
// VERBATIM from the Aeros KLD template (cup-kld-refs.js) - rule zero of the artwork cortex, "the outline is never touched".
// This file adds what the fan needs on top of the flat-die tools: polar geometry about the cone centre, the cup placement
// rules, bending artwork onto the cone, and the numbers for the 3D cup.
// Rules (ARTWORK-CORTEX.md section 2 / 2a): joint keep-clear 8 mm off the LEFT cut; no content within 15 mm of the bottom
// fold (grounds may run through); nothing above the limit line (rim curl); right 7.5 mm = glue seam; a baseline is a
// true arc (a straight line w wide sags w^2 / 8R), an edge is a radial, a width is constant arc length.
import { PT_PER_MM } from "./cakebox.js";
import { CUP_KLD_REFS } from "./cup-kld-refs.js";
import { corners } from "./designer/model.js";

// single wall: content 15 mm above the bottom fold, nothing above the limit line (rim curl).
// double wall (outer wrap): content 4 mm above the hem fold (Arjun 21-Nov-2026) and 5 mm below the top cut (no rim curl
// on the wrap); the wrap's bottom 5 mm is the hem and turns up inside.
export const CUP_RULES = { joint: 8, floor: 15, sagWarn: 0.3, sagBlock: 1.0 };
const WALL_RULES = { single: { floor: 15, top: 0, floorName: "bottom fold" }, double: { floor: 4, top: 5, floorName: "hem fold" } };
const item = (id, ok, severity, title, detail) => ({ id, ok, severity, title, detail });
const deg = (r) => (r * 180) / Math.PI;

/** polar helpers about the cone centre; a = angle from the fan's centre line, + to the right (radians) */
export const toPolar = (g, [x, y]) => ({ r: Math.hypot(x - g.cx, y - g.cy), a: Math.atan2(x - g.cx, g.cy - y) });
export const fromPolar = (g, r, a) => [g.cx + r * Math.sin(a), g.cy - r * Math.cos(a)];

export function cupGeometry(id) {
  const ref = CUP_KLD_REFS[id];
  if (!ref) return null;
  const g = { id, cx: ref.centre[0], cy: ref.centre[1] };
  const P = (q) => toPolar(g, q);
  const cutPts = ref.cut.flatMap((s) => [s[1], s[s.length - 1]]).map(P); // end points only (bezier handles sit off the curve)
  g.rTop = Math.max(...cutPts.map((p) => p.r)); g.rBot = Math.min(...cutPts.map((p) => p.r));
  // long radial cut lines = the left and right edges of the fan
  const radials = ref.cut.filter((s) => s[0] === "l").map((s) => [P(s[1]), P(s[2])]).filter(([p, q]) => Math.abs(p.r - q.r) > 50);
  g.aLeft = Math.min(...radials.map(([p, q]) => (p.a + q.a) / 2)); g.aRight = Math.max(...radials.map(([p, q]) => (p.a + q.a) / 2));
  // folds: the lowest arc = bottom fold (single wall) / hem fold (double wall); a second, upper arc = the rim-curl line
  // (single wall only - a double-wall wrap runs to its top cut). Full-height lines: the one on the right = glue-seam line.
  // (radii within 1 mm are the same arc: an arc is drawn as two halves that can differ in the second decimal)
  const arcR = ref.crease.filter((s) => s[0] === "c").map((s) => (P(s[1]).r + P(s[s.length - 1]).r) / 2).sort((a, b) => a - b).filter((r, i, all) => i === 0 || r - all[i - 1] > 1);
  g.wall = ref.wall || "single";
  g.rules = WALL_RULES[g.wall];
  g.rFold = arcR[0]; g.rRim = arcR.length > 1 ? arcR[arcR.length - 1] : g.rTop; g.hasRim = arcR.length > 1;
  const fullLines = ref.crease.filter((s) => s[0] === "l").map((s) => (P(s[1]).a + P(s[2]).a) / 2);
  g.aSeam = fullLines.some((a) => a > 0) ? Math.max(...fullLines) : g.aRight;
  const lim = ref.limit.map(P), bl = ref.bleed.map(P);
  g.limit = { rMin: Math.min(...lim.map((p) => p.r)), rMax: Math.max(...lim.map((p) => p.r)), aMin: Math.min(...lim.map((p) => p.a)), aMax: Math.max(...lim.map((p) => p.a)), poly: ref.limit };
  g.bleed = { rMin: Math.min(...bl.map((p) => p.r)), rMax: Math.max(...bl.map((p) => p.r)), poly: ref.bleed };
  // the formed cup: the left edge laps onto the glue strip up to the seam line, so one turn = aLeft .. aSeam
  g.wrap = g.aSeam - g.aLeft;
  g.sinB = g.wrap / (2 * Math.PI); g.cosB = Math.sqrt(1 - g.sinB * g.sinB);
  g.formed = { rimDia: (g.rRim * g.wrap) / Math.PI, baseDia: (g.rFold * g.wrap) / Math.PI, wallHeight: (g.rRim - g.rFold) * g.cosB, taperDeg: deg(Math.asin(g.sinB)) };
  g.spec = { TD: ref.TD, BD: ref.BD, H: ref.H, label: ref.label, kld: ref.kld };
  // content band (radius): above the floor rule, below the limit line and the top rule
  g.floorR = g.rFold + g.rules.floor; g.topR = Math.min(g.limit.rMax, g.rTop - g.rules.top);
  g.w = ref.w; g.h = ref.h;
  return g;
}

/** the die document, in the same shape every engine returns (points, y down) */
export function buildCupDieline(id) {
  const ref = CUP_KLD_REFS[id];
  if (!ref) return { segments: [], blank: null, warnings: ["Unknown cup die."], valid: false };
  const S = PT_PER_MM, seg = (layer) => (s) => ({ layer, kind: s[0], pts: s.slice(1).map(([x, y]) => [x * S, y * S]) });
  const segments = [...ref.cut.map(seg("cut")), ...ref.crease.map(seg("crease"))];
  for (let i = 1; i < ref.limit.length; i++) segments.push({ layer: "safe", kind: "l", pts: [ref.limit[i - 1], ref.limit[i]].map(([x, y]) => [x * S, y * S]) });
  const g = cupGeometry(id);
  return {
    segments, valid: true, warnings: [],
    blank: { widthPt: ref.w * S, heightPt: ref.h * S, style: "cup", cup: id },
    dims: [
      { x1: 0, y1: -12, x2: ref.w * S, y2: -12, valuePt: ref.w * S, label: "fan {v}", rotated: false },
      { x1: (ref.w + 5) * S, y1: 0, x2: (ref.w + 5) * S, y2: ref.h * S, valuePt: ref.h * S, rotated: true },
    ],
    meta: { cup: id, kld: ref.kld, source: ref.source, TD: ref.TD, BD: ref.BD, H: ref.H, slant: +(g.rTop - g.rBot).toFixed(2) },
  };
}

/** corners (and edge mid-points) of a placed item, flat or curved, as polar points */
function probe(g, it) {
  if (it.curve) {
    const c = toPolar(g, [it.x, it.y]), out = [];
    for (const u of [-it.w / 2, 0, it.w / 2]) for (const v of [-it.h / 2, 0, it.h / 2]) { const r = c.r - v; out.push({ r, a: c.a + u / r }); }
    return out;
  }
  const cs = corners(it), pts = [...cs, ...cs.map((p, k) => [(p[0] + cs[(k + 1) % 4][0]) / 2, (p[1] + cs[(k + 1) % 4][1]) / 2])];
  return pts.map((p) => toPolar(g, p));
}

/** cup placement checks for one item (used by checkArtwork through ctx.customGeometry) */
export function cupItemChecks(g, it) {
  const out = [], tag = it.name || it.kind, R = CUP_RULES;
  if (it.role !== "content") return [item("ART-CUP-GROUND", true, "info", `"${tag}" is clipped to the bleed line`, "Grounds and wraps run to the bleed line of the KLD and never onto the rim curl or past the glue seam.")];
  const pts = probe(g, it), c = toPolar(g, [it.x, it.y]);
  const top = Math.max(...pts.map((p) => p.r)), bot = Math.min(...pts.map((p) => p.r));
  const floor = g.floorR, W = g.rules;
  out.push(item("ART-CUP-TOP", top <= g.topR + 0.01, "block", g.hasRim ? `"${tag}" below the rim curl` : `"${tag}" ${W.top} mm below the top of the wrap`,
    top <= g.topR ? `${(g.topR - top).toFixed(1)} mm under the limit.` : g.hasRim ? `${(top - g.topR).toFixed(1)} mm above the limit line - it would roll into the rim.` : `${(g.rTop - top).toFixed(1)} mm from the top cut - needs ${W.top} mm.`));
  out.push(item("ART-CUP-FLOOR", bot >= floor - 0.01, "block", `"${tag}" ${W.floor} mm clear of the ${W.floorName}`, bot >= floor ? `${(bot - g.rFold).toFixed(1)} mm above the fold.` : `${(bot - g.rFold).toFixed(1)} mm above the fold - needs ${W.floor} mm (only grounds may run lower).`));
  const joint = Math.min(...pts.map((p) => (p.a - g.aLeft) * p.r)), seam = Math.min(...pts.map((p) => (g.limit.aMax - p.a) * p.r));
  out.push(item("ART-CUP-JOINT", joint >= R.joint - 0.01, "block", `"${tag}" ${R.joint} mm clear of the joint (left edge)`, joint >= R.joint ? `${joint.toFixed(1)} mm from the left cut.` : `${joint.toFixed(1)} mm from the left cut - the joint line shows there, keep ${R.joint} mm.`));
  out.push(item("ART-CUP-SEAM", seam >= -0.01, "block", `"${tag}" off the glue seam (right edge)`, seam >= 0 ? `${seam.toFixed(1)} mm inside the limit line.` : `${(-seam).toFixed(1)} mm past the limit line, onto the glue seam.`));
  if (!it.curve) {
    const lean = Math.abs((((it.rot || 0) - deg(c.a) + 540) % 360) - 180);
    out.push(item("ART-CUP-UPRIGHT", lean <= 1, "warn", `"${tag}" stands upright on the cup`, lean <= 1 ? "Its upright follows the cup's radial." : `Leans ${lean.toFixed(1)} deg from upright at this spot. Press "Stand upright".`));
    const sag = (it.w * it.w) / (8 * c.r);
    out.push(item("ART-CUP-CURVE", sag < R.sagBlock, sag < R.sagWarn ? "info" : it.kind === "svg" ? "block" : "warn", `"${tag}" follows the cup's curve`,
      sag < R.sagWarn ? `Straight is fine at ${it.w.toFixed(0)} mm wide (${sag.toFixed(2)} mm off the curve).`
        : `A straight ${it.w.toFixed(0)} mm line sits ${sag.toFixed(2)} mm off the cup's curve at its ends.${it.kind === "svg" ? ' Press "Curve to cup".' : " An image cannot be curved here: keep it under about 20 mm wide or use the vector file."}`));
  } else out.push(item("ART-CUP-CURVE", true, "info", `"${tag}" is curved to the cup`, "Baselines are true arcs, widths are constant arc length."));
  return out;
}

/** the wrap on its inner cup: where it sits and how much air is between them (double wall, full-cup view) */
export function cupFitChecks(wrap, inner, caliper = 0.3) {
  const tube = Math.max(0.6, (inner.spec.TD - inner.formed.rimDia) / 4);
  const lift = inner.formed.wallHeight - tube - wrap.formed.wallHeight; // hem fold above the inner cup's bottom fold
  const innerR = (h) => (inner.rFold + h / inner.cosB) * inner.sinB; // inner cup's outside radius at height h
  const gapTop = wrap.formed.rimDia / 2 - innerR(lift + wrap.formed.wallHeight), gapFoot = wrap.formed.baseDia / 2 - innerR(lift);
  return [
    item("3D-CUP-INNER", true, "info", "Inner cup shown", `${inner.spec.label} (${inner.spec.kld}) - ASSUMED to be the inner cup of this double wall: ${wrap.spec.TD === inner.spec.TD && wrap.spec.BD === inner.spec.BD && wrap.spec.H === inner.spec.H ? `both KLDs give TD ${inner.spec.TD} / BD ${inner.spec.BD} / H ${inner.spec.H}` : `it is the nearest single-wall KLD (TD ${inner.spec.TD} / BD ${inner.spec.BD} / H ${inner.spec.H}); the wrap's own KLD says TD ${wrap.spec.TD} / BD ${wrap.spec.BD} / H ${wrap.spec.H}`}. Its rim, base and bottom strip are derived as on the single-wall model.`),
    item("3D-CUP-FIT", gapTop > -0.3 && gapFoot > 0, "warn", "The wrap fits round the inner cup",
      `Wrap top tucked ${tube.toFixed(1)} mm under the rim line: ${lift.toFixed(1)} mm of the inner cup shows below the hem. Air gap ${gapTop.toFixed(2)} mm at the top, ${gapFoot.toFixed(2)} mm at the hem (board ${caliper} mm not deducted).`),
  ];
}

/** numbers the 3D cup and the checks panel show */
export function cupFormedChecks(g) {
  const f = g.formed, s = g.spec, skirt = (g.rFold - g.rBot) * g.cosB;
  if (g.wall === "double") return [
    item("3D-CUP-MODEL", true, "info", "What this model is", `The OUTER WRAP only, exact from the KLD: ${f.rimDia.toFixed(1)} mm across at its top, ${f.baseDia.toFixed(1)} mm at the hem fold, ${f.wallHeight.toFixed(1)} mm tall (taper ${f.taperDeg.toFixed(2)} deg). Wall thickness = the board caliper; the ${skirt.toFixed(1)} mm hem is turned up inside. The inner cup (TD ${s.TD} / BD ${s.BD} / H ${s.H}) is not modelled.`),
  ];
  const tube = Math.max(0.6, (s.TD - f.rimDia) / 4);
  return [
    item("3D-CUP-MODEL", true, "info", "What this model is", `Exact from the KLD: the wall from the bottom fold to the rim line (diameters, height, taper). Derived: wall thickness = the board caliper; the ${skirt.toFixed(1)} mm bottom strip turned up inside with the base disc on it; the rolled rim as a ${(2 * tube).toFixed(1)} mm tube, sized so the finished rim is TD ${s.TD}. Model height ${(f.wallHeight + tube).toFixed(1)} mm against the KLD's H ${s.H} mm.`),
    item("3D-CUP-BASE", Math.abs(f.baseDia - s.BD) <= 1.5, "warn", "Base diameter from the fan = the cup spec", `Fan gives ${f.baseDia.toFixed(1)} mm at the bottom fold; spec BD ${s.BD} mm.`),
    item("3D-CUP-RIM", true, "info", "Rim", `Body ${f.rimDia.toFixed(1)} mm at the rim-curl line; the finished rolled rim is TD ${s.TD} mm.`),
    item("3D-CUP-HEIGHT", true, "info", "Height", `Wall ${f.wallHeight.toFixed(1)} mm between the bottom fold and the rim line (taper ${f.taperDeg.toFixed(2)} deg); finished cup H ${s.H} mm.`),
  ];
}
