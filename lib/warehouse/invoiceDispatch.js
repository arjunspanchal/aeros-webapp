// WarehouseOS — dispatch driven by Zoho invoices (18-Nov-2026).
//
// Arjun: "Dispatched = invoiced in Zoho". Every Zoho invoice dated from the
// go-live date is "to load" until the warehouse records it:
//   • loaded              — vehicle / LR / cartons; lines that came off the
//                           racks post one outward movement; if the invoice's
//                           SO has a FactoryOS job, a dispatch lot is added to
//                           that job too (same as the job's own Dispatch form).
//   • not_from_warehouse  — went direct from a vendor, service line, etc.
//
// Zoho items are matched to WarehouseOS items on first use and remembered in
// zoho_item_links. Zoho's own stock figures are not used (they run negative);
// WarehouseOS racks are the stock record. No rates or amounts anywhere.

import { dbSelect, dbInsert, dbUpdate, dbDelete } from "../db/supabase.js";
import { listInvoicesSince, getInvoiceById, zohoConfigured } from "../zoho/books.js";
import { postMovement, getMovement } from "./movements.js";
import { addDispatch } from "../factoryos/transitions.js";
import { TRANSPORT_MODES } from "../factoryos/steps.js";

// Invoices dated before this never show as "to load" — history isn't
// back-filled ("old data is no big deal", 18-Nov-2026).
export const INVOICE_GO_LIVE = "2026-11-18";
const EARLIEST_SINCE = "2026-11-01";

export { TRANSPORT_MODES };

// Zoho's "Mode of Transport" dropdown → the FactoryOS transport list.
export function mapTransport(zohoMode) {
  const m = String(zohoMode || "").trim().toLowerCase();
  if (!m) return "";
  if (m.includes("delhivery")) return "Delhivery";
  if (m.includes("tci")) return "TCI Express";
  if (m.includes("blue")) return "Bluedart";
  if (m.includes("pick") || m.includes("customer")) return "Customer pickup";
  if (m.includes("ftl") || m.includes("truck")) return "Full truck (FTL)";
  if (m.includes("porter") || m.includes("aeros") || m.includes("tempo") || m.includes("vehicle")) return "Direct Vehicle";
  return "Other";
}

export function clampSince(raw) {
  const s = /^\d{4}-\d{2}-\d{2}$/.test(String(raw || "")) ? String(raw) : INVOICE_GO_LIVE;
  return s < EARLIEST_SINCE ? EARLIEST_SINCE : s;
}

const quoteIn = (vals) => `in.(${vals.map((v) => `"${String(v).replace(/"/g, "")}"`).join(",")})`;

async function jobsBySo(soNumbers) {
  const nums = [...new Set(soNumbers.filter(Boolean).map((s) => s.toUpperCase()))];
  if (!nums.length) return new Map();
  const rows = await dbSelect("jobs", {
    select: "id,airtable_id,j_number,item,stage,qty,fg_qty,zoho_so_no",
    filter: { zoho_so_no: quoteIn(nums) },
    limit: 500,
  }).catch(() => []);
  const out = new Map();
  for (const r of rows) {
    out.set(String(r.zoho_so_no).toUpperCase(), {
      pgId: r.id,
      id: r.airtable_id || r.id,
      jNumber: r.j_number,
      item: r.item || "",
      stage: r.stage,
      qty: r.fg_qty != null ? Number(r.fg_qty) : r.qty,
    });
  }
  return out;
}

function shapeRecord(r) {
  return {
    id: r.id,
    zohoInvoiceId: r.zoho_invoice_id,
    invoiceNumber: r.invoice_number,
    invoiceDate: r.invoice_date,
    customer: r.customer || "",
    soNumber: r.so_number || "",
    status: r.status,
    dispatchedOn: r.dispatched_on,
    transportMode: r.transport_mode || "",
    lrOrVehicleNumber: r.lr_or_vehicle_number || "",
    cartons: r.cartons,
    reason: r.reason || "",
    note: r.note || "",
    movementId: r.movement_id,
    movementNo: r.inventory_movements?.movement_no || "",
    createdByEmail: r.created_by_email || "",
    createdAt: r.created_at,
  };
}

