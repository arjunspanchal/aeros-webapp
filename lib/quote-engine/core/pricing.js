// Margin maths. Aeros uses two conventions and past quotes depend on both
// (Arjun, 23-Nov-2026: keep per product, show it on screen):
//   markup  — sell = cost × (1 + m)   bags, boxes, corrugated, wraps, stickers
//   on_sell — sell = cost ÷ (1 − m)   paper cups and tubs

export const MARGIN_MODES = {
  markup: { label: "markup on cost", formula: "cost × (1 + m)" },
  on_sell: { label: "margin on selling price", formula: "cost ÷ (1 − m)" },
};

export const FAMILY_MARGIN_MODE = {
  bag: "markup",
  box: "markup",
  corrugated: "markup",
  wrap: "markup",
  pp: "markup",
  sticker: "markup",
  cup: "on_sell",
  tub: "on_sell",
};

export function applyMargin(cost, pct, mode = "markup") {
  const m = pct / 100;
  if (mode === "on_sell") {
    if (m >= 1) throw new Error("margin on sell must be under 100%");
    return cost / (1 - m);
  }
  if (mode === "markup") return cost * (1 + m);
  throw new Error(`unknown margin mode "${mode}"`);
}

/** The margin % that turns `cost` into `sell` under the given mode. */
export function marginFor(cost, sell, mode = "markup") {
  if (!(cost > 0) || !(sell > 0)) return null;
  return mode === "on_sell" ? (1 - cost / sell) * 100 : (sell / cost - 1) * 100;
}
