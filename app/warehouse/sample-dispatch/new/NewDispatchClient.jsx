"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

function emptyLine() {
  return {
    description: "",
    quantity: 1,
    price: 0,
    gst_pct: 18,
    master_product_id: null,
    sample_kit_id: null,
  };
}

function fmtINR(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function NewDispatchClient({ products, kits = [], defaultManagedBy }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [kitPickerValue, setKitPickerValue] = useState("");

  const [form, setForm] = useState({
    dispatch_date: today,
    managed_by: defaultManagedBy || "",
    customer_name: "",
    customer_contact: "",
    customer_billing_address: "",
    customer_delivery_address: "",
    customer_gstin: "",
    notes: "",
  });
  const [items, setItems] = useState([emptyLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function setField(k, v) { setForm((f) => ({ ...f, [k]: v })); }
  function setLine(i, patch) {
    setItems((rows) => rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }
  function addLine()  { setItems((rows) => [...rows, emptyLine()]); }
  function addKit(kitId) {
    if (!kitId) return;
    const kit = kits.find((k) => k.id === kitId);
    if (!kit) return;

    // Expand the kit's components into individual line items so the
    // dispatch lists every SKU separately (e.g. PP Cup Kit → 600ml +
    // 350ml sippers + lids as their own lines, all back-linked to the
    // kit via sample_kit_id). If the kit has no components, fall back
    // to a single line carrying the kit's name + default price.
    const gst = kit.default_gst_pct ?? 18;
    const components = Array.isArray(kit.components) ? kit.components : [];
    const newLines = components.length > 0
      ? components.map((c) => ({
          description:       c.description,
          quantity:          Number(c.quantity_per_kit) || 1,
          price:             0,
          gst_pct:           gst,
          master_product_id: c.master_product_id || null,
          sample_kit_id:     kit.id,
        }))
      : [{
          description:       kit.name,
          quantity:          1,
          price:             kit.default_price ?? 0,
          gst_pct:           gst,
          master_product_id: null,
          sample_kit_id:     kit.id,
        }];

    setItems((rows) => {
      // Replace the single empty starter row instead of appending after it.
      if (rows.length === 1 && !rows[0].description.trim() && !rows[0].sample_kit_id) {
        return newLines;
      }
      return [...rows, ...newLines];
    });
    setKitPickerValue("");
  }
  function removeLine(i) {
    setItems((rows) => rows.length === 1 ? rows : rows.filter((_, idx) => idx !== i));
  }
  function copyDeliveryFromBilling() {
    setField("customer_delivery_address", form.customer_billing_address);
  }

  const totals = useMemo(() => {
    let excl = 0, incl = 0;
    for (const ln of items) {
      const lineExcl = Number(ln.quantity || 0) * Number(ln.price || 0);
      const lineIncl = lineExcl * (1 + Number(ln.gst_pct || 0) / 100);
      excl += lineExcl;
      incl += lineIncl;
    }
    return { excl, incl, gst: incl - excl };
  }, [items]);

  function productLabel(p) {
    return [p.sku, p.product_name].filter(Boolean).join(" — ");
  }
  function pickProduct(i, productId) {
    const p = products.find((x) => x.id === productId);
    if (!p) return setLine(i, { master_product_id: null });
    setLine(i, {
      master_product_id: p.id,
      description: productLabel(p),
    });
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!form.customer_name.trim()) return setError("Customer name is required");
    if (items.length === 0) return setError("Add at least one item");
    for (const [i, ln] of items.entries()) {
      if (!ln.description.trim()) return setError(`Line ${i + 1}: description is required`);
      if (!(Number(ln.quantity) > 0)) return setError(`Line ${i + 1}: quantity must be > 0`);
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/warehouse/sample-dispatches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to create dispatch");
      router.push(`/warehouse/sample-dispatch/${data.dispatch.id}`);
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

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-200">Header</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Dispatch date</label>
            <input type="date" value={form.dispatch_date} onChange={(e) => setField("dispatch_date", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Managed by</label>
            <input value={form.managed_by} onChange={(e) => setField("managed_by", e.target.value)} placeholder="e.g. Prerna" className={inputCls} />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-200">Customer</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Name *</label>
            <input value={form.customer_name} onChange={(e) => setField("customer_name", e.target.value)} className={inputCls} required />
          </div>
          <div>
            <label className={labelCls}>Contact number</label>
            <input value={form.customer_contact} onChange={(e) => setField("customer_contact", e.target.value)} className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>GSTIN</label>
            <input value={form.customer_gstin} onChange={(e) => setField("customer_gstin", e.target.value)} className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Billing address</label>
            <textarea rows={2} value={form.customer_billing_address} onChange={(e) => setField("customer_billing_address", e.target.value)} className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <div className="flex items-end justify-between gap-2">
              <label className={labelCls}>Delivery address</label>
              <button type="button" onClick={copyDeliveryFromBilling} className="text-xs text-blue-700 hover:text-blue-800 dark:text-blue-400 mb-1">Same as billing</button>
            </div>
            <textarea rows={2} value={form.customer_delivery_address} onChange={(e) => setField("customer_delivery_address", e.target.value)} className={inputCls} />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Items</h2>
          <div className="flex items-center gap-2">
            {kits.length > 0 && (
              <select
                value={kitPickerValue}
                onChange={(e) => addKit(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-gray-400 focus:outline-none dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100"
              >
                <option value="">+ Add sample kit</option>
                {kits.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}{k.default_price != null ? ` — ₹${Number(k.default_price).toFixed(2)}` : ""}
                  </option>
                ))}
              </select>
            )}
            <button type="button" onClick={addLine} className="text-sm font-medium text-blue-700 hover:text-blue-800 dark:text-blue-400">+ Add item</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <th className="px-2 py-2 w-10">#</th>
                <th className="px-2 py-2 min-w-[260px]">Description</th>
                <th className="px-2 py-2 w-24 text-right">Qty</th>
                <th className="px-2 py-2 w-28 text-right">Price (₹)</th>
                <th className="px-2 py-2 w-20 text-right">GST %</th>
                <th className="px-2 py-2 w-32 text-right">Total (incl.)</th>
                <th className="px-2 py-2 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {items.map((ln, i) => {
                const lineExcl = Number(ln.quantity || 0) * Number(ln.price || 0);
                const lineIncl = lineExcl * (1 + Number(ln.gst_pct || 0) / 100);
                return (
                  <tr key={i} className="align-top">
                    <td className="px-2 py-2 text-gray-500 dark:text-gray-400">{i + 1}</td>
                    <td className="px-2 py-2">
                      <input
                        list={`product-list-${i}`}
                        value={ln.description}
                        onChange={(e) => {
                          const v = e.target.value;
                          // If the user picks a datalist option, find the product and link it.
                          const match = products.find((p) => productLabel(p) === v || p.product_name === v);
                          if (match) {
                            pickProduct(i, match.id);
                          } else {
                            setLine(i, { description: v, master_product_id: null });
                          }
                        }}
                        className={inputCls}
                        placeholder="Type or pick from catalogue"
                      />
                      <datalist id={`product-list-${i}`}>
                        {products.map((p) => (
                          <option key={p.id} value={productLabel(p)} />
                        ))}
                      </datalist>
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" min="0" step="0.01" value={ln.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} className={`${inputCls} text-right tabular-nums`} />
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" min="0" step="0.01" value={ln.price} onChange={(e) => setLine(i, { price: e.target.value })} className={`${inputCls} text-right tabular-nums`} />
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" min="0" step="0.01" value={ln.gst_pct} onChange={(e) => setLine(i, { gst_pct: e.target.value })} className={`${inputCls} text-right tabular-nums`} />
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-gray-700 dark:text-gray-200 pt-4">{fmtINR(lineIncl)}</td>
                    <td className="px-2 py-2">
                      <button type="button" onClick={() => removeLine(i)} className="text-gray-400 hover:text-red-600" title="Remove line" disabled={items.length === 1}>×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 dark:border-gray-800">
                <td colSpan={5} className="px-2 py-3 text-right text-xs uppercase tracking-wide text-gray-500">Subtotal (excl. GST)</td>
                <td className="px-2 py-3 text-right tabular-nums text-gray-700 dark:text-gray-200">{fmtINR(totals.excl)}</td>
                <td />
              </tr>
              <tr>
                <td colSpan={5} className="px-2 py-1 text-right text-xs uppercase tracking-wide text-gray-500">GST</td>
                <td className="px-2 py-1 text-right tabular-nums text-gray-700 dark:text-gray-200">{fmtINR(totals.gst)}</td>
                <td />
              </tr>
              <tr>
                <td colSpan={5} className="px-2 py-2 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">Total (incl. GST)</td>
                <td className="px-2 py-2 text-right tabular-nums text-base font-semibold text-gray-900 dark:text-gray-100">{fmtINR(totals.incl)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <label className={labelCls}>Notes (optional)</label>
        <textarea rows={2} value={form.notes} onChange={(e) => setField("notes", e.target.value)} className={inputCls} />
      </section>

      <div className="flex items-center justify-end gap-3">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">Cancel</button>
        <button disabled={submitting} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100">
          {submitting ? "Creating…" : "Create dispatch"}
        </button>
      </div>
    </form>
  );
}
