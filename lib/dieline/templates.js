// STAFF TEMPLATES — the only dies staff can make without Arjun. Each template is a proven construction with:
//   proven   the real sizes it has been made at (SKUs in master_products or dies filed in Aeros Artworks), in mm
//   range    min..max of the proven sizes per input: staff may interpolate between proven sizes, never extrapolate
//   fixed    inputs that are locked (they belong to the die, not the order)
//   openCuts the open cut ends the proven die carries by design (lock slits, traced gaps), counted AFTER normalisation;
//            more than this at any size = blocked
// Everything here is data; the maths lives in the engines, normalize.js and audit.js.
import { buildSosbagDieline } from "./sosbag.js";
import { buildDcutbagDieline } from "./dcutbag.js";
import { buildFoodboxDieline } from "./foodbox.js";
import { buildBurgerboxDieline } from "./burgerbox.js";
import { buildCakeboxDieline } from "./cakebox.js";
import { buildCupholderboxDieline } from "./cupholderbox.js";
import { buildTuckboxDieline } from "./tuckbox.js";
import { buildCupDieline } from "./cup.js";

const IN = 25.4;
const rangeOf = (sizes, key) => [Math.min(...sizes.map((s) => s[key])), Math.max(...sizes.map((s) => s[key]))];

export const TEMPLATES = [
  {
    id: "sos-handmade",
    name: "SOS paper bag, hand-made (sheet punched)",
    family: "bag",
    route: "offset-sheet-handmade",
    build: (v, board) => buildSosbagDieline({ W: v.W, G: v.G, H: v.H, top: v.top || 0, half: !!v.half, holes: v.holes || 0, holeDrop: v.holeDrop || 20, holeD: v.holeD || 8 }),
    inputs: [
      { key: "W", label: "Width (front)", unit: "mm" },
      { key: "G", label: "Gusset", unit: "mm" },
      { key: "H", label: "Height", unit: "mm" },
      { key: "top", label: "Top fold / hem (0 = none)", unit: "mm", optional: true, range: [0, 50] },
      { key: "half", label: "2-piece (two halves per bag)", type: "bool", optional: true },
    ],
    proven: [
      { W: 105, G: 65, H: 165, ref: "SOS-001" }, { W: 127, G: 73, H: 271, ref: "SOS-002" }, { W: 127, G: 90, H: 280, ref: "SOS-003" },
      { W: 130, G: 90, H: 310, ref: "SOS-004" }, { W: 180, G: 130, H: 270, ref: "SOS-005" }, { W: 215, G: 120, H: 330, ref: "SOS-006" },
      { W: 230, G: 125, H: 335, ref: "SOS-007" }, { W: 165, G: 102, H: 229, ref: "SOS-008" }, { W: 190, G: 127, H: 305, ref: "SOS-009" },
      { W: 240, G: 120, H: 350, ref: "SOS-010" }, { W: 300, G: 178, H: 315, ref: "SOS-011" }, { W: 245, G: 178, H: 255, ref: "SOS-012 / Food Monkey" },
      { W: 178, G: 178, H: 254, ref: "Torta Haus 7x7x10" }, { W: 216, G: 127, H: 292, ref: "Nawaabs small" }, { W: 216, G: 127, H: 330, ref: "Pasay" },
      { W: 203, G: 127, H: 254, ref: "Perfume Gallery" },
    ],
    openCuts: 0,
    notes: "Straight top (hand-made bags never get the serrated top). Bottom = Aeros DRNK hand-made bottom, G/2 + 29.6.",
  },
  {
    id: "dcut-bag",
    name: "D-cut handle bag (DCB), hand-made",
    family: "bag",
    route: "offset-sheet-handmade", // Arjun 21-Nov-2026: D-cut bags are manual and follow the Aeros Listing sizes
    build: (v) => buildDcutbagDieline({ L: v.W, W: v.G, H: v.H, half: !!v.half }),
    inputs: [
      { key: "W", label: "Width", unit: "mm" }, { key: "G", label: "Gusset", unit: "mm" }, { key: "H", label: "Height", unit: "mm" },
      { key: "half", label: "2-piece (two halves per bag)", type: "bool", optional: true }, // Arjun 21-Nov-2026: DCB-002 = 2-piece
    ],
    proven: [{ W: 210, G: 140, H: 335, ref: "DCB-001" }, { W: 295, G: 150, H: 300, ref: "DCB-002" }],
    openCuts: 0,
  },
  {
    id: "food-box-front-lock",
    name: "Front-lock food box (FB)",
    family: "box",
    route: "offset-sheet",
    build: (v) => buildFoodboxDieline({ L: v.L, W: v.W, H: v.H, taper: v.taper }),
    inputs: [
      { key: "L", label: "Top length", unit: "mm" }, { key: "W", label: "Top width", unit: "mm" }, { key: "H", label: "Height", unit: "mm" },
      { key: "taper", label: "Wall flare per side", unit: "mm" },
    ],
    proven: [
      { L: 144, W: 104, H: 40, taper: 7, ref: "FB-032..035 500 mL" }, { L: 164, W: 114, H: 45, taper: 7, ref: "FB-030/031/036/037 750 mL" },
      { L: 200, W: 139, H: 50, taper: 10, ref: "FB-028/029/038/039 1000 mL" },
    ],
    openCuts: 8,
  },
  {
    id: "burger-box",
    name: "Burger clamshell box (BRB)",
    family: "box",
    route: "offset-sheet",
    build: (v) => buildBurgerboxDieline({ L: v.L, W: v.W, H: v.H }),
    inputs: [{ key: "L", label: "Width", unit: "mm" }, { key: "W", label: "Depth", unit: "mm" }, { key: "H", label: "Wall height", unit: "mm" }],
    proven: [{ L: 102, W: 102, H: 39, ref: "BRB-001..004 (Zepto production die)" }],
    tolerancePct: 10, // single proven size: allow +/-10 % (the engine band-scales the production die)
    openCuts: 11,
  },
  {
    id: "cake-box",
    name: "Cake / pastry box, lock-corner (CPB)",
    family: "box",
    route: "offset-sheet",
    build: (v) => buildCakeboxDieline({ L: v.L / IN, W: v.W / IN, H: v.H / IN, units: "in" }),
    closure: true, // blank.closure must pass the fold check
    inputs: [{ key: "L", label: "Length", unit: "mm" }, { key: "W", label: "Width", unit: "mm" }, { key: "H", label: "Height", unit: "mm" }],
    proven: [
      [4, 4, 4], [6, 4.5, 2.75], [5, 3, 5], [5, 5, 3], [6, 6, 3], [8, 5, 3], [5.5, 5.5, 4], [8, 8, 2.5], [10, 6, 3.5], [9.5, 5, 5],
      [9, 9, 3], [10, 10, 2.5], [8, 8, 4], [8, 8, 5], [9, 9, 4], [10, 10, 4], [10, 10, 5], [12, 12, 4], [10, 10, 6],
      [12, 12, 5],
      // NOT makeable as one-piece lock-corner on any standard sheet (blank > 901.7 mm Blueline / 965 Lucky), so left out of the
      // range although listed: 14x10x4, 14x10x5, 12x12x6, 14x10x6.5, 19x14x4, 14x14x6, 16x16x5, 19x14x5, 26.5x18.5x3, 26x18.5x4 in
      // (their listing blanks were estimates; 21-Nov-2026 check).
    ].map(([L, W, H]) => ({ L: L * IN, W: W * IN, H: H * IN, ref: `CPB ${L}x${W}x${H} in` })),
    openCuts: 4,
  },
  {
    id: "cup-holder-box",
    name: "Single cup holder box with handle (CHB)",
    family: "box",
    route: "offset-sheet",
    build: (v) => buildCupholderboxDieline({ L: 100, W: 100, H: v.H }),
    inputs: [{ key: "H", label: "Body height", unit: "mm" }],
    fixed: { L: 100, W: 100 },
    proven: [{ H: 145, ref: "CHB reference print layout" }, { H: 165, ref: "CHB-001..004" }],
    openCuts: 0,
  },
  {
    id: "mailer-0427",
    name: "Mailer / tuck box 0427 (Chuim type)",
    family: "box",
    route: "offset-sheet",
    build: (v, board) => buildTuckboxDieline({ L: v.L, W: v.W, H: v.H, thickness: board.mm, units: "mm" }),
    usesBoard: true,
    inputs: [{ key: "L", label: "Length (inside)", unit: "mm" }, { key: "W", label: "Width (inside)", unit: "mm" }, { key: "H", label: "Height (inside)", unit: "mm" }],
    proven: [
      { L: 152.4, W: 152.4, H: 50.8, ref: "die family 6x6x2 in" }, { L: 152.4, W: 101.6, H: 50.8, ref: "die family 6x4x2 in" },
      { L: 152.4, W: 50.8, H: 50.8, ref: "die family 6x2x2 in" }, { L: 156, W: 145, H: 60, ref: "66 Chuim mailer" },
      { L: 356, W: 128, H: 64, ref: "66 Chuim steak box" }, { L: 230, W: 185, H: 55, ref: "Mog Mog dim sum" }, { L: 165, W: 125, H: 55, ref: "Mog Mog 165" },
    ],
    openCuts: 0,
  },
  {
    id: "cup-sw-8oz",
    name: "Paper cup, 8 oz (250 mL) single wall",
    family: "cup",
    route: "cup",
    cup: "sw8", // die = KLD template lines verbatim (cup-kld-refs.js); a cup die is never drawn by formula
    build: () => buildCupDieline("sw8"),
    inputs: [],
    proven: [{ ref: "KLD-CUP-08SW v1 (TD 80 / BD 56 / H 95 mm)" }],
    openCuts: 1, // the KLD's own corner cap overlap
    notes: "Fixed die. Artwork follows the cup rules of the artwork cortex (joint 8 mm, 15 mm above the bottom fold, nothing in the rim curl).",
  },
];

// size limits of a template = span of its proven sizes (or +/- tolerance around a single proven size)
export function templateLimits(t) {
  const out = {};
  for (const inp of t.inputs) {
    if (inp.type === "bool") continue;
    if (inp.range) { out[inp.key] = inp.range; continue; }
    const [lo, hi] = rangeOf(t.proven, inp.key);
    const tol = t.tolerancePct ? (t.tolerancePct / 100) : 0;
    out[inp.key] = [lo * (1 - tol), hi * (1 + tol)];
  }
  return out;
}

export function nearestProven(t, v) {
  let best = null;
  for (const p of t.proven) {
    const d = Math.sqrt(t.inputs.filter((i) => i.type !== "bool" && p[i.key] != null).reduce((s, i) => s + ((v[i.key] || 0) - p[i.key]) ** 2, 0));
    if (!best || d < best.d) best = { d, p };
  }
  return best;
}
