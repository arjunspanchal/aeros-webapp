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

export const CATEGORIES = ["Paper Bag", "Paper Cups", "Food Box", "Tub", "Other"];

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

export const ATTENDANCE_STATUSES = [
  { value: "P", label: "Present", dayWeight: 1 },
  { value: "A", label: "Absent", dayWeight: 0 },
  { value: "H", label: "Half Day", dayWeight: 0.5 },
];

export const ATTENDANCE_WEIGHT = Object.fromEntries(
  ATTENDANCE_STATUSES.map((s) => [s.value, s.dayWeight]),
);