// The warehouse's list: invoices to load (from Zoho, live) and what was
// recorded recently.
export async function invoiceQueue({ since } = {}) {
  const from = clampSince(since);
  if (!zohoConfigured()) return { since: from, configured: false, pending: [], done: [], error: "Zoho is not connected yet" };
  let invoices = [];
  let error = "";
  try {
    invoices = await listInvoicesSince(from);
  } catch (e) {
    console.error("zoho invoice list failed:", e?.message || e);
    error = /scope|authori|permission|57/i.test(String(e?.message))
      ? "Zoho hasn't given WarehouseOS access to invoices yet (the connection needs the invoices scope)."
      : "Couldn't reach Zoho right now. Try again in a minute.";
  }
  const recorded = invoices.length
    ? await dbSelect("zoho_invoice_dispatches", {
        select: "zoho_invoice_id",
        filter: { zoho_invoice_id: quoteIn(invoices.map((i) => i.id)) },
        limit: 1000,
      })
    : [];
  const doneIds = new Set(recorded.map((r) => r.zoho_invoice_id));
  const pendingRaw = invoices.filter((i) => !doneIds.has(i.id));
  const jobs = await jobsBySo(pendingRaw.map((i) => i.soNumber));
  const today = new Date().toISOString().slice(0, 10);
  const pending = pendingRaw
    .map((i) => {
      const j = i.soNumber ? jobs.get(i.soNumber.toUpperCase()) : null;
      const waitingDays = i.date ? Math.max(0, Math.round((Date.parse(today) - Date.parse(i.date)) / 86400000)) : null;
      return { ...i, job: j ? { id: j.id, jNumber: j.jNumber, stage: j.stage } : null, waitingDays };
    })
    .sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.number || "").localeCompare(b.number || ""));

  const doneRows = await dbSelect("zoho_invoice_dispatches", {
    select: "*,inventory_movements(movement_no)",
    order: "created_at.desc",
    limit: 60,
  });
  return { since: from, configured: true, error, pending, done: doneRows.map(shapeRecord) };
}

// One invoice for the "Load" panel: lines, each with its remembered link and
// where that item sits on the racks; the job behind its SO; and the record if
// it was already handled.
export async function invoiceDetail(zohoInvoiceId) {
  const invoice = await getInvoiceById(zohoInvoiceId);
  if (!invoice) return null;
  const [recordRows, jobs] = await Promise.all([
    dbSelect("zoho_invoice_dispatches", {
      select: "*,inventory_movements(movement_no)",
      filter: { zoho_invoice_id: `eq.${invoice.id}` },
      limit: 1,
    }),
    jobsBySo([invoice.soNumber]),
  ]);
  const itemIds = [...new Set(invoice.lines.map((l) => l.itemId).filter(Boolean))];
  const links = itemIds.length
    ? await dbSelect("zoho_item_links", {
        select: "zoho_item_id,inventory_item_id,not_stock,inventory_items(id,sku,name,uom,case_pack)",
        filter: { zoho_item_id: quoteIn(itemIds) },
        limit: 500,
      })
    : [];
  const linkBy = new Map(links.map((l) => [l.zoho_item_id, l]));
  const invIds = links.map((l) => l.inventory_item_id).filter(Boolean);
  const stockRows = invIds.length
    ? await dbSelect("inventory_stock", {
        select: "item_id,location_id,qty,inventory_locations(code)",
        filter: { item_id: quoteIn(invIds), qty: "gt.0" },
        limit: 2000,
      })
    : [];
  const stockBy = new Map();
  for (const s of stockRows) {
    if (!stockBy.has(s.item_id)) stockBy.set(s.item_id, []);
    stockBy.get(s.item_id).push({ locationId: s.location_id, code: s.inventory_locations?.code || "", qty: Number(s.qty) || 0 });
  }
  for (const list of stockBy.values()) list.sort((a, b) => b.qty - a.qty);

  const lines = invoice.lines.map((l) => {
    const link = l.itemId ? linkBy.get(l.itemId) : null;
    const item = link?.inventory_items || null;
    return {
      ...l,
      link: link
        ? { notStock: !!link.not_stock, item: item ? { id: item.id, sku: item.sku, name: item.name, uom: item.uom, casePack: item.case_pack } : null }
        : null,
      stock: item ? stockBy.get(item.id) || [] : [],
    };
  });
  const j = invoice.soNumber ? jobs.get(invoice.soNumber.toUpperCase()) : null;
  return {
    invoice: { ...invoice, lines },
    suggestedTransport: mapTransport(invoice.transport),
    job: j ? { id: j.id, jNumber: j.jNumber, item: j.item, stage: j.stage, qty: j.qty, canDispatch: ["Ready for Dispatch", "Dispatched"].includes(j.stage) } : null,
    record: recordRows[0] ? shapeRecord(recordRows[0]) : null,
  };
}

