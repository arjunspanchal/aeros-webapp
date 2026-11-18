// The locked job flow (rebuild step 1, 17-Nov-2026).
//
// One job moves through a fixed sequence of steps. Each step has an owner and
// a short list of things that must be true before the job may move on. This
// file is the single definition of those rules. It is pure (no database, no
// React) so the server enforces it and the job screen shows the same list.
//
// Outsourcing knowledge the rules are built around (Arjun, 17-Nov-2026):
//   PE coating and printing are outsourced; conversion is in-house.
//   Viana Packaging = flexo · Lucky Offset, Blueline = offset
//   Sahil Fashion, Jayant Printery = PE coating + printing

import { ROLES } from "@/lib/auth/roles";
import { STAGES, STAGE_INDEX } from "./constants";
import { stagesForJob } from "./routes";

export const VENDOR_CAPABILITIES = [
  { value: "flexo", label: "Flexo printing" },
  { value: "offset", label: "Offset printing" },
  { value: "pe_coating", label: "PE coating" },
];

export const TRANSPORT_MODES = ["Delhivery", "TCI Express", "Bluedart", "Direct Vehicle", "Full truck (FTL)", "Customer pickup", "Other"];

// Who owns the move INTO each stage.
const PRODUCTION = new Set([ROLES.ADMIN, ROLES.FACTORY_MANAGER, ROLES.FACTORY_EXECUTIVE]);
const MOVERS = {
  "Coating": PRODUCTION,
  "Under Printing": PRODUCTION,
  "In Conversion": PRODUCTION,
  "Packing": PRODUCTION,
  "Ready for Dispatch": PRODUCTION,
  "Dispatched": new Set([ROLES.ADMIN, ROLES.WAREHOUSE]),
  "Delivered": new Set([ROLES.ADMIN, ROLES.WAREHOUSE, ROLES.ACCOUNT_MANAGER, ROLES.CUSTOMER]),
};
export const OWNER_LABEL = {
  "RM Pending": "Factory manager",
  "Coating": "Factory manager",
  "Under Printing": "Factory manager",
  "In Conversion": "Factory manager",
  "Packing": "Factory manager",
  "Ready for Dispatch": "Warehouse",
  "Dispatched": "Warehouse or sales",
  "Delivered": "",
};

export function canMoveTo(role, toStage) {
  return !!MOVERS[toStage]?.has(role);
}

// The stage after the job's current one, in the job's own flow.
export function nextStage(job) {
  const flow = stagesForJob(job);
  const i = flow.indexOf(job.stage);
  if (i >= 0) return flow[i + 1] || null;
  // Legacy job sitting on a stage its flow skips: go to the next flow stage.
  const cur = STAGE_INDEX[job.stage] ?? 0;
  return flow.find((s) => STAGE_INDEX[s] > cur) || null;
}

const has = (v) => v !== null && v !== undefined && String(v).trim() !== "";
const pos = (v) => Number(v) > 0;

// Everything that must be true to move `job` to `to`.
// ctx = { inwardCount, coaCount, dispatchedQty } (counts from the database).
// Each item: { key, label, ok, field? } — `field` names the job field an
// inline input on the job screen can fill.
export function requirementsFor(job, to, ctx = {}) {
  const from = job.stage;
  const req = [];
  const add = (key, label, ok, field) => req.push({ key, label, ok: !!ok, field: field || null });

  if (from === "RM Pending") {
    // The only date FactoryOS commits to (Arjun, 17-Nov-2026): when the goods
    // will be ready at the factory. Dispatch and delivery follow from Zoho.
    add("productionDueDate", "Production ready date", has(job.productionDueDate), "productionDueDate");
    add("paperType", "Paper type", has(job.paperType), "paperType");
    add("rmQty", "Paper quantity (sheets or kg)", pos(job.rmQtySheets) || pos(job.rmQtyKgs), "rmQty");
  }
  if (to === "Coating") {
    add("coatingVendorId", "Coater", has(job.coatingVendorId), "coatingVendorId");
    add("coatingSentOn", "Date paper was sent for coating", has(job.coatingSentOn), "coatingSentOn");
    add("coatingDueDate", "Date coated paper is due back", has(job.coatingDueDate), "coatingDueDate");
  }
  if (from === "Coating") {
    add("coatingReceivedOn", "Date coated paper came back", has(job.coatingReceivedOn), "coatingReceivedOn");
  }
  if (to === "Under Printing") {
    add("printingType", "Printing type (flexo or offset)", /^(flexo|offset)/i.test(String(job.printingType || "")), "printingType");
    add("printingVendor", "Printer", has(job.printingVendorId) || has(job.printingVendor), "printingVendor");
    add("printingDueDate", "Date printed stock is due back", has(job.printingDueDate), "printingDueDate");
  }
  if (from === "Under Printing") {
    add("inward", "Inward from the printer recorded (date, quantity, challan)", (ctx.inwardCount || 0) > 0);
  }
  if (from === "In Conversion") {
    add("producedQty", "Quantity produced", pos(job.producedQty), "producedQty");
  }
  if (to === "Ready for Dispatch") {
    add("fgQty", "Finished pieces handed to the warehouse", pos(job.fgQty), "fgQty");
    add("fgCartons", "Number of cartons", pos(job.fgCartons), "fgCartons");
    add("coa", "COA made for this job", (ctx.coaCount || 0) > 0);
  }
  if (to === "Dispatched") {
    add("dispatch", "Dispatch recorded (date, quantity, transport, LR or vehicle, Zoho invoice number)", (ctx.dispatchedQty || 0) > 0);
  }
  if (to === "Delivered") {
    add("deliveredOn", "Delivery date", has(job.deliveredOn), "deliveredOn");
  }
  return req;
}

// Decide whether a move is allowed. Returns { ok, error, missing }.
//   role: the caller's FactoryOS role ("admin" for the admin flag)
//   override: admin-only, needs a reason; skips the required list and allows
//             backward or multi-step moves.
export function checkMove({ job, to, role, ctx = {}, override = false, reason = "" }) {
  if (!STAGES.includes(to)) return { ok: false, error: "Unknown stage", missing: [] };
  if (to === job.stage) return { ok: true, missing: [] };
  const isAdmin = role === ROLES.ADMIN;
  if (override) {
    if (!isAdmin) return { ok: false, error: "Only an admin can override a locked step", missing: [] };
    if (!String(reason || "").trim()) return { ok: false, error: "Give a reason for the override", missing: [] };
    return { ok: true, missing: [], overridden: true };
  }
  const expected = nextStage(job);
  if (to !== expected) {
    const back = (STAGE_INDEX[to] ?? 0) < (STAGE_INDEX[job.stage] ?? 0);
    return {
      ok: false,
      missing: [],
      error: back
        ? "A job cannot move backwards. An admin can do it with a reason."
        : `The next step for this job is ${expected || "none (already delivered)"}. Steps cannot be skipped.`,
    };
  }
  if (!canMoveTo(role, to)) {
    return { ok: false, missing: [], error: `${to} is set by ${[...(MOVERS[to] || [])].filter((r) => r !== ROLES.ADMIN && r !== ROLES.CUSTOMER).map((r) => r.replace(/_/g, " ")).join(" / ") || "an admin"}.` };
  }
  const missing = requirementsFor(job, to, ctx).filter((r) => !r.ok);
  if (missing.length) {
    return { ok: false, missing, error: `Fill these before moving to ${to}: ${missing.map((m) => m.label).join("; ")}.` };
  }
  return { ok: true, missing: [] };
}
