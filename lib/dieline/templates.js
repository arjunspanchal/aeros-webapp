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
import { buildPetDieline } from "./pet.js";

const IN = 25.4;
const rangeOf = (sizes, key) => [Math.min(...sizes.map((s) => s[key])), Math.max(...sizes.map((s) => s[key]))];

// the picker shows one group at a time (Arjun 21-Nov-2026: "the template selection is getting cluttered")
export const TEMPLATE_GROUPS = [
  { family: "bag", label: "Paper bags" }, { family: "box", label: "Boxes" }, { family: "cup", label: "Paper cups" }, { family: "pet", label: "PET cups" },
];

export const TEMPLATES = [
  {
    id: "sos-handmade",
    short: "SOS bag", // the name on the picker; the full name goes on files
    digital: { assembly: ["Glue the side seam: the plain strip goes INSIDE the last gusset.", "Bottom: fold the two gusset flaps in, then the front flap, then the back flap over it; glue.", "If there is a top fold, turn it down inside before gluing the side seam."] }, // hand make-up notes for the 13 x 19 in digital sample
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
    short: "D-cut handle bag", // the name on the picker; the full name goes on files
    digital: { assembly: ["Glue the side seam: the plain strip goes INSIDE the last gusset.", "Bottom: fold the two gusset flaps in, then the two face flaps one over the other; glue.", "Push the D-cut handle out."] }, // hand make-up notes for the 13 x 19 in digital sample
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
    short: "Front-lock food box", // the name on the picker; the full name goes on files
    digital: { assembly: ["Fold the four walls up.", "Turn each corner flap round its corner and paste it on the INSIDE of the side wall.", "Close the lid: its lip drops over the front wall."] }, // hand make-up notes for the 13 x 19 in digital sample
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
    short: "Burger clamshell", // the name on the picker; the full name goes on files
    digital: { assembly: ["Fold the walls of the base and of the lid up; paste each corner ear on the inside of its neighbour wall.", "Close the lid over the base."] }, // hand make-up notes for the 13 x 19 in digital sample
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
    short: "Cake / pastry box", // the name on the picker; the full name goes on files
    digital: { assembly: ["No glue. Fold the four panels into a tube; the tuck flap goes inside the far side wall.", "Each end: fold the two side flaps in, then the base flap, then the lid flap, and push its tab into the slit."] }, // hand make-up notes for the 13 x 19 in digital sample
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
    short: "Cup holder box", // the name on the picker; the full name goes on files
    digital: { assembly: ["Paste the glue flap inside the last side panel.", "Bottom: the slotted flap first, then the two hooks, then the tongue.", "Top: fold the two lid halves in, stand the handle caps up, fold the side triangles over them."] }, // hand make-up notes for the 13 x 19 in digital sample
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
    short: "Mailer / tuck box", // the name on the picker; the full name goes on files
    digital: { assembly: ["No glue. Fold the side walls up and roll each over its dust flaps; press the tabs into the base slots.", "Close the lid and tuck the front flap in."] }, // hand make-up notes for the 13 x 19 in digital sample
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
    short: "8 oz single wall", // the name on the picker; the full name goes on files
    digital: { assembly: ["Wrap one fan round a plain white cup of the same size, art outside, left edge over the plain strip on the right; glue the overlap.", "A hand-cut fan shows the artwork on the cup; it cannot be formed into a working cup."] }, // hand make-up notes for the 13 x 19 in digital sample
    name: "Paper cup, 8 oz (250 mL) single wall",
    family: "cup",
    route: "cup",
    cup: "sw8", // die = KLD template lines verbatim (cup-kld-refs.js); a cup die is never drawn by formula
    build: () => buildCupDieline("sw8"),
    inputs: [],
    proven: [{ ref: "KLD-CUP-08SW v1 (TD 80 / BD 56 / H 95 mm)" }],
    openCuts: 1, // the KLD's own corner cap overlap
    notes: "Fixed die. Artwork follows the cup rules of the artwork cortex (joint 8 mm, 15 mm above the bottom fold, nothing in the rim curl).",
    routeNote: "Up to 25,000 cups: offset. Over 25,000: flexo on the 250 mL single-wall master plate (108 T, reel 870, 12-up) - that plate is K100 only and must pass the master-plate gate. No offset nest for this cup is on file, so the printer's set is not made here.",
  },
  {
    id: "cup-dw-8oz",
    short: "8 oz double wall", // the name on the picker; the full name goes on files
    digital: { assembly: ["Wrap one fan round a plain white inner cup, art outside; the right-hand plain strip goes under the left edge; glue.", "The bottom 5 mm hem folds inward."] }, // hand make-up notes for the 13 x 19 in digital sample
    name: "Paper cup, 8 oz (250 mL) double wall, outer wrap",
    family: "cup",
    route: "cup",
    cup: "dw8", // the printed outer wrap; die = KLD-CUP-08DW lines verbatim
    nest: "dw8-12up", // the printer's own 12-up punch layout (Blueline and Lucky Offset share it)
    printers: ["BLUELINE", "LUCKY-OFFSET"],
    innerCup: "sw8", // ASSUMED: the inner cup of this double wall is the Aeros 8 oz single-wall cup (same TD / BD / H on both KLDs)
    nestFile: { size: "250ml-8oz", item: "paper-cup-DW_outer-wrap", tag: "12up-676x415mm" },
    build: () => buildCupDieline("dw8"),
    inputs: [],
    proven: [{ ref: "KLD-CUP-08DW v1 (cup TD 80 / BD 56 / H 95 mm)" }],
    openCuts: 0,
    notes: "Fixed die. Outer wrap rules: joint 8 mm on the left, content 4 mm above the hem fold and 5 mm below the top cut.",
    routeNote: "Up to 25,000 cups: offset on the printer's 12-up sheet, 676 x 415 mm (Blueline or Lucky Offset) - the set below. Over 25,000: flexo, 116 T, reel 675, 12-up.",
  },
  {
    id: "cup-sw-12oz",
    short: "12 oz single wall", // the name on the picker; the full name goes on files
    digital: { assembly: ["Wrap one fan round a plain white cup of the same size, art outside, left edge over the plain strip on the right; glue the overlap.", "A hand-cut fan shows the artwork on the cup; it cannot be formed into a working cup."] }, // hand make-up notes for the 13 x 19 in digital sample
    name: "Paper cup, 12 oz (350 mL) single wall",
    family: "cup",
    route: "cup",
    cup: "sw12", // die = KLD-CUP-12SW v1 lines verbatim (cup-kld-refs.js)
    nest: "sw12-9up", // the printer's own punch layout, verbatim (cup-nest-refs.js)
    printers: ["BLUELINE"],
    nestFile: { size: "350ml-12oz", item: "paper-cup-SW_cup", tag: "9up-737x461mm" },
    build: () => buildCupDieline("sw12"),
    inputs: [],
    proven: [{ ref: "KLD-CUP-12SW v1 (TD 90 / BD 60 / H 109 mm)" }],
    openCuts: 4, // the KLD's own gaps where its corner caps meet the arcs (the printer's punch file has the same)
    notes: "Fixed die. Artwork follows the cup rules of the artwork cortex (joint 8 mm, 15 mm above the bottom fold, nothing in the rim curl).",
    routeNote: "Up to 25,000 cups: offset on Blueline's 9-up sheet, 737 x 461 mm - the set below (its outlines are in the printer's own 'Dieline' colour, as on their file). Over 25,000: flexo; the team's 6-up layout (740 x 318.6 mm) is on file but is not made here.",
  },
  {
    id: "cup-dw-12oz",
    short: "12 oz double wall", // the name on the picker; the full name goes on files
    digital: { assembly: ["Wrap one fan round a plain white inner cup, art outside; the right-hand plain strip goes under the left edge; glue.", "The bottom hem folds inward."] }, // hand make-up notes for the 13 x 19 in digital sample
    name: "Paper cup, 12 oz (350 mL) double wall, outer wrap",
    family: "cup",
    route: "cup",
    cup: "dw12", // die = KLD-CUP-12DW v1 lines verbatim (cup-kld-refs.js)
    nest: "dw12-9up", // the printer's own punch layout, verbatim (cup-nest-refs.js)
    printers: ["BLUELINE", "LUCKY-OFFSET"],
    innerCup: "sw12", // ASSUMED: the nearest Aeros single-wall KLD (TD 90 / BD 60 / H 109; this wrap's own KLD says H 111)
    nestFile: { size: "350ml-12oz", item: "paper-cup-DW_outer-wrap", tag: "9up-751x381mm" },
    build: () => buildCupDieline("dw12"),
    inputs: [],
    proven: [{ ref: "KLD-CUP-12DW v1 (cup TD 90 / BD 60 / H 111 mm)" }],
    openCuts: 0,
    notes: "Fixed die. Outer wrap rules: joint 8 mm on the left, content 4 mm above the hem fold and 5 mm below the top cut.",
    routeNote: "Up to 25,000 cups: offset on the 9-up sheet, 751 x 381 mm (Blueline's punch KLD; Lucky Offset runs the same sheet) - the set below. Over 25,000: flexo, 144 T, reel 740, 12-up.",
  },
  {
    id: "cup-sw-16oz",
    short: "16 oz single wall", // the name on the picker; the full name goes on files
    digital: { assembly: ["Wrap one fan round a plain white cup of the same size, art outside, left edge over the plain strip on the right; glue the overlap.", "A hand-cut fan shows the artwork on the cup; it cannot be formed into a working cup."] }, // hand make-up notes for the 13 x 19 in digital sample
    name: "Paper cup, 16 oz (450 mL) single wall",
    family: "cup",
    route: "cup",
    cup: "sw16", // die = KLD-CUP-16SW v1 lines verbatim (cup-kld-refs.js)
    build: () => buildCupDieline("sw16"),
    inputs: [],
    proven: [{ ref: "KLD-CUP-16SW v1 (TD 90 / BD 60 / H 135 mm)" }],
    openCuts: 0,
    notes: "Fixed die. Artwork follows the cup rules of the artwork cortex (joint 8 mm, 15 mm above the bottom fold, nothing in the rim curl).",
    routeNote: "No offset nest and no flexo plate for this cup is on file, so the printer's set is not made here. Send Arjun the printer's punch file and it can be added.",
  },
  {
    id: "cup-dw-16oz",
    short: "16 oz double wall", // the name on the picker; the full name goes on files
    digital: { assembly: ["Wrap one fan round a plain white inner cup, art outside; the right-hand plain strip goes under the left edge; glue.", "The bottom hem folds inward."] }, // hand make-up notes for the 13 x 19 in digital sample
    name: "Paper cup, 16 oz (450 mL) double wall, outer wrap",
    family: "cup",
    route: "cup",
    cup: "dw16", // die = KLD-CUP-16DW v1 lines verbatim (cup-kld-refs.js)
    nest: "dw16-9up", // the printer's own punch layout, verbatim (cup-nest-refs.js)
    printers: ["BLUELINE", "LUCKY-OFFSET"],
    innerCup: "sw16", // ASSUMED: the Aeros 16 oz single-wall cup (same TD / BD / H on both KLDs)
    nestFile: { size: "450ml-16oz", item: "paper-cup-DW_outer-wrap", tag: "9up-751x441mm" },
    build: () => buildCupDieline("dw16"),
    inputs: [],
    proven: [{ ref: "KLD-CUP-16DW v1 (cup TD 90 / BD 60 / H 135 mm)" }],
    openCuts: 2, // the KLD's own bridge gaps (the printer's punch file has the same)
    notes: "Fixed die. Outer wrap rules: joint 8 mm on the left, content 4 mm above the hem fold and 5 mm below the top cut.",
    routeNote: "Up to 25,000 cups: offset on the 9-up sheet, 751 x 441 mm (Blueline's punch KLD; Lucky Offset runs the same sheet) - the set below. Over 25,000: flexo, 129 T, reel 750, 9-up.",
  },
  {
    id: "pet-cup-12oz-u",
    short: "12 oz U-shape, 92 mm", // the name on the picker; the full name goes on files
    name: "PET cup, 92 mm dia: 12 oz (350 mL) U-shape",
    family: "pet",
    route: "pet",
    pet: "u12", // direct print (dry offset) on the moulded cup: the "die" is the print rectangle (lib/dieline/pet.js)
    petFile: { size: "350ml-12oz", item: "pet-cup-U" },
    build: () => buildPetDieline("u12"),
    inputs: [],
    proven: [{ ref: "print band 223 x 65 mm (cup 92 / 48 / 89)" }],
    openCuts: 0,
    notes: "Direct print on the moulded cup. Artwork is a plain rectangle; the printer applies the cone distortion.",
  },
  {
    id: "pet-cup-16oz-u",
    short: "16 oz U-shape, 92 mm", // the name on the picker; the full name goes on files
    name: "PET cup, 92 mm dia: 16 oz (425 mL) U-shape",
    family: "pet",
    route: "pet",
    pet: "u16", // direct print (dry offset) on the moulded cup: the "die" is the print rectangle (lib/dieline/pet.js)
    petFile: { size: "425ml-16oz", item: "pet-cup-U" },
    build: () => buildPetDieline("u16"),
    inputs: [],
    proven: [{ ref: "print band 235 x 65 mm (cup 92 / 48 / 118)" }],
    openCuts: 0,
    notes: "Direct print on the moulded cup. Artwork is a plain rectangle; the printer applies the cone distortion.",
  },
  {
    id: "pet-cup-16oz-flat",
    short: "16 oz flat bottom, 98 mm", // the name on the picker; the full name goes on files
    name: "PET cup, 98 mm dia: 16 oz (450 mL) flat bottom",
    family: "pet",
    route: "pet",
    pet: "flat16", // direct print (dry offset) on the moulded cup: the "die" is the print rectangle (lib/dieline/pet.js)
    petFile: { size: "450ml-16oz", item: "pet-cup-flat-98" },
    build: () => buildPetDieline("flat16"),
    inputs: [],
    proven: [{ ref: "print band 237 x 75 mm (cup 98 / 60 / 120)" }],
    openCuts: 0,
    notes: "Direct print on the moulded cup. Artwork is a plain rectangle; the printer applies the cone distortion.",
  },
  {
    id: "pet-cup-24oz-flat",
    short: "24 oz flat bottom, 98 mm", // the name on the picker; the full name goes on files
    name: "PET cup, 98 mm dia: 24 oz (750 mL) flat bottom",
    family: "pet",
    route: "pet",
    pet: "flat24", // direct print (dry offset) on the moulded cup: the "die" is the print rectangle (lib/dieline/pet.js)
    petFile: { size: "750ml-24oz", item: "pet-cup-flat-98" },
    build: () => buildPetDieline("flat24"),
    inputs: [],
    proven: [{ ref: "print band 237 x 100 mm (cup 98 / 60 / 155)" }],
    openCuts: 0,
    notes: "Direct print on the moulded cup. Artwork is a plain rectangle; the printer applies the cone distortion.",
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
