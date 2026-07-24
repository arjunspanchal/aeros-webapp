"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { suggestVehicle, VEHICLE_FILL_FACTOR } from "@/lib/warehouse/vehicleCapacity";

// Keep the arithmetic identical to lib/warehouse/dispatchManifest.js so the
// live totals on screen match what the server stores and the PDF prints.
function parseDims(text) {
  if (!text) return null;
  const nums = String(text).match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 3) return null;
  const [l, w, h] = nums.slice(0, 3).map(Number);
  if (!(l > 0 && w > 0 && h > 0)) return null;
  return { l, w, h };
}
function cbmFromDims(text) {
  const d = parseDims(text);
  return d ? +((d.l * d.w * d.h) / 1e9).toFixed(5) : null;
}

const num = (v) => (v === "" || v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);

function fmt(n, dp = 2) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function fmtInt(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-IN");
}

let keySeq = 0;
const nextKey = () => `row${++keySeq}`;

// A saved DB line (or a picked box type) → the shape this form edits.
function toRow(l, invoiceKeyById = null) {
  return {
    key: nextKey(),
    // Lines reference their invoice by the form's local key, never the DB id —
    // saving replaces the invoice rows, so ids don't survive a round-trip.
    invoice_key: l.invoice_key ?? (invoiceKeyById && l.invoice_id ? invoiceKeyById.get(l.invoice_id) ?? null : null),
    master_product_id: l.master_product_id || null,
    sku: l.sku || "",
    description: l.description || "",
    box_count: l.box_count ?? "",
    kg_per_box: l.kg_per_box ?? "",
    carton_dims: l.carton_dims || "",
    cbm_per_box: l.cbm_per_box ?? null,
    units_per_case: l.units_per_case ?? null,
    spec_source: l.spec_source || "manual",
  };
}

function toInvoice(inv, fallbackCustomer = "") {
  return {
    key: nextKey(),
    invoice_no: inv?.invoice_no || "",
    eway_bill_no: inv?.eway_bill_no || "",
    client_id: inv?.client_id || "",
    customer_name: inv?.customer_name || fallbackCustomer,
    drop_city: inv?.drop_city || "",
  };
}

// Per-line derived figures. CBM prefers the dims (so an edited carton size
// immediately moves the total) and falls back to a stored CBM.
function lineMath(r) {
  const boxes = num(r.box_count) || 0;
  const kg = num(r.kg_per_box);
  const cbm = cbmFromDims(r.carton_dims) ?? num(r.cbm_per_box);
  return {
    boxes,
    cbm,
    kg,
    lineKg: kg != null ? +(boxes * kg).toFixed(2) : null,
    lineCbm: cbm != null ? +(boxes * cbm).toFixed(3) : null,
    linePcs: r.units_per_case != null ? boxes * Number(r.units_per_case) : null,
  };
}

const OTHER_CONSIGNEE = "__other__";

const SOURCE_LABEL = {
  master: "specs from master",
  derived: "weight derived from piece weight",
  manual: "specs entered by hand",
};

