"use client";

// Parametric dieline generator UI. Each box style is a geometry engine in
// lib/dieline/ (verified against a real Aeros/reference die); exporters are
// style-agnostic. Everything runs client-side.

import { useEffect, useMemo, useRef, useState } from "react";
import { buildCakeboxDieline } from "@/lib/dieline/cakebox";
import { buildFoodboxDieline } from "@/lib/dieline/foodbox";
import { buildBurgerboxDieline } from "@/lib/dieline/burgerbox";
import { buildPaperbagKeyline, BAG_TYPES } from "@/lib/dieline/paperbag";
import { buildDcutbagDieline } from "@/lib/dieline/dcutbag";
import { buildSandwichboxDieline } from "@/lib/dieline/sandwichbox";
import { buildBowlsleeveDieline } from "@/lib/dieline/bowlsleeve";
import { buildCutlerypouchDieline } from "@/lib/dieline/cutlerypouch";
import { buildPartitionDieline } from "@/lib/dieline/partition";
import { buildPapercupDieline, CUP_DIES } from "@/lib/dieline/papercup";
import { buildCupNesting } from "@/lib/dieline/nesting";
import { buildTuckboxDieline } from "@/lib/dieline/tuckbox";
import { buildRscboxDieline } from "@/lib/dieline/rscbox";
import { buildRopebagKeyline } from "@/lib/dieline/ropebag";
import { buildNwBoxBagKeyline } from "@/lib/dieline/nwboxbag";
import { buildPieboxDieline } from "@/lib/dieline/piebox";
import { buildCartonDieline, CARTON_TYPES } from "@/lib/dieline/carton";
import { buildSleeveDieline, buildCupSleeveDieline } from "@/lib/dieline/sleeves";
import { buildPillowboxDieline } from "@/lib/dieline/pillowbox";
import { buildGableboxDieline } from "@/lib/dieline/gablebox";
import { buildPizzaboxDieline } from "@/lib/dieline/pizzabox";
import { buildSnackboxDieline } from "@/lib/dieline/snackbox";
import { buildTrayDieline } from "@/lib/dieline/tray";
import { buildEnvelopeDieline } from "@/lib/dieline/envelope";
import { buildCupcarrierDieline } from "@/lib/dieline/cupcarrier";
import { buildCarrier4Dieline } from "@/lib/dieline/carrier4";
import { toSvg, toPdf, toDxf, fmtBoth } from "@/lib/dieline/exports";
import { MATERIALS, materialStamp, materialThicknessMm } from "@/lib/dieline/materials";
import { SURFACES_3D } from "@/lib/dieline/materials3d";
import { buildDieMask } from "@/lib/dieline/mask";

// styles whose 3D flat pose lays out on the same grid as the die blank —
// their panels get clipped to the true die silhouette (curved wings, notches)
const DIE_MASK_STYLES = new Set(["snackbox", "sandwichbox", "bowlsleeve"]);
import { buildRig, RIGGED_STYLES } from "@/lib/dieline/fold3d";
import Fold3DViewer from "./Fold3DViewer";

const inputCls =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100";

