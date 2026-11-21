// Digital sample sheets for cups: no fan may touch the next one, and every fan's whole cut outline must be on the sheet.
import { writeFileSync } from "node:fs";
import { TEMPLATES } from "../lib/dieline/templates.js";
import { runStaffTemplate } from "../lib/dieline/staff.js";
import { cupGeometry, fromPolar } from "../lib/dieline/cup.js";
import { planDigital, digitalSamplePdf, DIGITAL } from "../lib/dieline/designer/digital-pdf.js";
const out = process.argv[2];
let bad = 0;
for (const t of TEMPLATES.filter((x) => x.route === "cup")) {
  const res = runStaffTemplate(t.id, {}, { mm: 0.3, gsm: 280 }), g = cupGeometry(t.cup), plan = planDigital({ doc: res.doc, blank: { w: res.blankMm[0], h: res.blankMm[1] }, cup: g });
  if (plan.error) { console.log("FAIL", t.id, plan.error); bad++; continue; }
  // outline of one fan (cut envelope incl. bleed), sampled; the same outline one pitch lower; smallest distance between them
  const Rt = Math.max(g.rTop, g.bleed.rMax), Rb = Math.min(g.rBot, g.bleed.rMin), a0 = Math.min(g.aLeft, g.limit.aMin) - 0.01, a1 = Math.max(g.aRight, g.limit.aMax) + 0.01, N = 400, A = [], B = [];
  for (let i = 0; i <= N; i++) { const a = a0 + ((a1 - a0) * i) / N; A.push(fromPolar(g, Rb, a)); const q = fromPolar(g, Rt, a); B.push([q[0], q[1] + plan.pitch]); }
  let gap = Infinity; for (const p of A) for (const q of B) gap = Math.min(gap, Math.hypot(p[0] - q[0], p[1] - q[1]));
  const last = plan.sheets[0][plan.sheets[0].length - 1], P0 = plan.pieces[0];
  // a turned fan (tubs) lies across the sheet: its far side must be inside the right margin, its length inside the sheet height
  const foot = plan.turned ? last.x + P0.h : last.y + P0.h, room = plan.turned ? DIGITAL.w - DIGITAL.margin : DIGITAL.h - DIGITAL.margin;
  const ok = gap >= 2.9 && foot <= room + 0.01 && P0.box[3] >= g.h - 0.01 && (!plan.turned || (plan.sheets[0].every((q) => q.rot === 90 && q.x >= DIGITAL.margin - 0.01 && q.y >= DIGITAL.margin + DIGITAL.head - 0.01 && q.y + P0.w <= DIGITAL.h - DIGITAL.margin + 0.01)));
  if (!ok) bad++;
  console.log(`${ok ? "PASS" : "FAIL"} ${t.id}: ${plan.ups}-up, pitch ${plan.pitch.toFixed(1)} mm (fan ${g.w.toFixed(0)} x ${g.h.toFixed(0)}), closest ${gap.toFixed(2)} mm between fans, last fan ends ${foot.toFixed(0)} of ${plan.turned ? `${DIGITAL.w} mm across (turned)` : `${DIGITAL.h} mm`}`);
  if (out) writeFileSync(`${out}/${t.id}.pdf`, digitalSamplePdf({ doc: res.doc, plan, images: [null], cutOnly: true, head: { title: `AEROS - test - ${t.name} - DIGITAL SAMPLE`, lines: [["ITEM", plan.note]], assembly: t.digital.assembly } }), "latin1");
}
process.exit(bad ? 1 : 0);
