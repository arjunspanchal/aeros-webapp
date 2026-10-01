// Production lines — the way the factory team actually divides Jobs work
// (one person runs cups + tubs, another runs bags + boxes). A line is a
// named group of job categories, matched loosely because jobs.category holds
// a mix of the legacy FactoryOS labels ("Paper Bag", "Tub", "Food Box") and
// the catalogue's category names ("Paper Bags", "Take Out Containers",
// "Cake & Pastry Boxes"). Keep this list in step with the catalogue when a
// new in-house product family is added (e.g. custom mailer / tuck boxes
// land under food_boxes via the "box" keyword).
//
// Pure, dependency-free so the client-side Jobs filter can import it.

export const LINES = [
  {
    key: "paper_cups",
    label: "Paper Cups",
    categories: ["Paper Cups", "PP Cups", "PET Cups"],
  },
  {
    key: "tubs",
    label: "Tubs",
    categories: ["Tub", "Tubs", "Take Out Containers", "Ice Cream Tubs"],
  },
  {
    key: "paper_bags",
    label: "Paper Bags",
    categories: ["Paper Bag", "Paper Bags"],
  },
  {
    key: "food_boxes",
    label: "Food Boxes",
    // Cup carriers & holders (CHC) are folded carton: paper goes to Blue
    // Line, converted stock comes back and is carton-packed here.
    // Table mats likewise: Aeros RM, printed + packed by Vienna / Blue Line.
    categories: ["Food Box", "Food Boxes", "Cake & Pastry Boxes", "Pizza Boxes", "Burger Boxes", "Cup Carriers & Holders", "Table Mats"],
    // Catch-all so a new box family (mailer, tuck, custom) is picked up
    // before anyone remembers to list it here.
    keyword: /\bbox(es)?\b/i,
  },
];

export const LINE_KEYS = new Set(LINES.map((l) => l.key));
export const LINE_LABEL = Object.fromEntries(LINES.map((l) => [l.key, l.label]));

const norm = (s) => String(s || "").trim().toLowerCase();

// Which line does a job category belong to? null = none of the four
// (lids, straws, traded items…), which "All lines" still shows.
export function lineForCategory(category) {
  const c = norm(category);
  if (!c) return null;
  for (const l of LINES) {
    if (l.categories.some((x) => norm(x) === c)) return l.key;
  }
  for (const l of LINES) {
    if (l.keyword && l.keyword.test(c)) return l.key;
  }
  return null;
}

// Drop anything that isn't a known line key; empty array -> null (= all).
export function cleanLineKeys(v) {
  if (!Array.isArray(v)) return null;
  const out = [...new Set(v.map((x) => norm(x)).filter((x) => LINE_KEYS.has(x)))];
  return out.length ? out : null;
}

export function describeLines(keys) {
  const list = cleanLineKeys(keys);
  if (!list) return "All lines";
  return list.map((k) => LINE_LABEL[k]).join(" + ");
}
