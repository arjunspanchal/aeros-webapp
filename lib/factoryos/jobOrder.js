// Vendor Job Order (print spec) — the sheet a printing vendor actually works
// from. Sits 1:1 on a FactoryOS job so the client / brand / SKU / qty /
// vendor / due date are never re-keyed; this layer only adds the things a
// press needs and a purchase order doesn't: substrate, colours + Pantones,
// varnish & finishing, plates, tolerances and packing instruction.
//
// Two processes, two field sets. Flexo (web/reel — deckle, repeat, anilox,
// wind direction) and Offset (sheet-fed — sheet size, grain, ups, plates).
// The shared block applies to both; the UI and the printed order show only
// the block matching `process`.
//
// Lifecycle: draft -> issued. A vendor only ever sees `issued`. Editing an
// issued spec bumps `rev`, which invalidates any earlier vendor
// acknowledgement (vendor_ack_rev) so a vendor can't be assumed to have
// accepted a spec that changed underneath them.

import { dbSelect, dbInsert, dbUpdate, dbDelete, findOne, publicId } from "@/lib/db/supabase";
import { num, int, str, dateOnly } from "@/lib/db/shapes";

import { VALID, processFromPrintingType } from "./jobOrderConstants.js";

export * from "./jobOrderConstants.js";

// Enum guard. The DB check constraints only cover process/status, so it
// lives here. Blank -> null (an explicit clear); an unrecognised value ->
// undefined, so the column is left untouched instead of being wiped.
function enumVal(col, v) {
  const s = str(v);
  if (s === null) return null;
  return VALID[col]?.has(s) ? s : undefined;
}

const SELECT = "*";

// Job public id (recXXX or uuid) -> jobs.id uuid. Spec + colour rows FK to
// the uuid, mirroring listJobArtworks in repo.js.
async function jobPgId(jobPublicId) {
  const row = await findOne("jobs", jobPublicId, "id");
  return row?.id || null;
}

// ---------- normalisers ----------

function normColour(r) {
  return {
    id: r.id,
    seq: r.seq ?? 1,
    colourType: r.colour_type || "spot",
    name: r.name || "",
    swatchHex: r.swatch_hex || null,
    side: r.side || null,
    deckNo: r.deck_no ?? null,
    coveragePct: r.coverage_pct ?? null,
    anilox: r.anilox || null,
    notes: r.notes || null,
  };
}

