// Domain read/write helpers over Airtable. Normalizes records into UI-shaped objects
// and handles role-scoped access.

import {
  airtableList,
  airtableGet,
  airtableCreate,
  airtableUpdate,
  airtableDelete,
  airtableUploadAttachment,
  escapeFormula,
  TABLES,
} from "./airtable.js";
import { ROLES, STAGES } from "./constants.js";
// Punch-clock PIN auth talks to Supabase directly (not the Airtable shim) so
// the pin_hash never flows through the normalised employee object / the UI.
import { dbSelect, dbUpdate, idFilterCol } from "../db/supabase.js";
import { hashPin } from "./pin.js";

// ---------- Clients ----------

export async function listClients() {
  const rows = await airtableList(TABLES.clients(), { sort: [{ field: "Name" }] });
  return rows.map(normClient);
}

export async function getClient(id) {
  const row = await airtableGet(TABLES.clients(), id);
  return row ? normClient(row) : null;
}

export async function createClient(fields) {
  const row = await airtableCreate(TABLES.clients(), {
    Name: fields.name,
    Code: fields.code || "",
    "Contact Person": fields.contactPerson || "",
    "Contact Email": fields.contactEmail || "",
    "Contact Phone": fields.contactPhone || "",
    "Brand Manager": fields.brandManager || "",
    "Brand Manager Email": fields.brandManagerEmail || "",
    Created: new Date().toISOString(),
  });
  return normClient(row);
}

// Count jobs linked to a client (used for the delete-confirmation preview).
export async function countJobsForClient(clientId) {
  const rows = await airtableList(TABLES.jobs(), {
    filterByFormula: `FIND('${escapeFormula(clientId)}', ARRAYJOIN({Client}))`,
  });
  return rows.length;
}

// Cascade-delete a client and every Job + Job Status Update that references it.
// Returns counts so the caller can show confirmation.
export async function deleteClient(clientId) {
  const jobs = await airtableList(TABLES.jobs(), {
    filterByFormula: `FIND('${escapeFormula(clientId)}', ARRAYJOIN({Client}))`,
  });
  let deletedUpdates = 0;
  for (const job of jobs) {
    const updates = await airtableList(TABLES.updates(), {
      filterByFormula: `FIND('${escapeFormula(job.id)}', ARRAYJOIN({Job}))`,
    });
    for (const u of updates) {
      await airtableDelete(TABLES.updates(), u.id);
      deletedUpdates++;
    }
    await airtableDelete(TABLES.jobs(), job.id);
  }
  await airtableDelete(TABLES.clients(), clientId);
  return { deletedJobs: jobs.length, deletedUpdates };
}

export async function updateClient(id, fields) {
  const patch = {};
  if (fields.name !== undefined) patch.Name = fields.name;
  if (fields.code !== undefined) patch.Code = fields.code;
  if (fields.contactPerson !== undefined) patch["Contact Person"] = fields.contactPerson;
  if (fields.contactEmail !== undefined) patch["Contact Email"] = fields.contactEmail;
  if (fields.contactPhone !== undefined) patch["Contact Phone"] = fields.contactPhone;
  if (fields.brandManager !== undefined) patch["Brand Manager"] = fields.brandManager;
  if (fields.brandManagerEmail !== undefined) patch["Brand Manager Email"] = fields.brandManagerEmail;
  const row = await airtableUpdate(TABLES.clients(), id, patch);
  return normClient(row);
}

function normClient(row) {
  const f = row.fields || {};
  return {
    id: row.id,
    name: f.Name || "",
    code: f.Code || "",
    contactPerson: f["Contact Person"] || "",
    contactEmail: f["Contact Email"] || "",
    contactPhone: f["Contact Phone"] || "",
    brandManager: f["Brand Manager"] || "",
    brandManagerEmail: f["Brand Manager Email"] || "",
  };
}

// ---------- Users ----------

export async function listUsers() {
  const rows = await airtableList(TABLES.users(), { sort: [{ field: "Email" }] });
  return rows.map(normUser);
}

export async function findUserByEmail(email) {
  const rows = await airtableList(TABLES.users(), {
    filterByFormula: `LOWER({Email})='${escapeFormula(email.toLowerCase())}'`,
    maxRecords: 1,
  });
  return rows[0] ? normUser(rows[0]) : null;
}

export async function createUser(fields) {
  const row = await airtableCreate(TABLES.users(), {
    Email: fields.email,
    Name: fields.name || "",
    Role: fields.role,
    Client: fields.clientIds && fields.clientIds.length ? fields.clientIds : undefined,
    Active: fields.active !== false,
    Created: new Date().toISOString(),
  });
  return normUser(row);
}

export async function updateUser(id, fields) {
  const patch = {};
  if (fields.name !== undefined) patch.Name = fields.name;
  if (fields.role !== undefined) patch.Role = fields.role;
  if (fields.clientIds !== undefined) patch.Client = fields.clientIds && fields.clientIds.length ? fields.clientIds : undefined;
  if (fields.active !== undefined) patch.Active = fields.active;
  if (fields.designation !== undefined) patch.Designation = fields.designation;
  if (fields.phone !== undefined) patch.Phone = fields.phone;
  const row = await airtableUpdate(TABLES.users(), id, patch);
  return normUser(row);
}

export async function getUser(id) {
  const row = await airtableGet(TABLES.users(), id);
  return row ? normUser(row) : null;
}

export async function attachUserPhoto({ userId, contentType, filename, fileBase64 }) {
  return airtableUploadAttachment(userId, "Photo", { contentType, filename, fileBase64 });
}

function normUser(row) {
  const f = row.fields || {};
  const photos = Array.isArray(f.Photo) ? f.Photo : [];
  const photo = photos[0];
  return {
    id: row.id,
    email: (f.Email || "").toLowerCase(),
    name: f.Name || "",
    role: f.Role || ROLES.CUSTOMER,
    clientIds: Array.isArray(f.Client) ? f.Client : [],
    active: f.Active !== false,
    designation: f.Designation || "",
    phone: f.Phone || "",
    photoUrl: photo?.thumbnails?.small?.url || photo?.url || null,
    photoFullUrl: photo?.url || null,
  };
}

// ---------- Jobs ----------

export async function listJobsForSession(session) {
  const all = await airtableList(TABLES.jobs(), { sort: [{ field: "J#", direction: "desc" }] });
  const jobs = all.map(normJob);

  if (
    session.role === ROLES.ADMIN ||
    session.role === ROLES.FACTORY_MANAGER ||
    session.role === ROLES.FACTORY_EXECUTIVE
  ) {
    return jobs;
  }
  if (session.role === ROLES.ACCOUNT_MANAGER) {
    const myClients = new Set(session.clientIds || []);
    // AM sees jobs whose client is in their assigned list, OR where they're the customer manager.
    return jobs.filter(
      (j) =>
        j.clientIds.some((cid) => myClients.has(cid)) ||
        (j.customerManagerId && j.customerManagerId === session.userId),
    );
  }
  if (session.role === ROLES.CUSTOMER) {
    const myClients = new Set(session.clientIds || []);
    return jobs.filter((j) => j.clientIds.some((cid) => myClients.has(cid)));
  }
  return [];
}

export async function getJob(id) {
  const row = await airtableGet(TABLES.jobs(), id);
  return row ? normJob(row) : null;
}

export async function getJobByJNumber(jNumber) {
  const rows = await airtableList(TABLES.jobs(), {
    filterByFormula: `{J#}='${escapeFormula(jNumber)}'`,
    maxRecords: 1,
  });
  return rows[0] ? normJob(rows[0]) : null;
}

