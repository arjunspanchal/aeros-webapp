"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const OTHER = "__other__";
const ADD_NEW = "__add__";

function fmtINR(n) {
  if (n == null) return "—";
  return `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function VehicleDispatchForm({
  clients = [],
  transporters = [],
  vehicleSizes = [],
  mode = "create",
  initial = null,
  dispatchId = null,
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const isEdit = mode === "edit";

  // Customer: if the record's client_id matches a known client we drive the
  // dropdown off it; otherwise the customer was typed free-hand (→ "Other").
  const initialClientKnown =
    initial?.client_id && clients.some((c) => c.id === initial.client_id);
  // Transporter: same idea against the transporter directory.
  const initialTransporterKnown =
    initial?.transporter_vendor_id &&
    transporters.some((t) => t.id === initial.transporter_vendor_id);

  const [form, setForm] = useState(() => ({
    dispatch_date:  initial?.dispatch_date || today,
    invoice_no:     initial?.invoice_no || "",
    eway_bill_no:   initial?.eway_bill_no || "",
    client_id:      initialClientKnown ? initial.client_id : "",
    customer_name:  initial?.customer_name || "",
    vehicle_size:   initial?.vehicle_size || "",
    vehicle_number: initial?.vehicle_number || "",
    transporter_vendor_id: initialTransporterKnown ? initial.transporter_vendor_id : "",
    transporter_name:      initial?.transporter_name || "",
    driver_name:    initial?.driver_name || "",
    driver_phone:   initial?.driver_phone || "",
    box_count:       initial?.box_count ?? "",
    total_weight_kg: initial?.total_weight_kg ?? "",
    from_city:       initial?.from_city || "",
    to_city:         initial?.to_city || "",
    approx_kms:      initial?.approx_kms ?? "",
    freight_lumpsum_inr: initial?.freight_lumpsum_inr ?? "",
    notes:           initial?.notes || "",
  }));

  // Customer dropdown selection state: a client id, OTHER (type a name), or "".
  const [customerMode, setCustomerMode] = useState(() =>
    initialClientKnown ? initial.client_id : (initial?.customer_name ? OTHER : "")
  );
  // Transporter dropdown: a vendor id, ADD_NEW (type a new transporter), or "".
  const [transporterMode, setTransporterMode] = useState(() =>
    initialTransporterKnown ? initial.transporter_vendor_id : (initial?.transporter_name ? ADD_NEW : "")
  );
  const [newTransporterName, setNewTransporterName] = useState(
    initialTransporterKnown ? "" : (initial?.transporter_name || "")
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function setField(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  function onCustomerChange(val) {
    setCustomerMode(val);
    if (val === OTHER) {
      setField("client_id", "");
      // keep whatever name was typed
    } else if (val === "") {
      setField("client_id", "");
      setField("customer_name", "");
    } else {
      const c = clients.find((x) => x.id === val);
      setField("client_id", val);
      setField("customer_name", c?.name || "");
    }
  }

  function onTransporterChange(val) {
    setTransporterMode(val);
    if (val === ADD_NEW) {
      setField("transporter_vendor_id", "");
      setField("transporter_name", "");
    } else if (val === "") {
      setField("transporter_vendor_id", "");
      setField("transporter_name", "");
      setNewTransporterName("");
    } else {
      const t = transporters.find((x) => x.id === val);
      setField("transporter_vendor_id", val);
      setField("transporter_name", t?.name || "");
    }
  }

  const derived = useMemo(() => {
    const freight = Number(form.freight_lumpsum_inr);
    const boxes = Number(form.box_count);
    const kg = Number(form.total_weight_kg);
    const hasFreight = form.freight_lumpsum_inr !== "" && Number.isFinite(freight);
    return {
      perBox: hasFreight && boxes > 0 ? +(freight / boxes).toFixed(2) : null,
      perKg:  hasFreight && kg > 0    ? +(freight / kg).toFixed(2)    : null,
    };
  }, [form.freight_lumpsum_inr, form.box_count, form.total_weight_kg]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!form.customer_name.trim()) return setError("Customer is required — pick one or type a name");

    const payload = { ...form };
    if (transporterMode === ADD_NEW) {
      const clean = newTransporterName.trim();
      if (!clean) return setError("Enter the new transporter's name");
      payload.newTransporterName = clean;
      payload.transporter_vendor_id = "";
      payload.transporter_name = clean;
    }

    setSubmitting(true);
    try {
      const url = isEdit
        ? `/api/warehouse/vehicle-dispatches/${dispatchId}`
        : "/api/warehouse/vehicle-dispatches";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || (isEdit ? "Failed to save changes" : "Failed to create dispatch"));
      router.push(`/warehouse/vehicle-dispatch/${data.dispatch.id}`);
      router.refresh();
    } catch (e) {
      setError(e.message);
      setSubmitting(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-gray-400 focus:outline-none dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100";
  const labelCls = "block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1";

  return (
    <form onSubmit={submit} className="space-y-8">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      )}

      {/* Paperwork */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-200">Paperwork</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelCls}>Dispatch date</label>
            <input type="date" value={form.dispatch_date} onChange={(e) => setField("dispatch_date", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Invoice no.</label>
            <input value={form.invoice_no} onChange={(e) => setField("invoice_no", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>E-way bill no.</label>
            <input value={form.eway_bill_no} onChange={(e) => setField("eway_bill_no", e.target.value)} className={inputCls} />
          </div>
          <div className="sm:col-span-3">
            <label className={labelCls}>Customer *</label>
            <select value={customerMode} onChange={(e) => onCustomerChange(e.target.value)} className={inputCls}>
              <option value="">— Select customer —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.code ? ` (${c.code})` : ""}</option>
              ))}
              <option value={OTHER}>Other (type a name)…</option>
            </select>
            {customerMode === OTHER && (
              <input
                value={form.customer_name}
                onChange={(e) => setField("customer_name", e.target.value)}
                placeholder="Customer name"
                className={`${inputCls} mt-2`}
              />
            )}
          </div>
        </div>
      </section>

      {/* Vehicle & transporter */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-200">Vehicle &amp; transporter</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Vehicle size</label>
            <select value={form.vehicle_size} onChange={(e) => setField("vehicle_size", e.target.value)} className={inputCls}>
              <option value="">— Select size —</option>
              {vehicleSizes.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Vehicle number</label>
            <input value={form.vehicle_number} onChange={(e) => setField("vehicle_number", e.target.value)} placeholder="e.g. MH04 AB 1234" className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Transporter (vendor)</label>
            <select value={transporterMode} onChange={(e) => onTransporterChange(e.target.value)} className={inputCls}>
              <option value="">— Select transporter —</option>
              {transporters.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
              <option value={ADD_NEW}>+ Add new transporter…</option>
            </select>
            {transporterMode === ADD_NEW && (
              <input
                value={newTransporterName}
                onChange={(e) => setNewTransporterName(e.target.value)}
                placeholder="New transporter name (added to the shared vendor directory)"
                className={`${inputCls} mt-2`}
              />
            )}
          </div>
          <div>
            <label className={labelCls}>Driver name</label>
            <input value={form.driver_name} onChange={(e) => setField("driver_name", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Driver phone</label>
            <input type="tel" value={form.driver_phone} onChange={(e) => setField("driver_phone", e.target.value)} placeholder="e.g. 98XXXXXXXX" className={inputCls} />
          </div>
        </div>
      </section>

      {/* Lane & load */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-200">Lane &amp; load</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelCls}>From city</label>
            <input value={form.from_city} onChange={(e) => setField("from_city", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>To city</label>
            <input value={form.to_city} onChange={(e) => setField("to_city", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Approx kms</label>
            <input type="number" min="0" step="1" value={form.approx_kms} onChange={(e) => setField("approx_kms", e.target.value)} className={`${inputCls} text-right tabular-nums`} />
          </div>
          <div>
            <label className={labelCls}>No. of boxes</label>
            <input type="number" min="0" step="1" value={form.box_count} onChange={(e) => setField("box_count", e.target.value)} className={`${inputCls} text-right tabular-nums`} />
          </div>
          <div>
            <label className={labelCls}>Total weight (kg)</label>
            <input type="number" min="0" step="0.01" value={form.total_weight_kg} onChange={(e) => setField("total_weight_kg", e.target.value)} placeholder="from e-way bill" className={`${inputCls} text-right tabular-nums`} />
          </div>
          <div>
            <label className={labelCls}>Freight — lump sum (₹)</label>
            <input type="number" min="0" step="0.01" value={form.freight_lumpsum_inr} onChange={(e) => setField("freight_lumpsum_inr", e.target.value)} placeholder="transporter quote" className={`${inputCls} text-right tabular-nums`} />
          </div>
        </div>

        {/* Live derived metrics */}
        <div className="mt-4 grid grid-cols-2 gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Cost per box</div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-100">{fmtINR(derived.perBox)}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Cost per kg</div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-100">{fmtINR(derived.perKg)}</div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <label className={labelCls}>Notes (optional)</label>
        <textarea rows={2} value={form.notes} onChange={(e) => setField("notes", e.target.value)} className={inputCls} />
      </section>

      <div className="flex items-center justify-end gap-3">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">Cancel</button>
        <button disabled={submitting} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100">
          {submitting
            ? (isEdit ? "Saving…" : "Creating…")
            : (isEdit ? "Save changes" : "Create dispatch")}
        </button>
      </div>
    </form>
  );
}
