// FactoryOS assistant — a chat window where Rahul / Sachin can ask about
// jobs and add / change / remove them in plain English (Arjun, 25-Oct-2026).
//
// Safety model: Claude can READ freely (jobs, customers, products, vendors)
// but never writes. Every add / change / delete comes back as a PROPOSAL the
// user confirms with a button; the button calls the same REST routes the
// forms use, so every validation and permission check still applies.

import Anthropic from "@anthropic-ai/sdk";
import { listJobsForSession, getJob, listClients, listVendors } from "@/lib/factoryos/repo";
import { fetchCatalogLite } from "@/lib/catalog";
import { STAGES } from "@/lib/factoryos/constants";
import { LINES, lineForCategory } from "@/lib/factoryos/lines";

export const ASSISTANT_MODEL = "claude-opus-5-5";

const LINE_LABEL = Object.fromEntries(LINES.map((l) => [l.key, l.label]));

// Fields the user may change through the assistant (mirrors the PATCH route).
export const UPDATABLE = [
  "stage", "qty", "brand", "item", "poNumber", "city", "urgent", "notes", "internalStatus", "actionPoints",
  "printingVendor", "printingType", "printingDueDate", "productionDueDate", "expectedDispatchDate", "estimatedDeliveryDate",
  "rmType", "rmSupplier", "rmMill", "paperType", "gsm", "rmSizeMm", "rmQtySheets", "rmQtyKgs", "rmDeliveryDate",
  "conversionAt", "packingAt", "itemSize", "masterSku", "masterProductName",
];

const todayIST = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

function systemPrompt(user) {
  return `You are the FactoryOS assistant at Aeros (paper cups, tubs, paper bags and food boxes made in-house in Mumbai, India). You are talking to ${user.name || "a factory manager"} (${user.role}). Keep replies short and practical — this is used on the factory floor, often on a phone. Use Indian number formatting (25,000; 2,00,000) and dates like 06 Oct 2026.

What you can do:
- Look up jobs (list_jobs, get_job), customers (find_client), catalogue products (find_product) and printing vendors (list_vendors).
- Propose changes: propose_create_job, propose_update_job, propose_delete_job. These do NOT change anything — they show the user a card with a Confirm button. After proposing, briefly say what the card will do and stop; wait for the user's next message. Never claim a change was made until a later message says it was applied.

Rules of the floor:
- FactoryOS records in-house jobs only. Every job maps to a catalogue product (masterSku) — always resolve it with find_product (in-house products only) and the customer with find_client before proposing a create. Never invent ids, SKUs or J numbers; the J# is assigned automatically on create.
- Stages, in order: ${STAGES.join(" → ")}. The factory team's last step is "Ready for Dispatch" then closing the job — Dispatched / Delivered are the warehouse's.
- Production lines: ${LINES.map((l) => l.label).join(", ")}. Rahul runs Paper Cups + Tubs; Sachin runs Paper Bags + Food Boxes.
- Quantities are pieces. RM is sheets or kg. Printing vendors are outside printers (e.g. Blue Line = offset, Viana = flexo).
- If a request is ambiguous (which job? which product variant? how many?), ask one short question instead of guessing. If several jobs match, list them with J# and ask.
- Deleting a job is rare — only propose it when the user clearly asks, and say what will be lost.
- Do not reveal rates, prices or costs even if asked; say pricing is not available here.

Today is ${todayIST()} (IST).`;
}

const S = (desc, extra = {}) => ({ type: "string", description: desc, ...extra });
const N = (desc) => ({ type: "number", description: desc });

