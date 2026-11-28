// DRAWER BOX (matchbox style): printed SLEEVE + no-glue lock TRAY + cup INSERT. Three dies from one size.
// Reference = the Zepto condiment box production die (CorelDRAW "Condiment Box_ver14", 26-Mar-2024; sleeve 4-up, tray 4-up,
// insert 10-up). Every figure below was measured off that file; at the reference size the three dies reproduce it line for
// line (scripts/check-drawerbox.mjs). The size the engine takes is the TRAY INSIDE: L (along the slide) x W x H.
//
//   TRAY    base W x L. Side walls H on the long sides. End walls H with a fold-over (H - 0.5) that turns back inside and
//           drops its 24 x 2 mm tab into a slot cut 2 mm into the base. Each side-wall end carries a 30 mm dust flap that
//           turns the corner and is trapped under the fold-over. No glue.
//   SLEEVE  open both ends (or closed at one end, see below). side (H + 1.4) | top (W + 2) | side (H + 2) | bottom (W + 2) | glue 17.5, ends slanted 15 deg.
//           Length L + 2 = flush with the tray.
//   INSERT  platform (W - 1.9) x (L - 2.6) on four legs (H - 7) folded down; three cup holes: crease ring Dia 60, cut
//           Dia 40.8, 24 radial slits between them, centres 32.38 mm in from each end.
// Locking features (tab, slot, dust flap, glue flap, hole) are ABSOLUTE - they never scale with the box.
import { PT_PER_MM } from "./cakebox.js";
import { SNAP_BOTTOM } from "./cupholderbox.js";

export const DRAWER_REF = { L: 202.6, W: 71.3, H: 42 }; // tray inside, mm (Zepto condiment box)
const TAB = 2, TAB_TIP = 24, TAB_ROOT = 25, SLOT_IN = 2, SLOT_ROOT = 26, FOLD_SHORT = 0.5;
const DUST = 30, DUST_INSET = 2, DUST_RELIEF = 3, DUST_SLANT_X = 20, DUST_SLANT_Y = 15;
const SLV = { side1: 1.4, face: 2.0, side2: 2.0, len: 2.0, glue: 17.5 }, SLANT = Math.tan((15 * Math.PI) / 180);
const INS = { dw: 1.9, dl: 2.6, legShort: 7, taper: 4, ring: 60, cut: 40.8, slitTo: 29.95, slits: 24, endToCentre: 32.38 };

const S = PT_PER_MM;
const num = (v, units) => (units === "in" ? +v * 25.4 : +v);
const bad = (msg) => ({ segments: [], blank: null, warnings: [msg], valid: false });
function finish(segs, W, H, style, frame, dims, warnings) {
  return {
    segments: segs.map((s) => ({ ...s, pts: s.pts.map(([x, y]) => [x * S, y * S]) })),
    blank: { widthPt: W * S, heightPt: H * S, flapDepthPt: null, style, frame },
    dims: dims.map((d) => ({ x1: d[0] * S, y1: d[1] * S, x2: d[2] * S, y2: d[3] * S, valuePt: d[4] * S, label: d[5], rotated: !!d[6] })),
    warnings, valid: true,
  };
}
const read = ({ L, W, H, units = "mm" }) => ({ L: num(L, units), W: num(W, units), H: num(H, units) });