const STYLES = {
  cakebox: {
    label: "Cake / Snack Box",
    build: buildCakeboxDieline,
    defaultUnits: "in",
    defaults: { L: "5", W: "5", H: "3" },
    hints: { L: "across the lock ends", W: "wrap-around band", H: "box depth" },
    // presets are stored in their native unit and converted on click
    presets: [
      { label: 'Samosa 5 x 5 x 3"', dims: [5, 5, 3], unit: "in" },
      { label: 'Cake 7 x 7 x 4"', dims: [7, 7, 4], unit: "in" },
      { label: 'Cake 8 x 8 x 5"', dims: [8, 8, 5], unit: "in" },
      { label: 'Cake 10 x 10 x 5"', dims: [10, 10, 5], unit: "in" },
      { label: 'Cake 12 x 12 x 5"', dims: [12, 12, 5], unit: "in" },
    ],
    hasWindow: true,
    depthLabel: "End-flap depth",
    note:
      "One-piece lock-corner die, no glue — tuck flap closes the wrap, base-flap slit locks the lid tab on both ends. Feed the blank size straight into the box calculator for sheet nesting.",
  },
  foodbox: {
    label: "Food Box (leakproof)",
    build: buildFoodboxDieline,
    defaultUnits: "mm",
    defaults: { L: "144", W: "104", H: "40" },
    hints: { L: "top opening length", W: "top opening width", H: "wall height" },
    presets: [
      { label: "500 mL (144×104×40)", dims: [144, 104, 40], unit: "mm", taper: 7 },
      { label: "750 mL (164×114×45)", dims: [164, 114, 45], unit: "mm", taper: 7 },
      { label: "1000 mL (200×139×50, taper 10)", dims: [200, 139, 50], unit: "mm", taper: 10 },
    ],
    hasTaper: true,
    depthLabel: "Wall height",
    note:
      "Tapered leakproof tray (7 mm flare per side — base comes out 14 mm smaller each way) with corner gussets, hinged lid with V-notches, and an 18 mm lip whose slots catch the wall teeth. Dims are the internal top opening.",
  },
  carton: {
    label: "Folding Carton (tuck end)",
    build: buildCartonDieline,
    defaultUnits: "mm",
    defaults: { L: "80", W: "40", H: "120" },
    hints: { L: "face width", W: "depth", H: "height" },
    presets: [
      { label: "80×40×120", dims: [80, 40, 120], unit: "mm" },
      { label: "60×60×160", dims: [60, 60, 160], unit: "mm" },
      { label: "100×50×140", dims: [100, 50, 140], unit: "mm" },
      { label: "Single cup holder 91×50×93 STE (Ø70 petal hole)", dims: [91, 50, 93], unit: "mm", winW: 70, winH: 42, cartonType: "ste", glueSide: "right", glue: 10, holes: 1 },
      { label: "Double cup holder 90×48×180 STE (2× Ø70 petal holes)", dims: [90, 48, 180], unit: "mm", winW: 70, winH: 42, cartonType: "ste", glueSide: "right", glue: 10, holes: 2, notch: true },
    ],
    hasWindow: true,
    windowLabels: ["Cup hole ring Ø (mm, 0 = none)", "Cup hole cut Ø (mm)"],
    hasCartonType: true,
    usesThickness: true,
    depthLabel: "Top panel depth",
    note:
      "Product carton with glue seam — straight or reverse tuck ends, or tuck top with crash-lock (auto) bottom. Standard construction — prototype the first cut.",
  },
  gablebox: {
    label: "Gable Box (handle)",
    build: buildGableboxDieline,
    defaultUnits: "mm",
    defaults: { L: "150", W: "100", H: "120" },
    hints: { L: "face width", W: "depth", H: "body height" },
    presets: [
      { label: "150×100×120", dims: [150, 100, 120], unit: "mm" },
      { label: "180×120×140", dims: [180, 120, 140], unit: "mm" },
    ],
    depthLabel: "Roof + handle",
    note:
      "Carry-out gable box: roof creases to a carry handle with hand hole, fold-in gussets, crash-lock style bottom. Standard construction — prototype the first cut.",
  },
  pizzabox: {
    label: "Pizza Box (production)",
    build: buildPizzaboxDieline,
    defaultUnits: "mm",
    defaults: { L: "308", W: "311", H: "43" },
    hints: { L: "internal depth", W: "internal width", H: "wall height" },
    presets: [
      { label: '7" (181×181×40)', dims: [181, 181, 40], unit: "mm" },
      { label: '8" (206×206×40)', dims: [206, 206, 40], unit: "mm" },
      { label: '9" (232×232×40)', dims: [232, 232, 40], unit: "mm" },
      { label: '10" (257×257×43)', dims: [257, 257, 43], unit: "mm" },
      { label: '12" (308×311×43)', dims: [308, 311, 43], unit: "mm" },
    ],
    defaultMaterial: { family: "corrugated", idx: 2 }, // E-flute
    depthLabel: "Wall height",
    note:
      "Calibrated to the production one-piece corrugated pizza die family (12-inch reference, die-exact; 7-inch cross-checks within ~1 mm) — drawn for E-FLUTE (1.5 mm); other flutes change fold allowances, re-check with the die maker. Rolled back wall with lock tabs, slotted side walls, lid side wings with snap bumps, rounded corners, thumb-notch lip.",
  },
  snackbox: {
    label: "Snack Box (hinged lid)",
    build: buildSnackboxDieline,
    defaultUnits: "mm",
    defaults: { L: "105", W: "200", H: "35" },
    hints: { L: "internal depth", W: "internal width", H: "wall height" },
    presets: [
      { label: "200×105×35 (production)", dims: [105, 200, 35], unit: "mm" },
      { label: "230×130×40", dims: [130, 230, 40], unit: "mm" },
    ],
    defaultMaterial: { family: "corrugated", idx: 2 }, // E-flute
    depthLabel: "Wall height",
    note:
      "Production hinged corrugated snack box (sides / garlic-knots family, die-exact at 200×105×35) — drawn for E-FLUTE (1.5 mm) like the pizza dies. Rolled back wall with lock tabs, snap-bump side walls, lid wings, lip with finger notch.",
  },
  sleeve: {
    label: "Sleeve (straight)",
    build: buildSleeveDieline,
    defaultUnits: "mm",
    defaults: { L: "150", W: "90", H: "60" },
    hints: { L: "face width", W: "depth", H: "sleeve height" },
    presets: [
      { label: "Tray sleeve 150×90×60", dims: [150, 90, 60], unit: "mm" },
      { label: "Burger sleeve 110×110×70", dims: [110, 110, 70], unit: "mm" },
    ],
    usesThickness: true,
    depthLabel: null,
    note:
      "Open-ended wrap with glue seam and thumb notch — tray sleeves, burger sleeves, soap wraps. Panels grow +2×board so the sleeve slides over its tray.",
  },
  cupsleeve: {
    label: "Cup Sleeve (tapered)",
    build: buildCupSleeveDieline,
    defaultUnits: "mm",
    defaults: { L: "90", W: "80", H: "60" },
    fieldLabels: ["Top Ø", "Bottom Ø", "Height"],
    hints: { L: "cup Ø at sleeve top", W: "cup Ø at sleeve bottom", H: "sleeve height" },
    presets: [
      { label: "Ø90→80 × 60 (90mm cups)", dims: [90, 80, 60], unit: "mm" },
      { label: "Ø80→70 × 55 (80mm cups)", dims: [80, 70, 55], unit: "mm" },
    ],
    depthLabel: null,
    note:
      "Annular-sector unwrap for conical cups (same maths family as a cup fan) with a 12 mm glued overlap seam. Pull cup Ø from the master before cutting.",
  },
  pillowbox: {
    label: "Pillow Box",
    build: buildPillowboxDieline,
    defaultUnits: "mm",
    defaults: { L: "150", W: "90", H: "0" },
    hints: { L: "box length", W: "face width (flat)", H: "not used — depth comes from the curve" },
    presets: [
      { label: "150×90", dims: [150, 90, 0], unit: "mm" },
      { label: "200×110", dims: [200, 110, 0], unit: "mm" },
    ],
    allowZeroH: true,
    depthLabel: "Tuck flap",
    note:
      "Two curved faces with curved tuck-in ends and a glued side seam; pillow depth emerges from the 0.18×W end curve. Standard construction — prototype the first cut.",
  },
  tray: {
    label: "Tray (ear-lock, 0421)",
    build: buildTrayDieline,
    defaultUnits: "mm",
    defaults: { L: "220", W: "150", H: "45" },
    hints: { L: "internal length", W: "internal width", H: "wall height" },
    presets: [
      { label: "220×150×45", dims: [220, 150, 45], unit: "mm" },
      { label: "300×200×60", dims: [300, 200, 60], unit: "mm" },
    ],
    usesThickness: true,
    depthLabel: "Wall height",
    note:
      "Glue-free open tray: side-wall ears wrap the ends, end-wall fold-over lips lock into base slots (same lock as the mailer). For a telescope set, generate a cover at L+3 × W+3 with the cover height. Standard construction — prototype the first cut.",
  },
  carrier4: {
    label: "4-Cup Carrier (carry box)",
    build: buildCarrier4Dieline,
    defaultUnits: "mm",
    defaults: { L: "165.5", W: "165.5", H: "108.8" },
    fieldLabels: ["Wall width", "\u2014 (square)", "Wall height"],
    hints: { L: "one side of the square box", W: "follows the wall width", H: "wall height to the gable crease" },
    presets: [
      { label: "165.5 \u00d7 165.5 \u00d7 228 (die-exact)", dims: [165.5, 165.5, 108.8], unit: "mm" },
    ],
    defaultMaterial: { family: "kraft", idx: 2 },
    depthLabel: "Wall height",
    note:
      "Square 4-cup carry box embedded VERBATIM from the PCKG / Testing Grounds production die (Jallo Creamery V2): four walls with gable peaks, hand holes on two opposite panels, auto-lock bottom, glue flap. Die-exact at 165.5 \u00d7 165.5 \u00d7 228 (blank 744 \u00d7 328.7); other sizes band-scale the walls and keep the die maker's gable, handle and bottom-lock proportions.",
  },
  cupcarrier: {
    label: "Take Away Cup Holder",
    build: buildCupcarrierDieline,
    defaultUnits: "mm",
    defaults: { L: "75", W: "115", H: "135" },
    fieldLabels: ["Cup hole Ø", "Pitch / strip W", "Handle H"],
    hints: { L: "cup RIM Ø minus 10 mm", W: "2-cup: centre-to-centre · 1-cup: strip width", H: "handle panel height" },
    presets: [
      { label: "Two cup · STANDARD (Ø75 × 115 × 135)", dims: [75, 115, 135], unit: "mm", cups: 2 },
      { label: "Single cup · Ø60 × 120 strip", dims: [60, 120, 130], unit: "mm", cups: 1 },
      { label: "Single cup · Ø82 × 130 strip", dims: [82, 130, 135], unit: "mm", cups: 1 },
    ],
    hasCups: true,
    depthLabel: "Wing / band depth",
    note:
      "Take Away Cup Holder — one-piece sling that drops over the cups: handle panel | central band with cup hole(s) | handle panel; the ends fold up and the hand-holes align. Handle panels default to 135 mm with a 95 \u00d7 32 mm hand hole 36 mm from the top edge, so the grip clears the lid domes by a hand's width (our first print at ~80 mm was too low). AEROS STANDARD double holder = \u00d875 holes \u00d7 115 pitch \u00d7 135 mm handle (blank 230 \u00d7 377), set from the Kinster 250 ml job with the handle raised from 95 mm \u2014 the 95 mm version put knuckles on the lids. Hole \u00d8 runs ~5 mm under the cup rim; if cups push through, drop to rim \u00d8 minus 10 or use a stiffer board.",
  },
  envelope: {
    label: "Envelope",
    build: buildEnvelopeDieline,
    defaultUnits: "mm",
    defaults: { L: "229", W: "162", H: "0" },
    fieldLabels: ["Width", "Height", "—"],
    hints: { L: "envelope width", W: "envelope height", H: "not used" },
    presets: [
      { label: "C5 (229×162)", dims: [229, 162, 0], unit: "mm" },
      { label: "C4 (324×229)", dims: [324, 229, 0], unit: "mm" },
      { label: "DL (220×110)", dims: [220, 110, 0], unit: "mm" },
    ],
    allowZeroH: true,
    depthLabel: "Closure flap",
    note: "Pocket envelope — glued side flaps, bottom flap, curved closure flap. Standard construction.",
  },
  tuckbox: {
    label: "Mailer / Tuck Box (0427)",
    build: buildTuckboxDieline,
    defaultUnits: "in",
    defaults: { L: "6", W: "6", H: "2" },
    hints: { L: "internal length", W: "internal width (depth)", H: "internal height" },
    presets: [
      { label: '6×6×2" (die-exact)', dims: [6, 6, 2], unit: "in" },
      { label: '6×4×2" (die-exact)', dims: [6, 4, 2], unit: "in" },
      { label: '6×2×2" (die-exact)', dims: [6, 2, 2], unit: "in" },
      { label: "315×202×62 mm", dims: [315, 202, 62], unit: "mm" },
    ],
    defaultMaterial: { family: "corrugated", idx: 2 },
    depthLabel: "Wall height",
    note:
      "Roll-end tuck-top mailer calibrated to a die-maker's production family (die-exact at 6×6×2, 6×4×2 and 6×2×2 in; other sizes band-scale from the nearest hand-tuned original). Thumb-notch tuck, double roll creases, corner ears, base lock slits. Drawn for corrugated board.",
  },
  rscbox: {
    label: "Shipper / RSC (0201)",
    build: buildRscboxDieline,
    defaultUnits: "mm",
    defaults: { L: "408.5", W: "333.5", H: "490.5" },
    hints: { L: "internal length", W: "internal width", H: "internal height" },
    presets: [
      { label: "8oz DW cup shipper (die 415×340×500)", dims: [408.5, 333.5, 490.5], unit: "mm" },
      { label: "640×400×570 scores (8oz 1000s master)", dims: [633.5, 393.5, 560.5], unit: "mm" },
    ],
    defaultMaterial: { family: "corrugated", idx: 5 }, // 5-ply BC
    depthLabel: "Flap depth",
    note:
      "Regular slotted container (FEFCO 0201) for 5-ply master cartons, modelled on the Aeros 8oz DW cup shipper keyline: panels L|W|L|W, meeting flaps (W+t)/2, 40 mm join lap, slots caliper+3, and the reference's 20 mm artwork-safe frame on every panel (orange dash). Scores = internal + 1 caliper; the reference is an artwork keyline, so confirm allowances with the die maker.",
  },
  tamperpouch: {
    label: "Tamper-Seal Pouch (pinch bottom)",
    build: (a) => buildPaperbagKeyline({ ...a, bagType: "v_bottom", windowW: a.windowW === undefined ? (a.units === "in" ? 25 / 25.4 : 25) : a.windowW, bottomFold: a.windowH === undefined ? (a.units === "in" ? 25 / 25.4 : 25) : a.windowH }),
    defaultUnits: "mm",
    defaults: { L: "200", W: "80", H: "130" },
    fieldLabels: ["Width (W)", "Base (G)", "Height (H)"],
    hints: { L: "pouch face width", W: "base / gusset", H: "pouch height (mouth to base fold)" },
    presets: [
      { label: "200\u00d780\u00d7130 (brown kraft ref)", dims: [200, 80, 130], unit: "mm" },
    ],
    hasWindow: true,
    windowLabels: ["Tamper flap (default 25 mm)", "Bottom paste fold (default 25 mm)"],
    defaultMaterial: { family: "kraft", idx: 0 },
    depthLabel: "Base pleat",
    note:
      "Pinch/V-bottom pouch with a tamper-seal flap on the back panel (chamfered ends, folds over the mouth; adhesive strip under the flap). Handmade-friendly \u2014 seam | front | gusset | back | gusset wrap; full-width bottom fold (25 mm, per the HomeRun sample) pasted onto the back. Flap defaults to 25 mm; set 0 for a plain pouch.",
  },
  piebox: {
    label: "Pie Box (hinged lid)",
    build: buildPieboxDieline,
    defaultUnits: "mm",
    defaults: { L: "156", W: "145", H: "64" },
    fieldLabels: ["Base length (L)", "Base depth (W)", "Wall height (H)"],
    hints: { L: "internal base length", W: "internal base depth", H: "tray wall height" },
    presets: [
      { label: "156\u00d7145\u00d764 (die-exact)", dims: [156, 145, 64], unit: "mm" },
      { label: "200\u00d7200\u00d765", dims: [200, 200, 65], unit: "mm" },
    ],
    defaultMaterial: { family: "white", idx: 3 },
    depthLabel: "Wall height",
    note:
      "Hinged-lid pie box calibrated to the 66 Chuim production die (die-exact at 156\u00d7145\u00d764, blank 424\u00d7482). Tray with doubled side walls (3 mm board gaps) and corner ears, hinged at the front wall to a lid that runs 6 mm narrower so it drops inside the tray. Prototype the first cut at a new size.",
  },
  nwboxbag: {
    label: "Non-Woven BOPP Box Bag",
    build: buildNwBoxBagKeyline,
    defaultUnits: "mm",
    defaults: { L: "410", W: "155", H: "430" },
    fieldLabels: ["Width (W)", "Gusset / bottom (G)", "Height (H)"],
    hints: { L: "bag face width", W: "side gusset = bottom depth", H: "bag height" },
    presets: [
      { label: '16\u00d717\u00d76" (410\u00d7430\u00d7155)', dims: [410, 155, 430], unit: "mm", winW: 32.5, winH: 10 },
      { label: '18\u00d717\u00d77" (460\u00d7430\u00d7180)', dims: [460, 180, 430], unit: "mm", winW: 25, winH: 10 },
      { label: "Maharani 380\u00d7410\u00d7115", dims: [380, 115, 410], unit: "mm", winW: 35, winH: 10 },
    ],
    hasWindow: true,
    windowLabels: ["Top hem (default 32.5 mm)", "Edge seal (default 10 mm)"],
    defaultMaterial: { family: "nonwoven", idx: 1 },
    depthLabel: "Top hem",
    note:
      "Print-cylinder keyline for laminated non-woven (BOPP) box bags, decoded from the 16\u00d717\u00d76 and 18\u00d717\u00d77 vendor KLDs and the Maharani layout. Along the roll: hem | face | bottom | face | hem; across: seal | G/2 | W | G/2 | seal. Faces print SIDEWAYS \u2014 the purple 'PLACE ARTWORK HERE' notes and arrows show which way is the top of the bag (toward the nearer hem). Handles are separate loops sealed under the hem.",
  },
  ropebag: {
    label: "Rope-Handle Bag (offset half-punch)",
    build: buildRopebagKeyline,
    defaultUnits: "mm",
    defaults: { L: "291.3", W: "194.8", H: "270" },
    fieldLabels: ["Face width (W)", "Gusset (G)", "Height (H)"],
    hints: { L: "bag face width", W: "side gusset", H: "bag height (hem to bottom fold)" },
    presets: [
      { label: "Drink bag (die-exact 291\u00d7195\u00d7270)", dims: [291.3, 194.8, 270], unit: "mm" },
    ],
    defaultMaterial: { family: "kraft", idx: 2 },
    depthLabel: "Bottom flap",
    note:
      "Offset HALF-PUNCH calibrated to the Aeros drink-bag production die: one impression = one face + one gusset + 20 mm seam, two impressions paste into a bag (a full rope-handle blank doesn't fit the offset bed). 30 mm hem with \u00d85 rope holes ON the hem crease (105 mm apart, self-aligning when the hem folds), SOS diamond bottom, split flap G/2+30 deep.",
  },
  paperbag: {
    label: "Paper Bag (keyline)",
    build: buildPaperbagKeyline,
    defaultUnits: "mm",
    defaults: { L: "230", W: "125", H: "335" },
    fieldLabels: ["Width (W)", "Gusset (G)", "Height (H)"],
    hints: { L: "bag face width", W: "side gusset", H: "bag height" },
    hasWindow: true,
    windowLabels: ["Tamper flap (mm, 0 = none)", "\u2014 (not used)"],
    presets: [
      { label: "105×65×165", dims: [105, 65, 165], unit: "mm" },
      { label: "127×73×271", dims: [127, 73, 271], unit: "mm" },
      { label: "230×125×335", dims: [230, 125, 335], unit: "mm" },
      { label: "254×152×406", dims: [254, 152, 406], unit: "mm" },
      { label: "305×229×432", dims: [305, 229, 432], unit: "mm" },
    ],
    hasBagType: true,
    depthLabel: "Bottom fold",
    note:
      "Flat blank for print/artwork — seam | front | gusset | back | gusset, SOS diamond folds at the gusset centres. Blank maths matches the bag rate calculator exactly (seam 15/20/25 by width, bottom = 0.75×G, V-bottom +15).",
  },
  papercup: {
    label: "Paper Cup (fan)",
    build: buildPapercupDieline,
    defaultUnits: "mm",
    defaults: { L: "75.68", W: "59.94", H: "86.08" },
    fieldLabels: ["Wall top Ø", "Wall bottom Ø", "Wall height"],
    hints: { L: "sidewall top diameter (under the rim curl)", W: "sidewall bottom diameter", H: "vertical wall height" },
    presets: [
      { label: "8 oz DW outer (die-exact)", dims: [75.68, 59.94, 86.08], unit: "mm" },
      { label: "12 oz DW outer (die-exact)", dims: [83.71, 62.8, 104.85], unit: "mm" },
      { label: "16 oz DW outer (die-exact)", dims: [84.65, 63.99, 125.77], unit: "mm" },
    ],
    hasCupPicker: true,
    defaultMaterial: { family: "white", idx: 4 },
    depthLabel: "Seam flap",
    note:
      "Annular-sector fan of the cup SIDEWALL, calibrated against the production 8 oz and 12 oz DW outer-wall dies (7.5 mm glue seam, 5 mm bottom crimp band, orange dashed = artwork safe boundary). Wall dims ≠ cup rim/base dims — the outer wall sits under the rim curl. Offset nesting reference: 250 mL DW runs 12-up interleaved on a 668 × 395 mm print area. Single-wall dies get their own presets when the files arrive.",
  },
  partition: {
    label: "Partition Tray",
    build: buildPartitionDieline,
    defaultUnits: "in",
    defaults: { L: "6", W: "4", H: "2" },
    hints: { L: "box internal length (the base the partition sits in)", W: "box internal width", H: "box internal wall height" },
    presets: [
      { label: "3-burger · 6×4×2\" box (3 col × 1 row)", dims: [6, 4, 2], unit: "in", cellsX: 3, cellsY: 1 },
      { label: "6 cells · 6×4×2\" (3 × 2)", dims: [6, 4, 2], unit: "in", cellsX: 3, cellsY: 2 },
      { label: "4 cells · square box (2 × 2)", dims: [6, 6, 2], unit: "in", cellsX: 2, cellsY: 2 },
    ],
    hasCells: true,
    usesThickness: true,
    defaultMaterial: { family: "kraft", idx: 2 },
    depthLabel: "Slot depth",
    note:
      "Slotted egg-crate divider set for an existing box — enter the BOX's internal size, then columns × rows. Long strips slot from the top, cross strips from the bottom (slot width = 2 × board + 1 mm, depth = half height) and press together. Single-row grids get 20 mm end tabs instead (fold back against the walls). Strips run 1 mm under the wall height.",
  },
  cutlerypouch: {
    label: "Cutlery Pouch",
    build: buildCutlerypouchDieline,
    defaultUnits: "mm",
    defaults: { L: "60", W: "200", H: "0" },
    fieldLabels: ["Face width", "Height", "—"],
    hints: { L: "pouch face (visible front)", W: "pouch height", H: "not used" },
    presets: [
      { label: "Third Wave 60×200 (reference)", dims: [60, 200, 0], unit: "mm" },
      { label: "50×180", dims: [50, 180, 0], unit: "mm" },
      { label: "70×230", dims: [70, 230, 0], unit: "mm" },
    ],
    allowZeroH: true,
    defaultMaterial: { family: "kraft", idx: 0 },
    depthLabel: "Seal band",
    note:
      "Roll-fed flat pouch with a centre back seam, from the Third Wave Coffee reference (KOZO paper, surface print) — half-backs = face ÷ 2 meet behind, 10 mm lap seams, 10 mm top and bottom seal bands. This is a converting keyline for artwork placement, not a punched die.",
  },
  bowlsleeve: {
    label: "Bowl Sleeve (anti-leak strap)",
    build: buildBowlsleeveDieline,
    defaultUnits: "mm",
    defaults: { L: "175", W: "89", H: "148" },
    fieldLabels: ["Bowl Ø at crease", "Strap width", "Disc Ø (0 = none)"],
    hints: { L: "bowl diameter measured at the corner creases (physical sample)", W: "width of the strap band", H: "circular extension of the top panel that caps the lid" },
    presets: [
      { label: "Zepto 750 mL bagasse (Ø175 · disc 148 · bottom 95)", dims: [175, 89, 148], unit: "mm", winW: 80, winH: 95 },
      { label: "1000 mL bagasse (Ø206 × 110 · disc 168 · bottom 140)", dims: [206, 110, 168], unit: "mm", winW: 80, winH: 140 },
      { label: "Ø175 × 89, no disc", dims: [175, 89, 0], unit: "mm", winW: 80, winH: 95 },
    ],
    allowZeroH: true,
    hasWindow: true,
    windowLabels: ["Side panel (mm)", "Bottom span (mm)"],
    defaultMaterial: { family: "duplex", idx: 1 },
    depthLabel: "Glue flap",
    note:
      "VERTICAL anti-leak strap from the Zepto Cafe 750 mL bagasse-bowl sample — side | top (= bowl Ø between the corner creases) | side | bottom, 15 mm glue flap tapered 2.96/side; the disc caps over the lid dome. Sides are a FIXED 80 mm across bowl sizes; the bottom span is per-size (750 mL: 95, 1000 mL: 140). Folds over the lid, down both sides, glues under the base. Duplex 280 gsm.",
  },
  sandwichbox: {
    label: "Sandwich Box (wedge)",
    build: buildSandwichboxDieline,
    defaultUnits: "in",
    defaults: { L: "4.5", W: "2.2", H: "0" },
    fieldLabels: ["Side", "Depth", "—"],
    hints: { L: "sandwich side (triangle leg)", W: "box depth", H: "not used" },
    presets: [
      { label: '4.5 × 2.2" (production die)', dims: [4.5, 2.2, 0], unit: "in" },
      { label: '5 × 2.5"', dims: [5, 2.5, 0], unit: "in" },
      { label: "125 × 65 mm", dims: [125, 65, 0], unit: "mm" },
    ],
    allowZeroH: true,
    hasWindow: true,
    defaultMaterial: { family: "white", idx: 4 },
    depthLabel: "Depth",
    note:
      "Right-isosceles wedge box calibrated to the 4.5 × 2.2 in production punch (300 gsm) — base | end triangle | sloping face with window | end triangle | back wall, wings on the sloping face, 14 mm lock strips with slots on the triangle legs, tuck tabs top and bottom, glued spine flap. Window defaults to ~49% × 55% of the sloping face — enter 0 for no window.",
  },
  dcutbag: {
    label: "D-Cut Bag",
    build: buildDcutbagDieline,
    defaultUnits: "mm",
    defaults: { L: "232", W: "140", H: "317.5" },
    fieldLabels: ["Width (W)", "Gusset (G)", "Height (H)"],
    hints: { L: "bag face width", W: "side gusset", H: "body height (below the mouth)" },
    presets: [
      { label: "Burma Burma Small \u2014 FIXED (232\u00d7140, gusset kept)", dims: [232, 140, 317.5], unit: "mm" },
      { label: "Burma Burma v2 \u2014 11.25\u00d77.5\u00d713 in (handle clears)", dims: [285.8, 190.5, 330.2], unit: "mm" },
      { label: "Burma Burma Small \u2014 OLD die (handle clash)", dims: [209.5, 140, 317.5], unit: "mm" },
      { label: "202×110×270 (handle clears)", dims: [202, 110, 270], unit: "mm" },
      { label: "252×160×350 (handle clears)", dims: [252, 160, 350], unit: "mm" },
    ],
    defaultMaterial: { family: "white", idx: 0 },
    depthLabel: "Bottom flap",
    note:
      "Die-cut stadium-handle bag calibrated to the Burma Burma Small Bag production file — seam | face | gusset | face | gusset wrap, 63.7 mm fold-over hem with rounded corners over face 1, 80 × 25.5 mm handle slots in both faces (hem slot mirrored so the holes align), glued flat bottom with G/2 + 26 flaps. Handle stays fixed across sizes (it's ergonomic). CONSTRAINT: the folded gusset halves sit behind the face, so only (face \u2212 gusset) stays single-ply \u2014 the 80 mm D-cut needs 92 mm of that, or the gusset fold lands inside the handle. The orange dashed lines show where the folds land; the engine flags the clash and gives the max gusset.",
  },
  burgerbox: {
    label: "Burger Box (clamshell)",
    build: buildBurgerboxDieline,
    defaultUnits: "mm",
    defaults: { L: "102", W: "102", H: "39" },
    hints: { L: "base depth (front-back)", W: "base width (hinge side)", H: "wall height" },
    presets: [{ label: "Standard 102×102×39", dims: [102, 102, 39], unit: "mm" }],
    depthLabel: "Wall height",
    note:
      "Hinged clamshell — base tray with flared walls and rounded side wings, double-crease spine, lid with front tuck lock. Organic curves are band-scaled from the production 204 × 381 mm blank, so the standard size is die-exact and other sizes are drafts for the die maker.",
  },
};