const intOrNull = (v) => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Math.round(Number(String(v).replace(/,/g, "")));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

// Record an invoice as loaded or not-from-warehouse. Zoho is re-read here so
// quantities always come from the invoice, never from the browser.
export async function recordInvoice({ session, zohoInvoiceId, body = {} }) {
  const detail = await invoiceDetail(zohoInvoiceId);
  if (!detail) return { ok: false, status: 404, error: "Zoho has no such invoice" };
  const { invoice, job } = detail;
  if (detail.record) return { ok: false, status: 409, error: `${invoice.number} was already recorded by ${detail.record.createdByEmail || "someone"}.` };
  if (invoice.status === "void") return { ok: false, status: 409, error: `${invoice.number} is void in Zoho.` };

  const email = session?.email || null;
  const base = {
    zoho_invoice_id: invoice.id,
    invoice_number: invoice.number,
    invoice_date: invoice.date,
    customer: invoice.customer,
    zoho_customer_id: invoice.customerId,
    so_number: invoice.soNumber || null,
    note: String(body.note || "").trim() || null,
    created_by_email: email,
  };

  if (body.status === "not_from_warehouse") {
    const reason = String(body.reason || "").trim();
    if (!reason) return { ok: false, status: 422, error: "Say why this invoice didn't go from the warehouse." };
    const row = await dbInsert("zoho_invoice_dispatches", { ...base, status: "not_from_warehouse", reason });
    return { ok: true, status: 200, record: shapeRecord(row) };
  }
  if (body.status !== "loaded") return { ok: false, status: 400, error: "Unknown status" };

  // ----- loaded -----
  const missing = [];
  if (!body.dispatchedOn) missing.push("dispatch date");
  if (!TRANSPORT_MODES.includes(body.transportMode)) missing.push("transport");
  if (!String(body.lrOrVehicleNumber || "").trim()) missing.push("LR or vehicle number");
  const choices = new Map((Array.isArray(body.lines) ? body.lines : []).map((c) => [String(c.lineId), c]));
  const goods = invoice.lines.filter((l) => l.goods && l.qty > 0);
  const moveLines = [];
  const newLinks = [];
  for (const l of goods) {
    const c = choices.get(l.lineId) || {};
    const remembered = l.link;
    // What this Zoho item is: the user's pick, else what was remembered.
    const notStock = c.notStock === true || (!c.inventoryItemId && remembered?.notStock);
    const invItemId = notStock ? null : (c.inventoryItemId || remembered?.item?.id || null);
    if (!notStock && !invItemId) { missing.push(`which warehouse item "${l.name}" is`); continue; }
    if (l.itemId && (c.inventoryItemId || c.notStock === true)) {
      const changed = notStock ? !remembered?.notStock : remembered?.item?.id !== invItemId;
      if (!remembered || changed) {
        newLinks.push({
          zoho_item_id: l.itemId, zoho_name: l.name, zoho_sku: l.sku || null,
          inventory_item_id: invItemId, not_stock: !!notStock,
          linked_by_email: email, linked_at: new Date().toISOString(),
        });
      }
    }
    // A stock item off a rack; "fromLocationId: ''" means not off the racks this time.
    if (invItemId && c.fromLocationId) {
      moveLines.push({ item_id: invItemId, from_location_id: c.fromLocationId, qty: l.qty, remarks: `${invoice.number} · ${l.name}`.slice(0, 200) });
    }
  }
  const jobQty = job?.canDispatch ? intOrNull(body.jobQty) : null;
  if (job?.canDispatch && body.recordOnJob !== false && !(jobQty > 0)) missing.push(`quantity sent for job ${job.jNumber}`);
  if (missing.length) return { ok: false, status: 422, error: `Fill these first: ${missing.join(", ")}.` };

  // Insert first: the unique invoice id stops a double tap posting stock twice.
  let row;
  try {
    row = await dbInsert("zoho_invoice_dispatches", {
      ...base,
      status: "loaded",
      dispatched_on: String(body.dispatchedOn).slice(0, 10),
      transport_mode: body.transportMode,
      lr_or_vehicle_number: String(body.lrOrVehicleNumber).trim(),
      driver_contact: String(body.driverContact || "").trim() || null,
      eway_bill_no: String(body.ewayBillNo || "").trim() || null,
      cartons: intOrNull(body.cartons),
      job_id: job?.canDispatch && body.recordOnJob !== false ? (await jobPg(job.id)) : null,
    });
  } catch (e) {
    if (/duplicate|23505/.test(String(e?.message))) return { ok: false, status: 409, error: `${invoice.number} was just recorded by someone else.` };
    throw e;
  }

  if (newLinks.length) {
    await dbInsert("zoho_item_links", newLinks, { onConflict: "zoho_item_id", returning: "minimal" });
  }

  let movement = null;
  if (moveLines.length) {
    try {
      movement = await postMovement({
        type: "outward",
        reference_type: "customer",
        reference: invoice.number,
        movement_date: String(body.dispatchedOn).slice(0, 10),
        notes: `Zoho invoice ${invoice.number} · ${invoice.customer}${invoice.soNumber ? ` · ${invoice.soNumber}` : ""}`,
        source_job_id: row.job_id || null,
        lines: moveLines,
      }, email);
      await dbUpdate("zoho_invoice_dispatches", "id", row.id, { movement_id: movement.id }, { returning: "minimal" });
    } catch (e) {
      await dbDelete("zoho_invoice_dispatches", "id", row.id).catch(() => {});
      return { ok: false, status: 400, error: `Stock could not be taken out: ${e.message}` };
    }
  }

  const warnings = [];
  if (row.job_id) {
    const res = await addDispatch({
      session,
      jobId: job.id,
      body: {
        dispatchedOn: body.dispatchedOn,
        qty: jobQty,
        cartons: body.cartons,
        transportMode: body.transportMode,
        lrOrVehicleNumber: body.lrOrVehicleNumber,
        driverContact: body.driverContact,
        zohoInvoiceNo: invoice.number,
        ewayBillNo: body.ewayBillNo,
        note: body.note,
        complete: body.jobComplete === true,
      },
    }).catch((e) => ({ ok: false, error: e.message }));
    if (!res.ok) warnings.push(`Loaded, but job ${job.jNumber} wasn't updated: ${res.error}. Record it on the job page.`);
  }
  return { ok: true, status: 200, movementNo: movement?.movement_no || null, warnings };
}

