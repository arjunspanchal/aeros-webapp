// Form state → engine spec, one function per family. Pure, so the forms stay
// dumb: they hold strings, this turns them into the numbers the engine takes.
// A blank field means "use the rate book", never zero.

// A typed number: "12,000" is 12000; a blank, a space, "abc", "0x10" or "1e9" is nothing.
export const num = (v) => {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const s = String(v).trim().replace(/(\d),(?=\d)/g, "$1");
  return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : undefined;
};

const UNIT_MM = { mm: 1, cm: 10, in: 25.4 };
/** Customer sizes are converted, never snapped (25.4 mm to the inch). */
export const toMm = (v, unit) => {
  const x = num(v);
  return x === undefined ? undefined : Math.round(x * UNIT_MM[unit] * 10) / 10;
};

// ── Bags ────────────────────────────────────────────────────────────────────
export const BAG_INITIAL = {
  type: "twisted", unit: "mm", W: "280", G: "150", H: "280",
  paperId: "", gsm: "90", paperRate: "", colour: "brown", supplier: "", paperLabel: "", paperType: "Brown Kraft",
  slab: "none", colours: "1", printRate: "", platePerColour: "", process: false,
  handleKind: "", handleMaterial: "", handlePasting: "", handleSize: "150",
  qty: "15000", casePack: "", marginPct: "", destination: "domestic", fob: false, fx: "", unitsPerContainer: "",
  conversion: "", wastagePct: "", wastageBase: "paper_print_conv", cartonPerCase: "", cartonReal: false,
  gluePerBag: "", deckle: "", cutoff: "", route: "auto", packing: "auto", extras: [],
};

export function bagSpec(s) {
  const handleBag = s.type === "twisted" || s.type === "flat";
  const blank = num(s.deckle) || num(s.cutoff) ? { deckle: num(s.deckle), cutoff: num(s.cutoff) } : undefined;
  return {
    family: "bag",
    type: s.type,
    W: toMm(s.W, s.unit), G: toMm(s.G, s.unit) ?? 0, H: toMm(s.H, s.unit),
    gsm: num(s.gsm), paperRate: num(s.paperRate),
    // grade (Brown Kraft / Bleach Kraft White / OGR / MG) is what the customer copy names; the mill never is
    paper: { label: s.paperLabel, colour: s.colour, supplier: s.supplier, grade: s.paperType, id: s.paperId || undefined },
    blank,
    print: { slab: s.slab, colours: num(s.colours) ?? 1, ratePerKg: num(s.printRate), platePerColour: num(s.platePerColour), process: s.process && s.slab !== "none" ? true : undefined },
    handle: handleBag ? { kind: s.handleKind || undefined, material: num(s.handleMaterial), pasting: num(s.handlePasting), sizeMm: num(s.handleSize) } : undefined,
    conversionPerKg: num(s.conversion), wastagePct: num(s.wastagePct), wastageBase: s.wastageBase,
    gluePerBag: num(s.gluePerBag),
    casePack: num(s.casePack),
    carton: s.cartonReal ? { real: true } : num(s.cartonPerCase) !== undefined ? { perCase: num(s.cartonPerCase) } : undefined,
    packing: s.packing,
    extras: s.extras.filter((e) => e.label && num(e.perBag) !== undefined).map((e) => ({ label: e.label, perBag: num(e.perBag) })),
    qty: num(s.qty), marginPct: num(s.marginPct), route: s.route, destination: s.destination,
    // FOB only exists on an export quote: a leftover tick must not turn an India quote into FOB.
    export: s.fob && s.destination !== "domestic" ? { fx: num(s.fx), unitsPerContainer: num(s.unitsPerContainer) } : undefined,
  };
}

// ── Cups and tubs ───────────────────────────────────────────────────────────
export const CUP_SIZES = {
  SW: ["8oz", "10oz", "12oz", "16oz", "20oz", "24oz"],
  DW: ["4oz", "8oz", "10oz", "12oz", "16oz", "20oz", "24oz"],
  TUB: ["350_ml", "400_ml", "500_ml", "750_ml"],
};

