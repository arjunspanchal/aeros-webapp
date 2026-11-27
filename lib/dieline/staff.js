// STAFF RUN — one call does everything the staff screen shows: build the die from a template, clean it, audit it, check
// the size against the proven range, fold-check closures, check it can be printed and made, and say whether the files
// may be downloaded. Pure functions, no AI, same inputs -> same answer (so a saved recipe rebuilds the identical die).
import { PT_PER_MM } from "./cakebox.js";
import { TEMPLATES, templateLimits, nearestProven } from "./templates.js";
import { normalizeDie } from "./normalize.js";
import { auditDie } from "./audit.js";
import { checkHandmadeBag, checkOffsetSheet, blocked } from "./print-rules.js";
import { petGeometry, petInfoChecks } from "./pet.js";
import { wrapGeometry, wrapInfoChecks } from "./wrap.js";
import { drawerFit } from "./drawerbox.js";

const item = (id, ok, severity, title, detail) => ({ id, ok, severity, title, detail });

// The 3-cup insert exists only inside the band round the produced die; at any other size the drawer box is sleeve + tray.
export function drawerInsertFits(values) {
  const t = TEMPLATES.find((x) => x.id === "drawer-box-insert"), lim = templateLimits(t);
  return t.inputs.every((inp) => { const v = +values[inp.key]; return Number.isFinite(v) && v >= lim[inp.key][0] - 0.05 && v <= lim[inp.key][1] + 0.05; });
}

export function getTemplate(id) {
  return TEMPLATES.find((t) => t.id === id) || null;
}