function normSpec(r) {
  if (!r) return null;
  return {
    id: r.id,
    jobId: r.job_id,
    process: r.process || "offset",
    status: r.status || "draft",
    rev: r.rev ?? 1,
    issuedAt: r.issued_at || null,
    issuedByEmail: r.issued_by_email || null,

    masterPaperId: r.master_paper_id || null,
    substrateName: r.substrate_name || "",
    substrateMill: r.substrate_mill || "",
    substrateGsm: r.substrate_gsm ?? null,
    substrateBf: r.substrate_bf ?? null,
    substrateForm: r.substrate_form || "",
    substrateCoating: r.substrate_coating || "",
    substrateNotes: r.substrate_notes || "",

    artworkRef: r.artwork_ref || "",
    artworkRev: r.artwork_rev || "",
    artworkApprovedDate: r.artwork_approved_date || null,
    dielineRef: r.dieline_ref || "",
    proofType: r.proof_type || "",
    proofDueDate: r.proof_due_date || null,
    colourTolerance: r.colour_tolerance || "",
    registrationToleranceMm: r.registration_tolerance_mm ?? null,

    printSide: r.print_side || "",
    totalColours: r.total_colours ?? null,
    platesStatus: r.plates_status || "",
    platesRef: r.plates_ref || "",
    plateOwner: r.plate_owner || "",
    plateChargeInr: r.plate_charge_inr ?? null,

    varnishRequired: r.varnish_required === true,
    varnishType: r.varnish_type || "",
    varnishCoverage: r.varnish_coverage || "",
    varnishNotes: r.varnish_notes || "",
    lamination: r.lamination || "",
    foiling: r.foiling || "",
    embossing: r.embossing || "",
    foodContact: r.food_contact !== false,

    flexoReelDeckleMm: r.flexo_reel_deckle_mm ?? null,
    flexoRepeatMm: r.flexo_repeat_mm ?? null,
    flexoNoOfDecks: r.flexo_no_of_decks ?? null,
    flexoColourOrder: r.flexo_colour_order || "",
    flexoAnilox: r.flexo_anilox || "",
    flexoPlateThicknessMm: r.flexo_plate_thickness_mm ?? null,
    flexoWindDirection: r.flexo_wind_direction || "",
    flexoCoreDiaMm: r.flexo_core_dia_mm ?? null,
    flexoReelOdMm: r.flexo_reel_od_mm ?? null,
    flexoSplicesAllowed: r.flexo_splices_allowed ?? null,
    flexoCoronaTreatment: r.flexo_corona_treatment || "",

    offsetSheetLengthMm: r.offset_sheet_length_mm ?? null,
    offsetSheetWidthMm: r.offset_sheet_width_mm ?? null,
    offsetGrain: r.offset_grain || "",
    offsetUpsPerSheet: r.offset_ups_per_sheet ?? null,
    offsetNoOfPlates: r.offset_no_of_plates ?? null,
    offsetSheetsRequired: r.offset_sheets_required ?? null,
    offsetMachine: r.offset_machine || "",
    offsetDieRef: r.offset_die_ref || "",
    offsetPunching: r.offset_punching || "",

    orderQty: r.order_qty ?? null,
    qtyUom: r.qty_uom || "pcs",
    oversAllowancePct: r.overs_allowance_pct ?? null,
    undersAllowancePct: r.unders_allowance_pct ?? null,
    wastageAllowancePct: r.wastage_allowance_pct ?? null,

    deliveryTo: r.delivery_to || "",
    deliveryAddress: r.delivery_address || "",
    deliveryDueDate: r.delivery_due_date || null,
    packingInstructions: r.packing_instructions || "",
    specialInstructions: r.special_instructions || "",

    vendorAckAt: r.vendor_ack_at || null,
    vendorAckBy: r.vendor_ack_by || null,
    vendorAckRev: r.vendor_ack_rev ?? null,

    createdAt: r.created_at || null,
    updatedAt: r.updated_at || null,
    // True when the vendor's acknowledgement predates the current revision —
    // the spec moved after they accepted it, so the ack no longer stands.
    ackStale: !!r.vendor_ack_at && (r.vendor_ack_rev ?? 0) !== (r.rev ?? 1),
  };
}