export const CUP_INITIAL = {
  wall: "SW", size: "8oz", gsm: "260", outerGsm: "", cupWeight: "",
  boardBasis: "poly", polyRate: "", paper: "APP", paperRate: "", outerPaper: "TNPL", outerRate: "", outerCoated: false,
  printMode: "none", colours: "1", printRate: "", offsetSheetRate: "", varnish: true, punch: "5", viana: false, genericDesign: false,
  sheetW: "", sheetH: "", sheetUps: "", outerSheetW: "", outerSheetH: "", outerSheetUps: "", glueG: "",
  vendorRate: "", qty: "25000", casePack: "", carton: "", marginPct: "",
  fob: false, us: true, chargesPerContainer: "", unitsPerContainer: "", fx: "",
};

export function cupSpec(s) {
  const dw = s.wall === "DW";
  const tub = s.wall === "TUB";
  const poly = s.boardBasis === "poly" && !tub;
  const printed = s.printMode !== "none";
  // A sheet is only sent once all three of its fields are filled.
  const sheetOf = (w, h, ups) => (num(w) !== undefined && num(h) !== undefined && num(ups) !== undefined ? { w: num(w), h: num(h), ups: num(ups) } : undefined);
  const sheet = sheetOf(s.sheetW, s.sheetH, s.sheetUps);
  const outerSame = s.outerPaper === "same";
  return {
    family: "cup",
    wall: s.wall, size: s.size,
    gsm: num(s.gsm), outerGsm: dw ? num(s.outerGsm) : undefined, cupWeight: tub ? undefined : num(s.cupWeight),
    polyBoard: poly, polyRate: poly ? num(s.polyRate) : undefined,
    paper: s.paper, paperRate: num(s.paperRate),
    outerPaper: dw && !outerSame ? s.outerPaper : undefined,
    outerRate: dw && !outerSame ? num(s.outerRate) : undefined,
    outerCoated: dw && outerSame && s.outerCoated,
    outerSheet: dw ? sheetOf(s.outerSheetW, s.outerSheetH, s.outerSheetUps) : undefined,
    print: printed
      ? { mode: s.printMode, colours: num(s.colours) ?? 1, ratePerKg: num(s.printRate), offsetSheetRate: num(s.offsetSheetRate), varnish: s.varnish }
      : { mode: "none" },
    punchPerKg: printed ? num(s.punch) : undefined,
    viana: printed && s.viana, genericDesign: s.genericDesign,
    sheet, glueG: num(s.glueG),
    vendorRate: num(s.vendorRate),
    qty: num(s.qty), casePack: num(s.casePack), carton: num(s.carton), marginPct: num(s.marginPct),
    // Sent whenever FOB is ticked, so the engine can say what is missing instead of dropping it.
    export: s.fob ? { chargesPerContainer: num(s.chargesPerContainer), unitsPerContainer: num(s.unitsPerContainer), fx: num(s.fx), us: s.us } : undefined,
  };
}

// ── Boxes ───────────────────────────────────────────────────────────────────
export const BOARDS = {
  fbb: { label: "FBB", rateKey: "box.board.fbb" },
  allyking: { label: "Allyking Hi-Bulk FBB", rateKey: "box.board.allyking_290" },
  kraft: { label: "Brown kraft", rateKey: "box.board.kraft" },
  kraft_300_high: { label: "Kraft 300 sheets", rateKey: "box.board.kraft_300_high" },
  duplex: { label: "Duplex", rateKey: "box.board.duplex" },
  art_card: { label: "Art card", rateKey: "box.board.art_card" },
  custom: { label: "Other board", rateKey: null },
};

export const BOX_INITIAL = {
  name: "", sheetKey: "25x36", sheetW: "", sheetH: "", ups: "", blankW: "", blankH: "", boardGPerPc: "",
  boardKey: "fbb", gsm: "300", boardRate: "", pe: false,
  construction: "four_corner", printMode: "none", printer: "blueline_walkin", colours: "4", sides: "1",
  finishOutside: "none", finishInside: "none", conversionAllIn: "", pastingPerPc: "", wastagePct: "",
  casePack: "250", cartonPerCase: "", cartonL: "", cartonB: "", cartonH: "", polyCost: "", polyPer: "",
  qty: "5000", marginPct: "", dieCost: "", size: "", printPer1000: "", punchPer1000: "",
};