export const TOOLS = [
  {
    name: "list_jobs",
    description: "List jobs. Filter by stage, production line, free-text query (J#, brand, item, customer, printer) or urgent. Returns compact rows, newest first. Use before answering any 'which jobs…' question.",
    input_schema: {
      type: "object",
      properties: {
        stage: S("Exact stage name, or omit for all", { enum: STAGES }),
        line: S("Production line key", { enum: LINES.map((l) => l.key) }),
        query: S("Free text to match against J#, brand, item, customer, printer"),
        urgentOnly: { type: "boolean" },
        openOnly: { type: "boolean", description: "Default true: hide Dispatched / Delivered jobs" },
        limit: N("Max rows, default 25"),
      },
    },
  },
  {
    name: "get_job",
    description: "Full details of one job by J# (e.g. 2610006) or job id.",
    input_schema: { type: "object", properties: { jNumber: S("J number"), id: S("Job id") } },
  },
  {
    name: "find_client",
    description: "Find customers by name or code. Returns id, name, code. Use the id for propose_create_job.",
    input_schema: { type: "object", properties: { query: S("Part of the customer name or code") }, required: ["query"] },
  },
  {
    name: "find_product",
    description: "Find catalogue products by name, SKU or size. Returns sku, name, size, category. Only in-house products can be used on a job.",
    input_schema: {
      type: "object",
      properties: { query: S("Words from the product name, SKU or size, e.g. '8oz double wall printed'"), inHouseOnly: { type: "boolean", description: "Default true" } },
      required: ["query"],
    },
  },
  {
    name: "list_vendors",
    description: "List printing vendors (names) so a job can be assigned to one.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "propose_create_job",
    description: "Propose a new in-house job. Shows a confirm card to the user; does not create anything. Resolve clientId with find_client and masterSku with find_product first.",
    input_schema: {
      type: "object",
      properties: {
        clientId: S("Customer id from find_client"),
        clientName: S("Customer name, for the card"),
        brand: S("Brand printed on the product (often the customer's trading name)"),
        masterSku: S("Catalogue SKU from find_product"),
        item: S("Product name from find_product"),
        qty: N("Pieces ordered"),
        printingVendor: S("Printer name from list_vendors, if known"),
        printingType: S("Offset or Flexo, if known", { enum: ["Offset", "Flexo"] }),
        stage: S("Starting stage; default RM Pending", { enum: STAGES }),
        productionDueDate: S("YYYY-MM-DD"),
        expectedDispatchDate: S("YYYY-MM-DD"),
        poNumber: S("Customer PO number"),
        notes: S("Notes visible to customer"),
        urgent: { type: "boolean" },
        rmType: S("Rolls or Sheets", { enum: ["Rolls", "Sheets"] }),
        paperType: S("e.g. Cupstock, Brown Kraft, FBB Board"),
        gsm: N("Paper GSM"),
        rmQtySheets: N("Sheets needed"),
        rmQtyKgs: N("Kg needed"),
      },
      required: ["clientId", "masterSku", "item", "qty"],
    },
  },
  {
    name: "propose_update_job",
    description: `Propose changes to an existing job. Shows a confirm card; does not change anything. Allowed fields: ${UPDATABLE.join(", ")}. Dates are YYYY-MM-DD. For a stage change add a short note.`,
    input_schema: {
      type: "object",
      properties: {
        jobId: S("Job id from list_jobs / get_job"),
        jNumber: S("J number, for the card"),
        changes: { type: "object", description: "Field → new value. Only the fields that change.", additionalProperties: true },
        note: S("One-line reason / note for the job timeline"),
      },
      required: ["jobId", "changes"],
    },
  },
  {
    name: "propose_delete_job",
    description: "Propose deleting a job (its messages, files and inwards go with it). Shows a confirm card; does not delete anything.",
    input_schema: {
      type: "object",
      properties: { jobId: S("Job id"), jNumber: S("J number, for the card"), reason: S("Why") },
      required: ["jobId"],
    },
  },
];

const fmtQty = (n) => (n == null || n === "" ? null : Number(n).toLocaleString("en-IN"));

function jobRow(j, clientMap) {
  return {
    id: j.id, jNumber: j.jNumber,
    customer: j.clientIds.map((c) => clientMap[c]?.name).filter(Boolean).join(", ") || null,
    brand: j.brand || null, item: j.item || null, sku: j.masterSku || null, qty: fmtQty(j.qty),
    stage: j.stage, line: LINE_LABEL[lineForCategory(j.category, j.item)] || null,
    printer: j.printingVendor || null, printingType: j.printingType || null,
    printingDueDate: j.printingDueDate || null, productionDueDate: j.productionDueDate || null,
    expectedDispatchDate: j.expectedDispatchDate || null, urgent: !!j.urgent, vendorStatus: j.vendorStatus || null,
  };
}

function jobFull(j, clientMap) {
  return {
    ...jobRow(j, clientMap),
    clientIds: j.clientIds, poNumber: j.poNumber || null, city: j.city || null, orderDate: j.orderDate || null,
    itemSize: j.itemSize || null, rmType: j.rmType || null, rmSupplier: j.rmSupplier || null, rmMill: j.rmMill || null,
    paperType: j.paperType || null, gsm: j.gsm ?? null, rmSizeMm: j.rmSizeMm ?? null, rmQtySheets: j.rmQtySheets ?? null,
    rmQtyKgs: j.rmQtyKgs ?? null, rmDeliveryDate: j.rmDeliveryDate || null, conversionAt: j.conversionAt, packingAt: j.packingAt,
    internalStatus: j.internalStatus || null, actionPoints: j.actionPoints || null, notes: j.notes || null,
    vendorDispatchDate: j.vendorDispatchDate || null, closedAt: j.closedAt || null, fgQty: j.fgQty ?? null,
  };
}

