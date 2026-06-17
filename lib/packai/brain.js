// PackAI brain — the single source of truth for the assistant's identity,
// knowledge and tools. The web chat route (app/api/chat) imports MODEL +
// SYSTEM_PROMPT + buildTools(). Kept as a standalone module so the assistant's
// logic lives in one place. All data is read through the packai_ro restricted
// client over sanitized views — no cost or vendor data ever reaches this layer.

import { tool } from 'ai';
import { z } from 'zod';
import { packaiSelect } from '@/lib/db/packai';

export const MODEL = 'claude-haiku-4-5';

// Module-scope cache so repeated turns don't refetch the catalog every message.
let _clearance = null;
let _catalog = null;
let _knowledge = null;
let _servables = null;

async function getClearance() {
  if (!_clearance) {
    _clearance = await packaiSelect('v_packai_clearance', {
      select:
        'id,item_name,sku,brand,category,material,gsm,description,specifications,stock_quantity,unit,case_pack,price,price_unit,status',
    });
  }
  return _clearance;
}

async function getCatalog() {
  if (!_catalog) {
    _catalog = await packaiSelect('v_packai_catalog', {
      select:
        'id,product_name,sku,category,sub_category,size_volume,material,colour,gsm,wall_type,coating,units_per_case,carton_dimensions,top_diameter_mm,moq_units,lead_time,stock_status,sell_price_inr',
    });
  }
  return _catalog;
}

async function getKnowledge() {
  if (!_knowledge) {
    _knowledge = await packaiSelect('v_packai_knowledge', {
      select: 'topic,question,answer,tags',
    });
  }
  return _knowledge;
}

async function getServables() {
  if (!_servables) {
    const [items, aliases] = await Promise.all([
      packaiSelect('v_packai_servables', {
        select: 'name,family,attributes,portion_bands,default_dims_mm,global_note',
      }),
      packaiSelect('v_packai_servable_aliases', { select: 'alias,servable_name' }),
    ]);
    // Index aliases onto each servable so a search can hit either.
    const aliasMap = new Map();
    for (const a of aliases) {
      const list = aliasMap.get(a.servable_name) || [];
      list.push(a.alias);
      aliasMap.set(a.servable_name, list);
    }
    _servables = items.map((s) => ({ ...s, aliases: aliasMap.get(s.name) || [] }));
  }
  return _servables;
}

// Lowercase, split, and singularize tokens ("cups" -> "cup") for matching.
function stemTokens(query) {
  return String(query)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t));
}

// (Strict all-words matching was removed — relevance ranking below replaces it.)
// Relevance ranking by token overlap (OR, scored). Each item scores by how
// many query tokens its haystack contains; results sort best-first and zero-
// score items drop out. This gives precision (an exact "12oz double wall cup"
// query ranks the full matches top) AND recall (a broad "wide boba straw"
// query still surfaces the BOBA products) — unlike strict all-words matching,
// which returned nothing on broad queries and fell back to a positional slice.
function rankByOverlap(items, query, toHay, limit) {
  const tokens = stemTokens(query);
  if (!tokens.length) return items.slice(0, limit);
  return items
    .map((it) => {
      const hay = toHay(it).toLowerCase();
      return { it, score: tokens.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0) };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.it);
}