export default function DielineClient() {
  const [styleId, setStyleId] = useState("cakebox");
  const style = STYLES[styleId];
  const [units, setUnits] = useState(style.defaultUnits);
  const [L, setL] = useState(style.defaults.L);
  const [W, setW] = useState(style.defaults.W);
  const [H, setH] = useState(style.defaults.H);
  const [taper, setTaper] = useState("7");
  const [showDims, setShowDims] = useState(true);
  const [matFamily, setMatFamily] = useState("white");
  const [matIdx, setMatIdx] = useState(3); // 280 gsm FBB default
  const [matCustomMm, setMatCustomMm] = useState("");
  const [bagType, setBagType] = useState("sos");
  const [hem, setHem] = useState("");
  const [cartonType, setCartonType] = useState("rte");
  const [glueSide, setGlueSide] = useState("left");
  const [glueW, setGlueW] = useState("");
  const [holeCount, setHoleCount] = useState(1); // carton: cup holes across the front panel
  const [holeNotch, setHoleNotch] = useState(false); // carton: I-cut notch between holes
  const [winW, setWinW] = useState("");
  const [winH, setWinH] = useState("");
  const [cups, setCups] = useState(2);
  const [cellsX, setCellsX] = useState("3");
  const [cellsY, setCellsY] = useState("1");
  const [cupList, setCupList] = useState(null); // catalog paper cups (lazy)
  const [cupSku, setCupSku] = useState("");
  const [cupNote, setCupNote] = useState("");
  const [printW, setPrintW] = useState("668.37");
  const [printH, setPrintH] = useState("395.37");
  const [view, setView] = useState("2d");
  const [foldT, setFoldT] = useState(1);
  const [artwork, setArtwork] = useState(null);
  const [backdrop, setBackdrop] = useState("studio");
  const [surface3d, setSurface3d] = useState(null); // null = follow the 2D board pick
  const [exporting, setExporting] = useState("");
  const viewerRef = useRef(null);

  const dims = { L: parseFloat(L), W: parseFloat(W), H: parseFloat(H) };
  const ready =
    [dims.L, dims.W].every((v) => Number.isFinite(v) && v > 0) &&
    (style.allowZeroH ? Number.isFinite(dims.H) : Number.isFinite(dims.H) && dims.H > 0);

  const matLabel = materialStamp(matFamily, matIdx, matCustomMm);
  const boardMm = materialThicknessMm(matFamily, matIdx, matCustomMm);
  const taperMm = style.hasTaper ? parseFloat(taper) || 7 : undefined;
  const result = useMemo(
    () => (ready ? style.build({ ...dims, taper: taperMm, bagType, cartonType, cups, cellsX: +cellsX || 1, cellsY: +cellsY || 1, hem: hem === "" ? undefined : +hem, windowW: winW === "" ? undefined : +winW, windowH: winH === "" ? undefined : +winH, glue: glueW === "" ? undefined : +glueW, glueSide, holes: holeCount, notch: holeNotch, thickness: boardMm, units }) : null),
    [styleId, dims.L, dims.W, dims.H, taperMm, bagType, cartonType, glueSide, glueW, holeCount, holeNotch, cups, cellsX, cellsY, hem, winW, winH, boardMm, units, ready],
  );

  const title = `${style.label} KLD ${L} x ${W} x ${H} ${units} - ${matLabel}`;
  const svg = useMemo(
    () => (result && result.blank ? toSvg(result, { units, showDims, title }) : null),
    [result, units, showDims, title],
  );

  function switchStyle(id) {
    if (id === styleId) return;
    const s = STYLES[id];
    setStyleId(id);
    setUnits(s.defaultUnits);
    setL(s.defaults.L);
    setW(s.defaults.W);
    setH(s.defaults.H);
    setTaper("7");
    setBagType("sos");
    setHem("");
    setCartonType("rte");
    setWinW("");
    setWinH("");
    setHoleCount(1);
    setHoleNotch(false);
    if (s.defaultMaterial) {
      setMatFamily(s.defaultMaterial.family);
      setMatIdx(s.defaultMaterial.idx);
      setMatCustomMm("");
    }
  }

  function switchUnits(next) {
    if (next === units) return;
    const conv = (v) => {
      const n = parseFloat(v);
      if (!Number.isFinite(n)) return v;
      return next === "mm" ? String(Math.round(n * 25.4)) : String(+(n / 25.4).toFixed(2));
    };
    setL(conv(L));
    setW(conv(W));
    setH(conv(H));
    setUnits(next);
  }

  useEffect(() => {
    if (styleId !== "papercup" || cupList) return;
    fetch("/api/dieline/cups")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setCupList(d.cups || []))
      .catch(() => setCupList([]));
  }, [styleId, cupList]);

  function applyCupSku(sku) {
    setCupSku(sku);
    const cup = (cupList || []).find((c) => c.sku === sku);
    if (!cup) return;
    // calibrated die for this size? (DW outer walls so far)
    const m = sku.match(/^PC-DW-(\d+)/);
    const die = m ? CUP_DIES[`dw${m[1]}-outer`] : null;
    setUnits("mm");
    if (die) {
      const h = Math.sqrt(die.S * die.S - ((die.Dt - die.Db) / 2) ** 2);
      setL(String(die.Dt));
      setW(String(die.Db));
      setH(String(+h.toFixed(2)));
      setCupNote(`${cup.sku}: die-exact outer-wall fan applied (cup spec ${cup.td}×${cup.bd}×${cup.h}).`);
    } else if (cup.td && cup.bd && cup.h) {
      setL(String(cup.td));
      setW(String(cup.bd));
      setH(String(cup.h));
      setCupNote(`${cup.sku}: no calibrated wall die for this size yet — using the CUP spec (${cup.td}×${cup.bd}×${cup.h}) as the wall. Send the production die to calibrate before cutting.`);
    } else {
      setCupNote(`${cup.sku}: no dimensions in the catalog — fill the wall dims manually.`);
    }
  }

  function applyPreset(p) {
    const conv = (v) => {
      if (p.unit === units) return String(v);
      return units === "mm" ? String(Math.round(v * 25.4)) : String(+(v / 25.4).toFixed(2));
    };
    setL(conv(p.dims[0]));
    setW(conv(p.dims[1]));
    setH(conv(p.dims[2]));
    if (p.taper != null) setTaper(String(p.taper));
    if (p.cups != null) setCups(p.cups);
    if (p.cellsX != null) setCellsX(String(p.cellsX));
    if (p.cellsY != null) setCellsY(String(p.cellsY));
    if (p.winW != null) setWinW(conv(p.winW));
    if (p.winH != null) setWinH(conv(p.winH));
    if (p.cartonType) setCartonType(p.cartonType);
    if (p.glueSide) setGlueSide(p.glueSide);
    if (p.glue != null) setGlueW(conv(p.glue));
    setHoleCount(p.holes ?? 1);
    setHoleNotch(!!p.notch);
  }

  function onArtworkFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => setArtwork(img);
    img.src = URL.createObjectURL(file);
  }

  async function exportMockup(kind) {
    if (!viewerRef.current) return;
    setExporting(kind);
    try {
      const blob = kind === "png" ? await viewerRef.current.exportPng(2048) : await viewerRef.current.exportTurntable(3);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `aeros-mockup-${styleId}-${L}x${W}x${H}${units}.${kind === "png" ? "png" : "webm"}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setExporting("");
    }
  }

  function download(ext) {
    if (!result || !result.blank) return;
    const base = `aeros-${styleId}-${L}x${W}x${H}${units}-KLD`;
    let blob;
    if (ext === "svg") {
      blob = new Blob([toSvg(result, { units, showDims, title })], { type: "image/svg+xml" });
    } else if (ext === "pdf") {
      blob = new Blob([toPdf(result, { units, showDims, title })], { type: "application/pdf" });
    } else {
      blob = new Blob([toDxf(result)], { type: "application/dxf" });
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${base}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // offset/flexo sheet nesting for cup fans
  const nesting = useMemo(
    () => (styleId === "papercup" && result?.valid ? buildCupNesting(result, { printW: +printW || 668.37, printH: +printH || 395.37 }) : null),
    [styleId, result, printW, printH],
  );

  function downloadLayout(ext) {
    if (!nesting?.valid) return;
    const t = `${style.label} sheet layout ${printW} x ${printH} mm - ${nesting.meta.ups}-up`;
    let blob;
    if (ext === "svg") blob = new Blob([toSvg(nesting, { units: "mm", showDims: true, title: t })], { type: "image/svg+xml" });
    else if (ext === "pdf") blob = new Blob([toPdf(nesting, { units: "mm", showDims: true, title: t })], { type: "application/pdf" });
    else blob = new Blob([toDxf(nesting)], { type: "application/dxf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aeros-papercup-layout-${printW}x${printH}-${nesting.meta.ups}up.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const blank = result?.blank;
  const has3d = RIGGED_STYLES.includes(styleId);
  // 3D surface: follows the 2D board pick until a swatch is chosen explicitly
  const surfaceAuto = matFamily === "corrugated" ? "corrugated" : matFamily === "kraft" ? "kraft" : matFamily === "duplex" ? "duplex" : matFamily === "art" ? "gloss" : "white";
  const surface = surface3d ?? surfaceAuto;
  const rig = useMemo(() => {
    if (!has3d || !ready) return null;
    const mm = (v) => (units === "in" ? v * 25.4 : v);
    // partition packs its grid into the cups slot (nx*100 + ny)
    const cupsArg = styleId === "partition" ? (+cellsX || 1) * 100 + (+cellsY || 1) : cups;
    return buildRig(styleId, { L: mm(dims.L), W: mm(dims.W), H: mm(dims.H), taper: taperMm, cups: cupsArg });
  }, [styleId, dims.L, dims.W, dims.H, taperMm, cups, cellsX, cellsY, units, ready, has3d]);

  const dieMask = useMemo(
    () => (view === "3d" && rig && DIE_MASK_STYLES.has(styleId) && result?.valid ? buildDieMask(result) : null),
    [view, rig, styleId, result],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      {/* Controls */}
      <div className="space-y-5">
        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Box style</h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(STYLES).map(([id, s]) => (
              <button
                key={id}
                onClick={() => switchStyle(id)}
                className={
                  id === styleId
                    ? "rounded-full bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-gray-100 dark:text-gray-900"
                    : "rounded-full border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:border-gray-900 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-300"
                }
              >
                {s.label}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Internal box size</h2>
            <div className="flex overflow-hidden rounded-md border border-gray-300 text-xs dark:border-gray-700">
              {["in", "mm"].map((u) => (
                <button
                  key={u}
                  onClick={() => switchUnits(u)}
                  className={
                    u === units
                      ? "bg-gray-900 px-3 py-1 font-semibold text-white dark:bg-gray-100 dark:text-gray-900"
                      : "bg-white px-3 py-1 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300"
                  }
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              [(style.fieldLabels || ["Length", "Width", "Height"])[0], L, setL, style.hints.L],
              [(style.fieldLabels || ["Length", "Width", "Height"])[1], W, setW, style.hints.W],
              [(style.fieldLabels || ["Length", "Width", "Height"])[2], H, setH, style.hints.H],
            ].map(([label, val, set, hint]) => (
              <label key={label} className="block">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  {label} ({units})
                </span>
                <input
                  type="number"
                  min="0"
                  step={units === "mm" ? "1" : "0.25"}
                  value={val}
                  onChange={(e) => set(e.target.value)}
                  className={inputCls}
                />
                <span className="mt-0.5 block text-[10px] leading-tight text-gray-400">{hint}</span>
              </label>
            ))}
          </div>

          {style.hasCups && (
            <div className="mt-3 flex gap-2">
              {[[2, "Take Away Two Cup Holder"], [1, "Single Cup Holder"]].map(([n, label]) => (
                <button
                  key={n}
                  onClick={() => setCups(n)}
                  className={
                    cups === n
                      ? "rounded-full bg-gray-900 px-3 py-1 text-xs font-semibold text-white dark:bg-gray-100 dark:text-gray-900"
                      : "rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300"
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {style.hasCupPicker && (
            <div className="mt-3">
              <label className="block">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Load from catalog (master_products)</span>
                <select value={cupSku} onChange={(e) => applyCupSku(e.target.value)} className={inputCls}>
                  <option value="">— pick a paper cup SKU —</option>
                  {(cupList || []).map((c) => (
                    <option key={c.sku} value={c.sku}>
                      {c.sku} · {c.name}
                    </option>
                  ))}
                </select>
              </label>
              {cupList === null && styleId === "papercup" && (
                <p className="mt-1 text-[10px] text-gray-400">Loading catalog…</p>
              )}
              {cupNote && <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{cupNote}</p>}

              <div className="mt-3 rounded-md border border-gray-200 p-2 dark:border-gray-800">
                <p className="mb-1.5 text-xs font-semibold text-gray-900 dark:text-gray-100">Sheet layout (offset / flexo)</p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-[11px] text-gray-600 dark:text-gray-400">Print area W (mm)</span>
                    <input type="number" min="100" value={printW} onChange={(e) => setPrintW(e.target.value)} className={inputCls} />
                  </label>
                  <label className="block">
                    <span className="text-[11px] text-gray-600 dark:text-gray-400">Print area H (mm)</span>
                    <input type="number" min="100" value={printH} onChange={(e) => setPrintH(e.target.value)} className={inputCls} />
                  </label>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {[["668.37", "395.37", "Offset 668×395"], ["737.54", "370.27", "Flexo 737×370"], ["750", "440", "750×440"]].map(([w, h, lbl]) => (
                    <button key={lbl} onClick={() => { setPrintW(w); setPrintH(h); }} className="rounded-full border border-gray-300 px-2 py-0.5 text-[11px] text-gray-600 hover:border-gray-500 dark:border-gray-700 dark:text-gray-300">
                      {lbl}
                    </button>
                  ))}
                </div>
                {nesting?.valid ? (
                  <>
                    <p className="mt-1.5 text-[11px] text-gray-600 dark:text-gray-300">
                      {nesting.meta.ups}-up · {nesting.meta.nU}×{nesting.meta.nRu} upright + {nesting.meta.nI}×{nesting.meta.nRi} inverted · pitch {nesting.meta.pitchMm} × {nesting.meta.vPitchMm} mm
                    </p>
                    <div className="mt-1.5 flex gap-1.5">
                      {["svg", "pdf", "dxf"].map((ext) => (
                        <button key={ext} onClick={() => downloadLayout(ext)} className="rounded-md border border-gray-300 px-2.5 py-1 text-[11px] font-semibold uppercase text-gray-700 hover:border-gray-900 dark:border-gray-700 dark:text-gray-200">
                          Layout {ext}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="mt-1.5 text-[11px] text-amber-600">{nesting?.warnings?.[0] || "Layout unavailable for these dims."}</p>
                )}
              </div>
            </div>
          )}
          {style.hasCells && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Columns (along L)</span>
                <input type="number" min="1" max="12" step="1" value={cellsX} onChange={(e) => setCellsX(e.target.value)} className={inputCls} />
                <span className="mt-0.5 block text-[10px] leading-tight text-gray-400">cells across the length</span>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Rows (along W)</span>
                <input type="number" min="1" max="12" step="1" value={cellsY} onChange={(e) => setCellsY(e.target.value)} className={inputCls} />
                <span className="mt-0.5 block text-[10px] leading-tight text-gray-400">cells across the width</span>
              </label>
            </div>
          )}
          {style.hasCartonType && (
            <label className="mt-3 block">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Carton type</span>
              <select value={cartonType} onChange={(e) => setCartonType(e.target.value)} className={inputCls}>
                {CARTON_TYPES.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </label>
          )}
          {style.hasCartonType && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Glue flap side</span>
                <select value={glueSide} onChange={(e) => setGlueSide(e.target.value)} className={inputCls}>
                  <option value="left">Left (on the front panel)</option>
                  <option value="right">Right (on the back panel)</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Glue flap width ({units})</span>
                <input type="number" min="0" step="0.5" placeholder="auto (12\u201320 mm)" value={glueW} onChange={(e) => setGlueW(e.target.value)} className={inputCls} />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Cup holes (front panel)</span>
                <select value={holeCount} onChange={(e) => setHoleCount(+e.target.value)} className={inputCls}>
                  <option value={1}>1 (single cup)</option>
                  <option value={2}>2 (double cup)</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                </select>
              </label>
              <label className="flex items-center gap-2 self-end pb-2">
                <input type="checkbox" checked={holeNotch} onChange={(e) => setHoleNotch(e.target.checked)} />
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Centre notch between holes</span>
              </label>
            </div>
          )}
          {style.hasBagType && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Bag type</span>
                <select value={bagType} onChange={(e) => setBagType(e.target.value)} className={inputCls}>
                  {BAG_TYPES.map((b) => (
                    <option key={b.id} value={b.id}>{b.label}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Top hem (mm)</span>
                <input
                  type="number"
                  min="0"
                  placeholder={bagType === "handle" ? "auto 35" : "0"}
                  value={hem}
                  onChange={(e) => setHem(e.target.value)}
                  className={inputCls}
                />
              </label>
            </div>
          )}
          {style.hasWindow && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{style.windowLabels?.[0] || `Window W (${units}, optional)`}</span>
                <input type="number" min="0" value={winW} onChange={(e) => setWinW(e.target.value)} className={inputCls} />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{style.windowLabels?.[1] || `Window H (${units}, optional)`}</span>
                <input type="number" min="0" value={winH} onChange={(e) => setWinH(e.target.value)} className={inputCls} />
              </label>
            </div>
          )}
          {style.hasTaper && (
            <label className="mt-3 block">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Wall taper (mm per side)</span>
              <input
                type="number"
                min="3"
                step="0.5"
                value={taper}
                onChange={(e) => setTaper(e.target.value)}
                className={inputCls + " max-w-[120px]"}
              />
              <span className="mt-0.5 block text-[10px] leading-tight text-gray-400">
                base = top − 2×taper each way · 7 on the 500/750 mL dies, 10 on the 1000 mL
              </span>
            </label>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {style.presets.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p)}
                className="rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:border-gray-900 hover:text-gray-900 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-300 dark:hover:text-white"
              >
                {p.label}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Material</h2>
          <div className="grid grid-cols-1 gap-2">
            <select
              value={matFamily}
              onChange={(e) => { setMatFamily(e.target.value); setMatIdx(0); setMatCustomMm(""); }}
              className={inputCls}
            >
              {MATERIALS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <select value={matIdx} onChange={(e) => setMatIdx(+e.target.value)} className={inputCls}>
              {(MATERIALS.find((m) => m.id === matFamily)?.options || []).map((o, i) => (
                <option key={o.label} value={i}>{o.label}</option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              step="0.05"
              placeholder="Custom thickness mm (optional)"
              value={matCustomMm}
              onChange={(e) => setMatCustomMm(e.target.value)}
              className={inputCls}
            />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
            Stamped on every export and used for the outer-size estimate below. Dims stay INTERNAL.
            {["tuckbox", "pizzabox", "snackbox"].includes(styleId)
              ? " On this die-exact family the caliper also steps the fold allowances (roll creases, tuck/dust offsets, slots) — reference die is E-flute 1.5 mm."
              : " Thickness allowances on folds remain the die maker's call."}
          </p>
        </section>

        {blank && (
          <section className="rounded-lg border border-gray-200 bg-white p-4 text-sm shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <h2 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Blank (sheet) size</h2>
            <dl className="space-y-1 text-gray-700 dark:text-gray-300">
              <div className="flex justify-between">
                <dt>Blank width</dt>
                <dd className="font-mono">{fmtBoth(blank.widthPt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Blank height</dt>
                <dd className="font-mono">{fmtBoth(blank.heightPt)}</dd>
              </div>
              {blank.flapDepthPt != null && style.depthLabel && (
                <div className="flex justify-between">
                  <dt>{style.depthLabel}</dt>
                  <dd className="font-mono">{fmtBoth(blank.flapDepthPt)}</dd>
                </div>
              )}
              {boardMm > 0 && ready && (
                <div className="flex justify-between text-gray-500 dark:text-gray-400">
                  <dt>Outer size (approx, +board)</dt>
                  <dd className="font-mono">
                    {outerDim(dims.L, boardMm, units)} × {outerDim(dims.W, boardMm, units)} × {outerDimH(dims.H, boardMm, units)} {units}
                  </dd>
                </div>
              )}
            </dl>
            <p className="mt-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{style.note}</p>
          </section>
        )}

        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Download</h2>
          <div className="grid grid-cols-3 gap-2">
            {["pdf", "svg", "dxf"].map((ext) => (
              <button
                key={ext}
                onClick={() => download(ext)}
                disabled={!blank}
                className="rounded-md bg-gray-900 px-3 py-2 text-xs font-semibold uppercase text-white hover:bg-gray-700 disabled:opacity-40 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
              >
                {ext}
              </button>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
            <input type="checkbox" checked={showDims} onChange={(e) => setShowDims(e.target.checked)} />
            Include dimension annotations (PDF / SVG)
          </label>
          <p className="mt-2 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
            PDF and SVG are true-scale vectors. DXF is in mm with CUT / CREASE layers for the
            die maker. Red = cut, green = crease.
          </p>
        </section>
      </div>

      {/* Preview */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex overflow-hidden rounded-md border border-gray-300 text-xs dark:border-gray-700">
            {[["2d", "Dieline"], ["3d", "3D fold"]].map(([v, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                disabled={v === "3d" && !has3d}
                className={
                  v === view
                    ? "bg-gray-900 px-3 py-1.5 font-semibold text-white dark:bg-gray-100 dark:text-gray-900"
                    : "bg-white px-3 py-1.5 text-gray-600 hover:bg-gray-50 disabled:opacity-40 dark:bg-gray-800 dark:text-gray-300"
                }
              >
                {label}
              </button>
            ))}
          </div>
          {view === "3d" && has3d && (
            <div className="flex flex-1 items-center gap-2 pl-4">
              <span className="text-[10px] uppercase tracking-wide text-gray-400">Flat</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={foldT}
                onChange={(e) => setFoldT(+e.target.value)}
                className="w-full max-w-xs accent-gray-900 dark:accent-gray-100"
              />
              <span className="text-[10px] uppercase tracking-wide text-gray-400">Closed</span>
            </div>
          )}
        </div>
        {result?.warnings?.length > 0 && (
          <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            {result.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </div>
        )}
        {view === "3d" && rig ? (
          <>
            <Fold3DViewer ref={viewerRef} panels={rig} foldT={foldT} artwork={artwork} backdrop={backdrop} surface={surface} styleId={styleId} dieMask={dieMask} />
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Material</span>
              {SURFACES_3D.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSurface3d(s.id)}
                  title={s.label}
                  className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] ${
                    surface === s.id
                      ? "border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900"
                      : "border-gray-300 text-gray-600 hover:border-gray-500 dark:border-gray-700 dark:text-gray-300"
                  }`}
                >
                  <span className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ background: s.swatch }} />
                  {s.label}
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="cursor-pointer rounded-md bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900">
                {artwork ? "Replace artwork" : "Upload artwork"}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onArtworkFile} />
              </label>
              {artwork && (
                <button onClick={() => setArtwork(null)} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300">
                  Clear
                </button>
              )}
              <select value={backdrop} onChange={(e) => setBackdrop(e.target.value)} className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                <option value="studio">Studio grey</option>
                <option value="white">White</option>
                <option value="warm">Warm</option>
                <option value="dark">Dark</option>
              </select>
              <div className="ml-auto flex gap-2">
                <button onClick={() => exportMockup("png")} disabled={!!exporting} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-gray-900 disabled:opacity-40 dark:border-gray-700 dark:text-gray-200">
                  {exporting === "png" ? "Exporting…" : "Export PNG"}
                </button>
                <button onClick={() => exportMockup("webm")} disabled={!!exporting} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-gray-900 disabled:opacity-40 dark:border-gray-700 dark:text-gray-200">
                  {exporting === "webm" ? "Recording…" : "Turntable video"}
                </button>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-gray-400">
              Drag to orbit · scroll to zoom · slider folds the blank. Artwork maps to the flat blank (print side) and
              folds with the box — set the slider to Flat to position your design. Simplified panel model; the dieline
              stays the source of truth.
            </p>
          </>
        ) : svg ? (
          <div
            className="dieline-preview w-full overflow-auto rounded-md bg-white p-2 [&_svg]:h-auto [&_svg]:w-full"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <p className="py-16 text-center text-sm text-gray-400">Enter a valid size to preview the die.</p>
        )}
      </div>
    </div>
  );
}

function outerDim(v, boardMm, units) {
  const t = units === "mm" ? boardMm : boardMm / 25.4;
  return +(v + 2 * t).toFixed(units === "mm" ? 1 : 3);
}
function outerDimH(v, boardMm, units) {
  const t = units === "mm" ? boardMm : boardMm / 25.4;
  return +(v + t).toFixed(units === "mm" ? 1 : 3);
}
