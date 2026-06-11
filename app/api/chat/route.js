import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { fetchInventory } from '@/lib/airtable';
import { fetchCatalogChat } from '@/lib/catalog';

export const maxDuration = 30;

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Cache products in module scope so repeated chat messages don't refetch
let _inventory = null;
let _catalog = null;

async function getInventory() {
  if (!_inventory) _inventory = await fetchInventory();
  return _inventory;
}

async function getCatalog() {
  // fetchCatalogChat = 2 Supabase queries; fetchCatalog went through the
  // airtable shim (~600 photo round trips) and stalled every cold start.
  if (!_catalog) _catalog = await fetchCatalogChat();
  return _catalog;
}

const SYSTEM_PROMPT = `You are a helpful product assistant for Aeros, a packaging products company based in India.

You help customers find the right packaging products from two ranges:
1. **Clearance Stock** — discounted end-of-line plain/generic packaging available for immediate dispatch
2. **Fresh Catalog** — our full range of standard packaging products with regular pricing

Your tone is friendly, knowledgeable, and concise. Always respond in the same language the customer uses.

When a customer asks about products, use the search tools to find relevant items. Then:
- Summarise the matching products clearly (name, key specs, price if available)
- Suggest they inquire via WhatsApp or Email for orders/quotes (buttons are on each product card)
- If no results found, suggest alternative search terms

You cannot place orders — direct customers to the WhatsApp or Email buttons on each product card.

Prices are in Indian Rupees (₹). Stock quantities are in the clearance range only.`;

export async function POST(req) {
  const { messages } = await req.json();

  const result = await streamText({
    model: anthropic('claude-3-5-haiku-20241022'),
    system: SYSTEM_PROMPT,
    messages,
    maxSteps: 5,
    tools: {
      searchClearanceStock: tool({
        description: 'Search the Aeros clearance stock inventory for packaging products available at discounted prices for immediate dispatch. Use this when customers ask about clearance, end-of-line, discounted, or available-now stock.',
        parameters: z.object({
          query: z.string().describe('Search term — product name, category, material, or description'),
          category: z.string().optional().describe('Optional category filter, e.g. "Paper Cup", "Paper Bag", "Food Box", "Paper Tub"'),
        }),
        execute: async ({ query, category }) => {
          const items = await getInventory();
          const q = query.toLowerCase();
          const results = items.filter((item) => {
            const haystack = `${item.itemName} ${item.category} ${item.brand} ${item.unit}`.toLowerCase();
            const matchesQuery = haystack.includes(q);
            const matchesCategory = !category || item.category.toLowerCase().includes(category.toLowerCase());
            return matchesQuery && matchesCategory;
          }).slice(0, 8);

          if (results.length === 0) return { found: 0, results: [] };
          return {
            found: results.length,
            results: results.map((i) => ({
              name: i.itemName,
              category: i.category,
              stock: i.stockQuantity !== null ? `${i.stockQuantity} ${i.unit}` : 'TBC',
              status: i.status,
            })),
          };
        },
      }),

      searchCatalog: tool({
        description: 'Search the Aeros fresh product catalog for standard packaging products with regular pricing. Use this when customers ask about regular products, pricing, specs, materials, or dimensions.',
        parameters: z.object({
          query: z.string().describe('Search term — product name, SKU, category, material, size, or description'),
          category: z.string().optional().describe('Optional category filter, e.g. "Paper Cups", "Lids", "Food Boxes", "Paper Bags", "Paper Straws", "Paper Tubs", "Salad Bowls"'),
        }),
        execute: async ({ query, category }) => {
          const products = await getCatalog();
          const q = query.toLowerCase();
          const results = products.filter((p) => {
            const haystack = `${p.productName} ${p.sku} ${p.category} ${p.subCategory} ${p.material} ${p.sizeVolume} ${p.colour}`.toLowerCase();
            const matchesQuery = haystack.includes(q);
            const matchesCategory = !category || p.category.toLowerCase().includes(category.toLowerCase());
            return matchesQuery && matchesCategory;
          }).slice(0, 8);

          if (results.length === 0) return { found: 0, results: [] };
          return {
            found: results.length,
            results: results.map((p) => ({
              name: p.productName,
              sku: p.sku,
              category: p.category,
              size: p.sizeVolume || null,
              material: p.material || null,
              gsm: p.gsm || null,
              colour: p.colour || null,
              unitsPerCase: p.unitsPerCase || null,
              cartonDimensions: p.cartonDimensions || null,
              pricePerUnit: p.pricePerUnit ? `₹${p.pricePerUnit}` : null,
              pricePerCase: p.pricePerCase ? `₹${p.pricePerCase}` : null,
            })),
          };
        },
      }),

      listCategories: tool({
        description: 'List all available product categories from both the clearance stock and fresh catalog. Use this when a customer asks what types of products are available.',
        parameters: z.object({}),
        execute: async () => {
          const [items, products] = await Promise.all([getInventory(), getCatalog()]);
          const clearanceCategories = [...new Set(items.map((i) => i.category))].sort();
          const catalogCategories = [...new Set(products.map((p) => p.category))].sort();
          return { clearanceCategories, catalogCategories };
        },
      }),
    },
  });

  return result.toDataStreamResponse();
}
