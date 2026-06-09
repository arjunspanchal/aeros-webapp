// Emission · Service OS — display helpers. Status labels are strictly greyscale
// (NO hue) — urgency is signalled by layout/weight/position, never color.

export const STATUS_LABEL = {
  received: "RECEIVED",
  diagnosing: "DIAGNOSING",
  quoted: "QUOTED",
  approved: "APPROVED",
  awaiting_parts: "AWAITING PARTS",
  in_repair: "IN REPAIR",
  ready: "READY",
  delivered: "DELIVERED",
  declined: "DECLINED",
  not_repairable: "NOT REPAIRABLE",
  returned: "RETURNED",
};

export const PAYMENT_LABEL = {
  cash: "CASH",
  business_upi: "BUSINESS UPI",
  hdfc_bank: "HDFC BANK",
  pending: "PENDING",
};

export const ITEM_TYPE_LABEL = {
  service: "SERVICE",
  spare_part: "SPARE PART",
  accessory_sale: "ACCESSORY SALE",
};

export const CLAIM_LABEL = {
  not_filed: "NOT FILED",
  filed: "FILED",
  approved: "APPROVED",
  rejected: "REJECTED",
  paid: "PAID",
};

export const REVENUE_CATEGORY_LABEL = {
  service: "SERVICE",
  spare_part: "SPARE PARTS",
  accessory_sale: "ACCESSORY SALES",
  inspection_charge: "INSPECTION FEES",
};

export function statusLabel(s) {
  return STATUS_LABEL[s] || String(s || "").toUpperCase();
}

// Whole-rupee, grouped (Indian convention is fine with en-IN).
export function inr(n) {
  const v = Number(n || 0);
  return "₹" + v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function fmtDate(d) {
  if (!d) return "—";
  // d is a YYYY-MM-DD (date) or ISO string. Render dd MMM yyyy, mono-friendly.
  const dt = typeof d === "string" && d.length === 10 ? new Date(d + "T00:00:00") : new Date(d);
  if (isNaN(dt)) return String(d);
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function daysSince(d) {
  if (!d) return null;
  const dt = typeof d === "string" && d.length === 10 ? new Date(d + "T00:00:00") : new Date(d);
  if (isNaN(dt)) return null;
  const ms = Date.now() - dt.getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Service-warranty window from a delivery date + warranty days.
export function warrantyStatus(dateDelivered, days = 90) {
  if (!dateDelivered) return null;
  const until = new Date((typeof dateDelivered === "string" && dateDelivered.length === 10 ? dateDelivered + "T00:00:00" : dateDelivered));
  if (isNaN(until)) return null;
  until.setDate(until.getDate() + Number(days || 90));
  const daysLeft = Math.ceil((until.getTime() - Date.now()) / 86400000);
  return { until, daysLeft, active: daysLeft >= 0 };
}

// Short relative time, e.g. "just now", "5m ago", "3h ago", "2d ago", "12 Apr".
export function timeAgo(ts) {
  if (!ts) return "";
  const dt = new Date(ts);
  if (isNaN(dt)) return "";
  const s = Math.floor((Date.now() - dt.getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}
