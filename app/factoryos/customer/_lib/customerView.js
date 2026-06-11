// Customer-facing translation layer over the raw `job` shape that the rest of
// FactoryOS uses internally. Keeps stage names, next-step text, and ETA logic
// in ONE place so the dashboard, the detail page, and any future surface
// (email, mobile, exports) stay aligned.
//
// Why this exists:
//   - Internal stages are jargon ("RM Pending", "Under Printing"). Customers
//     need plain English ("Sourcing raw material", "Printing in progress").
//   - `estimated_delivery_date` is null on most historical jobs (100% of
//     Brewbay's, audited 2026-06-10) — we derive a sensible expectation
//     instead of just blanking out.
//   - "What does Aeros need from me" is the single most useful signal a
//     customer can have at a glance, and it's nowhere in the schema; we
//     compute it from stage + flags.
//   - Activity-log notes contain staff emails; we sanitize them before render.

import { STAGES, STAGE_INDEX } from "@/lib/factoryos/constants";

// Plain-English stage labels — what we show. Internal stage names stay the
// canonical key.
export const STAGE_LABEL = {
  "RM Pending":         "Sourcing raw material",
  "Under Printing":     "Printing in progress",
  "In Conversion":      "Manufacturing",
  "Packing":            "Final packing",
  "Ready for Dispatch": "Awaiting dispatch",
  "Dispatched":         "On the way to you",
  "Delivered":          "Delivered",
};

// Short milestone strip the customer sees on the dashboard. Collapses the 7
// internal stages into 5 readable steps. Index N means "stage[N] is the
// active milestone" — same `current` semantics as StageTimeline.
export const MILESTONES = [
  { key: "confirmed",  label: "Confirmed",  matches: ["RM Pending"] },
  { key: "production", label: "Printing & manufacturing", matches: ["Under Printing", "In Conversion"] },
  { key: "packed",     label: "Packed",     matches: ["Packing", "Ready for Dispatch"] },
  { key: "dispatched", label: "Dispatched", matches: ["Dispatched"] },
  { key: "delivered",  label: "Delivered",  matches: ["Delivered"] },
];

export function milestoneIndex(stage) {
  const idx = MILESTONES.findIndex((m) => m.matches.includes(stage));
  return idx === -1 ? 0 : idx;
}

// Friendly label exposed to the UI. Falls back to the raw stage if we ever add
// a stage and forget to translate it.
export function friendlyStage(stage) {
  return STAGE_LABEL[stage] || stage || "Confirmed";
}

// Short "what's happening now" copy keyed off the current stage. One sentence,
// reassuring rather than apologetic. The detail page renders this large; the
// dashboard renders it as a sub-line.
export function whatHappeningNow(job) {
  switch (job.stage) {
    case "RM Pending":
      return "We're sourcing paper and getting raw materials in. Production starts as soon as the stock arrives.";
    case "Under Printing":
      return "Your artwork is being printed.";
    case "In Conversion":
      return "Printed sheets are being converted on the factory floor.";
    case "Packing":
      return "We're packing your order into shipping cartons.";
    case "Ready for Dispatch":
      return "Your order is packed and waiting for the truck.";
    case "Dispatched":
      return "Your order has left the factory and is on its way.";
    case "Delivered":
      return "Your order has been delivered. Thanks for working with us.";
    default:
      return "Your order has been confirmed and is queued for production.";
  }
}

// "Next step" — a single chip the customer can scan. Captures what's coming
// next AND what we need from them (artwork approval) so they don't have to
// hunt for it.
export function nextStep(job) {
  if (!job) return null;
  // Customer action needed — outranks everything else.
  if (!job.customerArtworkApprovedAt && job.stage === "RM Pending") {
    return { tone: "action", text: "Awaiting artwork approval from you" };
  }
  if (!job.customerArtworkApprovedAt && job.stage === "Under Printing") {
    // Edge case — printing started without explicit sign-off (legacy data).
    return { tone: "info", text: "Printing in progress" };
  }
  switch (job.stage) {
    case "RM Pending":         return { tone: "info", text: "Raw material being arranged" };
    case "Under Printing":     return { tone: "info", text: "Printing in progress" };
    case "In Conversion":      return { tone: "info", text: "Being manufactured" };
    case "Packing":            return { tone: "info", text: "Being packed" };
    case "Ready for Dispatch": return { tone: "soon", text: "Loading onto truck next" };
    case "Dispatched":         return { tone: "good", text: "On the way to you" };
    case "Delivered":          return { tone: "good", text: "Delivered" };
    default:                   return { tone: "info", text: "Confirmed — production starting" };
  }
}