// Auto-numbering: J# = YYMM + 3-digit zero-padded sequence within the month.
// Picks the next available sequence for the current month, e.g. existing
// "2605001" → returns "2605002". Sequence overflows to 4+ digits naturally
// once a month crosses 999 jobs (highly unlikely).
//
// Resilient by design: any failure (DB hiccup, missing rows) falls back to
// `${YYMM}001`, so the form always has a usable default — the J# field stays
// admin-editable in case of a collision, the API rejects duplicates anyway.
export async function getNextJobNumber() {
  const d = new Date();
  const yymm = `${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, "0")}`;
  try {
    // STARTS_WITH on J# limits us to the current month; desc sort + maxRecords=1
    // gets the highest sequence for that prefix in a single round-trip.
    const rows = await airtableList(TABLES.jobs(), {
      filterByFormula: `LEFT({J#}, 4)='${yymm}'`,
      sort: [{ field: "J#", direction: "desc" }],
      maxRecords: 1,
    });
    const top = rows[0]?.fields?.["J#"];
    const seq = top ? parseInt(String(top).slice(4), 10) : 0;
    const next = Number.isFinite(seq) ? seq + 1 : 1;
    return `${yymm}${String(next).padStart(3, "0")}`;
  } catch (e) {
    console.error("getNextJobNumber failed; falling back to 001:", e);
    return `${yymm}001`;
  }
}

export async function createJob(fields) {
  const now = new Date().toISOString();
  const row = await airtableCreate(TABLES.jobs(), {
    ...shapeJobFields(fields),
    Created: now,
    "Last Updated": now,
  });
  return normJob(row);
}

export async function updateJob(id, fields) {
  const row = await airtableUpdate(TABLES.jobs(), id, {
    ...shapeJobFields(fields),
    "Last Updated": new Date().toISOString(),
  });
  return normJob(row);
}

// Count timeline rows linked to a job — used by the delete-confirmation
// preview so the caller can show "Delete this job and its N updates?".
export async function countUpdatesForJob(jobId) {
  const rows = await airtableList(TABLES.updates(), {
    filterByFormula: `FIND('${escapeFormula(jobId)}', ARRAYJOIN({Job}))`,
  });
  return rows.length;
}

// Cascade-delete a job and every Job Status Update that references it. Same
// shape as deleteClient(): returns the count of timeline rows removed so the
// API can echo it back to the UI.
//
// PG-level cascades handle `job_artworks` and `job_lr_files` rows (both have
// ON DELETE CASCADE on job_id, verified). The Supabase Storage objects in
// the `job-artworks` and `lr-files` buckets are NOT cascade-deleted — those
// live outside PG, so we have to clean them up explicitly before dropping
// the job row. Otherwise private customer artwork accumulates forever and
// stays reachable by any signed URL that was issued before deletion (audit
// finding C3).
//
// `inventory_movements.source_job_id` has ON DELETE SET NULL (audit finding
// C4 — added in the same migration as this fix). The j_number is also
// snapshotted into `inventory_movements.reference` by the push RPC, so the
// FG ledger keeps J# traceability even after the source job is gone.
export async function deleteJob(jobId) {
  // 1) Clean Supabase Storage objects first. Best-effort: if a storage delete
  //    fails partway through, we still want to drop the job row so callers
  //    can complete the delete. `deleteFromBucket` already swallows 404/400,
  //    so the typical failure modes are network blips or auth — log and
  //    keep going.
  await purgeJobStorageObjects(jobId).catch((e) => {
    console.error(`deleteJob: storage purge for ${jobId} failed, continuing:`, e?.message || e);
  });

  // 2) Delete timeline updates. (Same shape as before — predates the PG-FK
  //    refactor; left explicit so its count can be returned to the UI.)
  const updates = await airtableList(TABLES.updates(), {
    filterByFormula: `FIND('${escapeFormula(jobId)}', ARRAYJOIN({Job}))`,
  });
  for (const u of updates) {
    await airtableDelete(TABLES.updates(), u.id);
  }

  // 3) Drop the job row. PG cascades clean up `job_artworks` and
  //    `job_lr_files` row entries automatically.
  await airtableDelete(TABLES.jobs(), jobId);
  return { deletedUpdates: updates.length };
}

// Helper: enumerate storage paths for a job in both `job-artworks` and
// `lr-files` buckets, then best-effort delete each. Exported indirectly via
// deleteJob; tests can call it directly if needed.
async function purgeJobStorageObjects(jobId) {
  const [artworks, lrFiles] = await Promise.all([
    dbSelect("job_artworks", {
      select: "storage_path",
      filter: { job_id: `eq.${jobId}` },
    }).catch(() => []),
    dbSelect("job_lr_files", {
      select: "storage_path",
      filter: { job_id: `eq.${jobId}` },
    }).catch(() => []),
  ]);
  const removals = [
    ...artworks.map((r) => deleteFromBucket("job-artworks", r.storage_path).catch(() => null)),
    ...lrFiles.map((r) => deleteFromBucket("lr-files", r.storage_path).catch(() => null)),
  ];
  if (removals.length) await Promise.all(removals);
}

function shapeJobFields(f) {
  const out = {};
  if (f.jNumber !== undefined) out["J#"] = f.jNumber;
  if (f.clientId !== undefined) out.Client = f.clientId ? [f.clientId] : [];
  if (f.brand !== undefined) out.Brand = f.brand;
  if (f.masterSku !== undefined) out["Master SKU"] = f.masterSku;
  if (f.masterProductName !== undefined) out["Master Product Name"] = f.masterProductName;
  if (f.customerManagerId !== undefined) out["Customer Manager"] = f.customerManagerId ? [f.customerManagerId] : [];
  if (f.category !== undefined) out.Category = f.category;
  if (f.item !== undefined) out.Item = f.item;
  if (f.itemSize !== undefined) out["Item Size"] = f.itemSize;
  if (f.city !== undefined) out.City = f.city;
  if (f.qty !== undefined) out.Qty = f.qty;
  if (f.orderDate !== undefined) out["Order Date"] = f.orderDate;
  if (f.expectedDispatchDate !== undefined) out["Expected Dispatch Date"] = f.expectedDispatchDate;
  if (f.estimatedDeliveryDate !== undefined) out["Estimated Delivery Date"] = f.estimatedDeliveryDate;
  if (f.stage !== undefined) out.Stage = f.stage;
  if (f.internalStatus !== undefined) out["Internal Status"] = f.internalStatus;
  if (f.poNumber !== undefined) out["PO Number"] = f.poNumber;
  if (f.rmType !== undefined) out["RM Type"] = f.rmType;
  if (f.rmSupplier !== undefined) out["RM Supplier"] = f.rmSupplier;
  if (f.paperType !== undefined) out["Paper Type"] = f.paperType;
  if (f.gsm !== undefined) out.GSM = f.gsm;
  if (f.rmSizeMm !== undefined) out["RM Size (mm)"] = f.rmSizeMm;
  if (f.rmQtySheets !== undefined) out["RM Qty (Sheets)"] = f.rmQtySheets;
  if (f.rmQtyKgs !== undefined) out["RM Qty (kgs)"] = f.rmQtyKgs;
  if (f.rmDeliveryDate !== undefined) out["RM Delivery Date"] = f.rmDeliveryDate;
  if (f.printingType !== undefined) out["Printing Type"] = f.printingType;
  if (f.printingVendor !== undefined) out["Printing Vendor"] = f.printingVendor;
  if (f.printingDueDate !== undefined) out["Printing Due Date"] = f.printingDueDate;
  if (f.productionDueDate !== undefined) out["Production Due Date"] = f.productionDueDate;
  if (f.actionPoints !== undefined) out["Action Points"] = f.actionPoints;
  if (f.notes !== undefined) out.Notes = f.notes;
  if (f.urgent !== undefined) out.Urgent = !!f.urgent;
  if (f.transportMode !== undefined) out["Transport Mode"] = f.transportMode;
  if (f.lrOrVehicleNumber !== undefined) out["LR / Vehicle Number"] = f.lrOrVehicleNumber;
  if (f.driverContact !== undefined) out["Driver Contact"] = f.driverContact;
  return out;
}

