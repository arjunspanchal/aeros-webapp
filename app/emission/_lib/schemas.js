// Emission · Service OS — Zod schemas (JS port of emission-service-os/src/lib/schemas.ts).
// Mirrors the `emission` Postgres schema. Used for intake validation + typed shapes.
import { z } from "zod";

export const JobStatus = z.enum([
  "received", "diagnosing", "quoted", "approved", "awaiting_parts", "in_repair", "ready", "delivered",
  "declined", "not_repairable", "returned",
]);

// Ordered happy-path lifecycle (for "advance status").
export const LIFECYCLE = [
  "received", "diagnosing", "quoted", "approved", "awaiting_parts", "in_repair", "ready", "delivered",
];
// Terminal branches a job can jump to from anywhere (still carry inspection_charge).
export const TERMINAL_BRANCHES = ["declined", "not_repairable", "returned"];
export const TERMINAL_STATUSES = ["delivered", ...TERMINAL_BRANCHES];

export const PaymentMethod = z.enum(["cash", "business_upi", "hdfc_bank", "pending"]);
export const ItemType = z.enum(["service", "spare_part", "accessory_sale"]);
export const ClaimStatus = z.enum(["not_filed", "filed", "approved", "rejected", "paid"]);
export const PinRole = z.enum(["staff", "admin"]);

// Columns a staff token is allowed to SELECT on emission.jobs (financials omitted
// by the DB column grants — selecting `*` as staff would be rejected).
export const JOB_STAFF_COLUMNS = [
  "id", "job_no", "date_received", "customer_name", "phone", "address", "email", "brand", "model",
  "serial_no", "complaint", "accessories", "remarks", "status", "technician_id", "defect_found",
  "date_delivered", "promised_date", "customer_signature_path", "technician_signature_path", "is_historical",
  "created_at", "updated_at",
].join(",");

// Staff-visible warranty_claims columns (money columns omitted).
export const CLAIM_STAFF_COLUMNS = [
  "id", "job_id", "claim_status", "date_filed", "yamaha_ref_no", "rejection_reason",
].join(",");

// Intake validation. Required to create: customer_name, phone, model, and (for
// warranty jobs) serial_no — the serial rule is enforced in the intake screen.
export const JobIntake = z.object({
  date_received: z.string().optional(),
  promised_date: z.string().nullable().optional(),
  customer_name: z.string().min(1, "Customer name required"),
  phone: z.string().min(7, "Phone required"),
  model: z.string().min(1, "Model required"),
  serial_no: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal("")),
  complaint: z.string().nullable().optional(),
  accessories: z.string().nullable().optional(),
  remarks: z.string().nullable().optional(),
  technician_id: z.string().uuid().nullable().optional(),
  status: JobStatus.optional(),
  is_historical: z.boolean().optional(),
});

// Multi-brand electronics catalogue (owner-only). purchase_rate is INR EXW
// (cost to Emission) and may be null for not-yet-priced models. The selling
// figure "EXW Aeros" is derived at +10% (null when there's no cost yet).
export const YAMAHA_MARKUP = 0.10; // kept name for back-compat
export const CATALOGUE_MARKUP = YAMAHA_MARKUP;
export function exwAeros(purchaseRate) {
  if (purchaseRate == null || purchaseRate === "" || isNaN(Number(purchaseRate))) return null;
  return Math.round(Number(purchaseRate) * (1 + CATALOGUE_MARKUP));
}

// Cross-brand product types offered in the catalogue.
export const PRODUCT_TYPES = [
  "Keyboard", "Arranger Keyboard", "Workstation Keyboard", "Synthesizer", "Digital Piano", "Stage Piano",
  "Acoustic Guitar", "Electric Guitar", "Bass Guitar", "Guitar Amplifier", "Guitar Effects",
  "Electronic Drums", "Acoustic Drums", "Percussion",
  "DJ Controller", "DJ System", "Media Player", "DJ Mixer", "Turntable", "DJ Headphones",
  "PA Speaker", "Portable PA", "Party Speaker", "Portable Speaker", "Column Speaker", "Subwoofer",
  "Studio Monitor", "Audio Interface", "Analog Mixer", "Digital Mixer", "MIDI Controller",
  "Dynamic Mic", "Condenser Mic", "Wireless Mic", "USB Mic", "Shotgun Mic", "IEM",
  "Headphones", "Earbuds", "AV Receiver", "Integrated Amplifier", "Power Amplifier", "Soundbar",
  "CD Player", "Network Player", "Recorder", "Accessory", "Other",
];

export const ProductDraft = z.object({
  brand: z.string().min(1, "Brand required"),
  vendor: z.string().nullable().optional(),
  product_type: z.string().nullable().optional(),
  category: z.string().min(1, "Category required"),
  sub_category: z.string().nullable().optional(),
  model_name: z.string().min(1, "Model name required"),
  purchase_rate: z.coerce.number().nonnegative("Rate must be ≥ 0").nullable().optional(),
  mrp: z.coerce.number().nonnegative().nullable().optional(),
  availability: z.string().nullable().optional(),
  remark: z.string().nullable().optional(),
  sort_order: z.coerce.number().int().optional(),
  active: z.boolean().optional(),
});

export const VendorDraft = z.object({
  name: z.string().min(1, "Vendor name required"),
  vendor_type: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  contact_person: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  gst_no: z.string().nullable().optional(),
  payment_terms: z.string().nullable().optional(),
  lead_time_days: z.coerce.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

export const LineItemDraft = z.object({
  item_type: ItemType,
  part_no: z.string().nullable().optional(),
  description: z.string().min(1, "Description required"),
  qty: z.coerce.number().positive().default(1),
  amount: z.coerce.number().nullable().optional(),
});
