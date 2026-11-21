// PET CUPS - the DIRECT-PRINT family (artwork cortex section 10). A moulded cup is not a wrapped blank:
//   - moulded first, printed after by DRY OFFSET; the artwork is a plain RECTANGLE (no fan, no arc, no curve check)
//   - the PRINTER applies the cone distortion; the print wraps a full 360 deg, so the rectangle's left and right edges are
//     the same line on the cup - art may run across it; no glue flap, no seam, NO BLEED
//   - the rectangle = the PRINT BAND: its top is the crease under the brim, its foot is as far down as the press reaches
//   - artwork is centred on the print band (Arjun 22-Oct-2026), logos x 2 at 25 % and 75 % of the width
//   - ONE solid colour only (Arjun 21-Nov-2026: "it can print one colour solids only and no CMYK logos"): one spot ink,
//     solid, no second colour, no CMYK, no tints, no photos
//   - NO FULL BACKGROUND PATCH (Arjun 21-Nov-2026: "PET cups cannot have a full background patch"): logos, text and
//     line work only - no colour ground, nothing that fills the band
//   - NO Aeros mark, logo or watermark is ever printed on a PET cup (Arjun 26-Sep-2026) - direct sale or not
// Figures below are the house job data (KLD Templates / PET Cups / _src and the last real jobs). What the cortex says must
// come from the printer and is still only DERIVED is marked so, and shown as a warning on screen until Arjun gives it.
import { PT_PER_MM } from "./cakebox.js";

export const PET_CUPS = {
  u12: { label: "12 oz (350 mL) U-shape PET cup, 92 mm", shape: "U-shape", td: 92, bd: 48, h: 89, band: [9, 74], pw: 223, safe: 2,
    u: { dAtCurve: 70.4, curveStart: 79, exp: 0.6 },
    source: "66 Chuim job (22-Oct-2026): listing model H 89, print band 9 to 74 mm below the brim = 65 mm (Arjun)",
    open: ["Print rectangle width 223 mm is DERIVED (218 x 92 / 90), not issued by the printer.", "Crease depth and where the U curve starts were read off photos."] },
  u16: { label: "16 oz (425 mL) U-shape PET cup, 92 mm", shape: "U-shape", td: 92, bd: 48, h: 118, band: [22.5, 87.5], pw: 235, safe: 2,
    u: { dAtCurve: 66.3, curveStart: 104, exp: 0.6, bodyD: 83.3, shoulder: 6 },
    source: "Noon job (Oct-2026): cup 92 / 48 / 118, body 83.3 mm under a 6 mm shoulder, print band 22.5 to 87.5 mm below the brim = 65 mm",
    open: ["Print rectangle width 235 mm is as used on the last job - confirm it is the width the printer issued.", "The U curve of the base is modelled (it starts 104 mm below the brim), not measured point by point."] },
  flat16: { label: "16 oz (450 mL) flat-bottom PET cup, 98 mm", shape: "flat bottom", td: 98, bd: 60, h: 120, band: [22, 97], pw: 237, safe: 3,
    profile: [[60, 0], [61.5, 6], [63, 6.6], [65.5, 12], [67, 23.6], [89, 98], [90.5, 98.6], [93, 107], [94.5, 107.6], [97, 118], [97.8, 118.4], [98, 120]],
    source: "Jallo Creamery job v2 (11-Nov-2026): height 120 from the product list, steps 2 / 11 / 9 / 75 print / 6 / 6 from the top (Arjun)",
    open: ["Print rectangle width 237 mm is DERIVED, not issued by the printer.", "The step heights were measured on a 109 mm sample; the lower wall was lengthened to the listed 120 mm."] },
  flat24: { label: "24 oz (750 mL) flat-bottom PET cup, 98 mm", shape: "flat bottom", td: 98, bd: 60, h: 155, band: [31, 131], pw: 237, safe: 3,
    profile: [[60, 0], [61.5, 7], [63.5, 7.6], [67.5, 23], [69, 23.6], [92, 124], [93.5, 124.6], [96, 139], [97.2, 139.6], [98, 155]],
    source: "Jallo Creamery job (Nov-2026): height 155 from the product list, steps 16 / 15 / 100 print / 16 / 7 from the top (Arjun)",
    open: ["Print rectangle width 237 mm is DERIVED, not issued by the printer.", "The step heights were measured on a 154 mm sample; the wall was lengthened 1 mm to the listed 155."] },
  // PP CUPS (Arjun 21-Nov-2026: "Add U shape PP cups 12 and 16 oz") - the same direct-print family; figures from the house
  // product files (studio-rules/toolkit/templates/pp-cups) and the jobs run on them. Two things differ from PET, both seen on
  // real PP jobs: OPAQUE WHITE is the usual ink (Beamer Brands, Leon Grill), and a second spot colour has been run (Bombay
  // Chowk: 2 inks, cut down from 3 at Arjun's word) - so PP allows 2 solid spots, the second with a warning.
  pp12u: { mat: "PP", maxInks: 2, label: "12 oz (350 mL) U-shape PP cup, 85 mm", shape: "U-shape", td: 85, bd: 32, h: 95, band: [10, 82], pw: 206, safe: 3,
    u: { dAtCurve: 60, curveStart: 85, exp: 0.6 },
    source: "Cup measured by Arjun 22-Sep-2026: top 85, height 95, crease 10 mm below the brim, U curve from 85 mm below the brim",
    open: ["Print rectangle width 206 mm is DERIVED, not issued by the printer.", "The foot of the band (82 mm below the brim, 3 mm above the U curve) is DERIVED - the printer says how far down the press reaches.", "Base diameter 32 mm is the modelled U base, not measured."] },
  pp16u: { mat: "PP", maxInks: 2, label: "16 oz (500 mL) U-shape PP cup, 85 mm", shape: "U-shape", td: 85, bd: 32, h: 124, band: [10, 105], pw: 206, safe: 3,
    u: { dAtCurve: 62, curveStart: 108, exp: 0.6 },
    source: "Measured on the Beamer sample 22-Sep-2026: top 85, height 124 (the product list says 134 - wrong), crease 10 mm below the brim; band to 105 mm below the brim, the press runs past the moulded ring at 95 (Arjun)",
    open: ["Print rectangle width 206 mm is DERIVED, not issued by the printer.", "Base diameter 32 mm is the modelled U base, not measured."] },
};
const item = (id, ok, severity, title, detail) => ({ id, ok, severity, title, detail });

