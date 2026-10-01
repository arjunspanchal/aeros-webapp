// Pure, dependency-free constants for the vendor job order. Split from
// jobOrder.js so client components can import the option lists without
// pulling the server-side Supabase client into the browser bundle.

export const PROCESSES = [
  { value: "offset", label: "Offset" },
  { value: "flexo", label: "Flexo" },
];

export const PRINT_SIDES = [
  { value: "outer", label: "Outer / food-contact-free side" },
  { value: "inner", label: "Inner side" },
  { value: "both", label: "Both sides" },
];

export const PROOF_TYPES = [
  { value: "none", label: "No proof — run to approved artwork" },
  { value: "digital", label: "Digital proof (PDF / colour print)" },
  { value: "wet", label: "Wet proof / draw-down on job stock" },
  { value: "machine_pass", label: "Machine pass — Aeros to approve on press" },
];

export const VARNISH_TYPES = [
  { value: "aqueous_gloss", label: "Aqueous gloss" },
  { value: "aqueous_matt", label: "Aqueous matt" },
  { value: "uv_gloss", label: "UV gloss" },
  { value: "uv_matt", label: "UV matt" },
  { value: "spot_uv", label: "Spot UV" },
  { value: "oil_based", label: "Oil-based / machine varnish" },
];

export const VARNISH_COVERAGE = [
  { value: "flood", label: "Flood (full sheet / web)" },
  { value: "spot", label: "Spot (to varnish layer in artwork)" },
  { value: "reserve", label: "Reserve — leave glue seam & food side free" },
];

export const LAMINATIONS = [
  { value: "none", label: "None" },
  { value: "gloss_bopp", label: "Gloss BOPP" },
  { value: "matt_bopp", label: "Matt BOPP" },
  { value: "thermal_matt", label: "Thermal matt" },
  { value: "soft_touch", label: "Soft touch" },
];

export const PLATE_STATUSES = [
  { value: "new", label: "New — make fresh plates" },
  { value: "existing", label: "Existing — reuse plates on record" },
  { value: "vendor_held", label: "Held by vendor" },
];

export const PLATE_OWNERS = [
  { value: "aeros", label: "Aeros" },
  { value: "vendor", label: "Vendor" },
];

export const SUBSTRATE_FORMS = [
  { value: "reel", label: "Reel" },
  { value: "sheet", label: "Sheet" },
];

export const GRAINS = [
  { value: "long", label: "Long grain" },
  { value: "short", label: "Short grain" },
];

export const PUNCHING = [
  { value: "none", label: "None" },
  { value: "die_cut", label: "Die cut" },
  { value: "creasing_only", label: "Creasing only" },
  { value: "die_cut_and_crease", label: "Die cut + crease" },
];

export const QTY_UOMS = [
  { value: "pcs", label: "pcs" },
  { value: "sheets", label: "sheets" },
  { value: "kg", label: "kg" },
  { value: "reels", label: "reels" },
];

// Standard reel wind chart. A wrong wind direction is one of the few spec
// errors that only surfaces when the reel is already on the converting
// machine, so it is spelled out rather than left as a bare number.
export const WIND_DIRECTIONS = [
  { value: "1", label: "1 — print out, unwind off top, leading edge first" },
  { value: "2", label: "2 — print out, unwind off bottom, leading edge first" },
  { value: "3", label: "3 — print out, unwind off top, trailing edge first" },
  { value: "4", label: "4 — print out, unwind off bottom, trailing edge first" },
  { value: "5", label: "5 — print in, unwind off top, leading edge first" },
  { value: "6", label: "6 — print in, unwind off bottom, leading edge first" },
  { value: "7", label: "7 — print in, unwind off top, trailing edge first" },
  { value: "8", label: "8 — print in, unwind off bottom, trailing edge first" },
];

export const PAPER_SUPPLIED_BY = [
  { value: "aeros", label: "Aeros supplies the paper" },
  { value: "vendor", label: "Printer buys the paper" },
];

export const COLOUR_TYPES = [
  { value: "spot", label: "Spot" },
  { value: "process", label: "Process" },
];

export const COLOUR_SIDES = [
  { value: "outer", label: "Outer" },
  { value: "inner", label: "Inner" },
];

const LABELS = (list) => Object.fromEntries(list.map((o) => [o.value, o.label]));
export const LABEL = {
  process: LABELS(PROCESSES),
  printSide: LABELS(PRINT_SIDES),
  proofType: LABELS(PROOF_TYPES),
  varnishType: LABELS(VARNISH_TYPES),
  varnishCoverage: LABELS(VARNISH_COVERAGE),
  lamination: LABELS(LAMINATIONS),
  platesStatus: LABELS(PLATE_STATUSES),
  plateOwner: LABELS(PLATE_OWNERS),
  substrateForm: LABELS(SUBSTRATE_FORMS),
  grain: LABELS(GRAINS),
  punching: LABELS(PUNCHING),
  windDirection: LABELS(WIND_DIRECTIONS),
  colourType: LABELS(COLOUR_TYPES),
  paperSuppliedBy: LABELS(PAPER_SUPPLIED_BY),
  colourSide: LABELS(COLOUR_SIDES),
};

export const VALID = {
  process: new Set(PROCESSES.map((o) => o.value)),
  print_side: new Set(PRINT_SIDES.map((o) => o.value)),
  proof_type: new Set(PROOF_TYPES.map((o) => o.value)),
  varnish_type: new Set(VARNISH_TYPES.map((o) => o.value)),
  varnish_coverage: new Set(VARNISH_COVERAGE.map((o) => o.value)),
  lamination: new Set(LAMINATIONS.map((o) => o.value)),
  plates_status: new Set(PLATE_STATUSES.map((o) => o.value)),
  plate_owner: new Set(PLATE_OWNERS.map((o) => o.value)),
  substrate_form: new Set(SUBSTRATE_FORMS.map((o) => o.value)),
  offset_grain: new Set(GRAINS.map((o) => o.value)),
  offset_punching: new Set(PUNCHING.map((o) => o.value)),
  flexo_wind_direction: new Set(WIND_DIRECTIONS.map((o) => o.value)),
  qty_uom: new Set(QTY_UOMS.map((o) => o.value)),
  colour_type: new Set(COLOUR_TYPES.map((o) => o.value)),
  paper_supplied_by: new Set(PAPER_SUPPLIED_BY.map((o) => o.value)),
  side: new Set(COLOUR_SIDES.map((o) => o.value)),
};

// Acceptance window around the ordered quantity. Overs/unders are how a
// print run is actually settled, so the order states the band in pieces
// rather than leaving the vendor to compute it off a percentage.
export function qtyBand(spec) {
  const q = Number(spec?.orderQty);
  if (!Number.isFinite(q) || q <= 0) return null;
  const over = Number(spec?.oversAllowancePct);
  const under = Number(spec?.undersAllowancePct);
  if (!Number.isFinite(over) && !Number.isFinite(under)) return null;
  return {
    min: Math.floor(q * (1 - (Number.isFinite(under) ? under : 0) / 100)),
    max: Math.ceil(q * (1 + (Number.isFinite(over) ? over : 0) / 100)),
  };
}

// jobs.printing_type is free text in practice ("Offset ", "Offset Print",
// "Flexo", "NA"), so match on the word, not the exact string. Returns null
// when the job doesn't say (NA / blank) so callers can tell "unknown" apart
// from a real mismatch.
export function processFromPrintingType(printingType) {
  const t = String(printingType || "");
  if (/flexo/i.test(t)) return "flexo";
  if (/offset/i.test(t)) return "offset";
  return null;
}
