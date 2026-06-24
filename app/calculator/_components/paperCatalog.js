// Pure helpers that drive the RM-backed paper cascade shared by the admin and
// client calculators. No rate math here beyond reading a row's effectiveRate —
// option derivation only. Source of truth is the `master_papers` rows served by
// GET /api/calc/papers (admin rows carry rates; client rows don't).
//
// Two shapes of row coexist in master_papers and the cascade handles both:
//   • GSM-specific rows (Jodhani, Om Shivaay, Pudumjee Solidwrap/bag, BILT OGR 50)
//     — gsm (and often bf) is part of the key; the GSM step is a dropdown.
//   • Flat rows (Ajit Brown, BILT/JK Bleach, generic BILT/JK OGR) — gsm/bf are
//     null and the rate is flat; the user types a GSM for the weight calc.

const TYPE_ORDER = ["Brown Kraft", "MG", "Bleach Kraft White", "OGR"];

const uniq = (arr) => [...new Set(arr)];
const byType = (papers, type) => papers.filter((p) => p.type === type);
const byTypeSupplier = (papers, type, supplier) =>
  papers.filter((p) => p.type === type && p.supplier === supplier);

export function deriveTypes(papers) {
  return uniq(papers.map((p) => p.type).filter(Boolean)).sort((a, b) => {
    const ia = TYPE_ORDER.indexOf(a), ib = TYPE_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
}

export function deriveSuppliers(papers, type) {
  if (!type) return [];
  return uniq(byType(papers, type).map((p) => p.supplier).filter(Boolean)).sort();
}

// True when the type+supplier has at least one GSM-specific row → render a GSM
// dropdown. False means all matching rows are flat (null gsm) → free GSM input.
export function supplierHasGsm(papers, type, supplier) {
  if (!type || !supplier) return false;
  return byTypeSupplier(papers, type, supplier).some((p) => p.gsm != null);
}

// Distinct numeric GSMs for a type+supplier, ascending. Excludes null-gsm rows
// (those drive the flat-paper path, not the dropdown).
export function deriveGsms(papers, type, supplier) {
  if (!type || !supplier) return [];
  return uniq(
    byTypeSupplier(papers, type, supplier)
      .map((p) => p.gsm)
      .filter((g) => g != null)
      .map(Number)
  ).sort((a, b) => a - b);
}

// Distinct BFs for a type+supplier+gsm. Returns numeric BFs ascending; a row
// with null bf contributes the sentinel null (caller renders it as "—").
export function deriveBfs(papers, type, supplier, gsm) {
  if (!type || !supplier || gsm == null || gsm === "") return [];
  const g = Number(gsm);
  return uniq(
    byTypeSupplier(papers, type, supplier)
      .filter((p) => Number(p.gsm) === g)
      .map((p) => (p.bf == null ? null : Number(p.bf)))
  ).sort((a, b) => (a == null ? -1 : b == null ? 1 : a - b));
}

// Rows still matching the current selection. Unset dimensions (undefined/"") are
// not filtered on. gsm/bf compare against the row's value (null tolerated).
export function deriveMatches(papers, { type, supplier, gsm, bf } = {}) {
  return papers.filter((p) => {
    if (type && p.type !== type) return false;
    if (supplier && p.supplier !== supplier) return false;
    if (gsm !== undefined && gsm !== "" && gsm != null) {
      if (Number(p.gsm) !== Number(gsm)) return false;
    }
    if (bf !== undefined && bf !== "" && bf != null) {
      if (Number(p.bf) !== Number(bf)) return false;
    }
    return true;
  });
}

export function findPaper(papers, id) {
  return papers.find((p) => p.id === id) || null;
}