// Surface the ETA only when Aeros has actually committed one. Previously
// this fell back to `order_date + 28d`, which generated dates the team had
// never agreed to; a café customer could plan a launch around that and get
// burned. Now: if there's an explicit `estimated_delivery_date`, show it;
// otherwise hand back a soft "we'll confirm shortly" hint via isPending.
//
// Returning `expectedDispatchDate` (Aeros-internal) is still allowed because
// it IS a team-set field — just treat it as less firm than the customer ETA.
export function derivedEta(job) {
  if (job?.estimatedDeliveryDate) return { date: job.estimatedDeliveryDate, isExplicit: true };
  if (job?.expectedDispatchDate) {
    return { date: shiftDateString(job.expectedDispatchDate, 3), isExplicit: false };
  }
  return { date: null, isPending: true };
}

function shiftDateString(isoLike, days) {
  try {
    const d = new Date(isoLike);
    if (Number.isNaN(d.getTime())) return null;
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

// Health flag: does this job need the customer's attention right now? Used by
// the dashboard's "Needs your attention" strip. Cheap to compute on the client.
export function needsCustomerAttention(job) {
  if (!job) return false;
  if (job.stage === "Delivered" || job.stage === "Dispatched") return false;
  if (!job.customerArtworkApprovedAt && job.stage === "RM Pending") return true;
  return false;
}

// Strip internal-only signals out of a `job_status_updates` note before we
// show it to the customer. The team writes notes like
//   "Speak to Omkar for printing"
// or stamps emails like rahul.fale@theepackagingcompany.com. None of that
// should leak. We keep notes that look customer-authored or customer-aimed.
export function sanitizeActivityNote(note) {
  if (!note) return null;
  const trimmed = String(note).trim();
  if (!trimmed) return null;
  // Strip any email-looking tokens.
  const masked = trimmed.replace(/\b[\w.+-]+@[\w.-]+\.\w{2,}\b/g, "Aeros team");
  return masked;
}

// Lowercase string match for "customer ..." notes the system writes itself —
// these are safe to always show.
const CUSTOMER_NOTE_PREFIXES = ["customer "];
export function activityIsCustomerVisible(update) {
  if (!update) return false;
  if (!update.note) return true; // stage-only updates are fine
  const low = String(update.note).toLowerCase();
  if (CUSTOMER_NOTE_PREFIXES.some((p) => low.startsWith(p))) return true;
  // Block notes that look like internal todos (action_points lookalikes). The
  // team writes things like "Speak to Omkar", "Get RM fast". Strip anything
  // that contains specific internal-name verbs.
  const internalSignals = ["speak to ", "release plates", "get rm", "tpc fast", "give flaps", "slitting to "];
  if (internalSignals.some((s) => low.includes(s))) return false;
  return true;
}

// Helper for the dashboard KPIs.
export function classifyForKpi(jobs) {
  const now = new Date();
  const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
  let inProgress = 0;
  let needsYou = 0;
  let dispatchedThisMonth = 0;
  let deliveredThisYear = 0;
  for (const j of jobs) {
    if (j.stage !== "Dispatched" && j.stage !== "Delivered") inProgress++;
    if (needsCustomerAttention(j)) needsYou++;
    if (j.stage === "Dispatched") {
      const d = j.orderDate ? new Date(j.orderDate) : null;
      if (d && d > monthAgo) dispatchedThisMonth++;
    }
    if (j.stage === "Delivered") {
      const d = j.orderDate ? new Date(j.orderDate) : null;
      if (d && d.getFullYear() === now.getFullYear()) deliveredThisYear++;
    }
  }
  return { inProgress, needsYou, dispatchedThisMonth, deliveredThisYear };
}

// 0..N index pointing at the active node in the internal STAGES strip — used
// when we render a detailed 7-node timeline (rare, only the existing
// StageTimeline). Kept here so consumers don't reach into constants directly.
export function internalStageIndex(stage) {
  return STAGE_INDEX[stage] ?? 0;
}
export const INTERNAL_STAGES = STAGES;