// ---------------------------------------------------------------- TRAY
export function buildDrawerTrayDieline(p) {
  const { L, W, H } = read(p);
  if (!(L > 0) || !(W > 0) || !(H > 0)) return bad("All dimensions must be positive.");
  if (W < 2 * DUST + 2) return bad(`Tray width ${W} mm: the two ${DUST} mm dust flaps would cross behind the end wall. Needs ${2 * DUST + 2} mm or more.`);
  if (H < DUST_SLANT_X + DUST_INSET + 5) return bad(`Wall height ${H} mm is too low for the dust flap of this die (needs ${DUST_SLANT_X + DUST_INSET + 5} mm or more).`);
  const warnings = [];
  const X1 = H, X2 = H + W, X3 = 2 * H + W, cx = (X1 + X2) / 2;
  const Y1 = TAB + H - FOLD_SHORT, Y2 = Y1 + H, Y3 = Y2 + L, Y4 = Y3 + H, Y5 = Y4 + H - FOLD_SHORT, Y6 = Y5 + TAB;
  const segs = [], line = (layer, x1, y1, x2, y2) => segs.push({ layer, kind: "l", pts: [[x1, y1], [x2, y2]] });
  for (const m of [(y) => y, (y) => Y6 - y]) { // top end, then the same mirrored for the bottom end
    const l = (layer, x1, y1, x2, y2) => line(layer, x1, m(y1), x2, m(y2));
    // lock tab on the fold-over's free edge
    l("cut", X1, TAB, cx - TAB_ROOT / 2, TAB); l("cut", cx - TAB_ROOT / 2, TAB, cx - TAB_TIP / 2, 0); l("cut", cx - TAB_TIP / 2, 0, cx + TAB_TIP / 2, 0);
    l("cut", cx + TAB_TIP / 2, 0, cx + TAB_ROOT / 2, TAB); l("cut", cx + TAB_ROOT / 2, TAB, X2, TAB);
    // fold-over + end wall: free sides, one crease between them
    for (const x of [X1, X2]) { l("cut", x, TAB, x, Y1); l("cut", x, Y1, x, Y2); }
    l("crease", X1, Y1, X2, Y1);
    // base crease, broken by the slot the tab drops into
    l("crease", X1, Y2, cx - SLOT_ROOT / 2, Y2); l("crease", cx + SLOT_ROOT / 2, Y2, X2, Y2);
    l("cut", cx - SLOT_ROOT / 2, Y2, cx - TAB_TIP / 2, Y2 + SLOT_IN); l("cut", cx - TAB_TIP / 2, Y2 + SLOT_IN, cx + TAB_TIP / 2, Y2 + SLOT_IN); l("cut", cx + TAB_TIP / 2, Y2 + SLOT_IN, cx + SLOT_ROOT / 2, Y2);
    // dust flaps on the side-wall ends (they turn the corner and sit behind the end wall, under the fold-over)
    for (const [x0, d] of [[0, 1], [X3, -1]]) {
      const xw = x0 === 0 ? X1 : X2; // the wall's fold with the base
      l("crease", x0, Y2, xw, Y2);
      l("cut", x0, Y2, x0 + d * DUST_INSET, Y2 - DUST_RELIEF); l("cut", x0 + d * DUST_INSET, Y2 - DUST_RELIEF, x0 + d * DUST_INSET, Y2 - DUST);
      l("cut", x0 + d * DUST_INSET, Y2 - DUST, xw - d * DUST_SLANT_X, Y2 - DUST); l("cut", xw - d * DUST_SLANT_X, Y2 - DUST, xw, Y2 - DUST_SLANT_Y);
    }
  }
  line("crease", X1, Y2, X1, Y3); line("crease", X2, Y2, X2, Y3);
  line("cut", 0, Y2, 0, Y3); line("cut", X3, Y2, X3, Y3);
  const dims = [
    [X1, (Y2 + Y3) / 2, X2, (Y2 + Y3) / 2, W, "base W {v}"],
    [cx + W / 4, Y2, cx + W / 4, Y3, L, "base L {v}", 1],
    [0, Y2 + L / 3, X1, Y2 + L / 3, H, "side wall {v}"],
    [cx - W / 4, Y1, cx - W / 4, Y2, H, "end wall {v}", 1],
    [cx - W / 4, TAB, cx - W / 4, Y1, H - FOLD_SHORT, "fold-over {v}", 1],
    [DUST_INSET + 4, Y2 - DUST, DUST_INSET + 4, Y2, DUST, "dust flap {v}", 1],
    [cx - TAB_TIP / 2, Y2 + SLOT_IN + 5, cx + TAB_TIP / 2, Y2 + SLOT_IN + 5, TAB_TIP, `slot {v}, ${SLOT_IN} mm into the base`],
    [0, Y6 + 6, X3, Y6 + 6, X3, "blank {v}"], [X3 + 6, 0, X3 + 6, Y6, Y6, "blank {v}", 1],
  ];
  return finish(segs, X3, Y6, "drawertray", { part: "tray", L, W, H, X1, X2, X3, Y1, Y2, Y3, Y4, Y5, Y6, cx, dust: DUST }, dims, warnings);
}