export function petGeometry(id) {
  const c = PET_CUPS[id];
  if (!c) return null;
  let profile = c.profile; // [[diameter, height above the base]]
  if (!profile) { // U-shape: straight wall from the brim down to where the curve starts, then the U to the flat base
    const zc = c.h - c.u.curveStart; profile = [];
    for (let k = 0; k <= 24; k++) { const z = (zc * k) / 24; profile.push([+(c.bd + (c.u.dAtCurve - c.bd) * Math.pow(k / 24, c.u.exp)).toFixed(2), +z.toFixed(2)]); }
    if (c.u.bodyD) profile.push([c.u.bodyD, c.h - c.u.shoulder], [c.td - 1, c.h - c.u.shoulder + 1]); // the body runs straight to the shoulder, then steps out to the brim
    profile.push([c.td, c.h]);
  }
  const diaAt = (z) => { for (let i = 1; i < profile.length; i++) if (z <= profile[i][1] + 1e-9) { const [d0, z0] = profile[i - 1], [d1, z1] = profile[i]; return d0 + ((d1 - d0) * (z - z0)) / ((z1 - z0) || 1); } return profile[profile.length - 1][0]; };
  const zTop = c.h - c.band[0], zFoot = c.h - c.band[1];
  return { id, mat: "PET", maxInks: 1, ...c, w: c.pw, bandH: c.band[1] - c.band[0], profile, diaAt, zTop, zFoot, dTop: diaAt(zTop), dFoot: diaAt(zFoot) };
}

/** the "die" of a PET cup = its print rectangle (the print band, flat), in the same shape every engine returns */
export function buildPetDieline(id) {
  const g = petGeometry(id);
  if (!g) return { segments: [], blank: null, warnings: ["Unknown PET cup."], valid: false };
  const S = PT_PER_MM, W = g.w * S, H = g.bandH * S, line = (a, b) => ({ layer: "cut", kind: "l", pts: [a, b] });
  return { valid: true, warnings: [], segments: [line([0, 0], [W, 0]), line([W, 0], [W, H]), line([W, H], [0, H]), line([0, H], [0, 0])],
    blank: { widthPt: W, heightPt: H, style: "pet", pet: id },
    dims: [{ x1: 0, y1: -12, x2: W, y2: -12, valuePt: W, label: "print rectangle {v}", rotated: false }, { x1: W + 14, y1: 0, x2: W + 14, y2: H, valuePt: H, rotated: true }],
    meta: { pet: id, td: g.td, bd: g.bd, h: g.h, band: g.band } };
}

