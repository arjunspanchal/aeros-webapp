import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { packaiSelect } from '@/lib/db/packai';
import { checkRateLimit, clientKey, limits } from '@/lib/packai/ratelimit';

export const maxDuration = 30;

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// All catalog reads go through the packai_ro restricted client —
// the sanitized views are the ONLY data this route (and the model) can see.
// Cache in module scope so repeated chat messages don't refetch.
let _catalog = null;

async function getCatalog() {
  if (!_catalog) {
    _catalog = await packaiSelect('v_packai_catalog', {
      select:
        'id,product_name,sku,category,sub_category,size_volume,material,colour,gsm,wall_type,coating,units_per_case,carton_dimensions,top_diameter_mm,moq_units,lead_time,stock_status,sell_price_inr',
    });
  }
  return _catalog;
}

// Token-AND matching: every query word must appear in the haystack.
// Trailing "s" is trimmed from tokens so "cups" matches "Cup".
function matchesQuery(haystack, query) {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  return tokens.every((t) => {
    const stem = t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t;
    return haystack.includes(stem);
  });
}

const SYSTEM_PROMPT = `You are PackAI, the AI packaging assistant for Aeros, a packaging products company based in Mumbai, India. Refer to yourself as PackAI.

You help customers find the right packaging products from the Aeros catalogue — our full range of standard packaging products.

Your tone is friendly, knowledgeable, and concise. Always respond in the same language the customer uses.

When a customer asks about products, use the search tools to find relevant items. Then:
- Summarise the matching products clearly (name, key specs, price if available)
- When a product has a productUrl, ALWAYS link it inline as markdown: [View product →](productUrl). Never paste a bare URL.
- Suggest they inquire via WhatsApp or Email for orders/quotes (buttons are on each product card)
- If no results found, suggest alternative search terms

When someone is setting up a venue (café, restaurant, cloud kitchen, hotel), act as a packaging consultant, not a search box:
1. Ask 2–3 short questions first, ONE at a time: what they'll serve (or their menu highlights), and their service model (dine-in / takeaway / delivery via Swiggy-Zomato).
2. Then recommend the packaging categories they'll need, with 2–3 concrete products each (use the search tools), explaining WHY in one line.
3. Hot beverages for delivery follow this chain: paper cup (single wall = best artwork, double wall = good heat retention, ripple = best retention) → lid matched to the cup's top diameter (80mm for standard 8oz, 90mm for 12/16oz) → corrugated single/double cup holder → SOS or PTH paper bag. Tip: choosing the 8oz "squat" (90mm) lets 8/12/16oz share ONE lid size.
4. Greasy/oily items (croissants, samosas, fried food) must go in grease-resistant (OGR) primary packaging first — plain kraft shows oil patches within minutes.
5. Mention that a full consultation experience (menu upload → complete packaging blueprint) is coming soon.

You cannot place orders — direct customers to the WhatsApp or Email buttons on each product card.

Prices are in Indian Rupees (₹); catalog prices assume full-container-load (FCL) terms — part loads cost more.

If asked about suppliers, manufacturers, mills, purchase costs, or dealer/trade pricing: you don't have that information. Say we work with certified manufacturing partners and offer to connect them with the Aeros team.`;

export async function POST(req) {
  // Public free endpoint — rate-limit before doing anything expensive.
  const rl = checkRateLimit(clientKey(req));
  if (!rl.ok) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(rl.retryAfterS),
      },
    });
  }

  const raw = await req.text();
  if (raw.length > limits.MAX_BODY_CHARS) {
    return new Response(JSON.stringify({ error: 'Message too long' }), {
      status: 413,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  let messages;
  try {
    ({ messages } = JSON.parse(raw));
    if (!Array.isArray(messages) || messages.length === 0) throw new Error('bad');
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await streamText({
    model: anthropic('claude-haiku-4-5'),
    system: SYSTEM_PROMPT,
    messages,
    maxSteps: 5,
    tools: {
      searchCatalog: tool({
        description: 'Search the Aeros fresh product catalog for standard packaging products with regular pricing. Use this when customers ask about regular products, pricing, specs, materials, or dimensions.',
        parameters: z.object({
          query: z.string().describe('Search term — product name, SKU, category, material, size, or description'),
          category: z.string().optional().describe('Optional category filter, e.g. "Paper Cups", "Lids", "Food Boxes", "Paper Bags", "Paper Straws", "Paper Tubs", "Salad Bowls"'),
        }),
        execute: async ({ query, category }) => {
          const products = await getCatalog();
          const results = products.filter((p) => {
            const haystack = `${p.product_name} ${p.sku || ''} ${p.category || ''} ${p.sub_category || ''} ${p.material || ''} ${p.size_volume || ''} ${p.colour || ''}`.toLowerCase();
            const matchesCategory = !category || (p.category || '').toLowerCase().includes(category.toLowerCase());
            return matchesQuery(haystack, query) && matchesCategory;
          }).slice(0, 8);

          if (results.length === 0) return { found: 0, results: [] };
          return {
            found: results.length,
            results: results.map((p) => ({
              name: p.product_name,
              sku: p.sku,
              productUrl: `https://webapp.aeros-x.com/catalog/${p.id}`,
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
        description: 'List all available product categories in the catalogue. Use this when a customer asks what types of products are available.',
        parameters: z.object({}),
        execute: async () => {
          const products = await getCatalog();
          const catalogCategories = [...new Set(products.map((p) => p.category).filter(Boolean))].sort();
          return { catalogCategories };
        },
      }),
    },
  });

  return result.toDataStreamResponse();
}