// ---------------------------------------------------------------- SLEEVE
// closed = one end shut with the 1-2-3 SNAP LOCK of the single cup holder box (Arjun 28-Nov-2026: "The lock side has to be
// interlock style. Like how we have in the single cup holder box we made"). No glue at the end. The four flaps are that
// die's bottom, laid on the sleeve's four panels: top = tongue flap, bottom = slotted flap, the two sides = hook flaps.
// Scaling keeps the lock a true (stretched) copy of the reference: everything that runs ACROSS the end (along the top /
// bottom panels) scales with their width, everything that runs through its HEIGHT scales with the side panel - so each
// overlap in the folded end is the reference overlap, stretched. The reference itself is 100 x 100 and was traced from a
// print layout, never a production die: the studio says "sample first".
// The open end gets a Dia 20 thumb cut on the top and the bottom panel: with one end shut the tray cannot be pushed out.
const panelOfSnap = (pts) => (pts.every((q) => q[0] <= 140.62) ? 0 : pts.every((q) => q[0] >= 140.6 && q[0] <= 240.62) ? 1 : pts.every((q) => q[0] >= 240.6 && q[0] <= 340.62) ? 2 : 3);
const THUMB_R = 10, SNAP_OF = [3, 0, 1, 2]; // sleeve panel (side | top | side | bottom) -> reference panel (hook | tongue | hook | slotted)
export function drawerClosedEnd({ W, H }) {
  const a = H + SLV.side1, f = W + SLV.face, b = H + SLV.side2, sAcross = f / SNAP_BOTTOM.panel, sHigh = a / SNAP_BOTTOM.panel;
  const hook = SNAP_BOTTOM.hookDepth * sAcross, depth = SNAP_BOTTOM.depth * sHigh;
  return { style: "snap", sAcross, sHigh, opening: [f, b], depth, body: SNAP_BOTTOM.bodyDepth * sHigh, tongue: depth - SNAP_BOTTOM.bodyDepth * sHigh,
    tongueW: SNAP_BOTTOM.tongueW * sAcross, recessW: SNAP_BOTTOM.recessW * sAcross, prongW: SNAP_BOTTOM.prongW * sAcross, hook, hookLap: 2 * hook > f + 0.01, out: Math.max(hook, depth), thumbR: THUMB_R };
}
export function buildDrawerSleeveDieline(p) {
  const { L, W, H } = read(p), closed = !!p.closed;
  if (!(L > 0) || !(W > 0) || !(H > 0)) return bad("All dimensions must be positive.");
  const Ls = L + SLV.len, a = H + SLV.side1, f = W + SLV.face, b = H + SLV.side2, g = SLV.glue, sl = g * SLANT;
  const ys = [0, a, a + f, a + f + b, a + 2 * f + b, a + 2 * f + b + g];
  const segs = [], line = (layer, x1, y1, x2, y2) => segs.push({ layer, kind: "l", pts: [[x1, y1], [x2, y2]] });
  const ce = closed ? drawerClosedEnd({ W, H }) : null;
  if (ce && ce.tongue < 7) return bad(`Wall height ${H} mm is too low for the snap lock: its tongue would be ${ce.tongue.toFixed(1)} mm long (needs 7 mm).`);
  if (ce && ce.prongW < 10) return bad(`Tray width ${W} mm is too narrow for the snap lock: the slotted flap's prongs would be ${ce.prongW.toFixed(1)} mm wide (needs 10 mm).`);
  if (ce && f < 2 * ce.thumbR + 20) return bad(`Tray width ${W} mm is too narrow for the thumb cut of the closed-end sleeve.`);
  line("cut", 0, 0, Ls, 0);
  for (let i = 0; i < 4; i++) {
    const y0 = ys[i], y1 = ys[i + 1], major = i === 1 || i === 3;
    // open end (x = 0): straight, or with the thumb cut on the top and bottom panels of a closed-end sleeve
    if (ce && major) {
      const c = (y0 + y1) / 2, r = ce.thumbR, k = 0.5522847498 * r;
      line("cut", 0, y0, 0, c - r); line("cut", 0, c + r, 0, y1);
      segs.push({ layer: "cut", kind: "c", pts: [[0, c - r], [k, c - r], [r, c - k], [r, c]] }, { layer: "cut", kind: "c", pts: [[r, c], [r, c + k], [k, c + r], [0, c + r]] });
    } else line("cut", 0, y0, 0, y1);
    // far end (x = Ls): open, or a snap-lock flap hinged on a crease
    if (!ce) line("cut", Ls, y0, Ls, y1);
    else {
      line("crease", Ls, y0, Ls, y1);
      const k = SNAP_OF[i], rx = SNAP_BOTTOM.x0 + SNAP_BOTTOM.panel * k, rw = k === 3 ? SNAP_BOTTOM.lastPanel : SNAP_BOTTOM.panel, sd = major ? ce.sHigh : ce.sAcross;
      for (const [layer, kind, ...pts] of SNAP_BOTTOM.segs) {
        if (panelOfSnap(pts) !== k) continue;
        segs.push({ layer, kind: kind === "l" ? "l" : "c", pts: pts.map(([x, y]) => [Ls + (y - SNAP_BOTTOM.yB) * sd, y0 + ((x - rx) / rw) * (y1 - y0)]) });
      }
    }
    line("crease", 0, y1, Ls, y1);
  }
  line("cut", 0, ys[4], sl, ys[5]); line("cut", sl, ys[5], Ls - sl, ys[5]); line("cut", Ls - sl, ys[5], Ls, ys[4]);
  const mid = Ls / 2, BW = Ls + (ce ? ce.out : 0);
  const dims = [
    [0, ys[1] + f / 2, Ls, ys[1] + f / 2, Ls, "length {v}"],
    [mid - 20, 0, mid - 20, ys[1], a, "side {v}", 1], [mid + 20, ys[1], mid + 20, ys[2], f, "top {v}", 1],
    [mid - 20, ys[2], mid - 20, ys[3], b, "side {v}", 1], [mid + 20, ys[3], mid + 20, ys[4], f, "bottom {v}", 1],
    [mid - 20, ys[4], mid - 20, ys[5], g, "glue {v}", 1],
    ...(ce ? [[Ls, ys[3] + f * 0.12, Ls + ce.depth, ys[3] + f * 0.12, ce.depth, "lock flap {v}"], [Ls, ys[2] + b * 0.15, Ls + ce.hook, ys[2] + b * 0.15, ce.hook, "hook flap {v}"],
      [0, (ys[1] + ys[2]) / 2 + ce.thumbR + 4, ce.thumbR, (ys[1] + ys[2]) / 2 + ce.thumbR + 4, ce.thumbR, `thumb cut Dia ${2 * ce.thumbR}`]] : []),
    [BW + 6, 0, BW + 6, ys[5], ys[5], "blank {v}", 1],
  ];
  return finish(segs, BW, ys[5], "drawersleeve", { part: "sleeve", L, W, H, Ls, ys, glue: g, slant: sl, closed: ce }, dims,
    ce ? ["Closed end: the snap lock of the single cup holder box, stretched to this end. Not produced at this size - make one sample before the die is ordered."] : []);
}

