// DELI WRAP SHEETS - the ALL-OVER-REPEAT family. A port of the house standard (KLD Templates / Wrap Sheets / README.md,
// _src/gen_wrap_sheet.py, studio-rules/rules/35-deli-wraps.md), same arithmetic:
//   - a wrap is a flat sheet FOLDED ROUND FOOD by hand, any way up: no face, no front, no centre, no safe zone, no curve,
//     no seam, NO Aeros mark (there is no hidden strip)
//   - THE ONE RULE: the art is an all-over repeat whose TILE DIVIDES THE SHEET EXACTLY - Px = W / nx, Py = H / ny, ny EVEN,
//     rows half-drop staggered. So every sheet is identical, the 4-up press sheet is one continuous field with butt cuts
//     (no gutters: guillotine drift only slides the pattern), and the same tile steps on a flexo cylinder
//   - rows A = the full lockup centred in each tile (always whole); rows B = a small mark on the tile corners - the only
//     thing a cut ever splits, identically on opposite edges. No small mark = plain half-drop rows of the lockup
//   - bleed 3 mm past every cut; the pattern runs to the bleed
//   - routes (Arjun 24-Sep-2026): below 20,000 pcs = plain white sheets in stock, printed 4-up offset; above = flexo on
//     the reel (the cylinder file is made by Arjun, not here)
import { PT_PER_MM } from "./cakebox.js";

export const WRAP_BLEED = 3, WRAP_MARGIN = 12; // 4-up: bleed, then a 12 mm margin for trim marks / registration / gripper
export const WRAP_SHEETS = {
  w254: { W: 254, H: 254, inch: "10 x 10 in", sku: "WRAP-031 / WRAP-032 (kraft / white)" },
  w305: { W: 305, H: 305, inch: "12 x 12 in", sku: "WRAP-015 / WRAP-016 (kraft / white)" },
  w300: { W: 300, H: 360, inch: "12 x 14 in", sku: "WRAP-035 / WRAP-036 (kraft / white)" },
  // 380 x 370 (Arjun 27-Nov-2026): not a listed size. 4-up would be 790 x 770 mm, wider than any press we use (Blueline
  // 622 x 902, Lucky 698 x 965), so it prints 2-UP: two sheets one above the other, 410 x 770 mm. The one inner cut is
  // horizontal - it runs in a row gap, the cleanest butt cut (house gate G3).
  w380: { W: 380, H: 370, inch: "15 x 14.5 in", sku: "custom size - not in the listing", up: 2 },
};
const item = (id, ok, severity, title, detail) => ({ id, ok, severity, title, detail });
const r2 = (v) => Math.round(v * 100) / 100;

export function wrapGeometry(id) {
  const c = WRAP_SHEETS[id];
  if (!c) return null;
  // the press sheet: 4-up = 2 x 2 (the house standard); 2-up = 1 across x 2 down, for a sheet too big to go 4-up
  const up = c.up || 4, cols = up === 4 ? 2 : 1, rows = 2, pad = 2 * (WRAP_BLEED + WRAP_MARGIN);
  const press = [cols * c.W + pad, rows * c.H + pad];
  return { id, ...c, up, cols, rows, label: `Deli wrap sheet ${c.W} x ${c.H} mm (${c.inch})`, sheet4: press, pressSheet: press, pitch0: Math.round(c.W / 5) };
}

/** the "die" of a wrap sheet = its cut rectangle, in the shape every engine returns */
export function buildWrapDieline(id) {
  const g = wrapGeometry(id);
  if (!g) return { segments: [], blank: null, warnings: ["Unknown wrap sheet."], valid: false };
  const S = PT_PER_MM, W = g.W * S, H = g.H * S, line = (a, b) => ({ layer: "cut", kind: "l", pts: [a, b] });
  return { valid: true, warnings: [], segments: [line([0, 0], [W, 0]), line([W, 0], [W, H]), line([W, H], [0, H]), line([0, H], [0, 0])],
    blank: { widthPt: W, heightPt: H, style: "wrap", wrap: id },
    dims: [{ x1: 0, y1: -12, x2: W, y2: -12, valuePt: W, rotated: false }, { x1: W + 14, y1: 0, x2: W + 14, y2: H, valuePt: H, rotated: true }],
    meta: { wrap: id, W: g.W, H: g.H } };
}