export default function ManifestClient({
  dispatchId,
  dispatch,
  boxTypes = [],
  initialLines = [],
  initialInvoices = [],
  clients = [],
  history = [],
  lastManifest = null,
}) {
  const router = useRouter();

  // Invoices and lines are seeded together: a saved line points at an invoice
  // by database id, which the form immediately translates into that invoice's
  // local key (ids don't survive a save, keys do).
  const [seed] = useState(() => {
    const invs = initialInvoices.map((i) => toInvoice(i, dispatch?.customer_name));
    const keyById = new Map(initialInvoices.map((i, idx) => [i.id, invs[idx].key]));
    return { invs, rows: initialLines.map((l) => toRow(l, keyById)) };
  });
  const [invoices, setInvoices] = useState(seed.invs);
  const [rows, setRows] = useState(seed.rows);
  const [saved, setSaved] = useState(() => serialise(seed.rows, seed.invs));
  const [syncDispatch, setSyncDispatch] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  // Add-row state
  const [pickId, setPickId] = useState("");
  const [pickBoxes, setPickBoxes] = useState("");

  const byId = useMemo(() => new Map(boxTypes.map((b) => [b.id, b])), [boxTypes]);
  const picked = pickId ? byId.get(pickId) : null;

  const dirty = useMemo(() => serialise(rows, invoices) !== saved, [rows, invoices, saved]);

  const totals = useMemo(() => {
    let boxes = 0, kg = 0, cbm = 0, pcs = 0, missingKg = 0, missingCbm = 0;
    for (const r of rows) {
      const m = lineMath(r);
      boxes += m.boxes;
      if (m.kg != null) kg += m.boxes * m.kg; else if (m.boxes) missingKg++;
      if (m.cbm != null) cbm += m.boxes * m.cbm; else if (m.boxes) missingCbm++;
      if (m.linePcs != null) pcs += m.linePcs;
    }
    return { boxes, kg: +kg.toFixed(2), cbm: +cbm.toFixed(3), pcs, missingKg, missingCbm };
  }, [rows]);

  // Per-invoice subtotals, keyed by invoice key — what the consignee checks
  // their own boxes against, and what the PDF prints under each section.
  const invoiceTotals = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      const k = r.invoice_key ?? "__none__";
      const cur = m.get(k) || { boxes: 0, kg: 0, cbm: 0, pcs: 0, lines: 0 };
      const mm = lineMath(r);
      cur.lines += 1;
      cur.boxes += mm.boxes;
      if (mm.kg != null) cur.kg += mm.boxes * mm.kg;
      if (mm.cbm != null) cur.cbm += mm.boxes * mm.cbm;
      if (mm.linePcs != null) cur.pcs += mm.linePcs;
      m.set(k, cur);
    }
    for (const v of m.values()) { v.kg = +v.kg.toFixed(2); v.cbm = +v.cbm.toFixed(3); }
    return m;
  }, [rows]);

  const consigneeCount = useMemo(
    () => new Set(invoices.map((i) => (i.customer_name || "").trim().toLowerCase()).filter(Boolean)).size,
    [invoices],
  );

  const unassignedCount = useMemo(
    () => rows.filter((r) => !r.invoice_key && (num(r.box_count) || 0) > 0).length,
    [rows],
  );

  // Vehicle recommendation off the live cube — the whole point of tallying CBM.
  const suggestion = useMemo(
    () => suggestVehicle(totals.cbm, totals.kg),
    [totals.cbm, totals.kg],
  );

  // Exactly one invoice → every new line belongs to it without asking. More
  // than one and the team has to say which, since that's the whole point.
  const soleInvoiceKey = invoices.length === 1 ? invoices[0].key : null;

  function addInvoice() {
    setError("");
    setInvoices((is) => [...is, toInvoice(null, dispatch?.customer_name)]);
  }
  function setInvoice(key, patch) {
    setInvoices((is) => is.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }
  function removeInvoice(key) {
    setInvoices((is) => is.filter((i) => i.key !== key));
    // Don't delete the boxes with the invoice — surface them as unassigned so
    // nothing silently disappears off the vehicle.
    setRows((rs) => rs.map((r) => (r.invoice_key === key ? { ...r, invoice_key: null } : r)));
  }
  // Consignee dropdown: picking a known client snapshots its name too.
  function setInvoiceClient(key, clientId) {
    const c = clients.find((x) => x.id === clientId);
    setInvoice(key, { client_id: clientId || "", customer_name: c?.name || "" });
  }

  function setRow(key, patch) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function removeRow(key) {
    setRows((rs) => rs.filter((r) => r.key !== key));
  }

  function addBoxType(boxType, boxCount) {
    setRows((rs) => {
      // Same product twice is almost always a miscount, not two rows — merge
      // the boxes into the existing line instead.
      const existing = rs.find((r) => r.master_product_id === boxType.id);
      if (existing) {
        return rs.map((r) =>
          r.key === existing.key
            ? { ...r, box_count: (num(r.box_count) || 0) + (num(boxCount) || 0) }
            : r,
        );
      }
      return [
        ...rs,
        toRow({
          invoice_key: soleInvoiceKey,
          master_product_id: boxType.id,
          sku: boxType.sku,
          description: boxType.name,
          box_count: boxCount,
          kg_per_box: boxType.kg_per_box,
          carton_dims: boxType.carton_dims,
          cbm_per_box: boxType.cbm_per_box,
          units_per_case: boxType.units_per_case,
          spec_source: boxType.spec_source,
        }),
      ];
    });
  }

  function addPicked() {
    setError("");
    if (!picked) return setError("Pick a box type from the product master first");
    const boxes = num(pickBoxes);
    if (boxes == null || boxes < 0) return setError("Enter how many boxes of this type are going");
    addBoxType(picked, boxes);
    setPickId("");
    setPickBoxes("");
  }

  // One click from the history strip: adds the item with last time's count for
  // this customer where we know it, else 0 for the team to fill in.
  function addFromHistory(h) {
    setError("");
    const bt = byId.get(h.master_product_id);
    if (!bt) return setError(`${h.description} is no longer in the product master`);
    addBoxType(bt, h.lastBoxCountForCustomer ?? 0);
  }

  function loadLastManifest() {
    if (!lastManifest) return;
    setError("");
    // Those lines were tagged to the PREVIOUS dispatch's invoices — drop the
    // link and let them fall to this vehicle's sole invoice, or be assigned.
    setRows(lastManifest.lines.map((l) => toRow({ ...l, invoice_id: null, invoice_key: soleInvoiceKey })));
    setNote(`Loaded the ${lastManifest.lines.length} line(s) from ${lastManifest.dispatch_no}. Adjust the counts and save.`);
  }

  function exportCsv() {
    const esc = (v) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const invLabel = (key) => {
      const inv = invoices.find((i) => i.key === key);
      return inv ? (inv.invoice_no || "(unnumbered)") : "Unassigned";
    };
    const head = ["Sr", "Invoice", "Consignee", "SKU", "Item", "Pcs/box", "Carton (mm)", "Boxes", "Total pcs", "Kg/box", "Total kg", "CBM/box", "Total CBM"];
    const body = rows.map((r, i) => {
      const m = lineMath(r);
      const inv = invoices.find((x) => x.key === r.invoice_key);
      return [i + 1, invLabel(r.invoice_key), inv?.customer_name ?? "", r.sku, r.description, r.units_per_case ?? "", r.carton_dims, m.boxes, m.linePcs ?? "", m.kg ?? "", m.lineKg ?? "", m.cbm ?? "", m.lineCbm ?? ""];
    });
    // Per-invoice subtotals, then the vehicle grand total.
    body.push([]);
    for (const inv of invoices) {
      const t = invoiceTotals.get(inv.key);
      if (t) body.push(["", invLabel(inv.key), inv.customer_name, "", "SUBTOTAL", "", "", t.boxes, t.pcs || "", "", t.kg, "", t.cbm]);
    }
    body.push(["", "", "", "", "VEHICLE TOTAL", "", "", totals.boxes, totals.pcs || "", "", totals.kg, "", totals.cbm]);
    const csv = [head, ...body].map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${dispatch?.dispatch_no || "manifest"}-manifest.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function save({ vehicleSize } = {}) {
    setBusy(true);
    setError("");
    setNote("");
    try {
      const payload = {
        syncDispatch,
        vehicle_size: vehicleSize || undefined,
        invoices: invoices.map((i) => ({
          key: i.key,
          invoice_no: i.invoice_no,
          eway_bill_no: i.eway_bill_no,
          client_id: i.client_id || null,
          customer_name: i.customer_name,
          drop_city: i.drop_city,
        })),
        lines: rows.map((r) => ({
          invoice_key: r.invoice_key,
          master_product_id: r.master_product_id,
          sku: r.sku,
          description: r.description,
          box_count: r.box_count,
          kg_per_box: r.kg_per_box,
          carton_dims: r.carton_dims,
          cbm_per_box: r.cbm_per_box,
          units_per_case: r.units_per_case,
          spec_source: r.spec_source,
        })),
      };
      const res = await fetch(`/api/warehouse/vehicle-dispatches/${dispatchId}/manifest`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to save manifest");
      const nextInvoices = (data.invoices || []).map((i) => toInvoice(i, dispatch?.customer_name));
      const keyById = new Map((data.invoices || []).map((i, idx) => [i.id, nextInvoices[idx].key]));
      const next = (data.lines || []).map((l) => toRow(l, keyById));
      setInvoices(nextInvoices);
      setRows(next);
      setSaved(serialise(next, nextInvoices));
      setNote(
        [
          "Manifest saved.",
          syncDispatch && next.length ? "Dispatch box count and weight updated to match." : "",
          vehicleSize ? `Vehicle set to ${vehicleSize}.` : "",
        ].filter(Boolean).join(" "),
      );
      router.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const cellInput =
    "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm tabular-nums text-right dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100";
  const miniInput =
    "w-full min-w-[110px] rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100";

  const usedIds = new Set(rows.map((r) => r.master_product_id));
  const historyStrip = history.filter((h) => !usedIds.has(h.master_product_id)).slice(0, 8);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Dispatch manifest</h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Add one row per box type and its count. Pcs per box, carton size and weight come from the
            product master — total weight, total CBM and the vehicle that fits are worked out here.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Export CSV
          </button>
          <a
            href={`/print/vehicle-dispatch/${dispatchId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Print manifest (PDF)
          </a>
        </div>
      </div>

      {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {note && (
        <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{note}</div>
      )}

      {/* Repeat the last run for this customer — the weekly-lane shortcut. */}
      {lastManifest && rows.length === 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200">
          <span>
            {dispatch?.customer_name} last went out on <strong>{lastManifest.dispatch_no}</strong> with{" "}
            {lastManifest.lines.length} box type(s).
          </span>
          <button
            type="button"
            onClick={loadLastManifest}
            className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-800"
          >
            Load that manifest
          </button>
        </div>
      )}

      {/* Invoices on this vehicle. One trip commonly carries three or four,
          and not always to the same consignee — each gets its own e-way bill
          because that's how they're issued. */}
      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
              Invoices on this vehicle
            </span>
            <span className="ml-2 text-[11px] text-gray-400">
              {invoices.length === 0
                ? "Add each invoice — the manifest prints a section and subtotal per invoice."
                : `${invoices.length} invoice${invoices.length > 1 ? "s" : ""}${
                    consigneeCount > 1 ? ` · ${consigneeCount} drops` : ""
                  }`}
            </span>
          </div>
          <button
            type="button"
            onClick={addInvoice}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            + Add invoice
          </button>
        </div>

        {invoices.length === 0 ? (
          <p className="py-2 text-sm text-gray-500 dark:text-gray-400">
            No invoices yet. Box types can still be added and will print as unassigned.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <th className="py-1 pr-2">Drop</th>
                  <th className="py-1 pr-2">Invoice no.</th>
                  <th className="py-1 pr-2">E-way bill</th>
                  <th className="py-1 pr-2">Consignee</th>
                  <th className="py-1 pr-2">Drop city</th>
                  <th className="py-1 pr-2 text-right">Boxes</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, i) => {
                  const sub = invoiceTotals.get(inv.key);
                  return (
                    <tr key={inv.key}>
                      <td className="py-1 pr-2 tabular-nums text-gray-500">{i + 1}</td>
                      <td className="py-1 pr-2">
                        <input
                          value={inv.invoice_no}
                          onChange={(e) => setInvoice(inv.key, { invoice_no: e.target.value })}
                          placeholder="INV-…"
                          className={miniInput}
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <input
                          value={inv.eway_bill_no}
                          onChange={(e) => setInvoice(inv.key, { eway_bill_no: e.target.value })}
                          placeholder="EWB no."
                          className={miniInput}
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <select
                          value={inv.client_id || OTHER_CONSIGNEE}
                          onChange={(e) =>
                            e.target.value === OTHER_CONSIGNEE
                              ? setInvoice(inv.key, { client_id: "" })
                              : setInvoiceClient(inv.key, e.target.value)
                          }
                          className={miniInput}
                        >
                          {clients.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                          <option value={OTHER_CONSIGNEE}>Other (type a name)…</option>
                        </select>
                        {!inv.client_id && (
                          <input
                            value={inv.customer_name}
                            onChange={(e) => setInvoice(inv.key, { customer_name: e.target.value })}
                            placeholder="Consignee name"
                            className={`${miniInput} mt-1`}
                          />
                        )}
                      </td>
                      <td className="py-1 pr-2">
                        <input
                          value={inv.drop_city}
                          onChange={(e) => setInvoice(inv.key, { drop_city: e.target.value })}
                          placeholder="optional"
                          className={miniInput}
                        />
                      </td>
                      <td className="py-1 pr-2 text-right tabular-nums text-gray-700 dark:text-gray-200">
                        {sub ? fmtInt(sub.boxes) : 0}
                      </td>
                      <td className="py-1 text-right">
                        <button
                          type="button"
                          onClick={() => removeInvoice(inv.key)}
                          className="text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add a box type */}
      <div className="mb-3 grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:grid-cols-[1fr_140px_auto] sm:items-end dark:border-gray-800 dark:bg-gray-950">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Box type (product master)
          </label>
          <BoxTypePicker boxTypes={boxTypes} history={history} value={pickId} onChange={setPickId} />
          {picked && (
            <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
              {picked.units_per_case ? `${fmtInt(picked.units_per_case)} pcs/box` : "pcs/box not on master"}
              {" · "}
              {picked.carton_dims ? `${picked.carton_dims} mm` : "carton size not on master"}
              {" · "}
              {picked.kg_per_box != null ? `${fmt(picked.kg_per_box)} kg/box` : "weight not on master"}
            </p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            No. of boxes
          </label>
          <input
            type="number" min="0" step="1"
            value={pickBoxes}
            onChange={(e) => setPickBoxes(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPicked(); } }}
            className={cellInput}
          />
        </div>
        <button
          type="button"
          onClick={addPicked}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
        >
          Add to manifest
        </button>
      </div>

      {/* Shipped-before shortcuts */}
      {historyStrip.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Shipped before
          </span>
          {historyStrip.map((h) => (
            <button
              key={h.master_product_id}
              type="button"
              onClick={() => addFromHistory(h)}
              title={`${h.sku} · used on ${h.times} manifest(s)`}
              className={`rounded-full border px-3 py-1 text-xs hover:bg-gray-100 dark:hover:bg-gray-800 ${
                h.forThisCustomer
                  ? "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200"
                  : "border-gray-200 bg-white text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300"
              }`}
            >
              + {h.description}
              {h.lastBoxCountForCustomer != null && (
                <span className="ml-1 opacity-70">({fmtInt(h.lastBoxCountForCustomer)})</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Lines */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-gray-900/60">
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2">Invoice</th>
              <th className="px-3 py-2 text-right">Boxes</th>
              <th className="px-3 py-2 text-right">Total pcs</th>
              <th className="px-3 py-2 text-right">Kg / box</th>
              <th className="px-3 py-2 text-right">Carton L × W × H (mm)</th>
              <th className="px-3 py-2 text-right">CBM / box</th>
              <th className="px-3 py-2 text-right">Total kg</th>
              <th className="px-3 py-2 text-right">Total CBM</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-sm dark:divide-gray-800">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-gray-500 dark:text-gray-400">
                  No box types on this manifest yet.
                </td>
              </tr>
            ) : rows.map((r, i) => {
              const m = lineMath(r);
              return (
                <tr key={r.key} className="align-top">
                  <td className="px-3 py-2 tabular-nums text-gray-500">{i + 1}</td>
                  <td className="px-3 py-2 min-w-[200px]">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{r.description}</div>
                    <div className="text-[11px] text-gray-400">
                      {r.sku || "—"}
                      {r.units_per_case ? ` · ${fmtInt(r.units_per_case)} pcs/box` : ""}
                      {` · ${SOURCE_LABEL[r.spec_source] || SOURCE_LABEL.manual}`}
                    </div>
                  </td>
                  <td className="px-3 py-2 w-[150px]">
                    {invoices.length === 0 ? (
                      <span className="text-[11px] text-gray-400">no invoices yet</span>
                    ) : (
                      <select
                        value={r.invoice_key || ""}
                        onChange={(e) => setRow(r.key, { invoice_key: e.target.value || null })}
                        className={`${miniInput} ${!r.invoice_key ? "border-amber-400" : ""}`}
                      >
                        <option value="">— Unassigned —</option>
                        {invoices.map((inv, n) => (
                          <option key={inv.key} value={inv.key}>
                            {inv.invoice_no || `Invoice ${n + 1}`}
                            {consigneeCount > 1 && inv.customer_name ? ` · ${inv.customer_name}` : ""}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-3 py-2 w-[90px]">
                    <input type="number" min="0" step="1" value={r.box_count}
                      onChange={(e) => setRow(r.key, { box_count: e.target.value })} className={cellInput} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-200">
                    {m.linePcs != null ? fmtInt(m.linePcs) : "—"}
                  </td>
                  <td className="px-3 py-2 w-[100px]">
                    <input type="number" min="0" step="0.001" value={r.kg_per_box}
                      onChange={(e) => setRow(r.key, { kg_per_box: e.target.value, spec_source: "manual" })}
                      className={cellInput} />
                  </td>
                  <td className="px-3 py-2 w-[150px]">
                    <input value={r.carton_dims} placeholder="640 x 400 x 570"
                      onChange={(e) => setRow(r.key, { carton_dims: e.target.value, spec_source: "manual" })}
                      className={`${cellInput} text-left`} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-200">
                    {m.cbm != null ? m.cbm.toFixed(4) : <span className="text-amber-600">missing</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-900 dark:text-gray-100">
                    {m.lineKg != null ? fmt(m.lineKg) : <span className="text-amber-600">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-900 dark:text-gray-100">
                    {m.lineCbm != null ? fmt(m.lineCbm, 3) : <span className="text-amber-600">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" onClick={() => removeRow(r.key)}
                      className="text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400">
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Shipment totals */}
      <div className="mt-4 grid grid-cols-2 gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:grid-cols-4 dark:border-gray-800 dark:bg-gray-950">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Total boxes</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-100">{fmtInt(totals.boxes)}</div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Total pieces</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-100">{totals.pcs ? fmtInt(totals.pcs) : "—"}</div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Total weight</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-100">{fmt(totals.kg)} kg</div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Total volume</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-100">{fmt(totals.cbm, 3)} CBM</div>
        </div>
      </div>

      {(totals.missingKg > 0 || totals.missingCbm > 0) && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          {totals.missingKg > 0 && `${totals.missingKg} line(s) have no weight per box. `}
          {totals.missingCbm > 0 && `${totals.missingCbm} line(s) have no carton size. `}
          The totals above exclude them — fill the blanks here, and fix the product master so the next
          manifest picks them up automatically.
        </p>
      )}

      {unassignedCount > 0 && invoices.length > 0 && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          {unassignedCount} box type(s) aren&apos;t tagged to an invoice — they still ship and still
          count towards the vehicle total, but they print in an &ldquo;unassigned&rdquo; section the
          consignee can&apos;t reconcile.
        </p>
      )}

      {/* Vehicle recommendation */}
      {suggestion && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          {suggestion.overflow ? (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              {fmt(totals.cbm, 2)} CBM / {fmt(totals.kg, 0)} kg is more than one{" "}
              <strong>{suggestion.biggest.name}</strong> ({suggestion.usableCbm} CBM usable,{" "}
              {fmtInt(suggestion.biggest.payload_kg)} kg payload) will take — plan for about{" "}
              <strong>{suggestion.trips} vehicles</strong>.
            </p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-gray-700 dark:text-gray-200">
                Suggested vehicle:{" "}
                <strong className="text-gray-900 dark:text-gray-100">{suggestion.vehicle.name}</strong>{" "}
                <span className="text-gray-500 dark:text-gray-400">
                  ({suggestion.vehicle.body} · ~{suggestion.usableCbm} CBM usable ·{" "}
                  {fmtInt(suggestion.vehicle.payload_kg)} kg payload)
                </span>
                <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  This load fills about {suggestion.utilisation}% of it.
                  {suggestion.nextUp && ` Next size up: ${suggestion.nextUp.name}.`}
                </div>
              </div>
              {dispatch?.vehicle_size !== suggestion.vehicle.name && (
                <button
                  type="button"
                  onClick={() => save({ vehicleSize: suggestion.vehicle.name })}
                  disabled={busy}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  Save &amp; set vehicle
                </button>
              )}
            </div>
          )}
          <p className="mt-2 text-[11px] text-gray-400">
            Body sizes are standard market figures at {Math.round(VEHICLE_FILL_FACTOR * 100)}% usable fill,
            not measured on our own hired fleet — confirm with the transporter before committing.
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
          <input type="checkbox" checked={syncDispatch} onChange={(e) => setSyncDispatch(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300" />
          Update this dispatch&apos;s box count &amp; weight from the manifest
        </label>
        <button
          type="button"
          onClick={() => save()}
          disabled={busy || !dirty}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800 disabled:opacity-40 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
        >
          {busy ? "Saving…" : dirty ? "Save manifest" : "Saved"}
        </button>
      </div>
    </section>
  );
}

// Keys are UI-only, but a line's invoice_key IS data (it's the link), so it
// stays in. Only the row's own identity key is stripped.
function serialise(rows, invoices = []) {
  return JSON.stringify({
    rows: rows.map(({ key, ...rest }) => rest),
    invoices: invoices.map(({ key, ...rest }) => rest),
  });
}

// Searchable box-type combobox over the product master. Name-first (that's how
// the floor talks about stock), with SKU and the carton spec on the second line
// so the picker itself shows whether the maths will work. Items this team has
// shipped before sit in their own group at the top — a 1,000-row master is
// unusable alphabetically, and the real answer is nearly always something
// that's gone out before.
function BoxTypePicker({ boxTypes, history = [], value, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);

  const selected = boxTypes.find((b) => b.id === value) || null;

  const historyRank = useMemo(() => {
    const m = new Map();
    history.forEach((h, i) => m.set(h.master_product_id, i));
    return m;
  }, [history]);

  const results = useMemo(() => {
    const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = tokens.length
      ? boxTypes.filter((b) => {
          const hay = `${b.name} ${b.sku} ${b.category || ""} ${b.sub_category || ""} ${b.size_volume || ""}`.toLowerCase();
          return tokens.every((t) => hay.includes(t));
        })
      : boxTypes;

    const seen = list.filter((b) => historyRank.has(b.id));
    const rest = list.filter((b) => !historyRank.has(b.id));
    seen.sort((a, b) => historyRank.get(a.id) - historyRank.get(b.id));
    // Products whose carton specs resolve float up — they're the ones that
    // make the manifest add up without hand-entry.
    rest.sort((a, b) => (b.complete === true) - (a.complete === true));

    return [
      ...seen.slice(0, 15).map((b) => ({ ...b, _group: "Shipped before" })),
      ...rest.slice(0, 60).map((b) => ({ ...b, _group: "Product master" })),
    ];
  }, [boxTypes, q, historyRank]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function choose(b) {
    onChange(b.id);
    setQ("");
    setOpen(false);
  }

  function onKeyDown(e) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) { setOpen(true); setActive(0); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (results[active]) choose(results[active]); }
    else if (e.key === "Escape") { setOpen(false); }
  }

  return (
    <div className="relative" ref={boxRef}>
      <input
        value={open ? q : (selected ? `${selected.name}${selected.sku ? ` · ${selected.sku}` : ""}` : "")}
        onChange={(e) => { setQ(e.target.value); setActive(0); if (!open) setOpen(true); }}
        onFocus={() => { setOpen(true); setActive(0); }}
        onKeyDown={onKeyDown}
        placeholder="Search the product master by name or SKU…"
        className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
      />
      {open && (
        <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-500">
              No products match — add it to the product master first.
            </li>
          ) : results.map((b, i) => (
            <li key={b.id}>
              {(i === 0 || results[i - 1]._group !== b._group) && (
                <div className="bg-gray-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-950 dark:text-gray-400">
                  {b._group}
                </div>
              )}
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(b)}
                onMouseEnter={() => setActive(i)}
                className={`block w-full px-3 py-2 text-left text-sm ${
                  i === active ? "bg-gray-100 dark:bg-gray-800" : ""
                }`}
              >
                <div className="truncate font-medium text-gray-900 dark:text-gray-100">{b.name}</div>
                <div className="truncate text-[11px] text-gray-400">
                  {b.sku}
                  {b.units_per_case ? ` · ${fmtInt(b.units_per_case)}/box` : ""}
                  {b.carton_dims ? ` · ${b.carton_dims} mm` : " · no carton size"}
                  {b.kg_per_box != null ? ` · ${b.kg_per_box} kg` : " · no weight"}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