// ---------------------------------------------------------------- INSERT (cup platform)
export function buildDrawerInsertDieline(p) {
  const { L, W, H } = read(p), n = Math.max(1, Math.min(4, Math.round(+p.holes || 3)));
  if (!(L > 0) || !(W > 0) || !(H > 0)) return bad("All dimensions must be positive.");
  const PW = W - INS.dw, PL = L - INS.dl, leg = H - INS.legShort, R = INS.ring / 2, r = INS.cut / 2;
  if (leg < 10) return bad(`Wall height ${H} mm leaves legs of only ${leg.toFixed(1)} mm - too low for the cup insert.`);
  const web = (PW - INS.ring) / 2;
  if (web < 3) return bad(`Tray width ${W} mm leaves ${web.toFixed(1)} mm of board beside the Dia ${INS.ring} cup ring; this insert needs 3 mm or more (tray ${(INS.ring + 6 + INS.dw).toFixed(1)} mm wide).`);
  const pitch = n > 1 ? (PL - 2 * INS.endToCentre) / (n - 1) : 0;
  if (n > 1 && pitch < INS.ring + 2) return bad(`Tray length ${L} mm: the ${n} cup rings would be ${(pitch - INS.ring).toFixed(1)} mm apart; this insert needs 2 mm or more (tray ${(2 * INS.endToCentre + (n - 1) * (INS.ring + 2) + INS.dl).toFixed(1)} mm long).`);
  const X1 = leg, X2 = leg + PW, X3 = 2 * leg + PW, Y1 = leg, Y2 = leg + PL, Y3 = 2 * leg + PL, t = INS.taper;
  const segs = [], line = (layer, x1, y1, x2, y2) => segs.push({ layer, kind: "l", pts: [[x1, y1], [x2, y2]] });
  line("crease", X1, Y1, X2, Y1); line("crease", X2, Y1, X2, Y2); line("crease", X2, Y2, X1, Y2); line("crease", X1, Y2, X1, Y1);
  line("cut", X1, Y1, X1 + t, 0); line("cut", X1 + t, 0, X2 - t, 0); line("cut", X2 - t, 0, X2, Y1);          // top leg
  line("cut", X1, Y2, X1 + t, Y3); line("cut", X1 + t, Y3, X2 - t, Y3); line("cut", X2 - t, Y3, X2, Y2);      // bottom leg
  line("cut", X1, Y1, 0, Y1 + t); line("cut", 0, Y1 + t, 0, Y2 - t); line("cut", 0, Y2 - t, X1, Y2);          // left leg
  line("cut", X2, Y1, X3, Y1 + t); line("cut", X3, Y1 + t, X3, Y2 - t); line("cut", X3, Y2 - t, X2, Y2);      // right leg
  const cx = (X1 + X2) / 2, k = 0.5522847498, centres = [];
  const circle = (layer, x, y, rad) => {
    const c = k * rad;
    for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) // four quarter arcs, each from the x axis round to the y axis
      segs.push({ layer, kind: "c", pts: [[x + sx * rad, y], [x + sx * rad, y + sy * c], [x + sx * c, y + sy * rad], [x, y + sy * rad]] });
  };
  for (let i = 0; i < n; i++) {
    const cy = n > 1 ? Y1 + INS.endToCentre + i * pitch : (Y1 + Y2) / 2; centres.push([cx, cy]);
    circle("crease", cx, cy, R); circle("cut", cx, cy, r);
    for (let s = 0; s < INS.slits; s++) { const a = (2 * Math.PI * s) / INS.slits; line("cut", cx + r * Math.cos(a), cy + r * Math.sin(a), cx + INS.slitTo * Math.cos(a), cy + INS.slitTo * Math.sin(a)); }
  }
  const dims = [
    [X1, Y1 + 12, X2, Y1 + 12, PW, "platform {v}"], [X1 + 8, Y1, X1 + 8, Y2, PL, "platform {v}", 1],
    [0, (Y1 + Y2) / 2 + (n % 2 ? pitch / 2 : 0), X1, (Y1 + Y2) / 2 + (n % 2 ? pitch / 2 : 0), leg, "leg {v}"],
    [cx - R, centres[0][1] + R + 3, cx + R, centres[0][1] + R + 3, INS.ring, "ring {v}"],
    [cx - r, centres[0][1], cx + r, centres[0][1], INS.cut, "cut {v}"],
    ...(n > 1 ? [[X2 - 6, centres[0][1], X2 - 6, centres[1][1], pitch, "pitch {v}", 1]] : []),
    [0, Y3 + 6, X3, Y3 + 6, X3, "blank {v}"], [X3 + 6, 0, X3 + 6, Y3, Y3, "blank {v}", 1],
  ];
  return finish(segs, X3, Y3, "drawerinsert", { part: "insert", L, W, H, PW, PL, leg, X1, X2, X3, Y1, Y2, Y3, centres, ring: INS.ring, cut: INS.cut, pitch, web }, dims, []);
}