// camelCase form payload -> column patch. Unknown keys are ignored, so a
// client can't write `status`, `rev` or `vendor_ack_*` through the editor —
// those move only via issueJobOrder / ackJobOrder.
//
// Only keys PRESENT in the body are mapped. Coercers like str()/num() turn
// undefined into null, so without the `in` check a partial save would blank
// every column it didn't mention.
function toColumns(body = {}) {
  const b = body;
  const p = {};
  const set = (col, key, coerce) => {
    if (!Object.prototype.hasOwnProperty.call(b, key) || b[key] === undefined) return;
    const v = coerce(b[key]);
    if (v !== undefined) p[col] = v;
  };

  set("process", "process", (v) => enumVal("process", v) || undefined);

  set("substrate_name", "substrateName", str);
  set("substrate_mill", "substrateMill", str);
  set("substrate_gsm", "substrateGsm", num);
  set("substrate_bf", "substrateBf", num);
  set("substrate_form", "substrateForm", (v) => enumVal("substrate_form", v));
  set("substrate_coating", "substrateCoating", str);
  set("substrate_notes", "substrateNotes", str);

  set("artwork_ref", "artworkRef", str);
  set("artwork_rev", "artworkRev", str);
  set("artwork_approved_date", "artworkApprovedDate", dateOnly);
  set("dieline_ref", "dielineRef", str);
  set("proof_type", "proofType", (v) => enumVal("proof_type", v));
  set("proof_due_date", "proofDueDate", dateOnly);
  set("colour_tolerance", "colourTolerance", str);
  set("registration_tolerance_mm", "registrationToleranceMm", num);

  set("print_side", "printSide", (v) => enumVal("print_side", v));
  set("total_colours", "totalColours", int);
  set("plates_status", "platesStatus", (v) => enumVal("plates_status", v));
  set("plates_ref", "platesRef", str);
  set("plate_owner", "plateOwner", (v) => enumVal("plate_owner", v));
  set("plate_charge_inr", "plateChargeInr", num);

  set("varnish_required", "varnishRequired", (v) => v === true);
  set("varnish_type", "varnishType", (v) => enumVal("varnish_type", v));
  set("varnish_coverage", "varnishCoverage", (v) => enumVal("varnish_coverage", v));
  set("varnish_notes", "varnishNotes", str);
  set("lamination", "lamination", (v) => enumVal("lamination", v));
  set("foiling", "foiling", str);
  set("embossing", "embossing", str);
  set("food_contact", "foodContact", (v) => v === true);

  set("flexo_reel_deckle_mm", "flexoReelDeckleMm", num);
  set("flexo_repeat_mm", "flexoRepeatMm", num);
  set("flexo_no_of_decks", "flexoNoOfDecks", int);
  set("flexo_colour_order", "flexoColourOrder", str);
  set("flexo_anilox", "flexoAnilox", str);
  set("flexo_plate_thickness_mm", "flexoPlateThicknessMm", num);
  set("flexo_wind_direction", "flexoWindDirection", (v) => enumVal("flexo_wind_direction", v));
  set("flexo_core_dia_mm", "flexoCoreDiaMm", num);
  set("flexo_reel_od_mm", "flexoReelOdMm", num);
  set("flexo_splices_allowed", "flexoSplicesAllowed", int);
  set("flexo_corona_treatment", "flexoCoronaTreatment", str);

  set("offset_sheet_length_mm", "offsetSheetLengthMm", num);
  set("offset_sheet_width_mm", "offsetSheetWidthMm", num);
  set("offset_grain", "offsetGrain", (v) => enumVal("offset_grain", v));
  set("offset_ups_per_sheet", "offsetUpsPerSheet", int);
  set("offset_no_of_plates", "offsetNoOfPlates", int);
  set("offset_sheets_required", "offsetSheetsRequired", int);
  set("offset_machine", "offsetMachine", str);
  set("offset_die_ref", "offsetDieRef", str);
  set("offset_punching", "offsetPunching", (v) => enumVal("offset_punching", v));

  set("order_qty", "orderQty", num);
  set("qty_uom", "qtyUom", (v) => enumVal("qty_uom", v));
  set("overs_allowance_pct", "oversAllowancePct", num);
  set("unders_allowance_pct", "undersAllowancePct", num);
  set("wastage_allowance_pct", "wastageAllowancePct", num);

  set("delivery_to", "deliveryTo", str);
  set("delivery_address", "deliveryAddress", str);
  set("delivery_due_date", "deliveryDueDate", dateOnly);
  set("packing_instructions", "packingInstructions", str);
  set("special_instructions", "specialInstructions", str);

  return p;
}

// ---------- reads ----------

export async function getJobOrder(jobPublicId) {
  const pgId = await jobPgId(jobPublicId);
  if (!pgId) return { spec: null, colours: [] };
  const [specs, colours] = await Promise.all([
    dbSelect("job_print_specs", { select: SELECT, filter: { job_id: `eq.${pgId}` }, limit: 1 }),
    dbSelect("job_print_colours", { select: SELECT, filter: { job_id: `eq.${pgId}` }, order: "seq.asc" }),
  ]);
  const spec = normSpec(specs[0] || null);
  // The paper picker keys on the public id (recXXX for migrated rows, uuid
  // for new ones); translate the stored uuid back so the dropdown matches.
  if (spec?.masterPaperId) {
    const paper = await findOne("master_papers", spec.masterPaperId, "id,airtable_id").catch(() => null);
    spec.masterPaperId = paper ? publicId(paper) : null;
  }
  return { spec, colours: colours.map(normColour) };
}

// Bulk "does this job have an issued order?" lookup for list views, so the
// jobs table doesn't fire one query per row.
export async function issuedOrderJobIds(jobPgIds = []) {
  if (!jobPgIds.length) return new Set();
  const rows = await dbSelect("job_print_specs", {
    select: "job_id,status",
    filter: { job_id: `in.(${jobPgIds.join(",")})`, status: "eq.issued" },
  });
  return new Set(rows.map((r) => r.job_id));
}

// ---------- seeding ----------

