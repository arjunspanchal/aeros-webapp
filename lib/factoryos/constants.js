// Shared constants for the Orders module. Keep in sync with Airtable single-select options.
//
// ROLES + MODULES are now defined canonically in lib/auth/roles.js (Phase 1.1
// of auth unification). We re-export them here so existing call-sites that
// `import { ROLES } from "@/lib/factoryos/constants"` keep working untouched.

import { ROLES, MODULES } from "@/lib/auth/roles";
export { ROLES, MODULES };

export const STAGES = [
  "RM Pending",
  "Under Printing",
  "In Conversion",
  "Packing",
  "Ready for Dispatch",
  "Dispatched",
  "Delivered",
];

export const STAGE_INDEX = Object.fromEntries(STAGES.map((s, i) => [s, i]));

export const ROLE_OPTIONS = [
  { value: ROLES.ADMIN, label: "Admin" },
  { value: ROLES.ACCOUNT_MANAGER, label: "Account Manager" },
  { value: ROLES.FACTORY_MANAGER, label: "Factory Manager" },
  { value: ROLES.FACTORY_EXECUTIVE, label: "Factory Executive" },
  { value: ROLES.CUSTOMER, label: "Customer" },
  { value: ROLES.VENDOR, label: "Vendor (Printing)" },
];

// Legacy hardcoded job categories from before the master-product picker
// existed. They no longer drive the picker UI — that derives categories
// from the loaded catalog (master_products.category) — but they're kept
// around so that:
//   1) Historical jobs created with these values render correctly in the
//      Edit Job dropdown (which unions catalog + legacy + current value).
//   2) An admin can still type/pick a legacy value if they need to.
//
// The original CATEGORIES const was used both as the dropdown options AND
// as a gate (`CATEGORIES.includes(p.category) ? p.category : f.category`),
// which silently discarded any catalog value not in this list — meaning a
// Lid / Take Out Container / Deli Wrap / Straw job would silently land on
// whatever the form default was. Audit finding C6.
export const LEGACY_CATEGORIES = ["Paper Bag", "Paper Cups", "Food Box", "Tub", "Other"];

// @deprecated — kept temporarily for any straggling import. Prefer
// LEGACY_CATEGORIES + deriving the live list from the catalog.
export const CATEGORIES = LEGACY_CATEGORIES;

// Vendor categories. Keep in sync with the Airtable `Vendors.Type` single-select
// options. `Printing` feeds the New Job printing-vendor dropdown; other types
// are reserved for future dropdowns (RM supplier, transporter).
export const VENDOR_TYPES = ["Printing", "RM Supplier", "Overseas Supplier", "Transport", "Other"];

// Factory machines. Consumption tracked in kgs, output in pcs (finished units).
// Partial rolls are normal — rolls count on RM Inventory stays fixed during
// a run; operators reconcile roll count when a roll is fully finished.
export const MACHINE_TYPES = [
  { value: "paper_bag", label: "Paper Bag Machine" },
  { value: "printer", label: "Printer" },
  { value: "die_cutter", label: "Die Cutter" },
  { value: "slotter", label: "Slotter" },
  { value: "lamination", label: "Lamination" },
  { value: "other", label: "Other" },
];

export const MACHINE_STATUSES = [
  { value: "active", label: "Active" },
  { value: "maintenance", label: "Maintenance" },
  { value: "retired", label: "Retired" },
];