export function boxSpec(s) {
  const sheet = s.sheetKey === "custom" ? (num(s.sheetW) && num(s.sheetH) ? { w: num(s.sheetW), h: num(s.sheetH) } : undefined) : s.sheetKey;
  const board = BOARDS[s.boardKey];
  // A half-entered carton or poly is sent as it is, so the engine can say what is missing.
  const anyDim = [s.cartonL, s.cartonB, s.cartonH].some((v) => num(v) !== undefined);
  const carton = num(s.cartonPerCase) !== undefined ? { perCase: num(s.cartonPerCase) }
    : anyDim ? { l: num(s.cartonL), b: num(s.cartonB), h: num(s.cartonH) } : undefined;
  return {
    family: "box",
    name: s.name || "Box",
    size: s.size || undefined,
    sheet, ups: num(s.ups),
    blank: num(s.blankW) && num(s.blankH) ? { w: num(s.blankW), h: num(s.blankH) } : undefined,
    boardGPerPc: num(s.boardGPerPc),
    // The engine reads the board and PE rates from the rate book, so the saved
    // quote records them; a typed rate sets it for this quote only.
    board: { label: board.label, gsm: num(s.gsm), rateKey: board.rateKey ?? undefined, ratePerKg: num(s.boardRate), pe: s.pe },
    construction: s.construction,
    // The printer also punches plain boxes, so it is sent whatever the print mode.
    printer: s.printer,
    print: s.printMode === "card" ? { mode: "card", colours: num(s.colours) ?? 1, sides: num(s.sides) ?? 1, per1000: num(s.printPer1000) } : { mode: s.printMode },
    punchPer1000: num(s.punchPer1000),
    finish: { outside: s.finishOutside, inside: s.finishInside },
    conversionAllIn: num(s.conversionAllIn), pastingPerPc: num(s.pastingPerPc), wastagePct: num(s.wastagePct),
    packing: {
      casePack: num(s.casePack), carton,
      poly: num(s.polyCost) !== undefined ? { cost: num(s.polyCost), per: num(s.polyPer) } : undefined,
    },
    qty: num(s.qty), marginPct: num(s.marginPct), dieCost: num(s.dieCost),
  };
}

// ── Wrap paper ──────────────────────────────────────────────────────────────
// Papers a wrap is made from, out of the paper master.
export const WRAP_PAPER_TYPES = ["OGR", "MG", "Bleach Kraft White"];

export const WRAP_INITIAL = {
  name: "", unit: "mm", W: "254", L: "279", gsm: "40",
  paperId: "", paperRate: "", paperLabel: "", paperType: "OGR", supplier: "",
  printMode: "none", colours: "1", source: "reel", sheetKey: "20x30", sheetW: "", sheetH: "", ups: "",
  qty: "100000", casePack: "", marginPct: "",
  printRate: "", printPer1000: "", platePerColour: "", wastagePct: "", cuttingPerKg: "", cartonPerCase: "",
};

