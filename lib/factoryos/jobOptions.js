// Fixed choice lists for the job forms. Free text in these fields produced
// "Sheet"/"Sheets", "Offset "/"Offset Print", four spellings of Cupstock…
// so they are buttons / selects now. Pure, client-safe.

export const RM_FORMS = [
  { value: "Rolls", label: "Rolls" },
  { value: "Sheets", label: "Sheets" },
];

export const PRINTING_TYPES = [
  { value: "Flexo", label: "Flexo" },
  { value: "Offset", label: "Offset" },
  { value: "Plain", label: "Plain / none" },
];

export const PAPER_TYPES = [
  "Cupstock",
  "Bleach Kraft",
  "Brown Kraft",
  "MG Kraft",
  "FBB Board",   // includes ITC Cyber XL — a grade, not a separate type
  "OGR",
  "SBS",
  "Duplex Board",
];

// Normalisers for values arriving from old rows or the API.
export function normRmForm(v) {
  const s = String(v || "").trim().toLowerCase();
  if (/^sheet/.test(s)) return "Sheets";
  if (/^roll/.test(s)) return "Rolls";
  return "";
}
export function normPrintingType(v) {
  const s = String(v || "").trim().toLowerCase();
  if (/^offset/.test(s)) return "Offset";
  if (/^flexo/.test(s)) return "Flexo";
  if (/^(plain|none)/.test(s)) return "Plain";
  return "";
}

// Paper mills (manufacturers). Distinct from suppliers/traders Aeros buys
// from (Unisource, KC Paper, Wikas…). Used for the Mill picker and to
// derive the mill from a master-paper name like "ITC Indobase Cupstock".
export const MILLS = [
  "ITC", "BILT", "JK Paper", "Stora Enso", "TNPL", "Jodhani Mill", "Pudumjee",
  "Jani Mill", "Khateema", "Om Shivaay", "Ajit", "BGPPL", "Century", "Emami",
];
export function millFromPaperName(name) {
  const n = String(name || "").toLowerCase();
  if (!n) return "";
  if (/\bitc\b|cyber xl|indobev|indobase/.test(n)) return "ITC";   // Cyber XL = ITC's FBB grade
  if (/\bbilt\b|bgppl/.test(n)) return "BILT";
  if (/\bjk\b|j k paper|jl ultima/.test(n)) return "JK Paper";   // JL Ultima = JK's FBB grade
  if (/stora/.test(n)) return "Stora Enso";
  if (/tnpl/.test(n)) return "TNPL";
  if (/jodhani/.test(n)) return "Jodhani Mill";
  if (/pudumjee/.test(n)) return "Pudumjee";
  if (/jani mill/.test(n)) return "Jani Mill";
  if (/khateema/.test(n)) return "Khateema";
  if (/om shivaay/.test(n)) return "Om Shivaay";
  if (/\bajit\b/.test(n)) return "Ajit";
  if (/century/.test(n)) return "Century";
  if (/emami/.test(n)) return "Emami";
  return "";
}

// Label for a printed variant in the "Print" choice of the job forms. The
// catalogue lists a printed version of an item as its own SKU pointing at the
// plain one (parent_sku); the factory picks the plain item, then the print.
export function printVariantLabel(v) {
  const sku = String(v?.sku || "");
  if (/-P50$/.test(sku)) return "Printed, up to 50% coverage";
  if (/-P100$/.test(sku)) return "Printed, full coverage";
  return "Custom printed";
}

// Product types a custom (not-in-catalogue) job can be raised under. Each maps
// to a production line in lib/factoryos/lines.js.
export const CUSTOM_ITEM_TYPES = [
  "Paper Cups", "Tubs", "Paper Bags", "Food Boxes", "Cake & Pastry Boxes",
  "Pizza Boxes", "Burger Boxes", "Cup Carriers & Holders", "Table Mats",
];

// Additional features made on top of a catalogue item (Arjun, 17-Nov-2026:
// "Flap is an additional feature we do"). The item stays the catalogue item,
// with its listing name; the feature is recorded on the job. Add to this list
// as new features come up; anything else can be typed as "Other".
export const JOB_FEATURES = ["Flap"];
export function cleanFeatures(v) {
  const arr = Array.isArray(v) ? v : [];
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const t = String(x || "").trim().slice(0, 60);
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase()); out.push(t);
  }
  return out.slice(0, 8);
}