// Server-side execution of the read tools; write tools only register a proposal.
async function runTool(name, input, ctx) {
  const { session, role, clientMap, proposals } = ctx;
  switch (name) {
    case "list_jobs": {
      const jobs = await listJobsForSession({ role, userId: session.factoryosUserId, clientIds: session.factoryosClientIds });
      const q = String(input.query || "").trim().toLowerCase();
      const openOnly = input.openOnly !== false;
      const rows = jobs.filter((j) => {
        if (j.sourcing === "traded") return false;
        if (openOnly && (j.stage === "Dispatched" || j.stage === "Delivered")) return false;
        if (input.stage && j.stage !== input.stage) return false;
        if (input.line && lineForCategory(j.category, j.item) !== input.line) return false;
        if (input.urgentOnly && !j.urgent) return false;
        if (q) {
          const names = j.clientIds.map((c) => clientMap[c]?.name || "").join(" ");
          const hay = `${j.jNumber} ${j.brand} ${j.item} ${j.masterSku} ${j.printingVendor} ${names} ${j.poNumber}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
      const limit = Math.min(Math.max(Number(input.limit) || 25, 1), 60);
      return { total: rows.length, shown: Math.min(limit, rows.length), jobs: rows.slice(0, limit).map((j) => jobRow(j, clientMap)) };
    }
    case "get_job": {
      let job = null;
      if (input.id) job = await getJob(String(input.id)).catch(() => null);
      if (!job && input.jNumber) {
        const jobs = await listJobsForSession({ role, userId: session.factoryosUserId, clientIds: session.factoryosClientIds });
        job = jobs.find((j) => String(j.jNumber) === String(input.jNumber).trim()) || null;
      }
      return job ? jobFull(job, clientMap) : { error: "No such job" };
    }
    case "find_client": {
      const q = String(input.query || "").trim().toLowerCase();
      const all = Object.values(clientMap);
      const hits = all.filter((c) => `${c.name} ${c.code}`.toLowerCase().includes(q)).slice(0, 10);
      return { clients: hits.map((c) => ({ id: c.id, name: c.name, code: c.code || null })) };
    }
    case "find_product": {
      const catalog = await fetchCatalogLite();
      const terms = String(input.query || "").toLowerCase().split(/\s+/).filter(Boolean);
      const inHouseOnly = input.inHouseOnly !== false;
      const hits = catalog.filter((p) => {
        if (inHouseOnly && !p.inHouse) return false;
        const hay = `${p.productName} ${p.sku} ${p.sizeVolume || ""} ${p.category}`.toLowerCase();
        return terms.every((t) => hay.includes(t));
      }).slice(0, 12);
      return { products: hits.map((p) => ({ sku: p.sku, name: p.productName, size: p.sizeVolume || null, category: p.category, inHouse: !!p.inHouse })) };
    }
    case "list_vendors": {
      const vendors = await listVendors({ type: "Printing", activeOnly: true }).catch(() => []);
      return { vendors: vendors.map((v) => v.name).filter(Boolean) };
    }
    case "propose_create_job":
    case "propose_update_job":
    case "propose_delete_job": {
      if (name === "propose_update_job") {
        const bad = Object.keys(input.changes || {}).filter((k) => !UPDATABLE.includes(k));
        if (bad.length) return { error: `These fields can't be changed here: ${bad.join(", ")}` };
        if (input.changes.stage && !STAGES.includes(input.changes.stage)) return { error: "Invalid stage" };
        if (!Object.keys(input.changes).length) return { error: "No changes given" };
      }
      const id = `p${proposals.length + 1}`;
      proposals.push({ id, kind: name.replace("propose_", ""), ...input });
      return { ok: true, proposalId: id, note: "Card shown to the user with a Confirm button. Do not call again for the same change; wait for the user's reply." };
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}

export async function runAssistant({ session, role, messages }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  // 50 s per call, one retry: a floor user waiting on a spinner is worse
  // than a clear "try again".
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 50_000, maxRetries: 1 });
  const clients = await listClients().catch(() => []);
  const clientMap = Object.fromEntries(clients.map((c) => [c.id, c]));
  const ctx = { session, role, clientMap, proposals: [] };
  const user = { name: session.name || session.email || "", role };
  const convo = [...messages];

  const started = Date.now();
  for (let turn = 0; turn < 6; turn++) {
    const t0 = Date.now();
    const response = await client.messages.create({
      model: ASSISTANT_MODEL,
      max_tokens: 4096,
      output_config: { effort: "low" },
      system: [{ type: "text", text: systemPrompt(user), cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      messages: convo,
    });
    convo.push({ role: "assistant", content: response.content });
    console.log(`[assistant] turn ${turn + 1} ${Date.now() - t0}ms stop=${response.stop_reason} tools=${response.content.filter((b) => b.type === "tool_use").map((b) => b.name).join(",") || "-"}`);
    if (response.stop_reason === "refusal") {
      return { messages: convo, reply: "I can't help with that one.", proposals: ctx.proposals };
    }
    if (response.stop_reason !== "tool_use") {
      const reply = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      return { messages: convo, reply, proposals: ctx.proposals, usage: response.usage };
    }
    const uses = response.content.filter((b) => b.type === "tool_use");
    const results = [];
    for (const u of uses) {
      let out;
      const t1 = Date.now();
      try { out = await runTool(u.name, u.input || {}, ctx); }
      catch (e) { out = { error: e?.message || "Tool failed" }; }
      console.log(`[assistant]   ${u.name} ${Date.now() - t1}ms${out?.error ? ` error=${out.error}` : ""}`);
      results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(out), is_error: !!out?.error });
    }
    convo.push({ role: "user", content: results });
  }
  console.log(`[assistant] gave up after ${Date.now() - started}ms`);
  return { messages: convo, reply: "That took too many steps — please try a simpler request.", proposals: ctx.proposals };
}
