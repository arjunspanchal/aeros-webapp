// FOLD PROGRAMS — how each Aeros construction folds, written as rules on the die's own crease lines (positions come from
// the same inputs that drew the die, so the program and the die can never drift apart). A program returns, per crease,
// { deg, t0, t1, stack }: deg > 0 folds into the box, deg < 0 folds out, 0 stays flat; t0..t1 is when it moves in the
// fold animation; stack = how many board layers already lie under this flap (it sits that many calipers further out).
// joins = glue / lock contacts that must land on their partner panel, checked after folding.
// expected = the size that was ordered, compared with the measured model.

const near = (a, b, tol = 0.05) => Math.abs(a - b) <= tol;
const isV = (c) => near(c.a[0], c.b[0], 0.01), isH = (c) => near(c.a[1], c.b[1], 0.01);
const midX = (c) => (c.a[0] + c.b[0]) / 2;

// generic gusseted bag (SOS hand-made and D-cut): seam | face | gusset | face | gusset, or one half (seam | face | gusset)
function bagProgram({ seam, W, G, H, topY, bodyTop, half, label }) {
  const cols = half ? [["seam", 0, seam], ["front", seam, seam + W], ["gusset1", seam + W, seam + W + G]]
    : [["seam", 0, seam], ["front", seam, seam + W], ["gusset1", seam + W, seam + W + G], ["back", seam + W + G, seam + 2 * W + G], ["gusset2", seam + 2 * W + G, seam + 2 * W + 2 * G]];
  const X1 = cols[cols.length - 1][2];
  const YB = bodyTop + H, YA = YB - G / 2, flap = G / 2 + 29.6;
  const colOf = (x) => (cols.find(([, a, b]) => x > a + 0.01 && x < b - 0.01) || ["?"])[0];
  const gussetMid = cols.filter(([n]) => n.startsWith("gusset")).map(([, a, b]) => (a + b) / 2);
  // bottom layers, inside to outside: gusset flaps, then the face flaps. When the two gusset flaps are long enough to reach
  // each other (2 x flap > W) the second one lies over the first, and everything after it sits one layer further out.
  const lap = 2 * flap > W + 0.01 ? 1 : 0;
  const flapOrder = { gusset1: [0, 0.5, 0.62], gusset2: [lap, 0.5, 0.62], front: [1 + lap, 0.64, 0.8], back: [2 + lap, 0.82, 0.95] };
  const twin = { gusset1: "gusset2", front: "back" }; // 2-piece bag: the second half's flaps close over the first half's
  const program = {
    name: label,
    rootPoint: [seam + W / 2, bodyTop + 5],
    angle(c) {
      if (isV(c)) {
        const x = midX(c);
        if (gussetMid.some((m) => near(x, m))) return { deg: 0 }; // gusset centre: open bag stands with the gusset flat
        // a crease inside the top fold / hem turns over with it: valley on the wall = mountain on the hem
        // (never used as a hinge: every hem piece turns down with ITS OWN wall through the top-fold crease, so it always
        // lies on the inside face of that wall whatever the bag's proportions)
        if (topY != null && Math.max(c.a[1], c.b[1]) <= topY + 0.05) return { free: true, deg: -90, t0: 0, t1: 0.45 };
        // glue seam: pasted on the INSIDE of the gusset it meets (its printed face is the glue face - no ink there), so it
        // sits one caliper inside that gusset, not in the same layer
        if (near(x, seam)) return { deg: 90, stack: -1, t0: 0, t1: 0.45 };
        if (cols.some(([, a]) => near(x, a)) || near(x, X1)) return { deg: 90, t0: 0, t1: 0.45 };
        return { deg: 0 };
      }
      if (isH(c)) {
        const y = c.a[1];
        if (near(y, YB)) { const o = flapOrder[colOf(midX(c))]; return o ? { deg: 90, stack: o[0], t0: o[1], t1: o[2] } : { deg: 90, t0: 0.5, t1: 0.95 }; }
        // top fold / hem turns inside. It is folded FIRST, on the flat sheet, before the tube is formed (that is how the bag is
        // made) - so it is already inside for all the rest of the fold slider (Arjun 21-Nov-2026: "it doesn't fold inside":
        // it used to turn only in the last tenth of the slider and looked like a flap standing above the bag)
        if (topY != null && near(y, topY)) return { deg: 180, t0: 0, t1: 0.14 };
        return { deg: 0 }; // cross crease, handle half-cut tab: flat when the bag stands open
      }
      return { deg: 0 }; // diamond diagonals: flat when the bag stands open
    },
    joins: [
      half
        ? { name: "Side seam: the other half's gusset edge lands on this seam", from: { instance: 1, at: [X1 - 0.5, (bodyTop + YA) / 2] }, onto: { instance: 0, at: [seam / 2, (bodyTop + YA) / 2] } }
        : { name: "Side seam: last gusset edge lands on the glue seam", from: { at: [X1 - 0.5, (bodyTop + YA) / 2] }, onto: { at: [seam / 2, (bodyTop + YA) / 2] } },
      half
        ? { name: "Bottom: the other half's face flap overlaps this face flap", from: { instance: 1, at: [seam + W / 2, YB + flap - 0.5] }, onto: { instance: 0, at: [seam + W / 2, YB + 3] } }
        : { name: "Bottom: back flap overlaps the front flap", from: { at: [seam + 1.5 * W + G, YB + flap - 0.5] }, onto: { at: [seam + W / 2, YB + 3] } },
    ],
    expected: { x: W, z: G, y: H, labels: { x: "Width", z: "Gusset", y: "Height" } },
    // artwork designer: the faces people see (visible wall = body top to the bottom fold) and where no ink may go
    areas: cols.filter(([n]) => n !== "seam").map(([n, a, b]) => ({ name: half && n === "front" ? "Front / Back" : n === "front" ? "Front" : n === "back" ? "Back" : "Gusset", box: [a, bodyTop, b, YB] })),
    noInk: [[-1e4, -1e4, seam, 1e4]], // glue seam (and the bleed beside it)
    topCutY: [0, bodyTop], // the sheet's top edge and the bag mouth (where the mouth is a cut)
    // a 2-piece bag = this half + the same half turned 180 deg about the bag's vertical centre line
    // top fold at the side seam: the seam strip is pasted inside the last gusset, and that gusset's hem is in the same place
    // for the height of the hem - four layers that the paper steps over by one caliper. Each panel stays flat in the model.
    flex: topY != null ? [{ at: [X1 - G / 4, topY / 2], note: "At the side seam the top fold makes four layers of paper; the seam strip steps over the gusset's hem by one paper thickness. The model keeps each panel flat." }] : [],
    instances: half ? [{ rotY180About: [seam + W / 2, null, G / 2],
      restack: (c, spec) => (isH(c) && near(c.a[1], YB) && twin[colOf(midX(c))] ? { ...spec, stack: flapOrder[twin[colOf(midX(c))]][0], t0: flapOrder[twin[colOf(midX(c))]][1], t1: flapOrder[twin[colOf(midX(c))]][2] } : spec) }] : [],
  };
  return program;
}

import { panelsFromDie, pointInPoly } from "./arrangement.js";