export const RUN_STATUSES = [
  { value: "planned", label: "Planned" },
  { value: "running", label: "Running" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
];

export function canUpdateStage(role) {
  return (
    role === ROLES.ADMIN ||
    role === ROLES.ACCOUNT_MANAGER ||
    role === ROLES.FACTORY_MANAGER ||
    role === ROLES.FACTORY_EXECUTIVE
  );
}

export function isInternalRole(role) {
  return (
    role === ROLES.ADMIN ||
    role === ROLES.ACCOUNT_MANAGER ||
    role === ROLES.FACTORY_MANAGER ||
    role === ROLES.FACTORY_EXECUTIVE
  );
}

export function isVendorRole(role) {
  return role === ROLES.VENDOR;
}

// ---------- HR / Attendance ----------
// Factory standard shift: 9 AM to 7 PM = 10 hrs. Anything past 7 PM on a
// Present day counts as OT for OT-eligible employees. Change in one place.
export const STANDARD_SHIFT_HOURS = 10;
export const SHIFT_START = "09:00";
export const SHIFT_END = "19:00";

// OT rate = normal hourly rate × this multiplier.
// Normal hourly rate = monthlySalary / PAYROLL_DAYS_IN_MONTH / STANDARD_SHIFT_HOURS.
export const OT_MULTIPLIER = 1.5;

// Payroll uses a fixed 30-day month (per-day rate = monthlySalary / 30).
export const PAYROLL_DAYS_IN_MONTH = 30;

// Attendance day types. Payroll is monthly-salaried (paid for the whole month
// incl. Sundays/holidays); we only DOCK pay for true loss-of-pay days. Each
// status carries:
//   dayWeight  — how much of a "present" day it counts as (present-day totals)
//   lopWeight  — how much of a day is LOSS OF PAY (docked from salary)
//   paid       — does the worker get paid for this day
//   kind       — work | absent | leave | off  (UI grouping / colour)
//   manual     — can HR pick it in the marking UI (WO/HO are auto-derived)
export const ATTENDANCE_STATUSES = [
  { value: "P",  label: "Present",      dayWeight: 1,   lopWeight: 0,   paid: true,  kind: "work",   manual: true  },
  { value: "H",  label: "Half Day",     dayWeight: 0.5, lopWeight: 0.5, paid: true,  kind: "work",   manual: true  },
  { value: "A",  label: "Absent",       dayWeight: 0,   lopWeight: 1,   paid: false, kind: "absent", manual: true  },
  { value: "PL", label: "Paid Leave",   dayWeight: 1,   lopWeight: 0,   paid: true,  kind: "leave",  manual: true  },
  { value: "UL", label: "Unpaid Leave", dayWeight: 0,   lopWeight: 1,   paid: false, kind: "leave",  manual: true  },
  { value: "WO", label: "Weekly Off",   dayWeight: 1,   lopWeight: 0,   paid: true,  kind: "off",    manual: false },
  { value: "HO", label: "Holiday",      dayWeight: 1,   lopWeight: 0,   paid: true,  kind: "off",    manual: false },
];

export const ATTENDANCE_WEIGHT = Object.fromEntries(
  ATTENDANCE_STATUSES.map((s) => [s.value, s.dayWeight]),
);

// Loss-of-pay weight per status — the only days we dock from monthly salary.
export const ATTENDANCE_LOP = Object.fromEntries(
  ATTENDANCE_STATUSES.map((s) => [s.value, s.lopWeight]),
);

export const ATTENDANCE_STATUS_MAP = Object.fromEntries(
  ATTENDANCE_STATUSES.map((s) => [s.value, s]),
);

// Statuses HR can manually pick in the marking UI (WO/HO are auto-derived).
export const MANUAL_ATTENDANCE_STATUSES = ATTENDANCE_STATUSES.filter((s) => s.manual);

// Default weekly off = Sunday (DOW 0). Stored per-employee in weekly_off_days.
export const DEFAULT_WEEKLY_OFF = [0];

// Late grace: a punch-in later than SHIFT_START + this many minutes is "Late".
export const LATE_GRACE_MINUTES = 15;

// Overnight shift cutoff. OT shifts run past midnight (e.g. a bag-machine
// operator working 09:00 → 04:00). A shift's hard end is this clock time on the
// day AFTER check-in: check-out before/at it is taken as-is; punching out later
// — or forgetting to punch out — auto-closes the shift here, capping OT. This is
// also the latest time the punch clock keeps offering "Check Out" for a
// still-open overnight shift. Env-overridable (OT_CUTOFF_HM).
export const OT_CUTOFF_HM = process.env.OT_CUTOFF_HM || "04:00";

// Office geofence — WFO workers can only punch in/out within this radius of the
// Bhiwandi factory. Centre is the Raj Rajeshwari Complex, Vehele, Bhiwandi
// (Plus code 7JFM63W3+FG3). WFH workers are exempt. Env vars override without a
// code change (set OFFICE_LAT / OFFICE_LNG / OFFICE_RADIUS_M in Vercel).
export const OFFICE_GEOFENCE = {
  lat: Number(process.env.OFFICE_LAT) || 19.24614,
  lng: Number(process.env.OFFICE_LNG) || 73.05380,
  radiusM: Number(process.env.OFFICE_RADIUS_M) || 250,
};

// ---------- Hiring / candidate pipeline ----------
// Where a candidate came from. Aeros hires mostly via WorkIndia (blue-collar)
// and Internshala (freshers); the rest are referrals / walk-ins.
export const HIRING_SOURCES = ["WorkIndia", "Internshala", "Referral", "Walk-in", "Other"];

// Candidate pipeline. `board:true` stages are the Kanban columns, left→right.
// Rejected / On-hold are side states reached from a card's menu and surfaced via
// the filter, not shown as columns.
export const HIRING_STAGES = [
  { value: "new", label: "New", board: true },
  { value: "screening", label: "Screening", board: true },
  { value: "interview", label: "Interview", board: true },
  { value: "selected", label: "Selected", board: true },
  { value: "hired", label: "Hired", board: true },
  { value: "rejected", label: "Rejected", board: false },
  { value: "on_hold", label: "On hold", board: false },
];
export const HIRING_STAGE_MAP = Object.fromEntries(HIRING_STAGES.map((s) => [s.value, s]));
export const HIRING_BOARD_STAGES = HIRING_STAGES.filter((s) => s.board);