// How the three parts sit in each other at board caliper t (mm), on the fold model's convention: inside = crease to crease,
// outside = inside + one caliper per wall. All three parts on the same board. Shown on the studio's check list.
export function drawerFit({ L, W, H }, t = 0.4) {
  const r2 = (v) => +v.toFixed(2);
  return {
    sleeveInside: [r2(W + SLV.face), r2(H + SLV.side2), r2(L + SLV.len)],        // across, height, length
    trayOutside: [r2(W + 2 * t), r2(H + t), r2(L + 2 * t)],
    playAcross: r2((SLV.face - 2 * t) / 2),                                        // a side, tray in sleeve
    playHeight: r2(SLV.side2 - t),                                                // tray rim to the sleeve's top panel
    trayInFromEnd: r2((SLV.len - 2 * t) / 2),                                     // how far the tray's end wall sits inside each open end
    trayInFromOpenEnd: r2(SLV.len - 2 * t),                                       // closed-end sleeve: the tray stops against the shut end
    insertPlayAcross: r2((INS.dw - 2 * t) / 2),                                   // a side, platform legs between the side walls
    insertPlayLength: r2((INS.dl - 2 * t - 4 * t) / 2),                           // an end: leg outside face to the fold-over (dust flap + fold-over = 2 calipers)
    platformAbove: r2(H - INS.legShort), cupRing: INS.ring, cupCut: INS.cut,
  };
}