// First open of the Job Order tab: pre-fill from the job so the operator is
// confirming a spec rather than typing one from scratch. Everything seeded
// here is editable — the seed is a starting point, not a lock.
function seedFromJob(job) {
  const isFlexo = processFromPrintingType(job?.printingType) === "flexo";
  return {
    process: isFlexo ? "flexo" : "offset",
    substrate_name: str(job?.paperType),
    substrate_mill: str(job?.rmSupplier),
    substrate_gsm: num(job?.gsm),
    // rm_size_mm on the job is a single dimension: the reel deckle for web
    // work, the sheet width for sheet-fed. Seed it into whichever field the
    // process actually uses rather than guessing a second dimension.
    flexo_reel_deckle_mm: isFlexo ? num(job?.rmSizeMm) : null,
    offset_sheet_width_mm: isFlexo ? null : num(job?.rmSizeMm),
    offset_sheets_required: isFlexo ? null : int(job?.rmQtySheets),
    substrate_form: isFlexo ? "reel" : "sheet",
    order_qty: num(job?.qty),
    qty_uom: "pcs",
    delivery_due_date: dateOnly(job?.printingDueDate),
    food_contact: true,
  };
}

// Idempotent: returns the existing spec if there is one, otherwise creates
// the seeded draft. Safe to call on every page load.
export async function ensureJobOrder(jobPublicId, job) {
  const pgId = await jobPgId(jobPublicId);
  if (!pgId) return { spec: null, colours: [] };
  const existing = await dbSelect("job_print_specs", {
    select: SELECT, filter: { job_id: `eq.${pgId}` }, limit: 1,
  });
  if (existing[0]) return getJobOrder(jobPublicId);
  // Repeat of a SKU at the same printer: plates are usually already there.
  const onFile = await findPlatesOnFile({ masterSku: job?.masterSku, printingVendorId: job?.printingVendorId }).catch(() => null);
  const plates = onFile ? { plates_status: "vendor_held", plates_ref: onFile.platesRef || null } : {};
  await dbInsert("job_print_specs", { job_id: pgId, ...seedFromJob(job), ...plates }, {
    onConflict: "job_id", returning: "minimal",
  });
  return getJobOrder(jobPublicId);
}

// ---------- writes ----------

export async function saveJobOrder(jobPublicId, body, { job } = {}) {
  const pgId = await jobPgId(jobPublicId);
  if (!pgId) return null;
  const patch = toColumns(body);
  // Paper picker sends a public id; the FK needs the uuid.
  if (body?.masterPaperId !== undefined) {
    const pid = str(body.masterPaperId);
    const paper = pid ? await findOne("master_papers", pid, "id").catch(() => null) : null;
    patch.master_paper_id = paper?.id || null;
  }

  const existing = await dbSelect("job_print_specs", {
    select: "id,status,rev", filter: { job_id: `eq.${pgId}` }, limit: 1,
  });
  if (!existing[0]) {
    await dbInsert("job_print_specs", { job_id: pgId, ...seedFromJob(job), ...patch }, {
      onConflict: "job_id", returning: "minimal",
    });
  } else {
    // Editing a spec the vendor has already been given is a revision, not a
    // silent edit: bump rev so the printed order and the portal both show
    // which version is current, and any prior ack reads as stale.
    const coloursChanged = Array.isArray(body?.colours);
    if (existing[0].status === "issued" && (Object.keys(patch).length || coloursChanged)) {
      patch.rev = (existing[0].rev ?? 1) + 1;
    }
    if (Object.keys(patch).length) {
      await dbUpdate("job_print_specs", "job_id", pgId, patch, { returning: "minimal" });
    }
  }

  if (Array.isArray(body?.colours)) await replaceColours(pgId, body.colours);
  return getJobOrder(jobPublicId);
}

// The colour list is small and always edited as a whole, so it is replaced
// rather than diffed — avoids per-row id plumbing through the form.
async function replaceColours(pgId, colours) {
  await dbDelete("job_print_colours", "job_id", pgId);
  const rows = colours
    .map((c, i) => ({
      job_id: pgId,
      seq: i + 1,
      colour_type: enumVal("colour_type", c.colourType) || "spot",
      name: str(c.name),
      swatch_hex: normHex(c.swatchHex),
      side: enumVal("side", c.side),
      deck_no: int(c.deckNo),
      coverage_pct: num(c.coveragePct),
      anilox: str(c.anilox),
      notes: str(c.notes),
    }))
    .filter((r) => r.name);
  if (rows.length) await dbInsert("job_print_colours", rows, { returning: "minimal" });
}