export const SYSTEM_PROMPT = `You are PackAI, the AI packaging assistant for Aeros, a packaging products company based in Mumbai, India. Refer to yourself as PackAI.

You help customers find the right packaging products from two ranges:
1. **Clearance Stock** — discounted end-of-line plain/generic packaging available for immediate dispatch
2. **Fresh Catalog** — our full range of standard packaging products with regular pricing

Your tone is friendly, knowledgeable, and concise. Always respond in the same language the customer uses.

ALWAYS check the lookupAerosFacts tool when a customer asks about what Aeros makes, product sizes/ranges, materials, care/storage, or anything where a verified Aeros-specific answer may exist. Prefer a verified fact over your own general knowledge. For generic packaging science not covered by a fact, answer from general knowledge.

When a customer mentions a specific food or drink they serve, call lookupFoodItem first to get its serving physics (temperature, grease/ooze, structure, delivery-survival time, portion size, whether it needs a companion container). Use those attributes to decide the packaging: e.g. greasy/oozing → grease-resistant (OGR) primary; saucy + delivery → leak-proof container; hot beverage → the cup→lid→holder→bag chain; an item needing a companion (biryani→raita cup, dosa→chutney cups) → include it. If lookupFoodItem finds no match, infer the attributes yourself and still apply the rules.

When a customer asks about products, use the search tools to find relevant items. Then:
- Summarise the matching products clearly (name, key specs, price if available)
- When a product has a productUrl, link it inline as markdown: [View product →](productUrl). Never paste a bare URL.
- Suggest they inquire via WhatsApp or Email for orders/quotes
- If no results found, suggest alternative search terms

When someone is setting up a venue (café, restaurant, cloud kitchen, hotel), act as a packaging consultant, not a search box:
1. Ask 2–3 short questions first, ONE at a time: what they'll serve (or their menu highlights), and their service model (dine-in / takeaway / delivery via Swiggy-Zomato).
2. Then recommend the packaging categories they'll need, with 2–3 concrete products each (use the search tools), explaining WHY in one line.
3. Hot beverages for delivery follow this chain: paper cup (single wall = best artwork, double wall = good heat retention, ripple = best retention but print is less crisp) → lid matched to the cup's TOP DIAMETER (80mm for standard 8oz, 90mm for 12/16oz) → corrugated single/double cup holder → SOS or PTH paper bag. Tip: the 8oz "squat" (90mm) lets 8/12/16oz share ONE lid size.
4. Greasy/oily items (croissants, samosas, fried food) must go in grease-resistant (OGR) primary packaging first — plain kraft shows oil patches within minutes.
5. Mention that a full consultation experience (menu upload → complete packaging blueprint) is coming soon.

You cannot place orders — direct customers to the WhatsApp or Email buttons / our team for quotes.

Prices are in Indian Rupees (₹); catalog prices assume full-container-load (FCL) terms — part loads cost more. Stock quantities are in the clearance range only.

If asked about suppliers, manufacturers, mills, purchase costs, or dealer/trade pricing: you don't have that information. Never name a supplier or vendor. Say we work with certified manufacturing partners and offer to connect them with the Aeros team.`;