function normJob(row) {
  const f = row.fields || {};
  return {
    id: row.id,
    jNumber: f["J#"] || "",
    clientIds: Array.isArray(f.Client) ? f.Client : [],
    brand: f.Brand || "",
    masterSku: f["Master SKU"] || "",
    masterProductName: f["Master Product Name"] || "",
    customerManagerId: Array.isArray(f["Customer Manager"]) ? f["Customer Manager"][0] : undefined,
    category: f.Category || "",
    item: f.Item || "",
    itemSize: f["Item Size"] || "",
    city: f.City || "",
    qty: typeof f.Qty === "number" ? f.Qty : null,
    orderDate: f["Order Date"] || null,
    expectedDispatchDate: f["Expected Dispatch Date"] || null,
    estimatedDeliveryDate: f["Estimated Delivery Date"] || null,
    stage: f.Stage || STAGES[0],
    internalStatus: f["Internal Status"] || "",
    poNumber: f["PO Number"] || "",
    rmType: f["RM Type"] || "",
    rmSupplier: f["RM Supplier"] || "",
    paperType: f["Paper Type"] || "",
    gsm: typeof f.GSM === "number" ? f.GSM : null,
    rmSizeMm: typeof f["RM Size (mm)"] === "number" ? f["RM Size (mm)"] : null,
    rmQtySheets: typeof f["RM Qty (Sheets)"] === "number" ? f["RM Qty (Sheets)"] : null,
    rmQtyKgs: typeof f["RM Qty (kgs)"] === "number" ? f["RM Qty (kgs)"] : null,
    rmDeliveryDate: f["RM Delivery Date"] || null,
    printingType: f["Printing Type"] || "",
    printingVendor: f["Printing Vendor"] || "",
    printingDueDate: f["Printing Due Date"] || null,
    productionDueDate: f["Production Due Date"] || null,
    actionPoints: f["Action Points"] || "",
    notes: f.Notes || "",
    urgent: f.Urgent === true,
    transportMode: f["Transport Mode"] || "",
    lrOrVehicleNumber: f["LR / Vehicle Number"] || "",
    driverContact: f["Driver Contact"] || "",
    lrFiles: Array.isArray(f["LR Files"]) ? f["LR Files"].map((a) => ({
      id: a.id, url: a.url, filename: a.filename, size: a.size, type: a.type,
    })) : [],
    lastUpdated: f["Last Updated"] || null,
  };
}

export async function attachJobLrFile({ jobId, contentType, filename, fileBase64 }) {
  return airtableUploadAttachment(jobId, "LR Files", { contentType, filename, fileBase64 });
}

// ---------- Status Updates ----------

export async function listJobUpdates(jobId) {
  const rows = await airtableList(TABLES.updates(), {
    filterByFormula: `FIND('${escapeFormula(jobId)}', ARRAYJOIN({Job}))`,
    sort: [{ field: "Created", direction: "desc" }],
  });
  return rows.map(normUpdate);
}

export async function addJobUpdate({ jobId, stage, note, updatedByEmail, updatedByName }) {
  const now = new Date();
  const summary = `${stage} · ${now.toISOString().slice(0, 16).replace("T", " ")}${updatedByName ? ` · ${updatedByName}` : ""}`;
  const row = await airtableCreate(TABLES.updates(), {
    Summary: summary,
    Job: [jobId],
    Stage: stage,
    Note: note || "",
    "Updated By Email": updatedByEmail || "",
    "Updated By Name": updatedByName || "",
    Created: now.toISOString(),
  });
  return normUpdate(row);
}

function normUpdate(row) {
  const f = row.fields || {};
  return {
    id: row.id,
    jobId: Array.isArray(f.Job) ? f.Job[0] : undefined,
    stage: f.Stage || "",
    note: f.Note || "",
    updatedByEmail: f["Updated By Email"] || "",
    updatedByName: f["Updated By Name"] || "",
    createdAt: f.Created || null,
  };
}

// ---------- Customer POs ----------

export async function listCustomerPOs({ clientIds } = {}) {
  const rows = await airtableList(TABLES.customerPOs(), {
    sort: [{ field: "Created", direction: "desc" }],
  });
  const all = rows.map(normCustomerPO);
  if (!clientIds) return all;
  const allow = new Set(clientIds);
  return all.filter((po) => po.clientIds.some((c) => allow.has(c)));
}

export async function createCustomerPO({ poNumber, clientId, uploadedByEmail, notes }) {
  const row = await airtableCreate(TABLES.customerPOs(), {
    "PO Number": poNumber,
    Client: clientId ? [clientId] : undefined,
    "Uploaded By": uploadedByEmail || "",
    Notes: notes || "",
    Created: new Date().toISOString(),
  });
  return normCustomerPO(row);
}

export async function attachPoFile({ recordId, contentType, filename, fileBase64 }) {
  return airtableUploadAttachment(recordId, "File", { contentType, filename, fileBase64 });
}

// ---------- Raw Materials ----------

export async function listRawMaterials({ activeOnly = false } = {}) {
  const rows = await airtableList(TABLES.rawMaterials(), { sort: [{ field: "Name" }] });
  const all = rows.map(normRawMaterial);
  return activeOnly ? all.filter((rm) => rm.active) : all;
}

export async function getRawMaterial(id) {
  const row = await airtableGet(TABLES.rawMaterials(), id);
  return row ? normRawMaterial(row) : null;
}

export async function createRawMaterial(fields) {
  const now = new Date().toISOString();
  const row = await airtableCreate(TABLES.rawMaterials(), {
    ...shapeRawMaterialFields(fields),
    Active: fields.active !== false,
    Created: now,
    "Last Updated": now,
  });
  return normRawMaterial(row);
}

export async function updateRawMaterial(id, fields) {
  const row = await airtableUpdate(TABLES.rawMaterials(), id, {
    ...shapeRawMaterialFields(fields),
    "Last Updated": new Date().toISOString(),
  });
  return normRawMaterial(row);
}

export async function deleteRawMaterial(id) {
  await airtableDelete(TABLES.rawMaterials(), id);
  return { ok: true };
}

// ---------- RM Receipts (invoice-driven stock receiving) ----------

export async function findRmByMasterName(masterName) {
  if (!masterName) return null;
  const rows = await airtableList(TABLES.rawMaterials(), {
    filterByFormula: `{Master RM}='${escapeFormula(masterName)}'`,
    maxRecords: 1,
  });
  return rows[0] ? normRawMaterial(rows[0]) : null;
}

// Record a full supplier invoice: creates one RM Receipt row per line and
// upserts the stock level on the matching Raw Materials row (creates the RM
// row if this master spec hasn't been stocked before).
export async function recordRmReceipt({
  invoiceNumber,
  invoiceDate,
  supplier,
  notes,
  createdByEmail,
  lines, // [{ masterPaperId, masterPaperName, paperType, gsm, bf, sizeMm, lengthMm, form, coating, qtyRolls, qtyKgs }]
}) {
  const created = [];
  const now = new Date().toISOString();

  for (const line of lines || []) {
    const qtyRolls = Number.isFinite(line.qtyRolls) ? line.qtyRolls : 0;
    const qtyKgs = Number.isFinite(line.qtyKgs) ? line.qtyKgs : 0;
    if (qtyRolls <= 0 && qtyKgs <= 0) continue; // skip empty lines

    // Find or create the stock line for this master paper.
    let stockLine = line.masterPaperName ? await findRmByMasterName(line.masterPaperName) : null;
    if (stockLine) {
      await updateRawMaterial(stockLine.id, {
        qtyRolls: (stockLine.qtyRolls || 0) + qtyRolls,
        qtyKgs: Number(((stockLine.qtyKgs || 0) + qtyKgs).toFixed(2)),
        status: "In Stock",
      });
    } else {
      stockLine = await createRawMaterial({
        masterRmName: line.masterPaperName || "",
        paperType: line.paperType || "",
        gsm: line.gsm,
        bf: line.bf,
        sizeMm: line.sizeMm,
        lengthMm: line.lengthMm,
        form: line.form || "Rolls",
        // Mill-applied coating (e.g. "Mill PE 1-side" for ITC IndoBev) — stamped by
        // the receipt UI from the master's Mill Coating field. Skipped by the PE
        // coating send-out page because it filters `!r.coating`.
        coating: line.coating || "",
        supplier: supplier || "",
        qtyRolls,
        qtyKgs,
        status: "In Stock",
        active: true,
      });
    }

    const summary = `${invoiceNumber || "(no inv)"} · ${line.masterPaperName || "(no spec)"} · ${qtyRolls || 0} rolls · ${qtyKgs || 0} kgs`;
    const row = await airtableCreate(TABLES.rmReceipts(), {
      Summary: summary,
      "Invoice Number": invoiceNumber || "",
      "Invoice Date": invoiceDate || null,
      Supplier: supplier || "",
      "Master Paper Name": line.masterPaperName || "",
      "Master Paper ID": line.masterPaperId || "",
      "Qty (Rolls)": qtyRolls || null,
      "Qty (kgs)": qtyKgs || null,
      "Stock Line": stockLine ? [stockLine.id] : undefined,
      Notes: notes || "",
      "Created By Email": createdByEmail || "",
      Created: now,
    });
    created.push(normRmReceipt(row));
  }
  return created;
}