// ---------------------------------------------------------------------------------------------------------------- boxes
// Box programs read their crease positions from the die the engine just drew (doc.blank / the panels themselves), so a
// rule can never point at a crease that is not there.
const MM = 25.4 / 72; // pt -> mm
// largest box around the panel's centre whose four corners are still on the panel (a no-ink box may never touch a neighbour)
const innerBox = (P) => { const b = boxOf(P), [cx, cy] = P.centroid; for (let k = 1; k > 0.2; k -= 0.05) { const r = [cx + (b[0] - cx) * k, cy + (b[1] - cy) * k, cx + (b[2] - cx) * k, cy + (b[3] - cy) * k]; if ([[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]].every((q) => pointInPoly(q, P.outline))) return r; } return null; };
const boxOf = (P) => { const xs = P.outline.map((v) => v[0]), ys = P.outline.map((v) => v[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };

// CAKE / PASTRY BOX (cakebox.js): a tube  tuck | lid | side | base | side  with a band W tall; each open end closes with
// two side dust flaps, the base flap (lock slit at H/2) and the lid flap (tab) over them. No glue.
function cakeProgram(v, doc) {
  const p = doc.blank.panels, xA = p.xA * MM, xB = p.xB * MM, xC = p.xC * MM, xD = p.xD * MM, xE = p.xE * MM, yT = p.yT * MM, yB = p.yB * MM;
  const F = doc.blank.flapDepthPt * MM, F2 = doc.blank.sideFlapDepthPt * MM, Q = xC - xB, mid = (yT + yB) / 2;
  const sh = doc.blank.closure.lockScale.sh, tabX = xA + ((xB - xA) / MM + (176.83 - 86.38) * sh) / 2 * MM; // middle of the lid tab's flat tip (cakebox.js lid flap)
  const col = (x) => (x < xA ? "tuck" : x < xB ? "lid" : x < xC ? "side" : x < xD ? "base" : "side");
  const order = { side: [0, 0.5, 0.64], base: [1, 0.66, 0.8], lid: [2, 0.82, 0.96] }; // dust flaps, then the base flap, then the lid tab
  const ends = [[yT, -1, "top"], [yB, 1, "bottom"]];
  return {
    name: "Cake box, closed",
    rootPoint: [(xC + xD) / 2, mid],
    angle(c) {
      if (isV(c) && near(midX(c), xA)) return { deg: 90, stack: -1, t0: 0, t1: 0.45 }; // tuck flap: one caliper INSIDE the far side wall
      if (isV(c) && [xB, xC, xD].some((x) => near(midX(c), x))) return { deg: 90, t0: 0, t1: 0.45 };
      if (isH(c) && (near(c.a[1], yT) || near(c.a[1], yB))) { const o = order[col(midX(c))]; return o ? { deg: 90, stack: o[0], t0: o[1], t1: o[2] } : { deg: 0 }; }
      return { deg: 0 };
    },
    joins: [
      { name: "Tuck flap sits inside the far side wall", from: { at: [xA - 5, mid] }, onto: { at: [(xD + xE) / 2, mid] } },
      ...ends.flatMap(([y, d, n]) => [
        { name: `End (${n}): side dust flap lies under the base flap`, from: { at: [xB + Q / 4, y + d * F2 / 2], skin: "outer" }, onto: { at: [(xC + xD) / 2, y + d * F / 2] } },
        { name: `End (${n}): lid tab reaches the base flap past the lock slit`, from: { at: [tabX, y + d * (F - 2)] }, onto: { at: [(xC + xD) / 2, y + d * F / 2] } },
      ]),
    ],
    custom({ at }) {
      // each end: the two side dust flaps come in from opposite walls and must not cross; the lid tab must be narrower than the slit
      const a = at([xB + Q / 4, yT - F2 + 1]), b = at([xD + (3 * Q) / 4, yT - F2 + 1]), gap = a && b ? b[0] - a[0] - 2 : NaN;
      const c = doc.blank.closure, slit = c.slitPt * MM, tab = c.tabRootPt * MM;
      return { checks: [
        { id: "3D-ENDS", ok: gap >= -0.05, title: "End closure: side dust flaps do not cross", detail: gap >= -0.05 ? `${Math.max(0, gap).toFixed(1)} mm between them on a ${(xD - xC).toFixed(1)} mm end.` : `They cross by ${(-gap).toFixed(1)} mm - the end cannot shut.` },
        { id: "3D-LOCK", ok: slit > tab, title: "End closure: lid tab fits the lock slit", detail: `Slit ${slit.toFixed(1)} mm, tab root ${tab.toFixed(1)} mm (the tab is shown lying over the base flap, not pushed through).` },
      ] };
    },
    expected: { x: +v.L, y: +v.W, z: +v.H, labels: { x: "Length", y: "Width", z: "Height" }, use: { y: "clear" } },
    areas: [{ name: "Lid", box: [xA, yT, xB, yB] }, { name: "Side", box: [xB, yT, xC, yB] }, { name: "Base", box: [xC, yT, xD, yB] }, { name: "Side", box: [xD, yT, xE, yB] }],
    noInk: [], topCutY: null,
  };
}

// CUP HOLDER BOX WITH HANDLE (cupholderbox.js): glue | handle panel | gusset | handle panel | gusset. Top: each handle panel
// throws a lid half (meets its twin at the centre) and a handle cap that stands up from it; each gusset throws a triangle
// that lies over the lids with its slot threaded over the caps. Bottom: 1-2-3 snap lock (drawn flat: its hooks bend).
function cupHolderProgram(v, doc) {
  const f = doc.blank.frame, [x0, x1, x2, x3] = f.px, { yT, yB, xE, lid } = f, L = f.pw[0], W = f.pw[1], H = yB - yT, mid = (yT + yB) / 2;
  const panelOf = (x) => (x < x0 ? -1 : x < x1 ? 0 : x < x2 ? 1 : x < x3 ? 2 : 3);
  // bottom, inside to outside: slotted flap, the two hooks (the second over the first where they reach each other), the tongue
  const hook = Math.max(...doc.segments.filter((q) => q.layer === "cut").flatMap((q) => q.pts).filter((q) => q[0] * MM > x1 + 1 && q[0] * MM < x2 - 1).map((q) => q[1] * MM)) - yB; // depth of a hook flap, off the die
  const hookLap = 2 * hook > L + 0.01 ? 1 : 0;
  const bottom = { 2: [0, 0.5, 0.62], 1: [1, 0.64, 0.74], 3: [1 + hookLap, 0.64, 0.74], 0: [2 + hookLap, 0.76, 0.86] };
  return {
    name: "Cup holder box, closed",
    rootPoint: [x0 + L / 2, mid],
    angle(c) {
      if (isV(c) && near(midX(c), x0)) return { deg: 90, stack: -1, t0: 0, t1: 0.4 }; // glue flap: pasted inside the last side panel
      if (isV(c)) return [x1, x2, x3].some((x) => near(midX(c), x)) ? { deg: 90, t0: 0, t1: 0.4 } : { deg: 0 };
      if (!isH(c)) return { deg: 0 };
      const k = panelOf(midX(c)), y = c.a[1];
      if (near(y, yB)) { const o = bottom[k]; return o ? { deg: 90, stack: o[0], t0: o[1], t1: o[2] } : { deg: 0 }; }
      if (near(y, yT)) return k % 2 === 0 ? { deg: 90, t0: 0.45, t1: 0.6 } : { deg: 90, stack: k === 1 ? 1 : 2, t0: k === 1 ? 0.86 : 0.9, t1: 1 }; // lid halves, then one triangle over them, then the other over that
      if (near(y, yT - lid)) return { deg: -90, t0: 0.6, t1: 0.75 }; // handle cap stands up from the lid half
      return { deg: 0 };
    },
    joins: [
      { name: "Side seam: the free gusset edge lands on the glue flap", from: { at: [xE - 3, mid] }, onto: { at: [x0 / 2, mid] } },
      ...(f.lock === "ear" ? [] : [
        { name: "Top: gusset triangle lies on the lid half", from: { at: [x1 + W / 3, yT - lid * 0.27] }, onto: { at: [x0 + L / 2, yT - lid / 2] } },
        { name: "Top: far gusset triangle lies on the lid half", from: { at: [x3 + W / 3, yT - lid * 0.27] }, onto: { at: [x2 + L / 2, yT - lid / 2] } },
      ]),
      { name: "Bottom: tongue flap closes over the slotted flap", between: 1 + hookLap, from: { at: [x0 + L / 2, yB + W * 0.6] }, onto: { at: [x2 + L / 6, yB + W * 0.4] } }, // the hooks lie between them
    ],
    custom({ at }) {
      // the two lid halves fold in from opposite walls: they must meet, not cross
      const a = at([x0 + 5, yT - lid + 1]), b = at([x2 + 5, yT - lid + 1]); // 1 mm inside each free edge
      const gap = a && b ? b[2] - a[2] - 2 : NaN;
      return { checks: [{ id: "3D-LIDS", ok: gap >= -0.05, title: "Lid halves meet at the centre without crossing", detail: `${Math.abs(gap) < 0.05 ? "Meet edge to edge" : gap > 0 ? `${gap.toFixed(1)} mm apart` : `Cross by ${(-gap).toFixed(1)} mm`} (${lid.toFixed(1)} + ${lid.toFixed(1)} across ${W.toFixed(1)}).` }] };
    },
    expected: { x: L, z: W, y: +v.H || H, labels: { x: "Length", z: "Width", y: "Body height" } },
    areas: [{ name: "Front (handle side)", box: [x0, yT, x1, yB] }, { name: "Side", box: [x1, yT, x2, yB] }, { name: "Back (handle side)", box: [x2, yT, x3, yB] }, { name: "Side", box: [x3, yT, xE, yB] }],
    noInk: [[0, yT - 1, x0, yB + 1]], // glue flap
    topCutY: null,
  };
}

// FRONT-LOCK FOOD BOX (foodbox.js): a flared tray - base (L - 2T) x (W - 2T), four walls that lean out by the taper T, webbed
// (sealed) corners, a lid hinged on the back wall with a lip that drops over the front wall.
//   wall angle: a wall of slant height H leaning out by T stands at acos(T / H) from the base plane, so the rim opens to L x W
//   corner webs: hinged full length on the front / back wall edge; turned round the corner onto the INSIDE of the side wall and pasted (4-corner
//                pasting). Their short crease on the side wall near the base corner is where the web crumples: free, not rigid.
//   left flat (lock parts that bend): the side-wall lips with their slot + holes, the lid lip's bracket tabs.
function foodBoxProgram(v, doc) {
  const f = doc.blank.frame, { ox, oy, Wb, Lb, T, H, W, L, g } = f;
  const A = (Math.acos(T / H) * 180) / Math.PI, lidA = 180 - A; // wall angle; lid and lid lip turn the rest of the way
  // CORNER PASTING FLAPS (Arjun 21-Nov-2026, corrected the same day: "The side flaps should be inside the box"). Each flap
  // is attached along the END of the front / back wall (full-length crease), turns round the corner and is pasted on the
  // INSIDE face of the short side wall, so the side wall is the outer layer and no flap shows on the outside of the box.
  // Its printed face is the pasted face. Its turn = the angle between the two flared walls about their shared corner edge (90 deg only when
  // the walls are upright): walls stand at A, so with unit vectors in the tray frame -
  const ar = (A * Math.PI) / 180, cA = Math.cos(ar), sA = Math.sin(ar);
  const cr = (u, w) => [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], dt = (u, w) => u[0] * w[0] + u[1] * w[1] + u[2] * w[2];
  const unit = (u) => { const l = Math.hypot(...u); return u.map((x) => x / l); };
  const nSide = [0, sA, cA], nFront = [sA, 0, cA]; // inside normals of the side wall (on the y0 edge) and the front wall (on the x0 edge)
  const edge = unit(cr(nSide, nFront)); // their shared corner edge
  let pOut = unit(cr(edge, nFront)); if (pOut[1] > 0) pOut = pOut.map((x) => -x); // in the front wall's plane, away past the corner
  let qIn = unit(cr(edge, nSide)); if (qIn[0] < 0) qIn = qIn.map((x) => -x); // in the side wall's plane, along the side wall
  const flapA = (Math.acos(Math.max(-1, Math.min(1, dt(pOut, qIn)))) * 180) / Math.PI;
  const x0 = ox, x1 = ox + Wb, y0 = oy, y1 = oy + Lb, xHinge = x1 + H, xLip = xHinge + W, cx = ox + Wb / 2, cy = oy + Lb / 2;
  const D = (x, y) => [ox + x, oy + y]; // base-frame point (as in foodbox.js) -> blank frame
  const gp = [-(13.85 * g + H) / 3, -(26.78 * g + T) / 3]; // a point well inside the top-left web (mean of three of its corners)
  const webs = [[gp[0], gp[1], -H / 2], [Wb - gp[0], gp[1], Wb + H / 2], [gp[0], Lb - gp[1], -H / 2], [Wb - gp[0], Lb - gp[1], Wb + H / 2]];
  return {
    name: "Food box, lid closed",
    rootPoint: [cx, cy],
    angle(c) {
      const dx = Math.abs(c.a[0] - c.b[0]), dy = Math.abs(c.a[1] - c.b[1]);
      if (isH(c) && (near(c.a[1], y0, 0.1) || near(c.a[1], y1, 0.1))) return { deg: A, t0: 0, t1: 0.35 }; // side walls
      // the two SIDE-WALL LIPS fold in over the box and lie flat under the lid (Arjun 21-Nov-2026: "The two flaps should be
      // inside too") - they used to be left standing up past the closed lid
      if (isH(c) && (c.a[1] < y0 - H / 2 || c.a[1] > y1 + H / 2) && midX(c) > x0 && midX(c) < x1 && c.len > Wb * 0.4) return { deg: lidA, t0: 0.42, t1: 0.55 };
      if (isH(c)) return { deg: 0 };
      if (isV(c)) {
        const x = midX(c);
        if (near(x, x0, 0.1) || near(x, x1, 0.1)) return { deg: A, t0: 0, t1: 0.35 };
        if (near(x, xHinge, 0.1)) return { deg: lidA, stack: 1, t0: 0.55, t1: 0.85 }; // the lid closes OVER the two side lips: one caliper up
        if (near(x, xLip, 0.1)) return { deg: lidA, stack: 1, t0: 0.85, t1: 1 }; // drops over the outside of the front wall
        return { deg: 0 };
      }
      return dx > dy ? { deg: flapA, stack: -1, t0: 0.35, t1: 0.55 } : { free: true, deg: 0 }; // pasting flap lies on the inside of the side wall (one caliper in) | its short corner web crumples
    },
    joins: [
      { name: "Lid lip drops over the front wall", from: { at: [xLip + 9, cy] }, onto: { at: D(-H / 2, Lb / 2) } },
      ...webs.map(([x, y], k) => ({ name: `Corner flap ${k + 1} lies on the inside of the side wall (pasted)`, from: { at: D(x, y), skin: "outer" }, onto: { at: D(Wb / 2, y < 0 ? -H / 2 : Lb + H / 2) } })),
    ],
    custom({ on, dist }) {
      const top = on(D(Wb / 2, -H / 4)), bot = on(D(Wb / 2, Lb + H / 4)), left = on(D(-H / 4, Lb / 2)), right = on(D(Wb + H / 4, Lb / 2));
      if (!top || !bot || !left || !right) return null;
      const rim = { t: D(Wb / 2, -H), b: D(Wb / 2, Lb + H), l: D(-H, Lb / 2), r: D(Wb + H, Lb / 2) };
      const Lin = dist(top(rim.t), bot(rim.b)), Lout = dist(top(rim.t, "outer"), bot(rim.b, "outer"));
      const Win = dist(left(rim.l), right(rim.r)), Wout = dist(left(rim.l, "outer"), right(rim.r, "outer"));
      const depth = top(rim.t)[2], slant = dist(top(D(Wb / 2, 0)), top(rim.t));
      // corners: the rim ends of neighbouring walls must be the same point in space
      const corners = [[top, D(-T, -H), left, D(-H, -T)], [top, D(Wb + T, -H), right, D(Wb + H, -T)], [bot, D(-T, Lb + H), left, D(-H, Lb + T)], [bot, D(Wb + T, Lb + H), right, D(Wb + H, Lb + T)]];
      const miss = Math.max(...corners.map(([a, p, b, q]) => dist(a(p), b(q))));
      return {
        rows: [
          { label: "Top opening length", ordered: L, inside: Lin, outside: Lout },
          { label: "Top opening width", ordered: W, inside: Win, outside: Wout },
          { label: "Wall height (on the slant)", ordered: H, inside: slant, outside: slant, note: `inside depth ${depth.toFixed(1)} mm, base ${Wb.toFixed(1)} x ${Lb.toFixed(1)} mm` },
        ],
        checks: [{ id: "3D-CORNERS", ok: miss <= 0.1, title: "Wall rims meet at all four corners", detail: `Walls stand at ${A.toFixed(1)} deg; worst corner gap ${miss.toFixed(2)} mm.` }],
      };
    },
    expected: null,
    areas: [{ name: "Lid", box: [xHinge, oy - T, xLip, y1 + T] }, { name: "Base", box: [x0, y0, x1, y1] }, { name: "Front wall", box: [x0 - H, y0, x0, y1] }, { name: "Back wall", box: [x1, y0, xHinge, y1] },
      { name: "Side wall", box: [x0, y0 - H, x1, y0] }, { name: "Side wall", box: [x0, y1, x1, y1 + H] }],
    // The corner flaps are hidden inside the box: their printed face is pasted to the inside (unprinted) face of the side
    // wall, so the outside of the box is clean side wall. Whether the flap's printed face must be left free of ink /
    // lamination for the paste is not blocked here yet (Arjun to say).
    noInk: [],
    topCutY: null,
  };
}

// crease -> rule lookup for traced dies: the program reads the die's own panel graph once and keys each rule by the crease it
// belongs to (midpoint + length), so the same crease always gets the same rule
const cKey = (c) => `${((c.a[0] + c.b[0]) / 2).toFixed(1)},${((c.a[1] + c.b[1]) / 2).toFixed(1)},${c.len.toFixed(0)}`;
function graph(doc, rootPoint) {
  const g = panelsFromDie(doc, { rootPoint });
  const nb = (i) => g.creases.filter((c) => c.p === i || c.q === i).map((c) => ({ c, o: c.p === i ? c.q : c.p }));
  return { g, nb, P: g.panels, box: (i) => boxOf(g.panels[i]) };
}

// MAILER / TUCK BOX 0427 (tuckbox.js, traced die family): base; front + back walls with dust flaps; side walls that roll over
// (outer wall | roll strip | inner ply with a lock tab into a base slot); lid on the back wall with two side flaps and a
// front flap with wings. No glue.
//   The die creases the lid flaps a little short of where they end up (lid sits on the wall tops, flaps spring inside): they
//   are modelled inside the box and the push-in is reported, not hidden.
function mailerProgram(v, doc) {
  const f = doc.blank.frame, { bx0, bx1, by0, by1 } = f, cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;
  const { g, nb, P, box } = graph(doc, [cx, cy]);
  const spec = new Map(), set = (c, s) => spec.set(cKey(c), s);
  const root = g.root, R = { dust: [], ears: [], wings: [] };
  for (const { c, o } of nb(root)) {
    const [px, py] = P[o].centroid;
    if (py > by1) { R.front = o; set(c, { deg: 90, t0: 0, t1: 0.25 }); }
    else if (py < by0) { R.back = o; set(c, { deg: 90, t0: 0, t1: 0.25 }); }
    else { R[px < bx0 ? "left" : "right"] = o; R[px < bx0 ? "cLeft" : "cRight"] = c; set(c, { deg: 90, t0: 0.3, t1: 0.5 }); }
  }
  for (const w of [R.front, R.back]) for (const { c, o } of nb(w)) {
    if (o === root) continue;
    const b = box(o);
    if (w === R.back && b[0] >= bx0 - 5 && b[2] <= bx1 + 5 && P[o].area > P[w].area) { R.lid = o; set(c, { deg: 90, t0: 0.7, t1: 0.9 }); }
    else { R.dust.push({ o, wall: w }); set(c, { deg: 90, t0: 0.1, t1: 0.3 }); }
  }
  const roll = {};
  for (const side of ["left", "right"]) {
    const outer = R[side];
    for (const { c, o } of nb(outer)) {
      if (o === root) continue;
      const b = box(o), stripW = b[2] - b[0];
      set(c, { deg: 90, t0: 0.45, t1: 0.6 });
      for (const { c: c2, o: inner } of nb(o)) if (inner !== outer) { set(c2, { deg: 90, t0: 0.5, t1: 0.65 }); roll[side] = { strip: o, stripW, inner, hinge: c2 }; }
    }
  }
  const lidLen = R.lid != null ? box(R.lid)[3] - box(R.lid)[1] : 0, over = lidLen - (by1 - by0); // lid longer than the base by this much
  const push = { ears: [], tuck: over };
  if (R.lid != null) for (const { c, o } of nb(R.lid)) {
    if (o === R.back) continue;
    const b = box(o), isTuck = P[o].centroid[1] < box(R.lid)[1];
    if (isTuck) { R.tuck = o; set(c, { deg: 90, stack: -1, liftMm: -over, t0: 0.85, t1: 1 }); } // inside the front wall
    else {
      const left = P[o].centroid[0] < cx, dE = left ? midX(c) - bx0 : bx1 - midX(c), gap = roll[left ? "left" : "right"]?.stripW || 0;
      R.ears.push(o); push.ears.push(gap - dE);
      set(c, { deg: 90, stack: -2, liftMm: -(gap - dE), t0: 0.85, t1: 1 }); // inside the rolled wall
    }
  }
  if (R.tuck != null) for (const { c, o } of nb(R.tuck)) {
    if (o === R.lid) continue;
    const left = P[o].centroid[0] < cx, dW = left ? midX(c) - bx0 : bx1 - midX(c), gap = roll[left ? "left" : "right"]?.stripW || 0;
    R.wings.push(o);
    set(c, { deg: 90, stack: -3, liftMm: -(gap - dW), t0: 0.9, t1: 1 }); // folds back along the side wall, inside the lid flap
  }
  const wallH = R.left != null ? box(R.left)[2] - box(R.left)[0] : f.H;
  const C = (i) => P[i].centroid;
  return {
    name: "Mailer box, closed",
    rootPoint: [cx, cy],
    angle: (c) => spec.get(cKey(c)) || { deg: 0 },
    joins: [
      ...R.dust.map(({ o, wall }, k) => ({ name: `${wall === R.front ? "Front" : "Back"} dust flap ${k % 2 + 1} sits against the side wall, under the roll`, from: { at: C(o), skin: "outer" }, onto: { at: C(C(o)[0] < cx ? R.left : R.right) } })),
    ],
    custom({ on, dist, thickness }) {
      const checks = [], rows = [];
      const L3 = dist(on(C(R.left))([bx0, cy]), on(C(R.right))([bx1, cy])), W3 = dist(on(C(R.back))([cx, by0]), on(C(R.front))([cx, by1]));
      const lidZ = R.lid != null ? on(C(R.lid))(C(R.lid))[2] : wallH;
      for (const side of ["left", "right"]) {
        const r = roll[side]; if (!r) continue;
        const o = P[r.inner].outline, hingeX = midX(r.hinge), far = (p) => Math.abs(p[0] - hingeX);
        const ys = o.map((p) => p[1]), yEnd = Math.min(...ys);
        const tip = Math.max(...o.map(far)), body = Math.max(...o.filter((p) => p[1] < yEnd + 0.5).map(far)); // tab tip / ply free edge, from the roll crease
        const w = on(C(r.inner)), sign = side === "left" ? -1 : 1;
        const zBody = w([hingeX + sign * body, cy])[2], zTip = w([hingeX + sign * tip, cy])[2];
        checks.push({ id: "3D-ROLL", ok: zBody >= -0.1, title: `Rolled ${side} wall: inner ply seats on the base`,
          detail: zBody >= -0.1 ? `Inner ply ${body.toFixed(1)} mm on a ${wallH.toFixed(1)} mm wall: stops ${Math.max(0, zBody).toFixed(1)} mm above the base; lock tab goes ${(-zTip).toFixed(1)} mm through its slot.`
            : `Inner ply ${body.toFixed(1)} mm is longer than the ${wallH.toFixed(1)} mm wall by ${(-zBody).toFixed(1)} mm: it bottoms on the base before the roll closes (the E-flute reference die is 2.0 mm SHORTER than the wall).` });
        const tabY = o.filter((p) => far(p) > tip - 0.05).map((p) => p[1]), parts = (side === "left" ? R.cLeft : R.cRight).parts || [];
        if (parts.length === 2) {
          const e = parts.map((q) => [Math.min(q.a[1], q.b[1]), Math.max(q.a[1], q.b[1])]).sort((a, b) => a[0] - b[0]), slot = [e[0][1], e[1][0]];
          const okTab = Math.min(...tabY) >= slot[0] - 0.05 && Math.max(...tabY) <= slot[1] + 0.05;
          checks.push({ id: "3D-LOCK", ok: okTab && zTip < -thickness, title: `Rolled ${side} wall: lock tab meets its base slot`,
            detail: `Tab ${(Math.max(...tabY) - Math.min(...tabY)).toFixed(1)} mm wide, slot ${(slot[1] - slot[0]).toFixed(1)} mm${okTab ? "" : " - the tab is wider than the slot or off its line"}; the ply stands ${r.stripW.toFixed(1)} mm in from the slot line and leans back to reach it.` });
        }
      }
      const clearL = L3 - 2 * ((roll.left?.stripW || 0) + thickness);
      rows.push({ label: "Length", ordered: f.L, inside: L3, outside: L3 + 2 * thickness, note: `base crease to crease; ${clearL.toFixed(1)} mm clear between the rolled side walls` });
      rows.push({ label: "Width", ordered: f.W, inside: W3, outside: W3 + 2 * thickness, note: `${(W3 - thickness).toFixed(1)} mm clear inside the lid's front flap` });
      rows.push({ label: "Height", ordered: f.H, inside: lidZ, outside: lidZ + 2 * thickness });
      if (R.lid != null) checks.push({ id: "3D-LID", ok: true, severity: "info", title: "Lid flaps are creased short of their seat (modelled inside the box)",
        detail: `Lid ${lidLen.toFixed(1)} mm on a ${(by1 - by0).toFixed(1)} mm base: the front flap is pushed in ${(over + thickness).toFixed(1)} mm to sit inside the front wall; the side flaps ${(Math.max(...push.ears) + 2 * thickness).toFixed(1)} mm to sit inside the rolled walls. On board the lid rests on the wall tops and the flaps spring in.` });
      return { rows, checks };
    },
    expected: null,
    areas: [R.lid != null && { name: "Lid", box: box(R.lid) }, { name: "Base", box: [bx0, by0, bx1, by1] }, { name: "Front wall", box: box(R.front) }, { name: "Back wall", box: box(R.back) },
      { name: "Side wall", box: box(R.left) }, { name: "Side wall", box: box(R.right) }, R.tuck != null && { name: "Lid front flap", box: box(R.tuck) }].filter(Boolean),
    noInk: [], topCutY: null,
  };
}

// FLARED TRAY read off the die: `tray` panel + the walls creased to it. A wall leaning out so that its side edge meets its
// neighbour's side edge stands at  cos(angle) = neighbour's sideways run x own edge length / (neighbour's edge length x own
// height)  (for a symmetric tray: cos = taper / slant height). Side edges are read from each wall's own outline.
function trayOf(G, tray) {
  const { g, nb, P } = G, tc = P[tray].centroid;
  const walls = nb(tray).map(({ c, o }) => {
    const [a, b] = [c.a, c.b], len = Math.hypot(b[0] - a[0], b[1] - a[1]), u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    let n = [-u[1], u[0]]; if ((P[o].centroid[0] - a[0]) * n[0] + (P[o].centroid[1] - a[1]) * n[1] < 0) n = [-n[0], -n[1]];
    const out = P[o].outline, N = out.length;
    const edge = (end, away) => { // walk the outline from the crease end, away from the crease, while it keeps its direction
      let k = 0, bd = Infinity; out.forEach((p, i) => { const d = Math.hypot(p[0] - end[0], p[1] - end[1]); if (d < bd) { bd = d; k = i; } });
      const other = end === a ? b : a;
      for (const step of [1, -1]) {
        const first = out[(k + step + N) % N];
        if (Math.hypot(first[0] - other[0], first[1] - other[1]) < Math.hypot(end[0] - other[0], end[1] - other[1]) - 0.5 && Math.abs((first[0] - a[0]) * n[0] + (first[1] - a[1]) * n[1]) < 0.3) continue; // that way lies the crease
        let last = end, d0 = null;
        for (let i = 1; i < N; i++) {
          const v = out[(k + step * i + N * N) % N], seg = [v[0] - last[0], v[1] - last[1]], sl = Math.hypot(seg[0], seg[1]);
          if (sl < 1e-6) continue;
          if (!d0) { if (Math.hypot(v[0] - end[0], v[1] - end[1]) < 2) { last = v; continue; } d0 = [(v[0] - end[0]), (v[1] - end[1])]; const l0 = Math.hypot(d0[0], d0[1]); d0 = [d0[0] / l0, d0[1] / l0]; last = v; continue; }
          if ((seg[0] * d0[0] + seg[1] * d0[1]) / sl < 0.94) break; // turned more than ~20 deg: the edge ended
          last = v;
        }
        const vec = [last[0] - end[0], last[1] - end[1]];
        return { vec, lat: (vec[0] * u[0] + vec[1] * u[1]) * away, h: vec[0] * n[0] + vec[1] * n[1], len: Math.hypot(vec[0], vec[1]) };
      }
      return null;
    };
    return { o, c, a, b, u, n, len, ea: edge(a, -1), eb: edge(b, 1) };
  });
  // corners: two walls whose creases share an end
  const corners = [];
  for (let i = 0; i < walls.length; i++) for (let j = i + 1; j < walls.length; j++) for (const [ka, pa] of [["ea", walls[i].a], ["eb", walls[i].b]]) for (const [kb, pb] of [["ea", walls[j].a], ["eb", walls[j].b]]) {
    if (Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) < 3 && walls[i][ka] && walls[j][kb]) corners.push({ A: walls[i], B: walls[j], eA: walls[i][ka], eB: walls[j][kb], at: pa });
  }
  for (const w of walls) {
    const est = [];
    for (const k of corners) { const me = k.A === w ? k.eA : k.B === w ? k.eB : null, ot = k.A === w ? k.eB : k.eA; if (me) est.push(Math.min(1, Math.max(0, (ot.lat * me.len) / (ot.len * me.h)))); }
    w.cos = est.length ? est.reduce((s, v) => s + v, 0) / est.length : 0;
    w.deg = (Math.acos(w.cos) * 180) / Math.PI;
    w.spread = est.length > 1 ? (Math.abs(Math.acos(est[0]) - Math.acos(est[1])) * 180) / Math.PI : 0; // the two corners disagree by this much
  }
  // a traced die's corners never agree exactly: settle each wall at the angle that closes its corners best (least squares
  // on the gap between the two wall edges at each corner, measured in the tray's own frame)
  const pt3 = (w, deg, end, e, l) => { const k = l / e.len, sv = (e.vec[0] * w.u[0] + e.vec[1] * w.u[1]) * k, hv = e.h * k, r = (deg * Math.PI) / 180;
    return [end[0] + sv * w.u[0] + hv * Math.cos(r) * w.n[0], end[1] + sv * w.u[1] + hv * Math.cos(r) * w.n[1], hv * Math.sin(r)]; };
  const gap = (k) => { const l = Math.min(k.eA.len, k.eB.len), p = pt3(k.A, k.A.deg, k.at, k.eA, l), q = pt3(k.B, k.B.deg, k.at, k.eB, l); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
  const cost = () => corners.reduce((s2, k) => s2 + gap(k) ** 2, 0);
  for (let round = 0, step = 2; round < 40; round++, step *= 0.8) for (const w of walls) {
    const d0 = w.deg, c0 = cost();
    let best = d0, bc = c0;
    for (const d of [d0 - step, d0 + step]) { w.deg = Math.min(90, Math.max(45, d)); const c = cost(); if (c < bc) { bc = c; best = w.deg; } }
    w.deg = best;
  }
  for (const w of walls) {
    w.cos = Math.cos((w.deg * Math.PI) / 180);
    const sn = Math.sqrt(1 - w.cos * w.cos);
    w.nIn = [-w.n[0] * sn, -w.n[1] * sn, w.cos]; // inside normal once folded (tray frame, z up)
  }
  return { tray, walls, corners, tc, gap, worstGap: Math.max(0, ...corners.map(gap)) };
}

// BURGER CLAMSHELL (burgerbox.js, traced production die): base tray + lid tray joined at the spine, eight pasted corners.
// Every angle is read off the die (trayOf). Pasted ears fold onto the INSIDE of the neighbouring wall. The spine hinge is the
// perforation the source draws as a cut (blank.hingeLines). Closed = lid tray upside down on the base tray.
function burgerProgram(v, doc) {
  const f = doc.blank.frame, cx = (f.xb[1] + f.xb[2]) / 2, cy = (f.yb[3] + f.yb[4]) / 2;
  const G = graph(doc, [cx, cy]), { g, nb, P } = G, spec = new Map(), set = (c, s) => spec.set(cKey(c), s);
  const base = trayOf(G, g.root), joins = [];
  const back = base.walls.find((w) => P[w.o].centroid[1] < f.yb[3] && Math.abs(P[w.o].centroid[0] - cx) < 20);
  const isEar = (i) => P[i].area < 0.3 * P[back.o].area;
  const lidBackId = back ? (nb(back.o).find(({ c, o }) => o !== g.root && !isEar(o) && c.len > 20) || {}).o : null;
  const lidId = lidBackId != null ? nb(lidBackId).map(({ o }) => o).filter((o) => o !== back.o && !isEar(o)).sort((p, q) => P[q].area - P[p].area)[0] : null;
  const lid = lidId != null ? trayOf(G, lidId) : null;
  const ears = (T, t0) => {
    for (const k of T.corners) for (const [W, O] of [[k.A, k.B], [k.B, k.A]]) for (const { c, o } of nb(W.o)) {
      if (!isEar(o) || c.len < 5) continue;
      const m = [(c.a[0] + c.b[0]) / 2, (c.a[1] + c.b[1]) / 2];
      if (Math.hypot(m[0] - k.at[0], m[1] - k.at[1]) > c.len) continue; // an ear on this wall's other end
      const dot = Math.max(-1, Math.min(1, W.nIn[0] * O.nIn[0] + W.nIn[1] * O.nIn[1] + W.nIn[2] * O.nIn[2]));
      set(c, { deg: (Math.acos(dot) * 180) / Math.PI, stack: -1, t0, t1: t0 + 0.15 });
      joins.push({ name: `Pasted ear lies on the inside of its neighbour wall (${T === base ? "base" : "lid"})`, from: { at: P[o].centroid, skin: "outer" }, onto: { at: P[O.o].centroid } });
    }
  };
  for (const w of base.walls) set(w.c, { deg: w.deg, t0: 0, t1: 0.3 });
  ears(base, 0.3);
  if (lid) {
    const lb = lid.walls.find((w) => w.o === lidBackId);
    for (const { c, o } of nb(back.o)) if (o === lidBackId) set(c, { deg: 180 - back.deg - lb.deg, t0: 0.55, t1: 0.9 }); // spine: closed clamshell
    for (const w of lid.walls) set(w.c, { deg: w.deg, t0: w === lb ? 0.55 : 0.35, t1: w === lb ? 0.9 : 0.55 });
    ears(lid, 0.4);
  }
  for (const c of g.creases) if (!spec.has(cKey(c))) set(c, c.len < 5 ? { free: true, deg: 0 } : { deg: 0 }); // spine-line stubs beside the ears
  const front = base.walls.find((w) => P[w.o].centroid[1] > f.yb[4]);
  return {
    name: "Burger box, closed",
    rootPoint: [cx, cy],
    angle: (c) => spec.get(cKey(c)) || { deg: 0 },
    joins,
    custom({ on, dist }) {
      const gapOf = (T) => Math.max(0, ...T.corners.map((k) => { const l = Math.min(k.eA.len, k.eB.len), p = (e) => [k.at[0] + (e.vec[0] / e.len) * l, k.at[1] + (e.vec[1] / e.len) * l]; return dist(on(k.A.o)(p(k.eA)), on(k.B.o)(p(k.eB))); }));
      const b0 = on(g.root), wid = dist(b0(back.a), b0(back.b)), widF = front ? dist(b0(front.a), b0(front.b)) : wid;
      const mid = (w) => [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2], dep = front ? dist(b0(mid(back)), b0(mid(front))) : NaN;
      const slant = back.ea.h, rimZ = on(back.o)([back.a[0] + back.ea.vec[0], back.a[1] + back.ea.vec[1]])[2];
      const lidZ = lid ? on(lid.tray)(P[lid.tray].centroid)[2] : NaN;
      const gb = gapOf(base), gl = lid ? gapOf(lid) : 0, spread = Math.max(...base.walls.map((w) => w.spread), ...(lid ? lid.walls.map((w) => w.spread) : [0]));
      return {
        rows: [
          { label: "Base width (back edge)", ordered: f.W, inside: wid, outside: wid, note: `front edge ${widF.toFixed(1)} mm` },
          { label: "Base depth", ordered: f.D, inside: dep, outside: dep },
          { label: "Wall height (on the slant)", ordered: f.H, inside: slant, outside: slant, note: `base rim ${rimZ.toFixed(1)} mm up${lid ? `, ${lidZ.toFixed(1)} mm inside height closed` : ""}` },
        ],
        checks: [
          { id: "3D-CORNERS", ok: gb <= 1, title: "Base tray: wall edges meet at the four corners", detail: `Walls stand at ${base.walls.map((w) => w.deg.toFixed(0)).join(" / ")} deg (read off the die); worst corner gap ${gb.toFixed(2)} mm.` },
          ...(lid ? [{ id: "3D-CORNERS", ok: gl <= 1, title: "Lid tray: wall edges meet at the four corners", detail: `Walls stand at ${lid.walls.map((w) => w.deg.toFixed(0)).join(" / ")} deg; worst corner gap ${gl.toFixed(2)} mm.` }] : []),
          { id: "3D-TRACE", ok: true, severity: "info", title: "Traced die: corners are not all alike", detail: `The two ends of one wall ask for angles up to ${spread.toFixed(1)} deg apart; each wall is set at the angle that closes its corners best. Front lips and side wings are folded with their wall, not tucked.` },
        ],
      };
    },
    expected: null,
    areas: [lid && { name: "Lid (top)", box: boxOf(P[lid.tray]) }, { name: "Base", box: boxOf(P[g.root]) }, ...base.walls.map((w) => ({ name: w === back ? "Base back wall" : w === front ? "Base front wall" : "Base side wall", box: boxOf(P[w.o]) })),
      ...(lid ? lid.walls.map((w) => ({ name: w.o === lidBackId ? "Lid back wall" : "Lid wall", box: boxOf(P[w.o]) })) : [])].filter(Boolean),
    noInk: g.panels.filter((q) => isEar(q.id) && nb(q.id).some(({ c }) => c.len >= 5)).map(innerBox).filter(Boolean), // pasted ears (their printed face is glued)
    topCutY: null,
    // closed clamshell: the lid's side and front walls come down over the base's taller side walls. Both are kept flat in
    // the model; in the board they give where they meet (found by the 3D audit, 21-Nov-2026 - how the lid really seats is
    // Arjun's to confirm on a made box).
    flex: lid ? [...base.walls.filter((w) => w !== back && w !== front), ...lid.walls.filter((w) => w.o !== lidBackId)].map((w) => ({ at: P[w.o].centroid,
      note: "Closed, the lid's walls come down over the base's side walls and the two meet near the base rim. Both are drawn flat; in the board they give there." })) : [],
  };
}

// one program per (die, template, size): the traced-die programs read the panel graph, which is worth keeping
// DRAWER BOX (drawerbox.js, Zepto condiment box production die). Three separate parts, each folded on its own.
//   TRAY: side walls up; the dust flap on each side-wall end turns the corner and lies on the INSIDE of the end wall (one
//         caliper in); the end wall comes up over it; the end wall's top half folds back down inside (over the dust flaps,
//         so one caliper further in) and its tab drops through the slot in the base.
function drawerTrayProgram(v, doc) {
  const f = doc.blank.frame, { X1, X2, X3, Y1, Y2, Y3, Y4, cx, L, W, H } = f, ym = (Y2 + Y3) / 2;
  return {
    name: "Drawer box tray, locked",
    rootPoint: [cx + W / 4, ym],
    angle(c) {
      if (isV(c)) return near(midX(c), X1) || near(midX(c), X2) ? { deg: 90, t0: 0, t1: 0.3 } : { deg: 0 };
      if (!isH(c)) return { deg: 0 };
      const y = c.a[1], x = midX(c), onBase = x > X1 && x < X2;
      if (near(y, Y2) || near(y, Y3)) return onBase ? { deg: 90, t0: 0.5, t1: 0.7 } : { deg: 90, stack: -1, t0: 0.32, t1: 0.48 }; // end wall | dust flap
      if (near(y, Y1) || near(y, Y4)) return { deg: 180, stack: 1, t0: 0.72, t1: 1 }; // fold-over, over the dust flaps
      return { deg: 0 };
    },
    custom({ at, thickness }) {
      const wl = at([X1 - 0.001, ym]), wr = at([X2 + 0.001, ym]), ea = at([cx + 10, Y2 - 0.001]), eb = at([cx + 10, Y3 + 0.001]);
      const rim = at([0.001, ym]), fa = at([cx + 10, Y1 - 5], "outer"), fb = at([cx + 10, Y4 + 5], "outer"), tip = at([cx, 0.2]), foot = at([cx + 20, 2.2]);
      const lean = 2 - (ea && foot ? Math.abs(foot[1] - ea[1]) : 0); // the slot is 2 mm in from the base fold; how far the fold-over's foot must lean to reach it
      return {
        rows: [
          { label: "Width", ordered: W, inside: wr[0] - wl[0], outside: wr[0] - wl[0] + 2 * thickness },
          { label: "Length", ordered: L, inside: eb[1] - ea[1], outside: eb[1] - ea[1] + 2 * thickness, note: `${(fb[1] - fa[1]).toFixed(1)} clear between the fold-overs` },
          { label: "Height", ordered: H, inside: rim[2], outside: rim[2] + thickness },
        ],
        checks: [
          { id: "3D-TRAY-TAB", ok: tip[2] < -thickness + 0.05 && foot[2] > 0, title: "Lock tab reaches through the base slot", detail: `Tab tip ${(-tip[2]).toFixed(1)} mm below the base's inside face (board ${thickness} mm); the fold-over's edge stops ${foot[2].toFixed(1)} mm above the base.` },
          { id: "3D-TRAY-DUST", ok: 2 * f.dust <= W - 2, title: "Dust flaps do not cross behind the end wall", detail: `Two ${f.dust} mm flaps on a ${W} mm end: ${(W - 2 * f.dust).toFixed(1)} mm between them.` },
          { id: "3D-FLEX", ok: true, severity: "info", title: "Lock shown unbent", detail: `The base slot sits 2 mm in from the fold. The fold-over is drawn hanging straight; in the board its foot leans in ${lean.toFixed(1)} mm to reach the slot, which is what keeps the lock tight.` },
        ],
      };
    },
    flex: [{ at: [cx, (2 + Y1) / 2], note: "fold-over: its foot leans in to the base slot" }, { at: [cx, (Y4 + f.Y5) / 2], note: "fold-over: its foot leans in to the base slot" }],
    expected: { x: W, y: L, z: H, labels: { x: "Width", y: "Length", z: "Height" } },
    areas: [{ name: "Base", box: [X1, Y2, X2, Y3] }, { name: "Side wall", box: [0, Y2, X1, Y3] }, { name: "Side wall", box: [X2, Y2, X3, Y3] }, { name: "End wall", box: [X1, Y1, X2, Y2] }, { name: "End wall", box: [X1, Y3, X2, Y4] }],
    noInk: [],
    topCutY: null,
  };
}
//   SLEEVE: side | top | side | bottom | glue, folded into a tube open at both ends; the glue flap is pasted INSIDE the first
//           side panel. The first side is 0.6 mm shorter than the other so its free edge stops short of the bottom panel.
function drawerSleeveProgram(v, doc) {
  const f = doc.blank.frame, { ys, Ls, glue } = f, top = ys[2] - ys[1], side = ys[3] - ys[2];
  return {
    name: "Drawer box sleeve, glued",
    rootPoint: [Ls / 2, (ys[3] + ys[4]) / 2], // the BOTTOM panel lies on the table: the top (main face) is up and the glued seam is at the bottom, as the box is used (Arjun 27-Nov-2026)
    angle(c) {
      if (!isH(c)) return { deg: 0 };
      const y = c.a[1];
      if (near(y, ys[4])) return { deg: 90, stack: -1, t0: 0.55, t1: 0.9 }; // glue flap: pasted inside the first side panel
      if ([ys[1], ys[2], ys[3]].some((q) => near(y, q))) return { deg: 90, t0: 0, t1: 0.6 };
      return { deg: 0 };
    },
    joins: [{ name: "Seam: the glue flap lands inside the first side panel", from: { at: [Ls / 2, ys[4] + glue / 2] }, onto: { at: [Ls / 2, ys[1] - (side - glue / 2)] } }], // the flap's middle sits (side - glue / 2) below the top fold
    expected: { x: +Ls.toFixed(2), y: +top.toFixed(2), z: +side.toFixed(2), labels: { x: "Length", y: "Width inside", z: "Height inside" } },
    areas: [{ name: "Side (seam side)", box: [0, ys[0], Ls, ys[1]] }, { name: "Top (main face)", box: [0, ys[1], Ls, ys[2]] }, { name: "Side", box: [0, ys[2], Ls, ys[3]] }, { name: "Bottom", box: [0, ys[3], Ls, ys[4]] }],
    noInk: [[-1, ys[4], Ls + 1, ys[5] + 1]], // glue flap
    topCutY: null,
  };
}
//   INSERT: a platform on four legs folded down; the cup-hole petals are drawn flat (they bend down when the cups go in).
function drawerInsertProgram(v, doc) {
  const f = doc.blank.frame, { X1, X2, Y1, Y2, PW, PL, leg } = f;
  return {
    name: "Drawer box cup insert, legs down",
    rootPoint: [X1 + 1, Y1 + 1], // on the platform, outside every cup ring
    angle(c) {
      if (isV(c) && (near(midX(c), X1) || near(midX(c), X2)) && Math.abs(c.a[1] - c.b[1]) > PL / 2) return { deg: 90, t0: 0, t1: 0.6 };
      if (isH(c) && (near(c.a[1], Y1) || near(c.a[1], Y2)) && Math.abs(c.a[0] - c.b[0]) > PW / 2) return { deg: 90, t0: 0.3, t1: 1 };
      return { deg: 0 }; // cup rings: petals stay flat in the model
    },
    custom() { return { checks: [{ id: "3D-FLEX", ok: true, severity: "info", title: "Cup petals shown flat", detail: `Each cup hole is cut Dia ${f.cut} inside a Dia ${f.ring} crease ring with 24 slits; the petals bend down and grip the cup. The model draws them flat.` }] }; },
    expected: { x: +PW.toFixed(2), y: +PL.toFixed(2), z: +leg.toFixed(2), labels: { x: "Platform width", y: "Platform length", z: "Leg height" } },
    areas: [{ name: "Platform", box: [X1, Y1, X2, Y2] }],
    noInk: [],
    topCutY: null,
  };
}

const cache = new WeakMap();
export function programFor(templateId, values, doc) {
  if (!doc || typeof doc !== "object") return buildProgram(templateId, values, doc);
  const key = `${templateId}|${JSON.stringify(values)}`;
  let m = cache.get(doc);
  if (!m) cache.set(doc, (m = new Map()));
  if (!m.has(key)) m.set(key, buildProgram(templateId, values, doc));
  return m.get(key);
}
function buildProgram(templateId, values, doc) {
  const v = values;
  if (templateId === "sos-handmade") {
    const top = +v.top || 0;
    return bagProgram({ seam: 20, W: +v.W, G: +v.G, H: +v.H, topY: top > 0 ? top : null, bodyTop: top, half: !!v.half, label: "SOS bag, open" });
  }
  if (templateId === "dcut-bag") {
    const HEM = 63.7; // dcutbag.js
    return bagProgram({ seam: 25, W: +v.W, G: +v.G, H: +v.H, topY: HEM, bodyTop: HEM, half: !!v.half, label: "D-cut bag, open" });
  }
  if (!doc || !doc.blank) return null;
  if (templateId === "cake-box") return cakeProgram(v, doc);
  if (templateId === "burger-box" && doc.blank.frame) return burgerProgram(v, doc);
  if (templateId === "mailer-0427" && doc.blank.frame) return mailerProgram(v, doc);
  if (templateId === "food-box-front-lock" && doc.blank.frame) return foodBoxProgram(v, doc);
  if (templateId === "cup-holder-box" && doc.blank.frame) return cupHolderProgram(v, doc);
  if (templateId === "drawer-box-tray" && doc.blank.frame) return drawerTrayProgram(v, doc);
  if (templateId === "drawer-box-sleeve" && doc.blank.frame) return drawerSleeveProgram(v, doc);
  if (templateId === "drawer-box-insert" && doc.blank.frame) return drawerInsertProgram(v, doc);
  return null;
}
