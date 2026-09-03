// 3D fold rigs for the dieline generator — dependency-free.
//
// A rig is a tree of flat rectangular PANELS. Panels attach to an EDGE of
// their parent ("top" | "bottom" | "left" | "right" in the parent's local
// frame); folding rotates the panel about that hinge. fold = +90 always folds
// "up" out of the parent's plane (toward parent +Z), so assembled boxes use
// consistent positive folds. The global slider t (0 = flat blank, 1 = formed
// box) eases each hinge inside its [t0, t1] window.
//
// Rigs are simplified visualisations (main panels + closures, no lock tabs).

const I = { r: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] };
function mul(a, b) {
  const r = new Array(9);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      r[i * 3 + j] = a.r[i * 3] * b.r[j] + a.r[i * 3 + 1] * b.r[3 + j] + a.r[i * 3 + 2] * b.r[6 + j];
  return {
    r,
    t: [
      a.r[0] * b.t[0] + a.r[1] * b.t[1] + a.r[2] * b.t[2] + a.t[0],
      a.r[3] * b.t[0] + a.r[4] * b.t[1] + a.r[5] * b.t[2] + a.t[1],
      a.r[6] * b.t[0] + a.r[7] * b.t[1] + a.r[8] * b.t[2] + a.t[2],
    ],
  };
}
const T = (x, y, z = 0) => ({ r: [...I.r], t: [x, y, z] });
function Rz(deg) {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return { r: [c, -s, 0, s, c, 0, 0, 0, 1], t: [0, 0, 0] };
}
function Rx(deg) {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return { r: [1, 0, 0, 0, c, -s, 0, s, c], t: [0, 0, 0] };
}
function apply(m, [x, y, z = 0]) {
  return [
    m.r[0] * x + m.r[1] * y + m.r[2] * z + m.t[0],
    m.r[3] * x + m.r[4] * y + m.r[5] * z + m.t[1],
    m.r[6] * x + m.r[7] * y + m.r[8] * z + m.t[2],
  ];
}
const ease = (v) => (v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v));

/** World polygons at fold parameter t. */
export function poseRig(panels, t) {
  const world = [];
  const faces = [];
  for (const p of panels) {
    const span = (p.t1 ?? 1) - (p.t0 ?? 0) || 1;
    const ang = (p.fold || 0) * ease((t - (p.t0 ?? 0)) / span);
    const parentM = p.parent >= 0 ? world[p.parent] : I;
    const M = mul(parentM, mul(T(p.origin[0], p.origin[1]), mul(Rz(p.axis), Rx(ang))));
    world.push(M);
    // p.pts overrides the rectangle (4 local points; repeat one for a triangle)
    const local = p.pts || [[0, 0], [p.w, 0], [p.w, p.d], [0, p.d]];
    faces.push({ pts3: local.map((pt) => apply(M, pt)), tone: p.tone ?? 0 });
  }
  return faces;
}

/** Rig builder with edge attachment. */
function rigger() {
  const panels = [];
  const root = (w, d) => {
    panels.push({ parent: -1, origin: [-w / 2, -d / 2], axis: 0, w, d, fold: 0 });
    return 0;
  };
  // attach panel (hinge length = parent edge length, depth = d) to parent edge
  const attach = (parent, edge, d, fold, t0, t1, tone = 0.1, shrink = 0) => {
    const pp = panels[parent];
    let origin, axis, w;
    if (edge === "top") { origin = [shrink, pp.d]; axis = 0; w = pp.w - 2 * shrink; }
    else if (edge === "bottom") { origin = [pp.w - shrink, 0]; axis = 180; w = pp.w - 2 * shrink; }
    else if (edge === "right") { origin = [pp.w, pp.d - shrink]; axis = -90; w = pp.d - 2 * shrink; }
    else { origin = [0, shrink]; axis = 90; w = pp.d - 2 * shrink; }
    panels.push({ parent, origin, axis, w, d, fold, t0, t1, tone });
    return panels.length - 1;
  };
  return { panels, root, attach };
}

