// STAFF RUN — one call does everything the staff screen shows: build the die from a template, clean it, audit it, check
// the size against the proven range, fold-check closures, check it can be printed and made, and say whether the files
// may be downloaded. Pure functions, no AI, same inputs -> same answer (so a saved recipe rebuilds the identical die).
import { PT_PER_MM } from "./cakebox.js";
import { TEMPLATES, templateLimits, nearestProven } from "./templates.js";
import { normalizeDie } from "./normalize.js";
import { auditDie } from "./audit.js";
import { checkHandmadeBag, checkOffsetSheet, blocked } from "./print-rules.js";

const item = (id, ok, severity, title, detail) => ({ id, ok, severity, title, detail });

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

  // 4. printable + makeable
  const blankW = clean.blank.widthPt / PT_PER_MM, blankH = clean.blank.heightPt / PT_PER_MM;
  const process = print.process === "plain" ? "plain" : print.process;
  const cupItems = () => [
    item("CUP-DIE", true, "info", "Die = the Aeros KLD, never redrawn", `${t.proven[0].ref}. Cut, fold, bleed and limit lines are taken verbatim from the KLD template.`),
    item("CUP-ROUTE", true, "info", "Print route", "Up to 25,000 cups: offset. Over 25,000: flexo on the 250 mL single-wall master plate (108 T, reel 870, 12-up) - that plate is K100 only and must pass the master-plate gate."),
    item("CUP-NEST", true, "info", "Single-up files", "This screen makes the one-cup artwork files. The 12-up plate / sheet is set from the master layout, not from a grid."),
    ...(process === "pantone" ? [item("OS-23", (+print.colours || 0) <= 4, "block", "Pantone colours: 4 at most", `${+print.colours || 0} Pantone.`)] : []),
  ];
  const pr = t.family === "cup" ? { items: cupItems(), fits: null, best: null } : t.family === "bag"
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
  const dims = template.inputs.filter((i) => i.type !== "bool" && values[i.key] != null && values[i.key] !== "").map((i) => Math.round(+values[i.key])).join("x");
  const b = board && board.gsm ? `-${board.gsm}gsm` : "";
  return `${template.id}${dims ? `-${dims}mm` : ""}${b}${values.half ? "-2PC" : ""}`;
}