function normHex(v) {
  const s = str(v);
  if (!s) return null;
  const h = s.trim().replace(/^#/, "");
  return /^[0-9a-fA-F]{6}$/.test(h) ? `#${h.toLowerCase()}` : null;
}

// Release to the vendor. Also the re-issue path for a revised spec: the rev
// was already bumped on save, this just re-stamps who released it and when.
export async function issueJobOrder(jobPublicId, { email } = {}) {
  const pgId = await jobPgId(jobPublicId);
  if (!pgId) return null;
  await dbUpdate("job_print_specs", "job_id", pgId, {
    status: "issued",
    issued_at: new Date().toISOString(),
    issued_by_email: str(email),
  }, { returning: "minimal" });
  return getJobOrder(jobPublicId);
}

export async function unissueJobOrder(jobPublicId) {
  const pgId = await jobPgId(jobPublicId);
  if (!pgId) return null;
  await dbUpdate("job_print_specs", "job_id", pgId, {
    status: "draft", issued_at: null, issued_by_email: null,
  }, { returning: "minimal" });
  return getJobOrder(jobPublicId);
}

// Vendor accepts the spec they can currently see. Stamped against the rev in
// force at that moment, so a later edit visibly invalidates it.
export async function ackJobOrder(jobPublicId, { by } = {}) {
  const pgId = await jobPgId(jobPublicId);
  if (!pgId) return null;
  const rows = await dbSelect("job_print_specs", {
    select: "rev,status", filter: { job_id: `eq.${pgId}` }, limit: 1,
  });
  if (!rows[0] || rows[0].status !== "issued") return null;
  await dbUpdate("job_print_specs", "job_id", pgId, {
    vendor_ack_at: new Date().toISOString(),
    vendor_ack_by: str(by),
    vendor_ack_rev: rows[0].rev ?? 1,
  }, { returning: "minimal" });
  return getJobOrder(jobPublicId);
}

// ---------- derived ----------

// ---------- repeat / copy ----------

// Copy a job's print spec + colours onto a new job (repeat orders). The copy
// starts as a fresh draft: rev 1, not issued, no vendor acknowledgement.
export async function copyJobOrder(fromJobPublicId, toJobPublicId) {
  const [fromId, toId] = await Promise.all([jobPgId(fromJobPublicId), jobPgId(toJobPublicId)]);
  if (!fromId || !toId) return false;
  const [src] = await dbSelect("job_print_specs", { select: SELECT, filter: { job_id: `eq.${fromId}` }, limit: 1 });
  if (!src) return false;
  const { id, job_id, status, rev, issued_at, issued_by_email, vendor_ack_at, vendor_ack_by, vendor_ack_rev, created_at, updated_at, ...spec } = src;
  await dbInsert("job_print_specs", { ...spec, job_id: toId, status: "draft", rev: 1 }, { onConflict: "job_id", returning: "minimal" });
  const colours = await dbSelect("job_print_colours", { select: SELECT, filter: { job_id: `eq.${fromId}` }, order: "seq.asc" });
  if (colours.length) {
    await dbDelete("job_print_colours", "job_id", toId);
    await dbInsert("job_print_colours", colours.map(({ id: _i, job_id: _j, created_at: _c, ...c }) => ({ ...c, job_id: toId })), { returning: "minimal" });
  }
  return true;
}

// Plates for a repeat: the last job order for the same SKU at the same
// printer that recorded plates as held / existing. Lets a repeat default to
// "plates available with vendor — yes" with the set number carried over.
export async function findPlatesOnFile({ masterSku, printingVendorId }) {
  if (!masterSku || !printingVendorId) return null;
  const jobs = await dbSelect("jobs", {
    select: "id",
    filter: { master_sku: `eq.${masterSku}`, printing_vendor_id: `eq.${printingVendorId}` },
    order: "created_at.desc",
    limit: 50,
  });
  if (!jobs.length) return null;
  const specs = await dbSelect("job_print_specs", {
    select: "job_id,plates_status,plates_ref,updated_at",
    filter: { job_id: `in.(${jobs.map((j) => j.id).join(",")})`, plates_status: "in.(\"vendor_held\",\"existing\")" },
    order: "updated_at.desc",
    limit: 1,
  });
  return specs[0] ? { platesRef: specs[0].plates_ref || "" } : null;
}