export async function listRmReceipts({ limit = 200 } = {}) {
  const rows = await airtableList(TABLES.rmReceipts(), {
    sort: [{ field: "Created", direction: "desc" }],
    maxRecords: limit,
  });
  return rows.map(normRmReceipt);
}

function normRmReceipt(row) {
  const f = row.fields || {};
  return {
    id: row.id,
    invoiceNumber: f["Invoice Number"] || "",
    invoiceDate: f["Invoice Date"] || null,
    supplier: f.Supplier || "",
    masterPaperName: f["Master Paper Name"] || "",
    masterPaperId: f["Master Paper ID"] || "",
    qtyRolls: typeof f["Qty (Rolls)"] === "number" ? f["Qty (Rolls)"] : null,
    qtyKgs: typeof f["Qty (kgs)"] === "number" ? f["Qty (kgs)"] : null,
    stockLineId: Array.isArray(f["Stock Line"]) ? f["Stock Line"][0] : null,
    notes: f.Notes || "",
    createdByEmail: f["Created By Email"] || "",
    createdAt: f.Created || null,
  };
}

// Auto-generate a human-readable label when `name` is not explicitly set.
function computeRmName(f) {
  // Dimension blurb: for rolls we use width only; for sheets/reams we use LxW.
  let dim = null;
  const hasWidth = f.sizeMm != null && f.sizeMm !== "";
  const hasLength = f.lengthMm != null && f.lengthMm !== "";
  if (f.form === "Rolls" && hasWidth) dim = `${f.sizeMm}mm`;
  else if (hasLength && hasWidth) dim = `${f.lengthMm}×${f.sizeMm}mm`;
  else if (hasWidth) dim = `${f.sizeMm}mm`;

  const bits = [
    f.supplier,
    f.paperType,
    f.gsm != null ? `${f.gsm} GSM` : null,
    f.bf != null ? `${f.bf} BF` : null,
    dim,
    f.form,
  ].filter(Boolean);
  return bits.join(" · ");
}

function shapeRawMaterialFields(f) {
  const out = {};
  if (f.name !== undefined) out.Name = f.name;
  else {
    // Auto-generate Name whenever enough fields are provided.
    const label = computeRmName(f);
    if (label) out.Name = label;
  }
  if (f.paperType !== undefined) out["Paper Type"] = f.paperType;
  if (f.gsm !== undefined) out.GSM = f.gsm;
  if (f.bf !== undefined) out.BF = f.bf;
  // `sizeMm` is the roll width / sheet short-edge. Column was renamed to `Width (mm)`
  // on the Airtable side; we keep the `sizeMm` prop name for code-level back-compat.
  if (f.sizeMm !== undefined) out["Width (mm)"] = f.sizeMm;
  if (f.lengthMm !== undefined) out["Length (mm)"] = f.lengthMm;
  if (f.form !== undefined) out.Form = f.form;
  if (f.supplier !== undefined) {
    out.Supplier = f.supplier;
    // Keep Mill (legacy column) in sync so nothing is orphaned.
    out.Mill = f.supplier;
  }
  if (f.baseRate !== undefined) out["Base Rate (INR/kg)"] = f.baseRate;
  if (f.discount !== undefined) out["Discount (INR/kg)"] = f.discount;
  if (f.transport !== undefined) out["Transport (INR/kg)"] = f.transport;
  if (f.wetStrengthExtra !== undefined) out["Wet Strength Extra (INR/kg)"] = f.wetStrengthExtra;
  if (f.notes !== undefined) out.Notes = f.notes;
  if (f.active !== undefined) out.Active = f.active;
  // Stock fields
  if (f.qtyRolls !== undefined) out["Qty (Rolls)"] = f.qtyRolls;
  if (f.qtyKgs !== undefined) out["Qty (kgs)"] = f.qtyKgs;
  if (f.coating !== undefined) out.Coating = f.coating;
  if (f.location !== undefined) out.Location = f.location;
  if (f.status !== undefined) out.Status = f.status;
  // Free-text pointer to the Paper RM Database master (stores `Material Name`).
  // Airtable links can't cross bases, so we keep it as text.
  if (f.masterRmName !== undefined) out["Master RM"] = f.masterRmName;
  return out;
}

function normRawMaterial(row) {
  const f = row.fields || {};
  return {
    id: row.id,
    name: f.Name || "",
    paperType: f["Paper Type"] || "",
    gsm: typeof f.GSM === "number" ? f.GSM : null,
    bf: typeof f.BF === "number" ? f.BF : null,
    // Old column was `Size (mm)`; Airtable has been renamed to `Width (mm)`.
    // Read both for back-compat with any legacy rows.
    sizeMm: typeof f["Width (mm)"] === "number"
      ? f["Width (mm)"]
      : typeof f["Size (mm)"] === "number" ? f["Size (mm)"] : null,
    lengthMm: typeof f["Length (mm)"] === "number" ? f["Length (mm)"] : null,
    form: f.Form || "",
    supplier: f.Supplier || f.Mill || "",
    baseRate: typeof f["Base Rate (INR/kg)"] === "number" ? f["Base Rate (INR/kg)"] : null,
    discount: typeof f["Discount (INR/kg)"] === "number" ? f["Discount (INR/kg)"] : null,
    transport: typeof f["Transport (INR/kg)"] === "number" ? f["Transport (INR/kg)"] : null,
    wetStrengthExtra: typeof f["Wet Strength Extra (INR/kg)"] === "number" ? f["Wet Strength Extra (INR/kg)"] : null,
    effectiveRate: typeof f["Effective Rate (INR/kg)"] === "number" ? f["Effective Rate (INR/kg)"] : null,
    notes: f.Notes || "",
    active: f.Active !== false,
    // Stock levels
    qtyRolls: typeof f["Qty (Rolls)"] === "number" ? f["Qty (Rolls)"] : null,
    qtyKgs: typeof f["Qty (kgs)"] === "number" ? f["Qty (kgs)"] : null,
    coating: f.Coating || "",
    location: f.Location || "",
    status: f.Status || "",
    masterRmName: f["Master RM"] || "",
    lastUpdated: f["Last Updated"] || null,
  };
}

function normCustomerPO(row) {
  const f = row.fields || {};
  const files = Array.isArray(f.File) ? f.File : [];
  const first = files[0];
  return {
    id: row.id,
    poNumber: f["PO Number"] || "",
    clientIds: Array.isArray(f.Client) ? f.Client : [],
    uploadedByEmail: f["Uploaded By"] || "",
    notes: f.Notes || "",
    createdAt: f.Created || null,
    fileUrl: first?.url || null,
    fileName: first?.filename || null,
    fileSize: first?.size || null,
    fileType: first?.type || null,
  };
}

// ---------- Machines ----------
// Factory machines. A machine consumes RM (kgs) and produces finished units (pcs).
// Production Runs + RM Consumption ledgers are layered on top of this in a later step.

