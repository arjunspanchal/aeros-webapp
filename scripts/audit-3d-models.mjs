// AUDIT OF EVERY 3D MODEL the staff dieline tool can show: each template x each proven size x two board calipers, folded
// fully, then checked for (1) creases that do not line up, (2) glue / lock joins that miss, (3) folded size against the
// ordered size, (4) panels that were never placed, (5) two boards in the same space, (6) a board passing through another.
//   node scripts/audit-3d-models.mjs            summary
//   node scripts/audit-3d-models.mjs --all      every run, not only the ones with findings
import { TEMPLATES } from "../lib/dieline/templates.js";
import { runStaffTemplate } from "../lib/dieline/staff.js";
import { solidModel } from "../lib/dieline/solid/index.js";

const ALL = process.argv.includes("--all");
const CAL = { bag: [0.1, 0.16], box: [0.42, 0.55], mailer: [0.42, 1.5] };
let runs = 0, bad = 0;
const notes = new Set();
const summary = [];
for (const t of TEMPLATES) {
  if (t.route === "cup" || t.route === "pet" || t.route === "wrap") continue;
  const cal = t.family === "bag" ? CAL.bag : t.id === "mailer-0427" ? CAL.mailer : CAL.box;
  const variants = [];
  for (const p of t.proven) {
    const v = {}; for (const inp of t.inputs) if (p[inp.key] != null) v[inp.key] = p[inp.key];
    variants.push([p.ref || JSON.stringify(v), v]);
    if (t.inputs.some((i) => i.key === "half")) variants.push([`${p.ref} 2-piece`, { ...v, half: true }]);
    if (t.inputs.some((i) => i.key === "top") && !v.top) variants.push([`${p.ref} +30 top fold`, { ...v, top: 30 }]);
  }
  const rowsOut = [];
  for (const [name, v] of variants) for (const mm of cal) {
    runs++;
    const res = runStaffTemplate(t.id, v, { mm, gsm: 300, label: "audit" });
    const f = [];
    if (res.error || !res.doc) { f.push(`DIE: ${res.error}`); }
    else {
      const m = solidModel(t.id, v, res.doc, { thickness: mm, t: 1 });
      if (m.error) f.push(`MODEL: ${m.error}`);
      else {
        for (const c of m.checks) if (!c.ok) f.push(`${c.id}: ${c.title} - ${c.detail}`);
        for (const c of m.checks) if (c.id === "3D-FLEX") notes.add(`${t.id}: ${c.detail}`);
        if (ALL && !f.length) rowsOut.push(`    ok   ${name} @ ${mm} mm: ${m.geom.panels.length} panels, ${m.rows.map((r) => `${r.label} ${r.inside.toFixed(1)}${r.ordered != null ? "/" + r.ordered : ""}`).join(", ")}`);
      }
    }
    if (f.length) { bad++; rowsOut.push(`    FAIL ${name} @ ${mm} mm`); for (const x of f) rowsOut.push(`           ${x}`); }
  }
  const fails = rowsOut.filter((r) => r.startsWith("    FAIL")).length;
  summary.push(`${fails ? "FAIL" : "PASS"}  ${t.id}: ${variants.length * cal.length} runs, ${fails} with findings`);
  console.log(`\n${t.name}  [${t.id}]`);
  console.log(rowsOut.length ? rowsOut.join("\n") : "    all runs clean");
}
// cups: the 3D cup is a cone built from the KLD fan - check its numbers against the cup's own spec
const { cupGeometry, cupFormedChecks, cupFitChecks } = await import("../lib/dieline/cup.js");
console.log("\nPaper cups (cone from the KLD fan)");
for (const t of TEMPLATES.filter((x) => x.route === "cup")) {
  const g = cupGeometry(t.cup), f = g.formed, s = g.spec, list = [...cupFormedChecks(g), ...(t.innerCup ? cupFitChecks(g, cupGeometry(t.innerCup), 0.3) : [])];
  // OPEN WITH ARJUN, not a fault of the model: on these two tubs the base the DIE forms differs from the base diameter in
  // the product list (350 mL: die 96.9 vs listed 95; 500 mL: die 88.9 vs listed 91). The screen warns about it; here it is
  // printed on every run and left out of the count, so a new finding still shows. Remove a line when the figure is settled.
  const OPEN = { "paper-tub-350ml": ["3D-CUP-BASE"], "paper-tub-500ml": ["3D-CUP-BASE"] };
  const known = list.filter((c) => !c.ok && (OPEN[t.id] || []).includes(c.id)), badC = list.filter((c) => !c.ok && !known.includes(c));
  for (const c of known) console.log(`    OPEN ${t.id}: ${c.title} - ${c.detail}`);
  runs++; if (badC.length) bad++;
  summary.push(`${badC.length ? "FAIL" : "PASS"}  ${t.id}: fan ${g.w} x ${g.h} mm -> ${g.wall === "double" ? "wrap" : "cup"} ${f.rimDia.toFixed(2)} / ${f.baseDia.toFixed(2)} x ${f.wallHeight.toFixed(2)} mm, taper ${f.taperDeg.toFixed(2)} deg (spec TD ${s.TD} / BD ${s.BD} / H ${s.H})`);
  console.log(badC.length ? badC.map((c) => `    FAIL ${t.id}: ${c.title} - ${c.detail}`).join("\n") : `    ${t.id}: clean`);
}
// PET cups: the 3D cup is turned from its measured profile - check the profile and the print band against the cup's own figures
const { petGeometry } = await import("../lib/dieline/pet.js");
console.log("\nPET cups (turned from the measured profile)");
for (const t of TEMPLATES.filter((x) => x.route === "pet")) {
  const g = petGeometry(t.pet), f = [];
  if (Math.abs(g.diaAt(g.h) - g.td) > 0.05) f.push(`top of the profile ${g.diaAt(g.h)} vs TD ${g.td}`);
  if (Math.abs(g.diaAt(0) - g.bd) > 0.05) f.push(`foot of the profile ${g.diaAt(0)} vs BD ${g.bd}`);
  if (g.profile.some((q, i) => i && q[1] < g.profile[i - 1][1])) f.push("profile heights do not rise");
  if (g.profile.some((q, i) => i && q[0] < g.profile[i - 1][0] - 0.01)) f.push("the cup gets narrower going up");
  if (!(g.zFoot > 0 && g.zTop < g.h && g.zTop > g.zFoot)) f.push("print band is not inside the cup height");
  runs++; if (f.length) bad++;
  summary.push(`${f.length ? "FAIL" : "PASS"}  ${t.id}: cup ${g.td} / ${g.bd} x ${g.h} mm, band ${g.bandH} mm (${g.dFoot.toFixed(1)} to ${g.dTop.toFixed(1)} mm across), rectangle ${g.w} mm = ${(g.w / Math.PI).toFixed(1)} mm across`);
  console.log(f.length ? `    FAIL ${t.id}: ${f.join("; ")}` : `    ${t.id}: clean`);
}
// Wrap sheets: flat, nothing folds - check the repeat itself (gate G1 of the house check_wrap.py) on every sheet and a
// spread of pitches, and that the pattern covers a sheet + bleed the same way on every sheet of the 4-up
const { wrapGeometry, tilePlan, expandWrap, WRAP_BLEED } = await import("../lib/dieline/wrap.js");
console.log("\nWrap sheets (flat: the repeat tile must divide the sheet exactly, rows even)");
for (const t of TEMPLATES.filter((x) => x.route === "wrap")) {
  const g = wrapGeometry(t.wrap), f = [];
  for (let pitch = 30; pitch <= 120; pitch += 1) {
    const pl = tilePlan(g.W, g.H, pitch);
    if (Math.abs(pl.nx * pl.Px - g.W) > 1e-9 || Math.abs(pl.ny * pl.Py - g.H) > 1e-9 || pl.ny % 2) f.push(`pitch ${pitch}: tile ${pl.Px} x ${pl.Py}, ${pl.nx} x ${pl.ny}`);
    const A = { id: "a", kind: "svg", rep: "A", w: Math.min(50, pl.Px - 2), h: Math.min(18, pl.Py - 2) }, Bm = { id: "b", kind: "svg", rep: "B", w: 11, h: 11 };
    const one = expandWrap([A, Bm], pl, [-WRAP_BLEED, -WRAP_BLEED, g.W + WRAP_BLEED, g.H + WRAP_BLEED]);
    const four = expandWrap([A, Bm], pl, [-WRAP_BLEED, -WRAP_BLEED, 2 * g.W + WRAP_BLEED, 2 * g.H + WRAP_BLEED]);
    const key = (l, dx, dy) => l.filter((i) => i.x - dx + i.w / 2 > 0 && i.x - dx - i.w / 2 < g.W && i.y - dy + i.h / 2 > 0 && i.y - dy - i.h / 2 < g.H).map((i) => `${i.id.split("@")[0]}:${(i.x - dx).toFixed(2)},${(i.y - dy).toFixed(2)}`).sort().join("|");
    const ref = key(one, 0, 0);
    for (const [dx, dy] of [[0, 0], [g.W, 0], [0, g.H], [g.W, g.H]]) if (key(four, dx, dy) !== ref) { f.push(`pitch ${pitch}: the 4-up piece at ${dx},${dy} differs from the single sheet`); break; }
  }
  runs++; if (f.length) bad++;
  summary.push(`${f.length ? "FAIL" : "PASS"}  ${t.id}: ${g.W} x ${g.H} mm, 91 pitches (30 to 120 mm): tile divides the sheet, rows even, the 4 pieces of the press sheet = the single sheet; press sheet ${g.sheet4.join(" x ")} mm`);
  console.log(f.length ? `    FAIL ${t.id}: ${f.slice(0, 3).join("; ")}` : `    ${t.id}: clean`);
}
if (notes.size) console.log("\nLock parts shown unbent (reported on screen, not a fault):\n  " + [...notes].join("\n  "));
console.log(`\n== ${runs} runs, ${bad} with findings ==\n` + summary.join("\n"));
