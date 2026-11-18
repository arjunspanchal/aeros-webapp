// Job routing — where conversion and packing physically happen — and the
// stage flow that follows from it. Pure, dependency-free so both the server
// (API validation, repo) and client forms can import it.
//
// Arjun, 01-Oct-2026:
//   cups / tubs / SOS / PTH / D-cut  → printed at vendor, converted + packed at Aeros
//   cup carriers (CHC)               → Blue Line prints + converts, Aeros packs in cartons
//   table mats, low qty (10–20k)     → Aeros buys sheets, Blue Line prints, Aeros packs
//   table mats, high qty             → roll to Viana, prints + sheets + packs, FG back
// The person picking the printer has already applied the MOQ logic, so the
// default follows the product + printer; both switches stay editable per job.

import { STAGES } from "./constants";

export const ROUTE_AT = [
  { value: "aeros", label: "Aeros" },
  { value: "vendor", label: "Vendor" },
];
const AT = new Set(ROUTE_AT.map((o) => o.value));
export const routeAt = (v) => (AT.has(String(v || "").toLowerCase()) ? String(v).toLowerCase() : "aeros");

export function defaultRoute({ category = "", subCategory = "", item = "", printingVendor = "" } = {}) {
  const hay = `${category} ${subCategory} ${item}`.toLowerCase();
  const vendor = String(printingVendor || "").toLowerCase();
  if (/cup carrier|cup holder|cup sling/.test(hay)) {
    return { conversionAt: "vendor", packingAt: "aeros" };
  }
  if (/table mat|tray mat/.test(hay)) {
    return { conversionAt: "vendor", packingAt: /viana|vienna/.test(vendor) ? "vendor" : "aeros" };
  }
  return { conversionAt: "aeros", packingAt: "aeros" };
}

// Stages this job actually passes through. "In Conversion" only exists when
// conversion is on Aeros machines / labour; "Packing" only when Aeros packs —
// when the vendor packs, finished goods arrive straight into Ready for Dispatch.
export function stagesForJob(job = {}) {
  const conv = routeAt(job.conversionAt);
  const pack = routeAt(job.packingAt);
  const plain = /^(plain|none)/i.test(String(job.printingType || "").trim());
  return STAGES.filter((s) => {
    // Coating only for jobs flagged as needing it; plain jobs skip the printer.
    if (s === "Coating" && !job.coatingRequired) return false;
    if (s === "Under Printing" && plain) return false;
    if (s === "In Conversion" && conv === "vendor") return false;
    if (s === "Packing" && pack === "vendor") return false;
    return true;
  });
}

// Stage options to offer in the editor: the job's own flow, plus its current
// stage if it somehow sits on a skipped one (legacy data) so nothing is lost.
export function stageOptionsForJob(job = {}) {
  const flow = stagesForJob(job);
  return job.stage && !flow.includes(job.stage) ? [job.stage, ...flow] : flow;
}

export function describeRoute(job = {}) {
  const conv = routeAt(job.conversionAt);
  const pack = routeAt(job.packingAt);
  if (conv === "aeros" && pack === "aeros") return "Converted and packed at Aeros";
  if (conv === "vendor" && pack === "aeros") return "Converted at vendor, packed at Aeros";
  if (conv === "vendor" && pack === "vendor") return "Converted and packed at vendor — FG arrives ready";
  return "Converted at Aeros, packed at vendor";
}

// Hand-pasted bags (Arjun, 17-Nov-2026): flap bags, D-cut bags and every
// custom-made offset bag come into the warehouse as printed sheets and are
// pasted by hand. They do not run on the bag machines, so their printed stock
// is counted in sheets and "In Conversion" means hand pasting.
export function isHandPasted(job = {}) {
  const sku = String(job.masterSku || "");
  const text = `${job.category || ""} ${job.item || ""}`.toLowerCase();
  const isBag = /\bbags?\b/.test(text) || /^(dcb|sos|pth|fhb|vb|vbp)-/i.test(sku);
  if (!isBag) return false;
  if (/^dcb-/i.test(sku) || /d[\s-]?cut/.test(text)) return true;
  if ((job.extraFeatures || []).some((f) => /flap/i.test(String(f)))) return true;
  if (job.customItem && /^offset/i.test(String(job.printingType || ""))) return true;
  return false;
}
