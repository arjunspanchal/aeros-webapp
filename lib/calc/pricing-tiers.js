// Pricing tiers — friendly labels over the raw `marginPct` field. Picking a
// tier sets the bag + cup margins to the same number; admin can still
// override either field manually afterwards.
//
// Margins are factory-list margins on top of mfg cost. The cup calculator
// (admin + client) reads marginPct/marginCupsPct from the client record;
// tier is just a display + bulk-set helper.

export const PRICING_TIERS = [
  { key: "Premium",    margin: 20, note: "Single-store cafés, small repeat orders" },
  { key: "Standard",   margin: 15, note: "Default — most clients, 50k–250k cups/yr" },
  { key: "Enterprise", margin: 10, note: "Multi-location chains, >250k cups/yr" },
  { key: "Strategic",  margin: 7,  note: "Top-tier accounts (>1M cups/yr), competitive bids" },
];

export const TIER_BY_KEY = Object.fromEntries(PRICING_TIERS.map((t) => [t.key, t]));

// Reverse-derive a tier label from a margin %. Used when the client record
// has a margin but no explicit tier set, so the badge in the calculator
// still reads something sensible.
export function tierFromMargin(marginPct) {
  if (marginPct == null) return null;
  const m = Number(marginPct);
  if (!Number.isFinite(m)) return null;
  // Exact-match first (covers the canonical 20/15/10/7 entries).
  const exact = PRICING_TIERS.find((t) => t.margin === m);
  if (exact) return exact.key;
  // Nearest tier — useful when admin keys 12% / 16% etc. manually.
  let best = PRICING_TIERS[0];
  let bestDiff = Math.abs(m - best.margin);
  for (const t of PRICING_TIERS) {
    const d = Math.abs(m - t.margin);
    if (d < bestDiff) { best = t; bestDiff = d; }
  }
  return `~${best.key}`;
}
