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
  if (t.route === "cup") continue;
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
  const badC = list.filter((c) => !c.ok);
  runs++; if (badC.length) bad++;
  summary.push(`${badC.length ? "FAIL" : "PASS"}  ${t.id}: fan ${g.w} x ${g.h} mm -> ${g.wall === "double" ? "wrap" : "cup"} ${f.rimDia.toFixed(2)} / ${f.baseDia.toFixed(2)} x ${f.wallHeight.toFixed(2)} mm, taper ${f.taperDeg.toFixed(2)} deg (spec TD ${s.TD} / BD ${s.BD} / H ${s.H})`);
  console.log(badC.length ? badC.map((c) => `    FAIL ${t.id}: ${c.title} - ${c.detail}`).join("\n") : `    ${t.id}: clean`);
}
if (notes.size) console.log("\nLock parts shown unbent (reported on screen, not a fault):\n  " + [...notes].join("\n  "));
console.log(`\n== ${runs} runs, ${bad} with findings ==\n` + summary.join("\n"));