export async function listMachines() {
  const rows = await airtableList(TABLES.machines(), { sort: [{ field: "Name" }] });
  return rows.map(normMachine);
}

export async function getMachine(id) {
  const row = await airtableGet(TABLES.machines(), id);
  return row ? normMachine(row) : null;
}

export async function createMachine(fields) {
  const row = await airtableCreate(TABLES.machines(), {
    Name: fields.name,
    Type: fields.type || "other",
    Status: fields.status || "active",
    Location: fields.location || "",
    Notes: fields.notes || "",
    Active: fields.active !== false,
    Created: new Date().toISOString(),
  });
  return normMachine(row);
}

export async function updateMachine(id, fields) {
  const patch = {};
  if (fields.name !== undefined) patch.Name = fields.name;
  if (fields.type !== undefined) patch.Type = fields.type;
  if (fields.status !== undefined) patch.Status = fields.status;
  if (fields.location !== undefined) patch.Location = fields.location;
  if (fields.notes !== undefined) patch.Notes = fields.notes;
  if (fields.active !== undefined) patch.Active = !!fields.active;
  const row = await airtableUpdate(TABLES.machines(), id, patch);
  return normMachine(row);
}

export async function deleteMachine(id) {
  // No production runs yet — once that table exists, block delete if runs reference this machine.
  await airtableDelete(TABLES.machines(), id);
  return { ok: true };
}

function normMachine(row) {
  const f = row.fields || {};
  return {
    id: row.id,
    name: f.Name || "",
    type: f.Type || "other",
    status: f.Status || "active",
    location: f.Location || "",
    notes: f.Notes || "",
    active: f.Active !== false,
    createdAt: f.Created || null,
  };
}

// ---------- Production Runs ----------
// A run is one shift / batch on a machine. Consumption (kgs) logged against it in RM Consumption.
// Output is pcs (finished units). Rolls count on RM Inventory is intentionally not decremented
// on consumption — partial rolls are normal; operators reconcile roll count when a roll is
// fully finished (via a direct edit on the inventory row).