export function buildRig(styleId, { L, W, H, taper, cups }) {
  if (!(L > 0) || !(W > 0)) return null;
  const { panels, root, attach } = rigger();

  switch (styleId) {
    case "foodbox": {
      const tp = taper > 0 ? taper : 7;
      const Lb = L - 2 * tp, Wb = W - 2 * tp;
      const a = 90 - (Math.atan(tp / H) * 180) / Math.PI;
      const base = root(Wb, Lb);
      const wTop = attach(base, "top", H, a, 0, 0.45);
      attach(wTop, "top", 15.5, 150, 0.35, 0.7, 0.2);
      const wBot = attach(base, "bottom", H, a, 0, 0.45);
      attach(wBot, "top", 15.5, 150, 0.35, 0.7, 0.2);
      attach(base, "left", H, a, 0, 0.45);
      const wR = attach(base, "right", H, a, 0, 0.45);
      const lid = attach(wR, "top", W, 180 - a, 0.55, 0.95, 0.05);
      attach(lid, "top", 18, 95, 0.85, 1, 0.2);
      break;
    }
    case "pizzabox": {
      const lip = 41;
      const base = root(W, L);
      // back wall's top edge carries the LID hinge only — a roll-in tuck
      // there would share the lid's flat-pose region (impossible on the die)
      const back = attach(base, "top", H, 90, 0, 0.4);
      const front = attach(base, "bottom", H, 90, 0, 0.4);
      attach(front, "top", H * 0.75, 160, 0.15, 0.5, 0.2);
      attach(base, "left", H, 90, 0.1, 0.5);
      attach(base, "right", H, 90, 0.1, 0.5);
      const lid = attach(back, "top", L + 2, 90, 0.55, 0.92, 0.05);
      attach(lid, "top", lip, 88, 0.85, 1, 0.2);
      attach(lid, "left", H - 3, 88, 0.75, 1, 0.15);
      attach(lid, "right", H - 3, 88, 0.75, 1, 0.15);
      break;
    }
    case "snackbox": {
      // flat pose mirrors the production die's band grid EXACTLY (top to
      // bottom: tab strip | back | base | front | lid | lip; side walls on
      // the base row, lid wings on the lid row) so the die-silhouette mask
      // aligns and clips the true curved shapes in 3D.
      const TABS = 43, LIP = 32;
      const base = root(W, L);
      const back = attach(base, "top", H, 90, 0, 0.4);
      attach(back, "top", TABS, 178, 0.3, 0.65, 0.2); // lock-tab strip rolls over
      const front = attach(base, "bottom", H, 90, 0, 0.4);
      // side walls span the full column strip (back row .. front row) so the
      // mask can reveal the curved corner joints that live in those cells
      attach(base, "left", H, 90, 0.1, 0.5, 0.1, -H);
      attach(base, "right", H, 90, 0.1, 0.5, 0.1, -H);
      // the die hinges the LID off the FRONT wall (rows run base|front|lid|lip)
      const lid = attach(front, "top", Math.max(10, L - 2.5), -90, 0.55, 0.92, 0.05);
      attach(lid, "top", LIP, -88, 0.85, 1, 0.2);
      attach(lid, "left", H, -90, 0.75, 1, 0.15);
      attach(lid, "right", H, -90, 0.75, 1, 0.15);
      break;
    }
    case "carton": {
      const front = root(L, H);
      const s1 = attach(front, "right", W, 90, 0, 0.35, 0.06);
      const bk = attach(s1, "top", L, 90, 0.08, 0.43, 0.1);
      attach(bk, "top", W, 90, 0.16, 0.51, 0.06);
      const top = attach(front, "top", W, 90, 0.55, 0.8, 0.08);
      attach(top, "top", Math.min(0.75 * W, 35), 92, 0.78, 1, 0.18);
      const bot = attach(front, "bottom", W, 90, 0.55, 0.8, 0.08);
      attach(bot, "top", Math.min(0.75 * W, 35), 92, 0.78, 1, 0.18);
      break;
    }
    case "sleeve": {
      const front = root(L, H);
      const s1 = attach(front, "right", W, 90, 0, 0.4, 0.06);
      const bk = attach(s1, "top", L, 90, 0.15, 0.55, 0.1);
      attach(bk, "top", W, 90, 0.3, 0.7, 0.06);
      break;
    }
    case "tuckbox":
    case "tray": {
      const base = root(L, W);
      const wT = attach(base, "top", H, 90, 0, 0.4);
      const wB = attach(base, "bottom", H, 90, 0, 0.4);
      const wL = attach(base, "left", H, 90, 0.15, 0.55);
      const wR = attach(base, "right", H, 90, 0.15, 0.55);
      if (styleId === "tray") {
        attach(wL, "top", Math.max(8, H - 2), 170, 0.5, 0.9, 0.2);
        attach(wR, "top", Math.max(8, H - 2), 170, 0.5, 0.9, 0.2);
      } else {
        attach(wL, "top", Math.max(8, H - 2), 170, 0.35, 0.7, 0.2);
        attach(wR, "top", Math.max(8, H - 2), 170, 0.35, 0.7, 0.2);
        attach(wB, "top", Math.max(8, H - 2), 160, 0.35, 0.7, 0.2);
        const lid = attach(wT, "top", W + 2, 90, 0.55, 0.9, 0.05);
        attach(lid, "top", H - 2, 88, 0.85, 1, 0.18);
      }
      break;
    }
    case "envelope": {
      const body = root(L, W);
      attach(body, "left", Math.min(25, L * 0.18), 175, 0, 0.4, 0.12);
      attach(body, "right", Math.min(25, L * 0.18), 175, 0, 0.4, 0.12);
      attach(body, "bottom", W * 0.72, 178, 0.35, 0.7, 0.08);
      attach(body, "top", Math.max(25, W * 0.35), 165, 0.65, 1, 0.05);
      break;
    }
    case "cakebox": {
      // wrap strip mirrors the die: tuck | lid | side | base | side, with
      // end flaps on lid + base and dust flaps on both side walls — so the
      // FLAT pose matches the KLD layout the artwork is designed on
      const lid = root(L, W);
      const s1 = attach(lid, "right", H, 90, 0.0, 0.35, 0.06);
      const base = attach(s1, "top", L, 90, 0.08, 0.43, 0.02);
      const s2 = attach(base, "top", H, 90, 0.16, 0.51, 0.06);
      const F = H / 2 + 25;
      const Fd = Math.min(F, W / 2 - 2); // side dust flaps clear the box middle
      // shrink insets each flap's hinge so cut gaps show between neighbouring
      // flaps in the flat pose — without them the blank reads as one solid
      // sheet instead of the die layout
      const G2 = 3;
      attach(base, "left", F, 90, 0.55, 0.85, 0.12, G2);
      attach(base, "right", F, 90, 0.55, 0.85, 0.12, G2);
      // lid end flaps live on the BAND-END edges (top/bottom) — its right
      // edge already carries the wall hinge (left/right here overlapped s1
      // in the flat pose and z-fought the wall when formed)
      attach(lid, "top", F, 90, 0.75, 1, 0.05, G2);
      attach(lid, "bottom", F, 90, 0.75, 1, 0.05, G2);
      // side dust flaps fold in first, then base flaps, then the lid closes
      attach(s1, "left", Fd, 90, 0.5, 0.78, 0.15, G2 + 2);
      attach(s1, "right", Fd, 90, 0.5, 0.78, 0.15, G2 + 2);
      attach(s2, "left", Fd, 90, 0.5, 0.78, 0.15, G2 + 2);
      attach(s2, "right", Fd, 90, 0.5, 0.78, 0.15, G2 + 2);
      // tuck flap on the lid's free edge, folds down last
      attach(lid, "left", Math.max(8, Math.min(22, H / 5)), 90, 0.85, 1, 0.1, 8);
      break;
    }
    case "burgerbox": {
      // clamshell: flared base tray + double-crease spine + inverted lid tray
      const wallA = 80;
      const base = root(W, L);
      const back = attach(base, "top", H, wallA, 0, 0.4);
      attach(base, "bottom", H, wallA, 0, 0.4);
      attach(base, "left", H, wallA, 0.05, 0.45);
      attach(base, "right", H, wallA, 0.05, 0.45);
      const spine = attach(back, "top", 4, 20, 0.5, 0.9, 0.15);
      const lid = attach(spine, "top", L - 2, wallA, 0.5, 0.9, 0.05);
      attach(lid, "top", H - 4, -wallA, 0.25, 0.6, 0.12); // lid front wall (pre-folded)
      attach(lid, "left", H - 4, -wallA, 0.25, 0.6, 0.12);
      attach(lid, "right", H - 4, -wallA, 0.25, 0.6, 0.12);
      break;
    }
    case "paperbag": {
      // L = face width, W = gusset, H = bag height; one glued side seam
      const G = W;
      const front = root(L, H);
      const g1a = attach(front, "right", G / 2, 90, 0, 0.35, 0.08);
      const g1b = attach(g1a, "top", G / 2, 0, 0, 0.35, 0.08);
      const back = attach(g1b, "top", L, 90, 0.1, 0.45, 0.04);
      const g2a = attach(back, "top", G / 2, 90, 0.2, 0.55, 0.08);
      attach(g2a, "top", G / 2, 0, 0.2, 0.55, 0.08);
      attach(front, "bottom", 0.75 * G, 90, 0.6, 0.9, 0.14); // bottom fold
      break;
    }
    case "dcutbag": {
      // L = face width, W = gusset, H = body height; wrap like the paper bag
      // plus a fold-over hem on face 1 and a flat glued bottom
      const G = W;
      const front = root(L, H);
      const g1a = attach(front, "right", G / 2, 90, 0, 0.35, 0.08);
      const g1b = attach(g1a, "top", G / 2, 0, 0, 0.35, 0.08);
      const back = attach(g1b, "top", L, 90, 0.1, 0.45, 0.04);
      const g2a = attach(back, "top", G / 2, 90, 0.2, 0.55, 0.08);
      attach(g2a, "top", G / 2, 0, 0.2, 0.55, 0.08);
      attach(front, "bottom", G / 2 + 26, 90, 0.55, 0.9, 0.14); // bottom flap
      attach(front, "top", Math.min(64, H * 0.3), 170, 0.65, 0.95, 0.12); // fold-over hem
      break;
    }
    case "sandwichbox": {
      // right-isosceles wedge: base | TRI B | sloping face (45° hinge) |
      // TRI A | back wall, plus wings, lock strips, tabs, spine flap. The
      // flat pose reproduces the die layout exactly (mask-clipped in 3D).
      // L = sandwich side, W = depth. Frames: rig y = up (die y flipped).
      const Wd = L, D = W, Hyp = Wd * Math.SQRT2, s2 = Math.SQRT1_2;
      const dA = D - 2.7, dB = 0.55 * D, dF = D + 5;
      const TAB = 18.7, TABW = 0.465 * Wd + 2 * 3.3, STRIP = 14;
      const push = (parent, origin, axis, w, d, fold, t0, t1, tone, pts) => {
        panels.push({ parent, origin, axis, w, d, fold, t0, t1, tone, pts });
        return panels.length - 1;
      };
      const base = root(Wd, D);
      // Tri B on the base's top edge: hyp from (0,0) to (W,W), right angle at (W,0)
      const triB = push(base, [0, D], 0, Wd, Wd, 90, 0, 0.35, 0.08, [[0, 0], [Wd, 0], [Wd, Wd], [Wd, Wd]]);
      // sloping face hinged on Tri B's hypotenuse (45°), width D on the far side
      const slope = push(triB, [0, 0], 45, Hyp, D, 90, 0.15, 0.5, 0.02);
      // Tri A on the sloping face's far long edge: hyp along the hinge, apex mid
      const triA = push(slope, [0, D], 0, Hyp, Hyp / 2, 90, 0.3, 0.65, 0.08, [[0, 0], [Hyp, 0], [Hyp / 2, Hyp / 2], [Hyp / 2, Hyp / 2]]);
      // back wall on Tri A's leg from the apex to the P2 end
      const back = push(triA, [Hyp / 2, Hyp / 2], -45, Wd, D, 90, 0.45, 0.8, 0.05);
      // wings on the sloping face's short ends fold 135° (45° dihedral) to lie
      // against the back wall / base; shrink matches the die's taper
      push(slope, [Hyp, D - 4.7], -90, D - 9.4, dA, 137, 0.6, 0.9, 0.15);
      push(slope, [0, 2.7], 90, D - 5.4, dB, 137, 0.6, 0.9, 0.15);
      // lock strips: Tri A leg (P3 -> apex) and Tri B leg (Q1 -> right angle)
      push(triA, [0, 0], 45, Wd, STRIP, 92, 0.55, 0.85, 0.18);
      push(triB, [Wd, Wd], -90, Wd, STRIP, 92, 0.55, 0.85, 0.18);
      // spine flap on the base's right edge glues inside the back wall
      push(base, [Wd, D - 4.7], -90, D - 9.4, dF, 93, 0.5, 0.85, 0.16);
      // tuck tabs (base bottom edge, back wall top edge)
      const shT = (Wd - TABW) / 2;
      push(base, [Wd - shT, 0], 180, TABW, TAB, 93, 0.8, 1, 0.2);
      push(back, [shT, D], 0, TABW, TAB, 93, 0.8, 1, 0.2);
      break;
    }
    case "bowlsleeve": {
      // VERTICAL anti-leak strap (Zepto bagasse-bowl construction): side |
      // TOP (Ø+3, disc extension caps the lid) | side | bottom + glue flap —
      // folds over the lid, down both sides, glues under the base.
      // L = bowl Ø at the crease, W = strap width, H = disc Ø.
      const dia = L, Hb = W, discD = H > 0 ? H : 0;
      const CL = 2.92;
      const topP = dia + CL;
      const sideP = (80 / 175) * dia;
      const botP = (95 / 175) * dia;
      const ext = discD > Hb ? (discD - Hb) / 2 : 0;
      // flat order matches the die (mask alignment): bottom | side | TOP | side | flap
      const top = root(topP, Hb);
      if (ext > 0) {
        attach(top, "top", ext, 0, 0, 1, 0.02);
        attach(top, "bottom", ext, 0, 0, 1, 0.02);
      }
      const s1 = attach(top, "left", sideP, 90, 0.1, 0.5, 0.06);
      const s2 = attach(top, "right", sideP, 90, 0.1, 0.5, 0.06);
      const bot = attach(s1, "top", botP, 90, 0.5, 0.85, 0.1); // bottom hangs off the LEFT side
      attach(s2, "top", 15, 88, 0.8, 1, 0.16); // glue flap on the RIGHT side, laps under
      break;
    }
    case "partition": {
      // double-wall serpentine (one piece per direction): floors are STATIC
      // roots at their assembled positions; each wall's two plies rise +90
      // from the adjacent floor edges, hinged 1 mm apart so they stand as
      // the double wall with the fold on top. cups packs nx*100 + ny.
      const nx = Math.max(1, Math.floor((cups || 301) / 100));
      const ny = Math.max(1, (cups || 301) % 100);
      const wall = H - 1;
      const serp = (pw, n, pitch, axis, origin, along, t0, t1, tone) => {
        const f = pitch - 1;
        const span = t1 - t0, per = span / Math.max(1, n - 1);
        const floors = [];
        for (let i = 0; i < n; i++) {
          const o = [origin[0] + along[0] * i * pitch, origin[1] + along[1] * i * pitch];
          floors.push(panels.length);
          panels.push({ parent: -1, origin: o, axis, w: pw, d: f, fold: 0, tone });
        }
        for (let i = 0; i < n - 1; i++) {
          const a = t0 + i * per, b = a + per;
          attach(floors[i], "top", wall, 90, a, b, tone + 0.06);
          attach(floors[i + 1], "bottom", wall, 90, a + per * 0.25, Math.min(1, b + per * 0.25), tone + 0.1);
        }
      };
      const bothDir = nx > 1 && ny > 1;
      if (ny > 1) serp(L - 1, ny, W / ny, 0, [-(L - 1) / 2, -W / 2], [0, 1], 0.05, 0.5, 0.02);
      if (nx > 1) serp(W - 1, nx, L / nx, -90, [-L / 2, (W - 1) / 2], [1, 0], bothDir ? 0.55 : 0.05, bothDir ? 0.95 : 0.5, 0.06);
      break;
    }
    case "cutlerypouch": {
      // flat pouch: front face, two half-backs fold 178° behind to the
      // centre seam, seam strips lap on top, bottom seal band creases in.
      // L = face width, W = height.
      const F = L, Hb = W;
      const front = root(F, Hb);
      const hbL = attach(front, "left", F / 2, 178, 0, 0.6, 0.06);
      const hbR = attach(front, "right", F / 2, 178, 0, 0.6, 0.06);
      // after a side attach the child's x runs along the hinge → chain the
      // seam strips on "top"
      attach(hbL, "top", 10, 0, 0, 0.6, 0.12);
      attach(hbR, "top", 10, 0, 0, 0.6, 0.12);
      attach(front, "bottom", 10, 30, 0.7, 1, 0.1); // bottom seal pinch
      break;
    }
    case "cupcarrier": {
      // sling: handle | hole band | handle (1 or 2 holes across)
      const band = L + (cups === 1 ? 4 : 32);
      const BW = +cups === 1 ? W : 2 * W;
      const b = root(BW, band);
      attach(b, "top", H, 80, 0.1, 0.7, 0.05);
      attach(b, "bottom", H, 80, 0.1, 0.7, 0.05);
      break;
    }
    default:
      return null;
  }
  return panels;
}

export const RIGGED_STYLES = ["cakebox", "foodbox", "pizzabox", "snackbox", "burgerbox", "carton", "sleeve", "tuckbox", "tray", "envelope", "paperbag", "dcutbag", "cupcarrier", "sandwichbox", "bowlsleeve", "cutlerypouch", "partition"];