async function jobPg(publicId) {
  const rows = await dbSelect("jobs", {
    select: "id",
    filter: /^[0-9a-f-]{36}$/i.test(publicId) ? { id: `eq.${publicId}` } : { airtable_id: `eq.${publicId}` },
    limit: 1,
  });
  return rows[0]?.id || null;
}

// Admin undo: puts any stock back on the racks it came from and removes the
// record so the invoice shows as "to load" again. A dispatch lot already added
// to a job stays on the job (remove it there if it was wrong).
export async function undoInvoiceRecord({ session, recordId }) {
  const rows = await dbSelect("zoho_invoice_dispatches", { select: "*", filter: { id: `eq.${recordId}` }, limit: 1 });
  const r = rows[0];
  if (!r) return { ok: false, status: 404, error: "Record not found" };
  let reversal = null;
  if (r.movement_id) {
    const mv = await getMovement(r.movement_id);
    const lines = (mv?.lines || [])
      .filter((l) => l.from_location_id)
      .map((l) => ({ item_id: l.item_id, to_location_id: l.from_location_id, qty: Number(l.qty), remarks: `Undo ${r.invoice_number}` }));
    if (lines.length) {
      reversal = await postMovement({
        type: "inward",
        reference_type: "return",
        reference: r.invoice_number,
        notes: `Undo of ${mv.movement_no} (Zoho invoice ${r.invoice_number} recorded by mistake)`,
        lines,
      }, session?.email);
    }
  }
  await dbDelete("zoho_invoice_dispatches", "id", r.id);
  return { ok: true, status: 200, reversalNo: reversal?.movement_no || null, jobLotKept: !!r.job_id };
}