export function wrapSpec(s) {
  const mode = s.printMode;
  // flexo prints on the reel, offset on stock sheets; a plain wrap can be either
  const source = mode === "flexo" ? "reel" : mode === "offset" ? "sheet" : s.source;
  const sheet = source !== "sheet" ? undefined : s.sheetKey === "custom" ? (num(s.sheetW) && num(s.sheetH) ? { w: num(s.sheetW), h: num(s.sheetH) } : undefined) : s.sheetKey;
  return {
    family: "wrap",
    name: s.name || undefined,
    W: toMm(s.W, s.unit), L: toMm(s.L, s.unit),
    gsm: num(s.gsm), paperRate: num(s.paperRate),
    paper: { label: s.paperLabel, grade: s.paperType, supplier: s.supplier, id: s.paperId || undefined },
    source, sheet, ups: source === "sheet" ? num(s.ups) : undefined,
    print: mode === "none" ? { mode: "none" }
      : { mode, colours: num(s.colours) ?? 1, ratePerKg: mode === "flexo" ? num(s.printRate) : undefined, per1000: mode === "offset" ? num(s.printPer1000) : undefined, platePerColour: num(s.platePerColour) },
    qty: num(s.qty), casePack: num(s.casePack), marginPct: num(s.marginPct),
    wastagePct: num(s.wastagePct), cuttingPerKg: mode === "offset" ? undefined : num(s.cuttingPerKg),
    carton: num(s.cartonPerCase) !== undefined ? { perCase: num(s.cartonPerCase) } : undefined,
  };
}

// ── PP items (injection moulded cups and lids) ──────────────────────────────
export const PP_INITIAL = {
  item: "350_cup", kind: "cup", name: "", itemWeight: "", rmRate: "",
  printColours: "0", qty: "100000", casePack: "", marginPct: "",
  cycleTime: "", cavities: "", shiftHrs: "", shiftsPerDay: "", labourPerDay: "",
  runnerG: "", regrindPct: "", powerKw: "", powerRate: "", mouldCost: "", mouldLifeShots: "", rejectPct: "",
  printRate: "", platePerColour: "", printRejectPct: "",
  sleeveCost: "", sleevePackLabour: "", unitsPerSleeve: "", cartonPerCase: "",
};

export function ppSpec(s) {
  const colours = num(s.printColours) ?? 0;
  return {
    family: "pp",
    item: s.item, kind: s.item === "custom" ? s.kind : undefined, name: s.name || undefined,
    itemWeightG: num(s.itemWeight), rmRate: num(s.rmRate),
    cycleTimeS: num(s.cycleTime), cavities: num(s.cavities), shiftHrs: num(s.shiftHrs), shiftsPerDay: num(s.shiftsPerDay), labourPerDay: num(s.labourPerDay),
    runnerGPerShot: num(s.runnerG), regrindPct: num(s.regrindPct), powerKw: num(s.powerKw), powerRate: num(s.powerRate),
    mouldCost: num(s.mouldCost), mouldLifeShots: num(s.mouldLifeShots), rejectPct: num(s.rejectPct),
    // a plain item sends no print block at all
    print: colours > 0 ? { colours, ratePerColour: num(s.printRate), platePerColour: num(s.platePerColour), rejectPct: num(s.printRejectPct) } : undefined,
    sleeveCost: num(s.sleeveCost), sleevePackLabour: num(s.sleevePackLabour), unitsPerSleeve: num(s.unitsPerSleeve), cartonPerCase: num(s.cartonPerCase),
    casePack: num(s.casePack), qty: num(s.qty), marginPct: num(s.marginPct),
  };
}

// ── Engine spec → form state ────────────────────────────────────────────────
// The reverse of the three functions above, used to put a line of the quote
// (or a line of a reopened saved quote) back into the form for editing.
// Round trip: xSpec(xState(spec)) is the same spec.

const str = (v) => (v === undefined || v === null ? "" : String(v));