/** tile_plan() of the house script: the tile nearest the target pitch that divides the sheet, rows even */
export function tilePlan(W, H, pitch, rowRatio = 0.85) {
  const p = Math.max(10, +pitch || 0);
  const nx = Math.max(1, Math.round(W / p));
  let ny = Math.max(2, Math.round(H / (p * rowRatio)));
  if (ny % 2) ny += H / (ny + 1) >= p * 0.6 ? 1 : -1;
  ny = Math.max(2, ny);
  return { nx, ny, Px: W / nx, Py: H / ny };
}

/**
 * pattern() of the house script. items = the job's layers: a colour ground (kind "flood") if any, the lockup (rep "A")
 * and the small mark (rep "B", optional). field = [x0, y0, x1, y1] mm to cover (a sheet + bleed, or the 4-up field +
 * bleed); origin = the top-left CUT corner of a sheet. Returns placed copies, ready for the screen and the print files.
 */
export function expandWrap(items, plan, field, origin = [0, 0]) {
  const out = items.filter((i) => i.kind === "flood");
  const A = items.find((i) => i.rep === "A" && i.kind !== "flood"), B = items.find((i) => i.rep === "B" && i.kind !== "flood");
  if (!A) return out;
  const [fx0, fy0, fx1, fy1] = field, [ox, oy] = origin, { Px, Py } = plan;
  const i0 = Math.floor((fx0 - ox) / Px) - 1, i1 = Math.ceil((fx1 - ox) / Px) + 1, j0 = Math.floor((fy0 - oy) / Py) - 1, j1 = Math.ceil((fy1 - oy) / Py) + 1;
  for (let j = j0; j <= j1; j++) {
    const cy = oy + (j + 0.5) * Py, even = ((j % 2) + 2) % 2 === 0;
    for (let i = i0; i <= i1; i++) {
      const src = even ? A : B || A, cx = even ? ox + (i + 0.5) * Px : ox + i * Px;
      if (cx + src.w / 2 < fx0 || cx - src.w / 2 > fx1 || cy + src.h / 2 < fy0 || cy - src.h / 2 > fy1) continue;
      out.push({ ...src, id: `${src.id}@${i},${j}`, x: r2(cx), y: r2(cy), rot: 0, repeat: true, role: "wrap" });
    }
  }
  return out;
}

/** what the screen says about the sheet and its print route */
export function wrapInfoChecks(g, print, board) {
  const [sw, sh] = g.sheet4, kraft = /kraft|brown/i.test(`${board?.label || ""}`);
  return [
    item("WRAP-SHEET", true, "info", "Sheet", `${g.label}, ${g.sku}. A flat sheet folded round food, any way up: the artwork is an all-over repeat with no face, no centre and no safe zone.`),
    item("WRAP-ROUTE", true, "info", "Print route", `Below 20,000 pcs: plain white sheets from stock, printed ${g.up}-up offset. Above 20,000: flexo on the reel - that cylinder file is made by Arjun, not on this screen.`),
    item("WRAP-4UP", true, "info", `${g.up}-up press sheet`, `${g.cols} x ${g.rows}, butt cut, no gutters: ${sw} x ${sh} mm (the cut field ${g.cols * g.W} x ${g.rows * g.H} + ${WRAP_BLEED} mm bleed + ${WRAP_MARGIN} mm margin). This is the MINIMUM parent sheet - the printer confirms the stock sheet.`
      + (g.up === 2 ? ` This size cannot go 4-up: that sheet would be ${2 * g.W + 2 * (WRAP_BLEED + WRAP_MARGIN)} x ${2 * g.H + 2 * (WRAP_BLEED + WRAP_MARGIN)} mm, wider than any press we use.` : "")),
    item("WRAP-NO-AEROS", true, "info", "No Aeros mark on a wrap sheet", "There is no hidden strip to carry it."),
    ...(kraft ? [item("WRAP-KRAFT", false, "warn", "Kraft sheet: every ink lays over brown", "There is no white base. Say so on the proof and ask for a draw-down (navy on kraft reads near black).")] : []),
    ...(print.process === "pantone" && +print.colours > 2 ? [item("WRAP-INKS", false, "warn", "More than two colours on a wrap", "One or two spot colours are the norm on 38 gsm food paper. Confirm with the press.")] : []),
  ];
}

