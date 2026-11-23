// Form state → engine spec, one function per family. Pure, so the forms stay
// dumb: they hold strings, this turns them into the numbers the engine takes.
// A blank field means "use the rate book", never zero.

export const num = (v) => {
  if (v === "" || v === null || v === undefined) return undefined;
  const x = Number(v);
  return Number.isFinite(x) ? x : undefined;
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
  paperId: "", gsm: "90", paperRate: "", colour: "brown", supplier: "", paperLabel: "",
  slab: "none", colours: "1", printRate: "", platePerColour: "",
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
    paper: { label: s.paperLabel, colour: s.colour, supplier: s.supplier, id: s.paperId || undefined },
    blank,
    print: { slab: s.slab, colours: num(s.colours) ?? 1, ratePerKg: num(s.printRate), platePerColour: num(s.platePerColour) },
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
  qty: "5000", marginPct: "", dieCost: "",
};

export function boxSpec(s) {
  const sheet = s.sheetKey === "custom" ? (num(s.sheetW) && num(s.sheetH) ? { w: num(s.sheetW), h: num(s.sheetH) } : undefined) : s.sheetKey;
  const board = BOARDS[s.boardKey];
  const carton = num(s.cartonPerCase) !== undefined ? { perCase: num(s.cartonPerCase) }
    : num(s.cartonL) && num(s.cartonB) && num(s.cartonH) ? { l: num(s.cartonL), b: num(s.cartonB), h: num(s.cartonH) } : undefined;
  return {
    family: "box",
    name: s.name || "Box",
    sheet, ups: num(s.ups),
    blank: num(s.blankW) && num(s.blankH) ? { w: num(s.blankW), h: num(s.blankH) } : undefined,
    boardGPerPc: num(s.boardGPerPc),
    // The engine reads the board and PE rates from the rate book, so the saved
    // quote records them; a typed rate sets it for this quote only.
    board: { label: board.label, gsm: num(s.gsm), rateKey: board.rateKey ?? undefined, ratePerKg: num(s.boardRate), pe: s.pe },
    construction: s.construction,
    // The printer also punches plain boxes, so it is sent whatever the print mode.
    printer: s.printer,
    print: s.printMode === "card" ? { mode: "card", colours: num(s.colours) ?? 1, sides: num(s.sides) ?? 1 } : { mode: s.printMode },
    finish: { outside: s.finishOutside, inside: s.finishInside },
    conversionAllIn: num(s.conversionAllIn), pastingPerPc: num(s.pastingPerPc), wastagePct: num(s.wastagePct),
    packing: {
      casePack: num(s.casePack), carton,
      poly: num(s.polyCost) !== undefined && num(s.polyPer) ? { cost: num(s.polyCost), per: num(s.polyPer) } : undefined,
    },
    qty: num(s.qty), marginPct: num(s.marginPct), dieCost: num(s.dieCost),
  };
}
