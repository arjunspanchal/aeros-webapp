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
  { value: "", label: "Plain / none" },
];

export const PAPER_TYPES = [
  "Cupstock",
  "Bleach Kraft",
  "Brown Kraft",
  "MG Kraft",
  "FBB Board",
  "FBB Cyber XL",
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
  return "";
}