/** placement rules for one item on the print rectangle (used through ctx.customGeometry) */
export function petItemChecks(g, it, corners) {
  const tag = it.name || it.kind, cs = corners(it), ys = cs.map((p) => p[1]), xs = cs.map((p) => p[0]);
  const top = Math.min(...ys), foot = g.bandH - Math.max(...ys), out = [];
  if (it.role !== "content") return [item("ART-PET-GROUND", false, "block", `"${tag}": no background on a ${g.mat} cup`, "A moulded cup cannot carry a full background patch or a wrap-round ground. Set this to Logo / text, or remove it.")];
  if (Math.max(...xs) - Math.min(...xs) >= g.w * 0.9 && Math.max(...ys) - Math.min(...ys) >= g.bandH * 0.9) return [item("ART-PET-GROUND", false, "block", `"${tag}" fills the print band`, "A moulded cup cannot carry a full background patch. Logos, text and line work only.")];
  const ok = top >= g.safe - 0.01 && foot >= g.safe - 0.01;
  out.push(item("ART-PET-BAND", ok, "block", `"${tag}" ${g.safe} mm clear of the top and foot of the print band`, ok ? `${top.toFixed(1)} mm under the crease, ${foot.toFixed(1)} mm above the foot of the band.` : `${Math.min(top, foot).toFixed(1)} mm from the ${top < foot ? "crease at the top" : "foot"} of the band - needs ${g.safe} mm.`));
  const off = Math.min(...xs) < -0.01 || Math.max(...xs) > g.w + 0.01;
  out.push(item("ART-PET-JOIN", !off, "block", `"${tag}" is inside the rectangle`, off ? "It runs off the left or right edge. The two edges are the same line on the cup: art that crosses the join must be split and placed at both ends." : `Its centre is ${((100 * it.x) / g.w).toFixed(0)} % round the cup (the house places logos at 25 % and 75 %).`));
  const mid = Math.abs((top + (g.bandH - foot)) / 2 - g.bandH / 2);
  out.push(item("ART-PET-CENTRE", mid <= 0.5, "warn", `"${tag}" is centred on the print band`, mid <= 0.5 ? "Centred top to bottom." : `${mid.toFixed(1)} mm off the middle of the band. The house rule centres artwork on the print band (use Middle).`));
  return out;
}

/** what the screen says about the cup itself */
export function petInfoChecks(g, print) {
  const circTop = Math.PI * g.dTop, circFoot = Math.PI * g.dFoot;
  return [
    item("PET-CUP", true, "info", "Cup", `${g.label}: top ${g.td} mm, base ${g.bd} mm, height ${g.h} mm, clear ${g.mat}, ${g.shape}. ${g.source}.`),
    item("PET-BAND", true, "info", "Print band", `${g.band[0]} to ${g.band[1]} mm below the brim = ${g.bandH} mm tall. Artwork = a flat rectangle ${g.w} x ${g.bandH} mm; the printer applies the cone distortion and the print wraps 360 deg (the cup is ${circTop.toFixed(0)} mm round at the top of the band, ${circFoot.toFixed(0)} mm at its foot). No bleed, no seam.`),
    item("PET-INK", print.process === "pantone" && +print.colours >= 1 && +print.colours <= g.maxInks, "block", g.maxInks === 1 ? "PET cup: ONE solid colour only" : `${g.mat} cup: solid spot colours only, ${g.maxInks} at most`,
      print.process !== "pantone" ? `Set Print to Pantone. A ${g.mat} cup prints solid spot colours: no CMYK logos, no tints, no photos.`
        : +print.colours >= 1 && +print.colours <= g.maxInks ? `${+print.colours} spot colour${+print.colours === 1 ? "" : "s"}, solid.` : g.maxInks === 1 ? `The job says ${+print.colours || 0} colours. A PET cup prints ONE solid colour only - set the number of Pantone colours to 1.` : `The job says ${+print.colours || 0} colours. ${g.mat} cups have run 1 colour, and 2 once: set it to 1 or 2.`),
    ...(g.maxInks > 1 && +print.colours === 2 ? [item("PP-TWO-INKS", false, "warn", "Two colours on a PP cup", "Most PP jobs print one colour; two has been run once. Confirm with the printer before plates.")] : []),
    ...(g.maxInks > 1 ? [item("PP-WHITE", true, "info", "White ink", 'Opaque white is the usual ink on a clear PP cup: name the colour "Opaque White" and it is written as that plate and shown white on the cup.')] : []),
    item("PET-NO-AEROS", true, "info", `No Aeros mark on a ${g.mat} cup`, "Nothing Aeros is ever printed on a PET or PP cup, direct sale or dealer."),
    ...g.open.map((t, k) => item(`PET-OPEN-${k + 1}`, false, "warn", "To confirm with the printer before plates", t)),
  ];
}