function generateRunId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `PR-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export async function listRuns({ machineId, status, limit } = {}) {
  const filters = [];
  if (machineId) filters.push(`FIND('${escapeFormula(machineId)}', ARRAYJOIN({Machine}))`);
  if (status) filters.push(`{Status}='${escapeFormula(status)}'`);
  const filterByFormula = filters.length ? `AND(${filters.join(",")})` : undefined;
  const rows = await airtableList(TABLES.productionRuns(), {
    filterByFormula,
    sort: [{ field: "Created", direction: "desc" }],
    maxRecords: limit,
  });
  return rows.map(normRun);
}

export async function getRun(id) {
  const row = await airtableGet(TABLES.productionRuns(), id);
  return row ? normRun(row) : null;
}

export async function createRun(fields) {
  const now = new Date().toISOString();
  const row = await airtableCreate(TABLES.productionRuns(), {
    "Run ID": fields.runId || generateRunId(),
    Machine: fields.machineId ? [fields.machineId] : undefined,
    Job: fields.jobId ? [fields.jobId] : undefined,
    Status: fields.status || "planned",
    "Start Time": fields.startTime || null,
    "End Time": fields.endTime || null,
    "Output (pcs)": Number.isFinite(fields.outputPcs) ? fields.outputPcs : null,
    "Waste (pcs)": Number.isFinite(fields.wastePcs) ? fields.wastePcs : null,
    "Operator Email": fields.operatorEmail || "",
    "Operator Name": fields.operatorName || "",
    Notes: fields.notes || "",
    Created: now,
  });
  return normRun(row);
}

export async function updateRun(id, fields) {
  const patch = {};
  if (fields.machineId !== undefined) patch.Machine = fields.machineId ? [fields.machineId] : [];
  if (fields.jobId !== undefined) patch.Job = fields.jobId ? [fields.jobId] : [];
  if (fields.status !== undefined) patch.Status = fields.status;
  if (fields.startTime !== undefined) patch["Start Time"] = fields.startTime || null;
  if (fields.endTime !== undefined) patch["End Time"] = fields.endTime || null;
  if (fields.outputPcs !== undefined) patch["Output (pcs)"] = fields.outputPcs;
  if (fields.wastePcs !== undefined) patch["Waste (pcs)"] = fields.wastePcs;
  if (fields.operatorEmail !== undefined) patch["Operator Email"] = fields.operatorEmail;
  if (fields.operatorName !== undefined) patch["Operator Name"] = fields.operatorName;
  if (fields.notes !== undefined) patch.Notes = fields.notes;
  const row = await airtableUpdate(TABLES.productionRuns(), id, patch);
  return normRun(row);
}

export async function deleteRun(id) {
  // Block delete if consumption exists — operator should cancel + reconcile first.
  const consumption = await airtableList(TABLES.rmConsumption(), {
    filterByFormula: `FIND('${escapeFormula(id)}', ARRAYJOIN({Run}))`,
    maxRecords: 1,
  });
  if (consumption.length > 0) {
    throw new Error("Cannot delete a run with consumption entries. Cancel the run instead.");
  }
  await airtableDelete(TABLES.productionRuns(), id);
  return { ok: true };
}

function normRun(row) {
  const f = row.fields || {};
  return {
    id: row.id,
    runId: f["Run ID"] || "",
    machineId: Array.isArray(f.Machine) && f.Machine[0] ? f.Machine[0] : null,
    jobId: Array.isArray(f.Job) && f.Job[0] ? f.Job[0] : null,
    status: f.Status || "planned",
    startTime: f["Start Time"] || null,
    endTime: f["End Time"] || null,
    outputPcs: typeof f["Output (pcs)"] === "number" ? f["Output (pcs)"] : null,
    wastePcs: typeof f["Waste (pcs)"] === "number" ? f["Waste (pcs)"] : null,
    operatorEmail: f["Operator Email"] || "",
    operatorName: f["Operator Name"] || "",
    notes: f.Notes || "",
    createdAt: f.Created || null,
  };
}

// ---------- RM Consumption (outflow ledger) ----------

export async function listConsumptionForRun(runId) {
  const rows = await airtableList(TABLES.rmConsumption(), {
    filterByFormula: `FIND('${escapeFormula(runId)}', ARRAYJOIN({Run}))`,
    sort: [{ field: "Created", direction: "desc" }],
  });
  return rows.map(normConsumption);
}

export async function listConsumption({ limit } = {}) {
  const rows = await airtableList(TABLES.rmConsumption(), {
    sort: [{ field: "Created", direction: "desc" }],
    maxRecords: limit,
  });
  return rows.map(normConsumption);
}

// Record one consumption line: decrement RM Inventory kgs, then write ledger row.
// Strict stock guard — refuses to go negative. Operator must fix the inventory row
// separately if the underlying count is wrong.
export async function recordConsumption({ runId, stockLineId, qtyKgs, operatorEmail, notes }) {
  const kgs = Number(qtyKgs);
  if (!Number.isFinite(kgs) || kgs <= 0) {
    throw new Error("Qty (kgs) must be a positive number");
  }
  if (!runId) throw new Error("Run is required");
  if (!stockLineId) throw new Error("Stock line is required");

  const run = await getRun(runId);
  if (!run) throw new Error("Run not found");
  const stockLine = await getRawMaterial(stockLineId);
  if (!stockLine) throw new Error("Stock line not found");

  const available = Number(stockLine.qtyKgs || 0);
  if (kgs > available + 0.001) {
    throw new Error(`Not enough stock. Available: ${available.toFixed(2)} kgs, requested: ${kgs.toFixed(2)} kgs`);
  }

  // Decrement first. If the ledger write below fails, stock is still correct (under-reports
  // consumption, not overstated). An over-consume bug is much worse than a lost ledger row.
  const newKgs = Number(Math.max(0, available - kgs).toFixed(2));
  await updateRawMaterial(stockLineId, { qtyKgs: newKgs });

  const paperLabel = stockLine.name || stockLine.masterRmName || stockLine.paperType || "RM";
  const summary = `${run.runId} · ${paperLabel} · ${kgs.toFixed(2)}kg`;

  const row = await airtableCreate(TABLES.rmConsumption(), {
    Summary: summary,
    Run: [runId],
    "Stock Line": [stockLineId],
    "Qty (kgs)": kgs,
    "Operator Email": operatorEmail || "",
    Notes: notes || "",
    Created: new Date().toISOString(),
  });
  return { consumption: normConsumption(row), newStockKgs: newKgs };
}

function normConsumption(row) {
  const f = row.fields || {};
  return {
    id: row.id,
    summary: f.Summary || "",
    runId: Array.isArray(f.Run) && f.Run[0] ? f.Run[0] : null,
    stockLineId: Array.isArray(f["Stock Line"]) && f["Stock Line"][0] ? f["Stock Line"][0] : null,
    qtyKgs: typeof f["Qty (kgs)"] === "number" ? f["Qty (kgs)"] : 0,
    operatorEmail: f["Operator Email"] || "",
    notes: f.Notes || "",
    createdAt: f.Created || null,
  };
}

// ---------- Employees (HR) ----------

export async function listEmployees({ activeOnly = false, managerUserId } = {}) {
  const rows = await airtableList(TABLES.employees(), { sort: [{ field: "Name" }] });
  let list = rows.map(normEmployee);
  if (activeOnly) list = list.filter((e) => e.active);
  if (managerUserId) list = list.filter((e) => e.managerId === managerUserId);
  return list;
}

export async function getEmployee(id) {
  const row = await airtableGet(TABLES.employees(), id);
  return row ? normEmployee(row) : null;
}

// Resolve the single ACTIVE employee whose phone matches `phone` (compared on
// the last-10-digits national number, since phones are entered in varied
// formats), returning the auth-relevant columns INCLUDING the PIN hash + lock
// state. Used by the punch-clock login. Queries Supabase directly (not the
// Airtable shim) so the pin_hash never flows through the normalised employee
// object that reaches the UI.
//   { auth }                     — exactly one active match (incl. pin fields)
//   { error: "not_found" }       — zero matches (or no/blank phone)
//   { error: "ambiguous", count} — two-plus active employees share the number
export async function getEmployeeAuthByPhone(phone) {
  const key = String(phone || "").replace(/\D/g, "").slice(-10);
  if (key.length < 10) return { error: "not_found" };
  const rows = await dbSelect("employees", {
    select: "id,airtable_id,name,phone,active,pin_hash,pin_fail_count,pin_locked_until",
    filter: { active: "eq.true" },
  });
  const matches = rows.filter(
    (r) => String(r.phone || "").replace(/\D/g, "").slice(-10) === key,
  );
  if (matches.length === 0) return { error: "not_found" };
  if (matches.length > 1) return { error: "ambiguous", count: matches.length };
  const r = matches[0];
  return {
    auth: {
      id: r.id, // pg uuid — for direct attempt-counter updates
      publicId: r.airtable_id || r.id, // what the session/repo use as employeeId
      name: r.name,
      phone: r.phone,
      pinHash: r.pin_hash || null,
      failCount: r.pin_fail_count || 0,
      lockedUntil: r.pin_locked_until || null,
    },
  };
}

// Set / reset a worker's punch-clock PIN. Hashes here; never stores plaintext.
// Accepts a public id (Airtable rec or pg uuid).
export async function setEmployeePin(publicId, pin) {
  const pin_hash = hashPin(pin);
  await dbUpdate(
    "employees",
    idFilterCol(publicId),
    publicId,
    { pin_hash, pin_fail_count: 0, pin_locked_until: null },
    { returning: "minimal" },
  );
  return { ok: true };
}

// Record a failed PIN attempt by pg uuid. Locks for `lockMinutes` once
// `maxFails` consecutive failures are reached, then the counter resets so the
// next window starts clean.
export async function recordPinFailure(pgId, { failCount, maxFails = 5, lockMinutes = 15 }) {
  const next = (failCount || 0) + 1;
  const patch =
    next >= maxFails
      ? { pin_fail_count: 0, pin_locked_until: new Date(Date.now() + lockMinutes * 60_000).toISOString() }
      : { pin_fail_count: next };
  await dbUpdate("employees", "id", pgId, patch, { returning: "minimal" });
  return { locked: next >= maxFails };
}

export async function resetPinAttempts(pgId) {
  await dbUpdate("employees", "id", pgId, { pin_fail_count: 0, pin_locked_until: null }, { returning: "minimal" });
}

export async function createEmployee(fields) {
  const row = await airtableCreate(TABLES.employees(), {
    ...shapeEmployeeFields(fields),
    Active: fields.active !== false,
    Created: new Date().toISOString(),
  });
  return normEmployee(row);
}

export async function updateEmployee(id, fields) {
  const row = await airtableUpdate(TABLES.employees(), id, shapeEmployeeFields(fields));
  return normEmployee(row);
}

// Soft-delete via Active=false to preserve historical attendance.
// Hard delete cascades attendance rows.
export async function deactivateEmployee(id) {
  const row = await airtableUpdate(TABLES.employees(), id, { Active: false });
  return normEmployee(row);
}

export async function deleteEmployee(id) {
  const records = await airtableList(TABLES.attendance(), {
    filterByFormula: `FIND('${escapeFormula(id)}', ARRAYJOIN({Employee}))`,
  });
  for (const r of records) await airtableDelete(TABLES.attendance(), r.id);
  await airtableDelete(TABLES.employees(), id);
  return { ok: true, deletedAttendance: records.length };
}

function shapeEmployeeFields(f) {
  const out = {};
  if (f.name !== undefined) out.Name = f.name;
  if (f.aadhar !== undefined) out.Aadhar = f.aadhar;
  if (f.phone !== undefined) out.Phone = f.phone;
  if (f.monthlySalary !== undefined) out["Monthly Salary"] = f.monthlySalary;
  if (f.joiningDate !== undefined) out["Joining Date"] = f.joiningDate || null;
  if (f.managerId !== undefined) out.Manager = f.managerId ? [f.managerId] : [];
  if (f.otEligible !== undefined) out["OT Eligible"] = !!f.otEligible;
  if (f.designation !== undefined) out.Designation = f.designation;
  if (f.notes !== undefined) out.Notes = f.notes;
  if (f.active !== undefined) out.Active = !!f.active;
  return out;
}

export async function attachEmployeeAadhar({ employeeId, contentType, filename, fileBase64 }) {
  return airtableUploadAttachment(employeeId, "Aadhar Photo", { contentType, filename, fileBase64 });
}

// Remove one attachment from Aadhar Photo. We have to PATCH the whole field
// with the trimmed list because Airtable's attachment field is replace-only.
export async function removeEmployeeAadharPhoto(employeeId, attachmentId) {
  const row = await airtableGet(TABLES.employees(), employeeId);
  if (!row) throw new Error("Employee not found");
  const remaining = (row.fields?.["Aadhar Photo"] || [])
    .filter((a) => a.id !== attachmentId)
    .map((a) => ({ id: a.id }));
  const updated = await airtableUpdate(TABLES.employees(), employeeId, {
    "Aadhar Photo": remaining.length ? remaining : null,
  });
  return normEmployee(updated);
}

function normEmployee(row) {
  const f = row.fields || {};
  const aadharAtts = Array.isArray(f["Aadhar Photo"]) ? f["Aadhar Photo"] : [];
  return {
    id: row.id,
    name: f.Name || "",
    aadhar: f.Aadhar || "",
    phone: f.Phone || "",
    monthlySalary: typeof f["Monthly Salary"] === "number" ? f["Monthly Salary"] : 0,
    joiningDate: f["Joining Date"] || null,
    managerId: Array.isArray(f.Manager) && f.Manager[0] ? f.Manager[0] : null,
    otEligible: f["OT Eligible"] === true,
    designation: f.Designation || "",
    notes: f.Notes || "",
    active: f.Active !== false,
    // Whether a punch-clock PIN is set (boolean only; the hash never reaches
    // the client). Drives the "PIN set" indicator in the HR admin.
    hasPin: f["Pin Set"] === true,
    createdAt: f.Created || null,
    aadharPhotos: aadharAtts.map((a) => ({
      id: a.id,
      url: a.url,
      thumbnailUrl: a.thumbnails?.small?.url || a.url,
      largeUrl: a.thumbnails?.large?.url || a.url,
      filename: a.filename,
      type: a.type,
      size: a.size,
    })),
  };
}

// ---------- Attendance ----------
// One row per (Employee, Date). Upsert on mark so managers can correct.

function ymd(date) {
  if (!date) return null;
  if (typeof date === "string") return date.slice(0, 10);
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// "HH:MM" → decimal hours since midnight. Null for missing/malformed.
function parseHm(t) {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h + mm / 60;
}

// OT = hours worked past shift-end clock time (e.g. past 19:00).
// If outTime is missing or <= shift end, OT is 0. Out times crossing midnight
// are not supported here — factory operates a single-day shift.
export function computeOtHours(_inTime, outTime, shiftEndHm = "19:00") {
  const end = parseHm(shiftEndHm);
  const out = parseHm(outTime);
  if (end == null || out == null) return 0;
  return Math.max(0, Number((out - end).toFixed(2)));
}

export async function listAttendance({ employeeId, from, to, managerUserId } = {}) {
  // Only push Employee filter server-side; date filtering in JS keeps the
  // formula simple and avoids IS_AFTER/IS_BEFORE inclusivity footguns.
  const filterByFormula = employeeId
    ? `FIND('${escapeFormula(employeeId)}', ARRAYJOIN({Employee}))`
    : undefined;
  const rows = await airtableList(TABLES.attendance(), {
    filterByFormula,
    sort: [{ field: "Date", direction: "desc" }],
  });
  let list = rows.map(normAttendance);
  if (from) list = list.filter((r) => r.date && r.date >= from);
  if (to) list = list.filter((r) => r.date && r.date <= to);
  if (managerUserId) list = list.filter((r) => r.markedByUserId === managerUserId);
  return list;
}

export async function findAttendance(employeeId, date) {
  const day = ymd(date);
  if (!employeeId || !day) return null;
  const rows = await airtableList(TABLES.attendance(), {
    filterByFormula: `AND(FIND('${escapeFormula(employeeId)}', ARRAYJOIN({Employee})), IS_SAME({Date}, '${escapeFormula(day)}', 'day'))`,
    maxRecords: 1,
  });
  return rows[0] ? normAttendance(rows[0]) : null;
}

export async function upsertAttendance({
  employeeId,
  date,
  status,
  inTime,
  outTime,
  otHours,
  markedByUserId,
  markedByEmail,
  markedByName,
  notes,
}) {
  const day = ymd(date);
  if (!employeeId) throw new Error("Employee required");
  if (!day) throw new Error("Date required");

  const base = {
    Employee: [employeeId],
    Date: day,
    Status: status,
    "In Time": inTime || "",
    "Out Time": outTime || "",
    "OT Hours": Number.isFinite(otHours) ? otHours : 0,
    "Marked By": markedByUserId ? [markedByUserId] : undefined,
    "Marked By Email": markedByEmail || "",
    "Marked By Name": markedByName || "",
    Notes: notes || "",
    "Last Updated": new Date().toISOString(),
  };

  const existing = await findAttendance(employeeId, day);
  if (existing) {
    const row = await airtableUpdate(TABLES.attendance(), existing.id, base);
    return normAttendance(row);
  }
  const row = await airtableCreate(TABLES.attendance(), { ...base, Created: new Date().toISOString() });
  return normAttendance(row);
}

export async function deleteAttendance(id) {
  await airtableDelete(TABLES.attendance(), id);
  return { ok: true };
}

function normAttendance(row) {
  const f = row.fields || {};
  return {
    id: row.id,
    employeeId: Array.isArray(f.Employee) && f.Employee[0] ? f.Employee[0] : null,
    date: f.Date ? String(f.Date).slice(0, 10) : null,
    status: f.Status || "A",
    inTime: f["In Time"] || "",
    outTime: f["Out Time"] || "",
    otHours: typeof f["OT Hours"] === "number" ? f["OT Hours"] : 0,
    markedByUserId: Array.isArray(f["Marked By"]) && f["Marked By"][0] ? f["Marked By"][0] : null,
    markedByEmail: f["Marked By Email"] || "",
    markedByName: f["Marked By Name"] || "",
    notes: f.Notes || "",
    createdAt: f.Created || null,
    lastUpdated: f["Last Updated"] || null,
  };
}

// ---------- Coating Jobs ----------

// Send-out flow:
//   1. Pick an uncoated source stock line + coater + coating type + qty (kgs).
//   2. Decrement the source row's Qty (kgs) immediately — treats the stock as "in
//      transit", so it's not double-counted while at the coater.
//   3. Create the Coating Jobs row with Status=Sent.
//
// Receive-back flow (receiveCoatingJob):
//   1. Entered: qty returned (post-coating weight, includes added PE) + PE rate.
//   2. Find or create a coated twin of the source row: same mill/GSM/paper type,
//      new Coating value (e.g. "SSP 18g" / "DSP").
//   3. Increment that coated row's Qty (kgs) by the returned weight.
//   4. Flip the job to Status=Received, stamp Return Date, link Result Stock Line.
//
// Cancel flow (cancelCoatingJob):
//   Restore the source row's Qty (kgs) by the Sent amount and flip Status=Cancelled.

export async function listCoatingJobs() {
  const rows = await airtableList(TABLES.coatingJobs(), {
    sort: [{ field: "Created", direction: "desc" }],
  });
  return rows.map(normCoatingJob);
}

export async function getCoatingJob(id) {
  const row = await airtableGet(TABLES.coatingJobs(), id);
  return row ? normCoatingJob(row) : null;
}

function generateCoatingJobId() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `CT-${yyyy}${mm}${dd}-${hh}${mi}`;
}

// Inventory `Coating` free-text tag we stamp on coated lots. Kept short because
// it shows up in dropdowns — e.g. "SSP 18g" rather than a whole sentence.
function coatingTag(coatingType) {
  if (coatingType === "SSP") return "SSP 18g";
  if (coatingType === "DSP") return "DSP";
  return coatingType || "";
}

// Find an existing coated inventory row that matches a source lot + coating type.
// Matching key = same Master RM + same Coating tag. Falls back to (GSM + supplier)
// if no Master RM is set on the source (shouldn't normally happen for cupstock).
async function findCoatedTwin(sourceRow, coatingType) {
  const tag = coatingTag(coatingType);
  const all = await airtableList(TABLES.rawMaterials(), {});
  const norm = all.map(normRawMaterial);
  return norm.find((r) => {
    if (r.id === sourceRow.id) return false;
    if ((r.coating || "") !== tag) return false;
    if (sourceRow.masterRmName && r.masterRmName === sourceRow.masterRmName) return true;
    if (!sourceRow.masterRmName && r.gsm === sourceRow.gsm && r.supplier === sourceRow.supplier && r.paperType === sourceRow.paperType) return true;
    return false;
  }) || null;
}

export async function createCoatingJob({
  sourceStockLineId,
  coater,
  coatingType,
  qtySent,
  sentDate,
  notes,
  createdByEmail,
}) {
  const kgs = Number(qtySent);
  if (!Number.isFinite(kgs) || kgs <= 0) throw new Error("Qty Sent must be a positive number");
  if (!sourceStockLineId) throw new Error("Source stock line is required");
  if (!coater) throw new Error("Coater is required");
  if (!coatingType) throw new Error("Coating type is required");

  const source = await getRawMaterial(sourceStockLineId);
  if (!source) throw new Error("Source stock line not found");

  const available = Number(source.qtyKgs || 0);
  if (kgs > available + 0.001) {
    throw new Error(`Not enough stock. Available: ${available.toFixed(2)} kgs, requested: ${kgs.toFixed(2)} kgs`);
  }

  // Decrement first. Same safety reasoning as RM consumption: under-reporting is
  // safer than double-counting.
  const newKgs = Number(Math.max(0, available - kgs).toFixed(2));
  await updateRawMaterial(sourceStockLineId, { qtyKgs: newKgs });

  const jobId = generateCoatingJobId();
  const row = await airtableCreate(TABLES.coatingJobs(), {
    "Job ID": jobId,
    Status: "Sent",
    Coater: coater,
    "Coating Type": coatingType,
    "Source Stock Line": [sourceStockLineId],
    "Qty Sent (kgs)": kgs,
    "Sent Date": sentDate || new Date().toISOString().slice(0, 10),
    Notes: notes || "",
    "Created By Email": createdByEmail || "",
    Created: new Date().toISOString(),
  });
  return { job: normCoatingJob(row), sourceNewKgs: newKgs };
}

export async function receiveCoatingJob({
  jobId,
  qtyReturned,
  peRate,
  returnDate,
  invoiceNumber,
  notes,
}) {
  const job = await getCoatingJob(jobId);
  if (!job) throw new Error("Coating job not found");
  if (job.status !== "Sent") throw new Error(`Cannot receive a job with status "${job.status}"`);

  const returned = Number(qtyReturned);
  if (!Number.isFinite(returned) || returned <= 0) throw new Error("Qty Returned must be a positive number");
  if (!job.sourceStockLineId) throw new Error("Job has no source stock line");

  const source = await getRawMaterial(job.sourceStockLineId);
  if (!source) throw new Error("Source stock line not found (deleted?)");

  // Find or create the coated twin.
  let coated = await findCoatedTwin(source, job.coatingType);
  if (coated) {
    const newKgs = Number(((coated.qtyKgs || 0) + returned).toFixed(2));
    await updateRawMaterial(coated.id, { qtyKgs: newKgs, status: "In Stock" });
  } else {
    const tag = coatingTag(job.coatingType);
    coated = await createRawMaterial({
      masterRmName: source.masterRmName || "",
      paperType: source.paperType || "Cupstock",
      gsm: source.gsm,
      bf: source.bf,
      sizeMm: source.sizeMm,
      lengthMm: source.lengthMm,
      form: source.form || "",
      supplier: source.supplier || "",
      coating: tag,
      qtyKgs: returned,
      status: "In Stock",
      active: true,
      // Auto-labels via computeRmName — supplier/type/GSM/...
    });
  }

  // Flip the job row.
  const patch = {
    Status: "Received",
    "Qty Returned (kgs)": returned,
    "Return Date": returnDate || new Date().toISOString().slice(0, 10),
    "Result Stock Line": [coated.id],
  };
  if (peRate !== undefined && peRate !== null && peRate !== "") {
    const rate = Number(peRate);
    if (Number.isFinite(rate)) patch["PE Rate (INR/kg)"] = rate;
  }
  if (invoiceNumber !== undefined) patch["Invoice Number"] = invoiceNumber || "";
  if (notes !== undefined) patch.Notes = notes;
  const row = await airtableUpdate(TABLES.coatingJobs(), jobId, patch);
  return { job: normCoatingJob(row), resultStockLineId: coated.id };
}

export async function cancelCoatingJob({ jobId, reason }) {
  const job = await getCoatingJob(jobId);
  if (!job) throw new Error("Coating job not found");
  if (job.status !== "Sent") throw new Error(`Cannot cancel a job with status "${job.status}"`);

  // Restore the source row's qty.
  if (job.sourceStockLineId) {
    const source = await getRawMaterial(job.sourceStockLineId);
    if (source) {
      const restored = Number(((source.qtyKgs || 0) + (job.qtySent || 0)).toFixed(2));
      await updateRawMaterial(job.sourceStockLineId, { qtyKgs: restored });
    }
  }

  const row = await airtableUpdate(TABLES.coatingJobs(), jobId, {
    Status: "Cancelled",
    Notes: [job.notes, reason].filter(Boolean).join("\n— Cancelled: "),
  });
  return { job: normCoatingJob(row) };
}

function normCoatingJob(row) {
  const f = row.fields || {};
  return {
    id: row.id,
    jobId: f["Job ID"] || "",
    status: f.Status || "Sent",
    coater: f.Coater || "",
    coatingType: f["Coating Type"] || "",
    sourceStockLineId: Array.isArray(f["Source Stock Line"]) && f["Source Stock Line"][0] ? f["Source Stock Line"][0] : null,
    resultStockLineId: Array.isArray(f["Result Stock Line"]) && f["Result Stock Line"][0] ? f["Result Stock Line"][0] : null,
    qtySent: typeof f["Qty Sent (kgs)"] === "number" ? f["Qty Sent (kgs)"] : 0,
    qtyReturned: typeof f["Qty Returned (kgs)"] === "number" ? f["Qty Returned (kgs)"] : null,
    sentDate: f["Sent Date"] || null,
    returnDate: f["Return Date"] || null,
    peRate: typeof f["PE Rate (INR/kg)"] === "number" ? f["PE Rate (INR/kg)"] : null,
    invoiceNumber: f["Invoice Number"] || "",
    notes: f.Notes || "",
    createdByEmail: f["Created By Email"] || "",
    createdAt: f.Created || null,
  };
}

// ---------- Vendors ----------
// Master vendor directory. Dropdowns across the app (printing vendor on New Job
// today; RM supplier / transport tomorrow) pull from here filtered by Type.
// Soft-delete via Active=false so historical jobs that reference a vendor don't
// break if we stop working with them.

export async function listVendors({ type, activeOnly = false } = {}) {
  const rows = await airtableList(TABLES.vendors(), { sort: [{ field: "Name" }] });
  let list = rows.map(normVendor);
  if (type) list = list.filter((v) => v.type === type);
  if (activeOnly) list = list.filter((v) => v.active);
  return list;
}

export async function getVendor(id) {
  const row = await airtableGet(TABLES.vendors(), id);
  return row ? normVendor(row) : null;
}

export async function createVendor(fields) {
  if (!fields.name || !String(fields.name).trim()) throw new Error("Vendor name is required");
  if (!fields.type) throw new Error("Vendor type is required");
  const row = await airtableCreate(TABLES.vendors(), {
    Name: String(fields.name).trim(),
    Type: fields.type,
    "Contact Person": fields.contactPerson || "",
    Phone: fields.phone || "",
    Email: fields.email || "",
    Active: fields.active !== false,
    Notes: fields.notes || "",
    Created: new Date().toISOString(),
  });
  return normVendor(row);
}

export async function updateVendor(id, fields) {
  const patch = {};
  if (fields.name !== undefined) patch.Name = fields.name;
  if (fields.type !== undefined) patch.Type = fields.type;
  if (fields.contactPerson !== undefined) patch["Contact Person"] = fields.contactPerson;
  if (fields.phone !== undefined) patch.Phone = fields.phone;
  if (fields.email !== undefined) patch.Email = fields.email;
  if (fields.active !== undefined) patch.Active = !!fields.active;
  if (fields.notes !== undefined) patch.Notes = fields.notes;
  const row = await airtableUpdate(TABLES.vendors(), id, patch);
  return normVendor(row);
}

export async function deleteVendor(id) {
  // Hard-delete — callers should prefer setting Active=false instead. We don't
  // cascade anything here: vendor linkage on Jobs is a plain text snapshot so
  // deletion won't orphan data.
  await airtableDelete(TABLES.vendors(), id);
  return { ok: true };
}

function normVendor(row) {
  const f = row.fields || {};
  return {
    id: row.id,
    name: f.Name || "",
    type: f.Type || "Other",
    contactPerson: f["Contact Person"] || "",
    phone: f.Phone || "",
    email: f.Email || "",
    active: f.Active !== false,
    notes: f.Notes || "",
    createdAt: f.Created || null,
  };
}