// values: { [inputKey]: number|bool } in mm; board: { label, gsm, mm, family }; print: { process: "cmyk"|"pantone"|"plain", colours }
export function runStaffTemplate(templateId, values, board, print = { process: "cmyk", colours: 4 }) {
  const t = getTemplate(templateId);
  if (!t) return { error: "Unknown template" };
  const checks = [];

  // 1. size inside the proven range (interpolate, never extrapolate)
  const lim = templateLimits(t);
  for (const inp of t.inputs) {
    if (inp.type === "bool" || values[inp.key] == null || values[inp.key] === "") continue;
    const v = +values[inp.key], [lo, hi] = lim[inp.key];
    const ok = v >= lo - 0.05 && v <= hi + 0.05;
    checks.push(item(`SIZE-${inp.key}`, ok, "block", `${inp.label} within the proven range`,
      `${v} mm; proven ${lo.toFixed(0)}-${hi.toFixed(0)} mm${ok ? "" : " - outside what we have made. Ask Arjun."}`));
  }
  // 1b. a size the engine closes at, but we have never run: files open, with a plain "sample first" warning
  if (t.produced) {
    const out = t.inputs.filter((inp) => { const v = +values[inp.key], r = t.produced[inp.key]; return r && Number.isFinite(v) && (v < r[0] - 0.05 || v > r[1] + 0.05); });
    if (out.length) checks.push(item("SIZE-NOT-PRODUCED", false, "warn", "Not a size we have produced - make one sample before the die is ordered",
      `We have run this box at ${t.proven.map((q) => `${q.L} x ${q.W} x ${q.H} mm`).join(", ")} only. The die draws correctly at ${+values.L} x ${+values.W} x ${+values.H} mm, but the locks do not grow with the box (24 mm tab, 30 mm dust flaps, 17.5 mm glue flap). Cut one sample on the plotter, check the tray stays locked and slides freely, then order the die.`));
  }
  if (t.id === "drawer-box-sleeve" && values.closed) checks.push(item("CLOSED-END-NEW", false, "warn", "Closed end: snap lock, not yet made on this box - make one sample before the die is ordered",
    "The closed end is the interlocking snap lock of our single cup holder box (no glue): the bottom panel's slotted flap folds in first, then the two hook flaps, and the top panel's tongue flap locks into the slot. It is that lock stretched to this end's size; the cup holder box itself is 100 x 100 mm. A Dia 20 mm thumb cut on the top and the bottom at the open end lets the tray be pulled out. Cut one sample and check the lock holds when the tray is pushed home against it."));
  const near = nearestProven(t, values);
  if (near) checks.push(item("NEAREST", true, "info", "Nearest proven size", `${near.p.ref} (${near.d.toFixed(0)} mm away)`));

  // 2. build + clean + audit
  let doc;
  try { doc = t.build(values, board || { mm: 0.42 }); } catch (e) { return { error: `Could not build: ${e.message}`, checks }; }
  if (!doc || !doc.valid) return { error: (doc && doc.warnings && doc.warnings.join(" ")) || "Could not build this size.", checks };
  const clean = normalizeDie(doc);
  const audit = auditDie(clean);
  const counts = {};
  for (const i of audit.issues) counts[i.code] = (counts[i.code] || 0) + 1;
  const open = counts.OPEN_CUT || 0, other = audit.issues.filter((i) => i.code !== "OPEN_CUT");
  checks.push(item("AUDIT-OPEN", open <= t.openCuts, "block", "Every piece cuts free",
    open <= t.openCuts ? (open ? `${open} open cut ends = the proven die's slits/lock cuts (by design).` : "No open cut ends.") : `${open} open cut ends; the proven die has ${t.openCuts}.`));
  checks.push(item("AUDIT-RULES", other.length === 0, "block", "No doubled rules, no cut over crease, no zero-length lines",
    other.length ? other.map((i) => i.message).join(" ") : "Clean."));

  // 3. closure fold check (cake boxes)
  if (t.closure && doc.blank.closure) {
    const c = doc.blank.closure, mm = (v) => (v / PT_PER_MM).toFixed(1);
    checks.push(item("FOLD", c.sideFlapGapPt >= 0 && c.slitPt > c.tabRootPt, "block", "Box closes (side flaps clear, tab fits its slit)",
      `side-flap gap ${mm(c.sideFlapGapPt)} mm; slit ${mm(c.slitPt)} vs tab ${mm(c.tabRootPt)} mm.`));
  }
  for (const w of doc.warnings || []) checks.push(item("ENGINE", true, "warn", "Engine note", w));

  // 3b. drawer box = sleeve + tray + insert from ONE size: say so on every part, and check the three fit on this board
  if (t.drawerSet) {
    const mm = (board && +board.mm) || 0.42, f = drawerFit({ L: +values.L, W: +values.W, H: +values.H }, mm), ins = drawerInsertFits(values);
    checks.push(item("DRAWER-SET", true, "info", ins ? "Drawer box = three parts at the same size" : "Drawer box = sleeve + tray at the same size (no cup insert at this size)",
      ins ? `Make the sleeve, the tray and the cup insert with the same three numbers (${+values.L} x ${+values.W} x ${+values.H} mm = the tray's inside). Each has its own template in this group.${values.closed ? " The sleeve is set to CLOSED AT ONE END." : ""}`
        : `Make the sleeve and the tray with the same three numbers (${+values.L} x ${+values.W} x ${+values.H} mm = the tray's inside). The 3-cup insert is made for one tray only (about 203 x 71 x 42 mm) and is not part of this box.${values.closed ? " The sleeve is set to CLOSED AT ONE END." : ""}`));
    const tight = [["tray in the sleeve, across", f.playAcross], ["tray under the sleeve's top", f.playHeight], ...(ins ? [["insert between the side walls", f.insertPlayAcross], ["insert between the end walls", f.insertPlayLength]] : [])].filter(([, v]) => v < 0);
    checks.push(item("DRAWER-FIT", tight.length === 0, "warn", ins ? "The three parts fit each other on this board" : "The tray fits the sleeve on this board",
      `On ${mm} mm board: tray ${f.trayOutside[0]} x ${f.trayOutside[1]} outside in a sleeve ${f.sleeveInside[0]} x ${f.sleeveInside[1]} inside = ${f.playAcross} mm play a side, ${f.playHeight} mm under the top${ins ? `; insert ${f.insertPlayAcross} mm a side, ${f.insertPlayLength} mm an end; platform ${f.platformAbove} mm above the base` : ""}.`
      + (tight.length ? ` TOO TIGHT: ${tight.map(([n, v]) => `${n} ${v} mm`).join("; ")} - use a thinner board or ask Arjun.` : "")));
  }

  // 4. printable + makeable
  const blankW = clean.blank.widthPt / PT_PER_MM, blankH = clean.blank.heightPt / PT_PER_MM;
  const process = print.process === "plain" ? "plain" : print.process;
  const cupItems = () => [
    item("CUP-DIE", true, "info", "Die = the Aeros KLD, never redrawn", `${t.proven[0].ref}. Cut, fold, bleed and limit lines are taken verbatim from the KLD template.`),
    item("CUP-ROUTE", true, "info", "Print route", t.routeNote || "Offset up to 25,000 cups, flexo above."),
    item("CUP-NEST", true, "info", t.nest ? "Printer's set" : "Single-up files", t.nest ? "LAYOUT, ARTWORK-PUNCH and PUNCH are made on the printer's own nested sheet, taken verbatim from their punch file." : "This screen makes the one-cup artwork files only."),
    ...(process === "pantone" ? [item("OS-23", (+print.colours || 0) <= 4, "block", "Pantone colours: 4 at most", `${+print.colours || 0} Pantone.`)] : []),
  ];
  const pr = t.family === "wrap" ? { items: wrapInfoChecks(wrapGeometry(t.wrap), print, board), fits: null, best: null } : t.family === "pet" ? { items: petInfoChecks(petGeometry(t.pet), print), fits: null, best: null } : t.family === "cup" ? { items: cupItems(), fits: null, best: null } : t.family === "bag"
    ? checkHandmadeBag({ W: +values.W, G: +values.G, H: +values.H, half: !!values.half, blankW, blankH, colours: +print.colours || 0, process })
    : checkOffsetSheet({ blankW, blankH, kind: t.id.startsWith("food") ? "foodbox" : t.id.startsWith("mailer") ? "mailer" : "box", colours: +print.colours || 0, process });
  checks.push(...pr.items);

  // 2-piece bags (Arjun 21-Nov-2026: "We will need data mentioning that this bag will be made in 2 pieces")
  const twoPiece = t.family === "bag" && !!values.half;
  const construction = twoPiece ? "2-piece" : "1-piece";
  const best = pr.best || null;
  if (twoPiece) checks.push(item("2-PIECE", true, "info", "Made in 2 pieces",
    `Two identical halves per bag from this one die (seam + face + gusset each), glued at both side seams. Order halves = 2 x bags.${!best ? "" : best.ups === 1 ? ` Only 1 half fits a sheet (${best.sheet}), so each bag takes 2 sheets.` : ` ${best.ups} halves per sheet = ${Math.floor(best.ups / 2)} bag${Math.floor(best.ups / 2) === 1 ? "" : "s"} per sheet${best.ups % 2 ? " (one half left over)" : ""}.`}`));
  const piecesPerBag = twoPiece ? 2 : 1;
  const bagsPerSheet = best ? best.ups / piecesPerBag : 0; // 0.5 = 2 sheets per bag

  const isBlocked = blocked(checks);
  return {
    template: t, doc: clean, audit, checks, blocked: isBlocked,
    blankMm: [+blankW.toFixed(1), +blankH.toFixed(1)], sheetFits: pr.fits, bestSheet: best,
    construction, piecesPerBag, bagsPerSheet,
    // one line every KLD carries in its footer
    kldNote: twoPiece ? "2-PIECE BAG: 2 identical halves per bag from this die" : "",
    recipe: { template: t.id, values, construction, piecesPerBag, board: board ? { id: board.id || null, label: board.label, gsm: board.gsm, mm: board.mm, caliperStatus: board.caliperStatus || null } : null, print, engineVersion: 1 },
  };
}

export function fileStem({ template, values, board }) {
  const dims = template.inputs.filter((i) => i.type !== "bool" && values[i.key] != null && values[i.key] !== "" && !(i.optional && +values[i.key] === 0)).map((i) => Math.round(+values[i.key])).join("x");
  const b = board && board.gsm ? `-${board.gsm}gsm` : "";
  return `${template.id}${dims ? `-${dims}mm` : ""}${b}${values.half ? "-2PC" : ""}${values.closed && template.id === "drawer-box-sleeve" ? "-CLOSED-END" : ""}`;
}