export function bagState(spec) {
  return {
    ...BAG_INITIAL,
    type: spec.type, unit: "mm", W: str(spec.W), G: str(spec.G), H: str(spec.H),
    paperId: spec.paper?.id ?? "", gsm: str(spec.gsm), paperRate: str(spec.paperRate),
    colour: spec.paper?.colour ?? "brown", supplier: spec.paper?.supplier ?? "", paperLabel: spec.paper?.label ?? "", paperType: spec.paper?.grade ?? "Brown Kraft",
    slab: spec.print?.slab ?? "none", colours: str(spec.print?.colours ?? 1), printRate: str(spec.print?.ratePerKg), platePerColour: str(spec.print?.platePerColour), process: spec.print?.process === true,
    handleKind: spec.handle?.kind ?? "", handleMaterial: str(spec.handle?.material), handlePasting: str(spec.handle?.pasting), handleSize: str(spec.handle?.sizeMm ?? 150),
    qty: str(spec.qty), casePack: str(spec.casePack), marginPct: str(spec.marginPct),
    destination: spec.destination ?? "domestic", fob: Boolean(spec.export), fx: str(spec.export?.fx), unitsPerContainer: str(spec.export?.unitsPerContainer),
    conversion: str(spec.conversionPerKg), wastagePct: str(spec.wastagePct), wastageBase: spec.wastageBase ?? "paper_print_conv",
    cartonPerCase: str(spec.carton?.perCase), cartonReal: Boolean(spec.carton?.real),
    gluePerBag: str(spec.gluePerBag), deckle: str(spec.blank?.deckle), cutoff: str(spec.blank?.cutoff),
    route: spec.route ?? "auto", packing: spec.packing ?? "auto",
    extras: (spec.extras ?? []).map((e) => ({ label: e.label, perBag: str(e.perBag) })),
  };
}

export function cupState(spec) {
  const wall = String(spec.wall).toUpperCase();
  const printed = spec.print?.mode && spec.print.mode !== "none";
  return {
    ...CUP_INITIAL,
    wall, size: spec.size, gsm: str(spec.gsm), outerGsm: str(spec.outerGsm), cupWeight: str(spec.cupWeight),
    boardBasis: spec.polyBoard || wall === "TUB" ? "poly" : "paper", polyRate: str(spec.polyRate),
    paper: spec.paper ?? "APP", paperRate: str(spec.paperRate),
    outerPaper: wall === "DW" ? spec.outerPaper ?? "same" : CUP_INITIAL.outerPaper, outerRate: str(spec.outerRate), outerCoated: Boolean(spec.outerCoated),
    printMode: spec.print?.mode ?? "none", colours: str(spec.print?.colours ?? 1), printRate: str(spec.print?.ratePerKg), offsetSheetRate: str(spec.print?.offsetSheetRate),
    varnish: spec.print?.varnish ?? true, punch: printed ? str(spec.punchPerKg) : CUP_INITIAL.punch, viana: Boolean(spec.viana), genericDesign: Boolean(spec.genericDesign),
    sheetW: str(spec.sheet?.w), sheetH: str(spec.sheet?.h), sheetUps: str(spec.sheet?.ups),
    outerSheetW: str(spec.outerSheet?.w), outerSheetH: str(spec.outerSheet?.h), outerSheetUps: str(spec.outerSheet?.ups),
    glueG: str(spec.glueG), vendorRate: str(spec.vendorRate),
    qty: str(spec.qty), casePack: str(spec.casePack), carton: str(spec.carton), marginPct: str(spec.marginPct),
    fob: Boolean(spec.export), us: spec.export?.us ?? true, chargesPerContainer: str(spec.export?.chargesPerContainer), unitsPerContainer: str(spec.export?.unitsPerContainer), fx: str(spec.export?.fx),
  };
}

export function boxState(spec) {
  const custom = typeof spec.sheet !== "string";
  const boardKey = Object.keys(BOARDS).find((k) => BOARDS[k].label === spec.board?.label && (BOARDS[k].rateKey ?? undefined) === (spec.board?.rateKey ?? undefined)) ?? "custom";
  const card = spec.print?.mode === "card";
  return {
    ...BOX_INITIAL,
    name: spec.name === "Box" ? "" : spec.name ?? "",
    sheetKey: custom ? "custom" : spec.sheet, sheetW: custom ? str(spec.sheet?.w) : "", sheetH: custom ? str(spec.sheet?.h) : "",
    ups: str(spec.ups), blankW: str(spec.blank?.w), blankH: str(spec.blank?.h), boardGPerPc: str(spec.boardGPerPc),
    boardKey, gsm: str(spec.board?.gsm), boardRate: str(spec.board?.ratePerKg), pe: Boolean(spec.board?.pe),
    construction: spec.construction ?? "flat", printMode: spec.print?.mode ?? "none", printer: spec.printer ?? "blueline_walkin",
    colours: card ? str(spec.print.colours ?? 1) : BOX_INITIAL.colours, sides: card ? str(spec.print.sides ?? 1) : BOX_INITIAL.sides,
    finishOutside: spec.finish?.outside ?? "none", finishInside: spec.finish?.inside ?? "none",
    conversionAllIn: str(spec.conversionAllIn), pastingPerPc: str(spec.pastingPerPc), wastagePct: str(spec.wastagePct),
    casePack: str(spec.packing?.casePack), cartonPerCase: str(spec.packing?.carton?.perCase),
    cartonL: str(spec.packing?.carton?.l), cartonB: str(spec.packing?.carton?.b), cartonH: str(spec.packing?.carton?.h),
    polyCost: str(spec.packing?.poly?.cost), polyPer: str(spec.packing?.poly?.per),
    qty: str(spec.qty), marginPct: str(spec.marginPct), dieCost: str(spec.dieCost),
    size: spec.size ?? "", printPer1000: card ? str(spec.print.per1000) : "", punchPer1000: str(spec.punchPer1000),
  };
}

