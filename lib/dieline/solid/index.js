// SOLID MODEL of a die: panels from the die -> folded at the board's real caliper -> measured and checked.
// One call for the staff screen: solidModel(templateId, values, doc, { thickness, t }).
import { panelsFromDie, pointInPoly } from "./arrangement.js";
import { foldDie, measure, apply, rotAbout, mul } from "./fold.js";
import { programFor } from "./programs.js";
import { boardClashes } from "./clash.js";

const inv = (m) => { // inverse of a rigid transform
  const r = m.r, rt = [r[0], r[3], r[6], r[1], r[4], r[7], r[2], r[5], r[8]];
  const t = [0, 1, 2].map((i) => -(rt[i * 3] * m.t[0] + rt[i * 3 + 1] * m.t[1] + rt[i * 3 + 2] * m.t[2]));
  return { r: rt, t };
};

export function solidModel(templateId, values, doc, { thickness = 0.4, t = 1, geom: geomIn = null } = {}) {
  const program = programFor(templateId, values, doc);
  if (!program) return { error: "No fold program for this template yet." };
  const geom = geomIn || panelsFromDie(doc, { rootPoint: program.rootPoint });
  const folded = foldDie(geom, program, { thickness, t });
  // instances: the folded piece itself, plus copies (2-piece bags = the same half turned 180 deg)
  // a copy may be layered differently from the first piece (its bottom flap closes OVER the first half's): spec.restack
  const insts = [{ r: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] }], folds = [folded];
  for (const spec of program.instances || []) {
    if (spec.rotY180About) {
      const [x, , z] = spec.rotY180About; insts.push(rotAbout([x, 0, z], [0, 1, 0], 180 * Math.min(1, t * 1)));
      folds.push(spec.restack ? foldDie(geom, { ...program, angle: (c, ctx) => spec.restack(c, program.angle(c, ctx) || { deg: 0 }) }, { thickness, t }) : folded);
    }
  }
  const Mi = (k, i) => (folds[k].M[i] ? mul(insts[k], folds[k].M[i]) : null);
  const world = insts.flatMap((T, k) => folds[k].world.map((w, i) => (w ? {
    instance: k, panel: i,
    inner: w.inner.map((p) => apply(T, p)), outer: w.outer.map((p) => apply(T, p)),
    normalIn: [0, 1, 2].map((r) => T.r[r * 3] * w.normalIn[0] + T.r[r * 3 + 1] * w.normalIn[1] + T.r[r * 3 + 2] * w.normalIn[2]),
    holes: w.holes.map((h) => ({ inner: h.inner.map((p) => apply(T, p)), outer: h.outer.map((p) => apply(T, p)) })),
  } : null)).filter(Boolean));
  const size = measure({ world });

  const panelAt = (pt) => geom.panels.filter((P) => pointInPoly(pt, P.outline)).sort((a, b) => a.area - b.area)[0];
  const checks = [];
  // 1. every crease that closes a loop must line up (else the die cannot fold as drawn)
  const worst = folded.closure.reduce((m, c) => (c.errMm > m.errMm ? c : m), { errMm: 0 });
  const takeUp = 2 * thickness + 0.05; // a fold that turns back over another (hems, liners) takes up 2 calipers - real, not an error
  checks.push({ id: "3D-LOOPS", ok: worst.errMm <= takeUp, severity: "warn", title: "Every crease lines up when folded",
    detail: worst.errMm <= 0.05 ? `${folded.closure.length} closing creases, worst ${worst.errMm.toFixed(2)} mm.`
      : worst.errMm <= takeUp ? `${folded.closure.length} closing creases; worst ${worst.errMm.toFixed(2)} mm = board take-up where a fold turns back over itself (${thickness} mm caliper).`
      : `A crease near x ${worst.at[0].toFixed(0)}, y ${worst.at[1].toFixed(0)} mm misses by ${worst.errMm.toFixed(1)} mm - the die cannot fold as drawn.` });
  // 2. glue / lock joins
  for (const j of program.joins || []) {
    const A = panelAt(j.from.at), B = panelAt(j.onto.at);
    if (!A || !B || !folded.M[A.id] || !folded.M[B.id]) { checks.push({ id: "3D-JOIN", ok: false, severity: "warn", title: j.name, detail: "Join points not found on the die." }); continue; }
    // from.skin "outer" = the printed face of the flap is the one that touches (a flap folded back onto the outside of a wall)
    const pw = apply(Mi(j.from.instance || 0, A.id), [j.from.at[0], j.from.at[1], j.from.skin === "outer" ? -thickness : 0]);
    const local = apply(inv(Mi(j.onto.instance || 0, B.id)), pw);
    const inside = pointInPoly([local[0], local[1]], B.outline);
    const gap = local[2] > 0 ? local[2] : local[2] < -thickness ? -thickness - local[2] : 0; // distance off the partner's skins
    const ok = inside && gap <= thickness * (1 + (j.between || 0)) + 0.1; // j.between = boards that lie between the two by design
    checks.push({ id: "3D-JOIN", ok, severity: "warn", title: j.name,
      detail: ok ? `Lands on its partner (${gap.toFixed(2)} mm off the board).` : inside ? `Stands ${gap.toFixed(1)} mm off its partner.` : "Misses its partner panel." });
  }
  // 3. measured size vs ordered. Default = cavity between the main walls on the root panel's axes; expected.use = { y: "clear" }
  // takes the narrowest gap on that axis instead (closures made of stacked flaps). Boxes whose walls lean (flared trays) or roll
  // over (mailers) measure themselves: program.custom(ctx) -> { rows, checks } with ctx.at(diePoint, skin, instance) -> world mm.
  const at = (pt, skin = "inner", instance = 0) => { const P = panelAt(pt); return P && folded.M[P.id] ? apply(Mi(instance, P.id), [pt[0], pt[1], skin === "outer" ? -thickness : 0]) : null; };
  // on(ref) -> (pt, skin) => world: any die point carried rigidly with the panel that holds `ref` (rims, corners, edges)
  const on = (ref, instance = 0) => { const P = typeof ref === "number" ? geom.panels[ref] : panelAt(ref), M = P && Mi(instance, P.id); return M ? (pt, skin = "inner") => apply(M, [pt[0], pt[1], skin === "outer" ? -thickness : 0]) : null; };
  const dist = (a, b) => (a && b ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : NaN);
  const custom = program.custom ? program.custom({ at, on, dist, size, thickness, geom, folded }) : null;
  const ex = program.expected || { labels: {} }, ax = { x: 0, y: 1, z: 2 };
  const rows = custom?.rows || Object.keys(ax).filter((k) => ex[k] != null).map((k) => ({ label: ex.labels[k], ordered: ex[k], inside: (ex.use?.[k] === "clear" ? size.clear : size.inside)[ax[k]], outside: size.outside[ax[k]] }));
  const worstDev = Math.max(0, ...rows.filter((r) => r.ordered != null).map((r) => Math.abs(r.inside - r.ordered)));
  checks.push({ id: "3D-SIZE", ok: worstDev <= 0.5, severity: "warn", title: "Folded inside size = ordered size",
    detail: rows.map((r) => `${r.label} ${r.inside.toFixed(1)} inside${r.outside != null ? ` / ${r.outside.toFixed(1)} outside` : ""}${r.ordered != null ? ` (ordered ${r.ordered})` : ""}${r.note ? ` - ${r.note}` : ""}`).join("; ") });
  for (const c of custom?.checks || []) checks.push({ severity: "warn", ...c });
  // 4. no two boards in the same space, no board through another (fully folded model only: it is the one that is measured).
  // program.flex = lock parts the die leaves without a crease (they bend in the real box): [{ at: diePoint, note }] - a clash
  // that touches one of those panels is reported as what it is, not as a fault.
  if (t >= 0.999) {
    const lost = folded.M.map((x, i) => (x ? null : i)).filter((x) => x != null);
    checks.push({ id: "3D-PLACED", ok: !lost.length, severity: "warn", title: "Every panel of the die is in the model",
      detail: lost.length ? `${lost.length} of ${geom.panels.length} panels are not placed (${lost.reduce((a, i) => a + geom.panels[i].area, 0).toFixed(0)} mm2).` : `${geom.panels.length} panels placed.` });
    const flex = (program.flex || []).map((f) => ({ ...f, id: panelAt(f.at)?.id })).filter((f) => f.id != null);
    const all = boardClashes(world, thickness), isFlex = (c) => flex.find((f) => f.id === c.a.panel || f.id === c.b.panel);
    const real = all.filter((c) => !isFlex(c)), bent = all.filter(isFlex);
    const say = (c) => `panel ${c.a.panel}${c.a.instance ? " (2nd piece)" : ""} and ${c.b.panel}${c.b.instance ? " (2nd piece)" : ""}: ${c.kind === "same" ? `${c.mm2.toFixed(0)} mm2 in the same layer` : `crosses over ${c.mm.toFixed(0)} mm`}`;
    checks.push({ id: "3D-CLASH", ok: !real.length, severity: "warn", title: "No two boards in the same space",
      detail: real.length ? `${real.length} overlap(s): ${real.slice(0, 4).map(say).join("; ")}.` : "Every lap sits one board thickness off its partner; nothing passes through anything else." });
    if (bent.length) {
      const f = isFlex(bent[0]), deep = Math.max(0, ...bent.map((c) => c.depth || 0));
      checks.push({ id: "3D-FLEX", ok: true, severity: "info", title: "Lock parts shown unbent", detail: `${f.note}${deep ? ` Shown straight they overlap the neighbour by up to ${deep.toFixed(1)} mm.` : ""}` });
    }
  }
  return { program: program.name, geom, folded, world, size, rows, checks, thickness, instances: insts.length };
}