/** the gates of the repeat itself (G1 of check_wrap.py + the size rules of the family) */
export function wrapArtChecks(g, plan, items) {
  const { nx, ny, Px, Py } = plan, out = [];
  const A = items.find((i) => i.rep === "A" && i.kind !== "flood"), B = items.find((i) => i.rep === "B" && i.kind !== "flood"), extra = items.filter((i) => i.kind !== "flood" && i !== A && i !== B);
  const divides = Math.abs(nx * Px - g.W) < 1e-6 && Math.abs(ny * Py - g.H) < 1e-6 && ny % 2 === 0;
  out.push(item("WRAP-G1", divides, "block", "The repeat tile divides the sheet exactly, rows even", `Tile ${Px.toFixed(2)} x ${Py.toFixed(2)} mm = ${nx} across x ${ny} down: every sheet is identical and the ${g.up}-up butt cut is seamless.`));
  if (!A) { out.push(item("WRAP-LOCKUP", false, "block", "The lockup (rows A) is chosen", "Add the logo file: the first one added becomes the lockup.")); return out; }
  const fitA = A.w <= Px - 2 && A.h <= Py - 2;
  out.push(item("WRAP-FIT-A", fitA, "block", `"${A.name}" fits its tile`, fitA ? `${A.w.toFixed(1)} x ${A.h.toFixed(1)} mm in a ${Px.toFixed(1)} x ${Py.toFixed(1)} mm tile: whole on every sheet, never cut.` : `${A.w.toFixed(1)} x ${A.h.toFixed(1)} mm does not fit a ${Px.toFixed(1)} x ${Py.toFixed(1)} mm tile with 1 mm clear each side. Make the lockup narrower or raise the pitch.`));
  out.push(item("WRAP-SIZE-A", A.w >= 45 && A.w <= 61, "warn", "Lockup 45 to 60 mm wide", `${A.w.toFixed(1)} mm. The family runs lockups 45 to 60 mm wide (Moonbeam 48, Brewburg 61).`));
  if (B) {
    const fitB = B.w <= Px - 2 && B.h <= Py - 2 && A.h / 2 + B.h / 2 <= Py - 1;
    out.push(item("WRAP-FIT-B", fitB, "block", `"${B.name}" clears the lockup rows`, fitB ? `${B.w.toFixed(1)} x ${B.h.toFixed(1)} mm on the tile corners: split by the cut, identically on opposite edges (it rejoins when the sheet is wrapped).` : "The small mark runs into the lockup rows or is wider than a tile. Make it smaller or raise the pitch."));
    out.push(item("WRAP-SIZE-B", B.w >= 9 && B.w <= 13, "warn", "Small mark 9 to 13 mm", `${B.w.toFixed(1)} mm. Under 9 mm it reads too faint; over 13 it stops being the small mark.`));
  } else out.push(item("WRAP-NO-B", true, "info", "No small mark", "Rows B repeat the lockup, half a tile across (plain half-drop rows). Add a second file for a small mark on the tile corners."));
  if (extra.length) out.push(item("WRAP-EXTRA", false, "block", "A repeat has two elements at most", `${extra.map((i) => `"${i.name}"`).join(", ")} ${extra.length === 1 ? "is" : "are"} not in the repeat. Remove ${extra.length === 1 ? "it" : "them"}, or make it the lockup or the small mark.`));
  if (items.some((i) => i.kind === "flood")) out.push(item("WRAP-GROUND", false, "warn", "Full colour ground on 38 gsm paper", "Heavy ink on a thin sheet strikes through and curls. Allowed, but confirm with the press."));
  if (items.some((i) => i.kind === "raster" && i.rep)) out.push(item("WRAP-RASTER", false, "warn", "A picture in the repeat", "A picture prints as a CMYK build, not as one plate. The vector logo is needed for a true spot-colour file (or trace it)."));
  return out;
}