// Build the tool set fresh per request (cheap; keeps no cross-request state).
export function buildTools({ productUrlBase = 'https://webapp.aeros-x.com' } = {}) {
  return {
    lookupFoodItem: tool({
      description:
        'Look up the serving physics of a food or drink item (temperature, grease/ooze, structure, consumption mode, delivery-survival time, portion sizes by region, whether it needs a companion container). Call this BEFORE recommending packaging for any menu item — the attributes tell you which packing rules apply (e.g. greasy → OGR pouch). Pass the food/drink name; aliases and other languages are matched.',
      parameters: z.object({
        item: z.string().describe('Food or drink name — e.g. "croissant", "masala chai", "biryani", "iced matcha"'),
      }),
      execute: async ({ item }) => {
        const servables = await getServables();
        const matched = rankByOverlap(
          servables,
          item,
          (s) => `${s.name} ${s.family} ${(s.aliases || []).join(' ')}`,
          3
        );
        if (matched.length === 0) {
          return {
            found: 0,
            note: 'No exact match. Infer the attributes yourself (temperature, grease, structure, consumption mode, delivery survival) and apply the packing rules.',
          };
        }
        return {
          found: matched.length,
          items: matched.map((s) => ({
            name: s.name,
            family: s.family,
            attributes: s.attributes,
            portionByRegion: s.portion_bands,
            defaultDimsMm: s.default_dims_mm,
            globalNote: s.global_note,
          })),
        };
      },
    }),

    lookupAerosFacts: tool({
      description:
        'Look up verified Aeros-specific facts (what Aeros makes, product sizes/ranges, materials, care & storage, leak-proof rules, etc.). Use this BEFORE answering any Aeros-specific question. Returns curated facts you should prefer over general knowledge.',
      parameters: z.object({
        query: z.string().describe('Topic or question — e.g. "biggest paper cup", "PLA straw storage", "leak proof tub"'),
      }),
      execute: async ({ query }) => {
        const facts = await getKnowledge();
        const hits = rankByOverlap(
          facts,
          query,
          (f) => `${f.topic} ${f.question} ${(f.tags || []).join(' ')}`,
          6
        );
        // If nothing scored, hand back a small sample so the model still has
        // something rather than nothing (the bank is curated and small).
        const out = hits.length ? hits : facts.slice(0, 6);
        return { facts: out.map((f) => ({ topic: f.topic, answer: f.answer })) };
      },
    }),

    searchClearanceStock: tool({
      description:
        'Search the Aeros clearance stock inventory for packaging products available at discounted prices for immediate dispatch. Use when customers ask about clearance, end-of-line, discounted, or available-now stock.',
      parameters: z.object({
        query: z.string().describe('Search term — product name, category, material, or description'),
        category: z.string().optional().describe('Optional category filter, e.g. "Paper Cup", "Paper Bag"'),
      }),
      execute: async ({ query, category }) => {
        const items = await getClearance();
        const pool = category
          ? items.filter((i) => (i.category || '').toLowerCase().includes(category.toLowerCase()))
          : items;
        const results = rankByOverlap(
          pool,
          query,
          (i) => `${i.item_name} ${i.category || ''} ${i.brand || ''} ${i.material || ''} ${i.description || ''}`,
          8
        );
        if (results.length === 0) return { found: 0, results: [] };
        return {
          found: results.length,
          results: results.map((i) => ({
            name: i.item_name,
            category: i.category,
            material: i.material || null,
            stock: i.stock_quantity !== null ? `${i.stock_quantity} ${i.unit || ''}`.trim() : 'TBC',
            price: i.price != null ? `₹${i.price}${i.price_unit ? ` ${i.price_unit}` : ''}` : null,
            status: i.status,
          })),
        };
      },
    }),

    searchCatalog: tool({
      description:
        'Search the Aeros fresh product catalog for standard packaging products. Use when customers ask about regular products, pricing, specs, materials, or dimensions.',
      parameters: z.object({
        query: z.string().describe('Search term — product name, SKU, category, material, size, or description'),
        category: z.string().optional().describe('Optional category filter, e.g. "Paper Cups", "Lids", "Paper Bags"'),
      }),
      execute: async ({ query, category }) => {
        const products = await getCatalog();
        const pool = category
          ? products.filter((p) => (p.category || '').toLowerCase().includes(category.toLowerCase()))
          : products;
        const results = rankByOverlap(
          pool,
          query,
          (p) => `${p.product_name} ${p.sku || ''} ${p.category || ''} ${p.sub_category || ''} ${p.material || ''} ${p.size_volume || ''} ${p.colour || ''}`,
          8
        );
        if (results.length === 0) return { found: 0, results: [] };
        return {
          found: results.length,
          results: results.map((p) => ({
            name: p.product_name,
            sku: p.sku,
            productUrl: `${productUrlBase}/catalog/${p.id}`,
            category: p.category,
            size: p.size_volume || null,
            material: p.material || null,
            gsm: p.gsm || null,
            colour: p.colour || null,
            unitsPerCase: p.units_per_case || null,
            cartonDimensions: p.carton_dimensions || null,
            pricePerUnit: p.sell_price_inr != null ? `₹${p.sell_price_inr}` : null,
            pricePerCase:
              p.sell_price_inr != null && p.units_per_case
                ? `₹${Math.round(p.sell_price_inr * p.units_per_case * 100) / 100}`
                : null,
          })),
        };
      },
    }),

    listCategories: tool({
      description: 'List all available product categories from clearance stock and the fresh catalog.',
      parameters: z.object({}),
      execute: async () => {
        const [items, products] = await Promise.all([getClearance(), getCatalog()]);
        return {
          clearanceCategories: [...new Set(items.map((i) => i.category).filter(Boolean))].sort(),
          catalogCategories: [...new Set(products.map((p) => p.category).filter(Boolean))].sort(),
        };
      },
    }),
  };
}
