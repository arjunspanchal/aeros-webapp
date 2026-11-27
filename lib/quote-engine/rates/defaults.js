// Seed rate book. Supabase `calc_rates` overrides these at runtime; this file is
// the fallback and the record of where each number came from.
//
// status:
//   confirmed — Arjun or a vendor bill has confirmed it
//   assumed   — working value nobody has confirmed; the UI badges it
//   disputed  — two sources disagree; the UI badges it and names both
//
// Sources are the Aeros skills (.claude/skills/aeros-*) and cortex/aeros-db-cortex.yaml.

const r = (value, unit, status, source) => ({ value, unit, status, source });

export const DEFAULT_RATES = {
  // ── Paper bags: machine route ────────────────────────────────────────────
  "bag.glue.gsm": r(30, "g/m²", "assumed", "engine line, never measured on the floor (bag skill)"),
  "bag.glue.rate_per_kg": r(226, "₹/kg", "confirmed", "Fevicol 1000L, Orient Grafix bill; Arjun 7-Nov-2026"),
  "bag.conversion.handle": r(15, "₹/kg", "confirmed", "handle bags in-house; Arjun often cuts to 10 on big orders"),
  "bag.conversion.sos": r(10, "₹/kg", "confirmed", "SOS / no-handle"),
  "bag.conversion.vbottom": r(10, "₹/kg", "confirmed", "V-bottom in-house (Nero, 14-Nov-2026)"),
  "bag.conversion.vendor": r(20, "₹/kg", "assumed", "vendor benchmark, not a vendor quote"),
  "bag.wastage.pct": r(5, "%", "confirmed", "5% of paper + print + conversion, every quote since Oct-2026"),
  "bag.wastage.long_run_pct": r(3, "%", "confirmed", "runs of 2 lakh pcs and up (Halal Guys, 22-Oct-2026)"),
  "bag.wastage.long_run_qty": r(200000, "pcs", "confirmed", "threshold for the long-run wastage"),
  "bag.handle.brown_twisted": r(0.85, "₹/bag", "confirmed", "brown twisted rope pair"),
  "bag.handle.white_twisted": r(1.0, "₹/bag", "confirmed", "Arjun 8-Oct-2026; set per job (Halal Guys 0.85)"),
  "bag.handle.black_twisted": r(1.0, "₹/bag", "assumed", "no rate on file (13-Oct-2026)"),
  "bag.handle.flat": r(1.0, "₹/bag", "confirmed", "flat paper handle pair"),
  "bag.handle.cord": r(1.0, "₹/bag", "confirmed", "cord pair material, Arjun 18-Oct-2026"),
  "bag.handle.pasting": r(0.35, "₹/bag", "confirmed", "handle pasting; 0.20 on Halal Guys / NOON"),
  "bag.handle.cord_fixing": r(0.5, "₹/bag", "assumed", "hand fixing of cord handles"),
  "bag.handle.twisted_g": r(6, "g", "confirmed", "twisted rope pair weight; holds on PTH-011"),
  "bag.handle.cord_g": r(1, "g", "confirmed", "cord pair, solved from two weighed Sign Laban bags"),
  "bag.carton.per_case": r(70, "₹/case", "confirmed", "cushion figure; real small cartons cost ₹15–25"),
  "bag.inner_poly.per_100": r(2, "₹/100 pcs", "confirmed", "V-bottom only, mandatory"),
  "bag.setup.per_size": r(3000, "₹", "confirmed", "one-time, outside the rate since 1-Oct-2026"),
  "bag.plate.flexo_per_colour": r(5000, "₹/colour", "disputed", "Sept–Oct quotes ₹5,000; cortex 12-Aug says ₹3,000"),
  "bag.margin.inhouse": r(10, "%", "confirmed", "markup on cost"),
  "bag.margin.vendor": r(15, "%", "confirmed", "markup on cost, vendor-made bags"),
  "bag.moq": r(15000, "pcs", "confirmed", "machine MOQ per size; under it a bag is hand-made (Arjun 23-Nov-2026: every bag type)"),
  "bag.moq.printed_vbottom": r(50000, "pcs", "confirmed", "flexo printed V-bottom default; Arjun sets job MOQs"),
  "bag.gusset.max": r(178, "mm", "confirmed", "in-house gusset limit"),
  "bag.gusset.clamp_to": r(185, "mm", "confirmed", "a gusset up to about here is made at 178 and said so"),
  "bag.case.max_kg": r(19, "kg", "confirmed", "case weight ceiling"),
  "bag.reel.max_over_deckle": r(50, "mm", "confirmed", "reel may be at most deckle + 50 (Arjun 16-Nov-2026)"),
  "bag.ink.g_per_m2_per_colour": r(2.3, "g/m²", "confirmed", "flood ink weight, Project Hum weighing"),
  "bag.handmade.labour": r(1.0, "₹/bag", "confirmed", "hand labour, body + handle, Arjun's hand-made ruling"),
  "bag.handmade.paper_overs_pct": r(10, "%", "confirmed", "paper overs on hand-made bags"),
  "bag.handmade.overhead_pct": r(3, "%", "confirmed", "overhead on paper + punching + labour + handle"),
  "bag.bale.cost": r(10, "₹/bale", "assumed", "small SOS ship in bales, not cartons (Arjun 6-Nov-2026); cost is a placeholder"),
  "bag.bale.pack": r(500, "pcs", "assumed", "bags per bale for the placeholder cost"),
  "bag.bale.max_width": r(155, "mm", "assumed", "SOS up to #8 (152 wide) counts as small until Arjun says otherwise"),
  "bag.bale.max_gsm": r(60, "GSM", "assumed", "small SOS run on 50–60 GSM"),

  // print slabs, ₹ per kg of bag paper
  "bag.print.logo": r(7, "₹/kg", "confirmed", "1C small logo, about 10% coverage"),
  "bag.print.solid": r(10, "₹/kg", "confirmed", "1C solid / 2C line work, about 30%"),
  "bag.print.p50": r(15, "₹/kg", "confirmed", "half coverage, up to 2 colours"),
  "bag.print.flood": r(20, "₹/kg", "confirmed", "flood on white kraft / white opaque on brown"),
  "bag.print.p100": r(25, "₹/kg", "confirmed", "full patch up to 4 colours, Arjun 7-Aug-2026"),
  "bag.print.metallic": r(32, "₹/kg", "assumed", "flood + metallic; an estimate, not a ruling"),

  // ── Paper cups and tubs (rate_calc.py, rates of 2-Nov-2026) ──────────────
  "cup.paper.APP": r(90, "₹/kg", "confirmed", "APP cup board"),
  "cup.paper.APP_VOLUME": r(85, "₹/kg", "confirmed", "APP at volume"),
  "cup.paper.TNPL": r(76, "₹/kg", "confirmed", "TNPL 73 → 76, Arjun 2-Nov-2026"),
  "cup.paper.poly_board": r(105, "₹/kg", "confirmed", "Wikas PE-coated wall board, PE weight included, 14-Oct-2026"),
  "cup.coat.one_side": r(20, "₹/kg", "confirmed", "PE 1 side, on paper weight; 18 → 20 on 2-Nov-2026"),
  "cup.coat.two_side": r(40, "₹/kg", "assumed", "PE 2 sides taken as double the 1-side adder"),
  "cup.glue.rate_per_kg": r(250, "₹/kg", "confirmed", "EVA"),
  "cup.conversion.dw": r(0.2, "₹/cup", "confirmed", "forming + jacketing, Arjun 2-Nov-2026"),
  "cup.overhead.monthly_pool": r(422500, "₹/month", "confirmed", "salary 185k + power 100k + rent 112.5k + maintenance 15k + QC 10k"),
  "cup.fleet.hours": r(500, "h/month", "confirmed", "running hours"),
  "cup.fleet.machines": r(3, "machines", "confirmed", "cup fleet"),
  "cup.cpm.SW": r(70, "cups/min", "confirmed", "single wall former"),
  "cup.cpm.DW": r(60, "cups/min", "confirmed", "double wall line"),
  "cup.cpm.RIPPLE": r(60, "cups/min", "assumed", "ripple, not confirmed in-house"),
  "cup.cpm.TUB": r(50, "tubs/min", "confirmed", "Ø115 tub former"),
  "cup.pack.consumables_per_case": r(5.25, "₹/case", "confirmed", "poly 1.25 + tape 3 + label 1"),
  "cup.pack.labour_monthly": r(30000, "₹/month", "confirmed", "packing labour, pooled over the fleet"),
  "cup.print.flexo_per_kg": r(5, "₹/kg/colour", "confirmed", "flexo standard; ₹7–15 on older quotes"),
  "cup.offset.pantone_first": r(2200, "₹/1000 sheets", "confirmed", "Blueline Pantone card, first colour (3 colours = ₹4.60 a sheet); varies by job"),
  "cup.offset.pantone_extra": r(1200, "₹/1000 sheets", "confirmed", "Blueline Pantone card, each extra colour"),
  "cup.offset.varnish_per_sheet": r(1.08, "₹/sheet", "confirmed", "offset varnish, 7-Nov-2026 (was 0.86)"),
  "cup.offset.punch_per_sheet": r(0.59, "₹/sheet", "confirmed", "Blueline NBL/213 and NBL/283: ₹0.59 a sheet on runs over about 850 sheets"),
  "cup.offset.punch_min_job": r(500, "₹/job", "confirmed", "punching is about ₹500 a job on short runs (Froth ₹492, locked 7-Nov-2026)"),
  "cup.offset.min_sheets": r(1000, "sheets", "confirmed", "the Pantone card is flat up to 1,000 sheets (3 Pantone = ₹4,600 a job)"),
  "cup.print.moq": r(2000, "pcs", "confirmed", "printed cup minimum, Arjun 29-Oct-2026"),
  "cup.offset.makeready_sheets": r(50, "sheets", "confirmed", "waste sheets per offset job, 7-Nov-2026 (Jallo used 100)"),
  "cup.print.offset_max_qty": r(25000, "pcs", "confirmed", "offset up to here, flexo above (29-Oct-2026)"),
  "cup.viana.scrap_credit": r(10, "₹/kg", "assumed", "skeleton scrap returned by the printer"),
  "cup.plate.flexo_per_colour": r(5000, "₹/colour", "disputed", "aeros-quote 3-Nov ₹5,000 per colour per size; old templates ₹3,000"),
  "cup.plate.offset_per_colour": r(650, "₹/colour", "confirmed", "offset CTP ₹600–700"),
  "cup.margin.default": r(15, "%", "confirmed", "Standard tier, margin on selling price"),

  // ── Folding cartons and boxes (aeros-custom-costing) ─────────────────────
  "box.board.fbb": r(75, "₹/kg", "confirmed", "FBB 250–500, Janta 29-Sep-2026"),
  "box.board.allyking_290": r(74, "₹/kg", "confirmed", "Allyking Hi-Bulk 290, Ashtavinayak, incl. sheeting"),
  "box.board.kraft": r(50, "₹/kg", "confirmed", "brown kraft 250–300 for cartons, Arjun 10-Oct-2026"),
  "box.board.duplex": r(50, "₹/kg", "confirmed", "duplex 290–300"),
  "box.board.kraft_300_high": r(64, "₹/kg", "confirmed", "kraft 300 sheets, the high case (bag sealer, cup carriers)"),
  "box.board.art_card": r(80, "₹/kg", "confirmed", "art card"),
  "box.board.pe_per_kg": r(18, "₹/kg", "confirmed", "1-side PE on board (boat trays)"),
  "box.wastage.pasted": r(7, "%", "confirmed", "sheet wastage, pasted boxes"),
  "box.wastage.flat": r(5, "%", "confirmed", "sheet wastage, flat / lock-corner"),
  "box.min_sheets": r(1000, "sheets", "confirmed", "Blueline minimum billing"),
  "box.locked_min_sheets": r(25000, "sheets", "confirmed", "locked band starts here"),
  "box.print.blueline_walkin.first": r(700, "₹/1000 sheets", "confirmed", "walk-in card, first colour"),
  "box.print.blueline_walkin.extra": r(300, "₹/1000 sheets", "confirmed", "walk-in card, each extra colour"),
  "box.print.blueline_locked.first": r(350, "₹/1000 sheets", "confirmed", "locked rate, 25,000+ sheets"),
  "box.print.blueline_locked.extra": r(250, "₹/1000 sheets", "confirmed", "locked rate, each extra colour"),
  "box.print.lucky.per_colour": r(400, "₹/1000 sheets", "confirmed", "Lucky Offset walk-in, 18-Nov-2026"),
  "box.punch.blueline_walkin": r(350, "₹/1000 sheets", "confirmed", "Blueline bill, 12-Sep-2026"),
  "box.punch.blueline_locked": r(300, "₹/1000 sheets", "confirmed", "locked; 500 if Blueline returns the scrap"),
  "box.punch.lucky": r(550, "₹/1000 sheets", "confirmed", "Lucky Offset walk-in, 18-Nov-2026"),
  "box.plate.blueline": r(600, "₹/colour", "confirmed", "Blueline actual"),
  "box.plate.lucky": r(700, "₹/colour", "confirmed", "Lucky Offset"),
  "box.ink.cmyk_flat": r(0.4, "₹/box", "confirmed", "CMYK ink flat per box, food-box basis"),
  "box.pasting.four_corner": r(0.1361, "₹/pc", "confirmed", "glue 0.5 g + clam machine, Arjun 29-Oct-2026"),
  "box.pasting.seam": r(0.112, "₹/pc", "assumed", "one straight seam on the folder-gluer, 0.070–0.112"),
  "box.pasting.cross_tray": r(0.8, "₹/pc", "confirmed", "glued end tabs, Arjun 19-Oct-2026 (approx.)"),
  "box.forming.printed": r(2.5, "%", "confirmed", "rejects on the clam machine, printed"),
  "box.forming.plain": r(1.5, "%", "confirmed", "rejects on the clam machine, plain"),
  "box.lam.gloss": r(0.45, "₹/100 sq in", "confirmed", "gloss BOPP, per side, whole sheet"),
  "box.lam.matt": r(0.55, "₹/100 sq in", "confirmed", "matt BOPP, per side, whole sheet"),
  "box.lam.pvc": r(0.35, "₹/100 sq in", "confirmed", "PVC, not food grade"),
  "box.lam.blister": r(0.25, "₹/100 sq in", "confirmed", "blister coat under inside lamination"),
  "box.pack.carton_per_case": r(70, "₹/case", "assumed", "used when no carton size or cost is given"),
  "box.pack.poly_per_case": r(2, "₹/case", "confirmed", "default poly; front-lock food boxes use ₹3.98 per 100"),
  "box.print.moq": r(3000, "pcs", "assumed", "printed box minimum on the App; confirm per item"),
  "box.pack.labour_per_pc": r(0.0167, "₹/pc", "confirmed", "packing labour"),
  "box.margin.default": r(15, "%", "confirmed", "markup on cost; boxes are shown at 15 / 20 / 25"),

  // ── Bought-in items ──────────────────────────────────────────────────────
  "traded.uplift_pct": r(10, "%", "confirmed", "vendor price × 1.10 before margin"),

  // ── Wrap paper (deli paper, food wraps, liners) ──────────────────────────
  "wrap.wastage.pct": r(8, "%", "confirmed", "8% of paper, every wrap working Oct–Nov 2026"),
  "wrap.cutting.per_kg": r(10, "₹/kg", "confirmed", "slitting + cutting, Arjun 20-Oct-2026 (the 3-Nov deli paper quote used ₹8)"),
  "wrap.print.flexo_per_kg": r(35, "₹/kg/colour", "confirmed", "flexo on the reel, 1 colour, Arjun 20-Oct-2026"),
  "wrap.print.offset.25x36.1000": r(1300, "₹/1000 sheets", "confirmed", "Blueline thin-sheet card of 1-Jul-2026, 25 × 36 in, up to 1,000 sheets"),
  "wrap.print.offset.25x36.2000": r(1100, "₹/1000 sheets", "confirmed", "Blueline thin-sheet card of 1-Jul-2026, 25 × 36 in, 2,000 sheets"),
  "wrap.print.offset.25x36.5000": r(1000, "₹/1000 sheets", "confirmed", "Blueline thin-sheet card of 1-Jul-2026, 25 × 36 in, 3,000 to 5,000 sheets"),
  "wrap.print.offset.25x36.8000": r(900, "₹/1000 sheets", "confirmed", "Blueline thin-sheet card of 1-Jul-2026, 25 × 36 in, 6,000 to 8,000 sheets"),
  "wrap.print.offset.25x36.12000": r(800, "₹/1000 sheets", "confirmed", "Blueline thin-sheet card of 1-Jul-2026, 25 × 36 in, 9,000 to 12,000 sheets"),
  "wrap.print.offset.25x36.16000": r(750, "₹/1000 sheets", "confirmed", "Blueline thin-sheet card of 1-Jul-2026, 25 × 36 in, 13,000 to 16,000 sheets"),
  "wrap.print.offset.25x36.20000": r(700, "₹/1000 sheets", "confirmed", "Blueline thin-sheet card of 1-Jul-2026, 25 × 36 in, 17,000 to 20,000 sheets"),
  "wrap.print.offset.25x36.25000": r(650, "₹/1000 sheets", "confirmed", "Blueline thin-sheet card of 1-Jul-2026, 25 × 36 in, 21,000 to 25,000 sheets"),
  "wrap.print.offset.25x36.max": r(600, "₹/1000 sheets", "confirmed", "Blueline thin-sheet card of 1-Jul-2026, 25 × 36 in, 26,000 sheets and over"),
  "wrap.print.offset.20x30.1000": r(1200, "₹/1000 sheets", "confirmed", "Blueline thin-sheet card of 1-Jul-2026, 20 × 30 in, up to 1,000 sheets"),
  "wrap.print.offset.20x30.2000": r(1000, "₹/1000 sheets", "confirmed", "Blueline thin-sheet card of 1-Jul-2026, 20 × 30 in, 2,000 sheets"),
  "wrap.print.offset.20x30.5000": r(900, "₹/1000 sheets", "confirmed", "Blueline thin-sheet card of 1-Jul-2026, 20 × 30 in, 3,000 to 5,000 sheets"),
  "wrap.print.offset.20x30.8000": r(800, "₹/1000 sheets", "confirmed", "Blueline thin-sheet card of 1-Jul-2026, 20 × 30 in, 6,000 to 8,000 sheets"),
  "wrap.print.offset.20x30.12000": r(750, "₹/1000 sheets", "confirmed", "Blueline thin-sheet card of 1-Jul-2026, 20 × 30 in, 9,000 to 12,000 sheets"),
  "wrap.print.offset.20x30.16000": r(700, "₹/1000 sheets", "confirmed", "Blueline thin-sheet card of 1-Jul-2026, 20 × 30 in, 13,000 to 16,000 sheets"),
  "wrap.print.offset.20x30.20000": r(650, "₹/1000 sheets", "confirmed", "Blueline thin-sheet card of 1-Jul-2026, 20 × 30 in, 17,000 to 20,000 sheets"),
  "wrap.print.offset.20x30.25000": r(600, "₹/1000 sheets", "confirmed", "Blueline thin-sheet card of 1-Jul-2026, 20 × 30 in, 21,000 to 25,000 sheets"),
  "wrap.print.offset.20x30.max": r(550, "₹/1000 sheets", "confirmed", "Blueline thin-sheet card of 1-Jul-2026, 20 × 30 in, 26,000 sheets and over"),
  "wrap.offset.cutting_per_1000": r(50, "₹/1000 sheets", "confirmed", "Blueline thin-sheet card, cutting per stack"),
  "wrap.offset.bundle": r(25, "₹/bundle", "confirmed", "Blueline thin-sheet card, bundle making"),
  "wrap.offset.bundle_sheets": r(3000, "sheets", "confirmed", "one bundle = 500 sheets × 6 packets"),
  "wrap.offset.min_sheets": r(1000, "sheets", "confirmed", "the printer's minimum billing"),
  "wrap.pack.poly": r(3, "₹/poly", "assumed", "one poly per 1,000 sheets (Arjun 20-Oct-2026 set the method; the ₹3 is assumed)"),
  "wrap.pack.tape_label": r(4, "₹/case", "assumed", "tape and label per carton, used on every wrap working"),
  "wrap.pack.labour_per_sheet": r(0.01, "₹/sheet", "confirmed", "packing labour"),
  "wrap.case.max_kg": r(15, "kg", "confirmed", "wrap cases are kept under 15 kg net (Arjun 20-Oct-2026)"),
  "wrap.plate.flexo_per_colour": r(9000, "₹/colour", "disputed", "old wrap calculator figure; bag plates are ₹3,000–5,000, a 4-colour sleeve set was ₹20,000"),
  "wrap.setup.per_run": r(2000, "₹/run", "assumed", "run setup on reel jobs, kept out of the rate"),
  "wrap.margin.default": r(20, "%", "assumed", "markup on cost; wraps are shown at 15 / 20 / 25 and orders were valued at 20"),
  "wrap.paper.mill_moq_kg": r(5000, "kg", "confirmed", "Pudumjee reel minimum, 5 tonnes"),

  // ── Packing and corrugated ───────────────────────────────────────────────
  "corrugated.finished_per_kg": r(55, "₹/kg", "confirmed", "5-ply brown shipper, Smart Pack, 3-Nov-2026"),
  "corrugated.tare_kg_per_m2": r(0.875, "kg/m²", "confirmed", "carton surface tare, bag carton model"),

  // ── Export ───────────────────────────────────────────────────────────────
  "export.fob.charges_40hc": r(75402, "₹/40HC", "confirmed", "port/CFS 60,402 + truck 15,000, loose"),
  "export.fob.ams_us": r(3403, "₹/40HC", "confirmed", "AMS filing, US shipments only"),
  "export.fob.palletised_extra": r(72000, "₹/40HC", "confirmed", "pallets + wrap, when palletised"),
  "export.fx.usd": r(98, "₹/USD", "confirmed", "default FX; quotes have used 90 / 95 / 98"),
  "export.container.40hc_payload_kg": r(26000, "kg", "confirmed", "working payload"),
  "export.container.carton_wall_mm": r(10, "mm", "assumed", "added to each inside carton dimension to get the outside size (5-ply)"),
};

/**
 * Lane cost added to the ex-mill paper rate to get the landed rate. Only mills
 * whose master_papers rate is known to be ex-mill get a lane. Every other
 * supplier's rate (JK / BILT white, Khateema and Jani MG, BILT OGR) is taken
 * as already delivered, which is how the bag skill records them.
 */
export const PAPER_LANE_PER_KG = {
  "jodhani": 5,
  "om shivaay": 3,
  "ajit": 2,
  "pudumjee": 5, // ex-Pune 120 → 125 landed
  default: 0,
};

export function laneFor(supplier = "") {
  const s = supplier.toLowerCase();
  const hit = Object.keys(PAPER_LANE_PER_KG).find((k) => k !== "default" && s.includes(k));
  return PAPER_LANE_PER_KG[hit ?? "default"];
}