export function wrapState(spec) {
  const custom = spec.sheet && typeof spec.sheet !== "string";
  const mode = spec.print?.mode ?? "none";
  return {
    ...WRAP_INITIAL,
    name: spec.name ?? "", unit: "mm", W: str(spec.W), L: str(spec.L), gsm: str(spec.gsm),
    paperId: spec.paper?.id ?? "", paperRate: str(spec.paperRate), paperLabel: spec.paper?.label ?? "", paperType: spec.paper?.grade ?? "OGR", supplier: spec.paper?.supplier ?? "",
    printMode: mode, colours: str(spec.print?.colours ?? 1), source: spec.source ?? "reel",
    sheetKey: custom ? "custom" : spec.sheet ?? WRAP_INITIAL.sheetKey, sheetW: custom ? str(spec.sheet.w) : "", sheetH: custom ? str(spec.sheet.h) : "", ups: str(spec.ups),
    qty: str(spec.qty), casePack: str(spec.casePack), marginPct: str(spec.marginPct),
    printRate: str(spec.print?.ratePerKg), printPer1000: str(spec.print?.per1000), platePerColour: str(spec.print?.platePerColour),
    wastagePct: str(spec.wastagePct), cuttingPerKg: str(spec.cuttingPerKg), cartonPerCase: str(spec.carton?.perCase),
  };
}

export function ppState(spec) {
  return {
    ...PP_INITIAL,
    item: spec.item ?? "custom", kind: spec.kind ?? "cup", name: spec.name ?? "", itemWeight: str(spec.itemWeightG), rmRate: str(spec.rmRate),
    printColours: str(spec.print?.colours ?? 0), qty: str(spec.qty), casePack: str(spec.casePack), marginPct: str(spec.marginPct),
    cycleTime: str(spec.cycleTimeS), cavities: str(spec.cavities), shiftHrs: str(spec.shiftHrs), shiftsPerDay: str(spec.shiftsPerDay), labourPerDay: str(spec.labourPerDay),
    runnerG: str(spec.runnerGPerShot), regrindPct: str(spec.regrindPct), powerKw: str(spec.powerKw), powerRate: str(spec.powerRate),
    mouldCost: str(spec.mouldCost), mouldLifeShots: str(spec.mouldLifeShots), rejectPct: str(spec.rejectPct),
    printRate: str(spec.print?.ratePerColour), platePerColour: str(spec.print?.platePerColour), printRejectPct: str(spec.print?.rejectPct),
    sleeveCost: str(spec.sleeveCost), sleevePackLabour: str(spec.sleevePackLabour), unitsPerSleeve: str(spec.unitsPerSleeve), cartonPerCase: str(spec.cartonPerCase),
  };
}

export const SPEC_OF = { bag: bagSpec, cup: cupSpec, box: boxSpec, wrap: wrapSpec, pp: ppSpec };
export const STATE_OF = { bag: bagState, cup: cupState, box: boxState, wrap: wrapState, pp: ppState };
