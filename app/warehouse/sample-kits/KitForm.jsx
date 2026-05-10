"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ProductPicker from "../_components/ProductPicker";

function emptyComponent() {
  return { description: "", master_product_id: null, quantity_per_kit: 1 };
}

export default function KitForm({ products, initial, kitId, mode = "create" }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: initial?.name || "",
    description: initial?.description || "",
    default_price: initial?.default_price ?? "",
    default_gst_pct: initial?.default_gst_pct ?? 18,
    active: initial?.active ?? true,
  });
  const [components, setComponents] = useState(
    initial?.components?.length ? initial.components.map((c) => ({ ...c })) : [emptyComponent()],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function setField(k, v) { setForm((f) => ({ ...f, [k]: v })); }
  function setComp(i, patch) {
    setComponents((rows) => rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }
  function addComp() { setComponents((rows) => [...rows, emptyComponent()]); }
  function removeComp(i) {
    setComponents((rows) => rows.length === 1 ? rows : rows.filter((_, idx) => idx !== i));
  }

  function productLabel(p) { return [p.sku, p.product_name].filter(Boolean).join(" — "); }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) return setError("Name is required");
    setBusy(true);
    try {
      const cleanComponents = components.filter((c) => c.description.trim());
      const url = mode === "create"
        ? "/api/warehouse/sample-kits"
        : `/api/warehouse/sample-kits/${kitId}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, components: cleanComponents }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Save failed");
      router.push("/warehouse/sample-kits");
      router.refresh();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  async function deleteKit() {
    if (!confirm("Delete this kit? It will be hidden from the picker but historical dispatches keep their reference.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/warehouse/sample-kits/${kitId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Delete failed");
      }
      router.push("/warehouse/sample-kits");
      router.refresh();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-gray-400 focus:outline-none dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100";
  const labelCls = "block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1";

  return (
    <form onSubmit={submit} className="space-y-6">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-200">Kit details</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelCls}>Name *</label>
            <input value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="e.g. PET Cup Sample Kit" className={inputCls} required />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Description</label>
            <textarea rows={2} value={form.description} onChange={(e) => setField("description", e.target.value)} className={inputCls} placeholder="What's special about this kit (optional)" />
          </div>
          <div className="sm:col-span-2 flex items-center gap-2">
            <input id="active" type="checkbox" checked={form.active} onChange={(e) => setField("active", e.target.checked)} className="rounded border-gray-300" />
            <label htmlFor="active" className="text-sm text-gray-700 dark:text-gray-200">Active (shows up in the dispatch form picker)</label>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Components</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">For warehouse packing reference. Not printed on the dispatch PDF.</p>
          </div>
          <button type="button" onClick={addComp} className="text-sm font-medium text-blue-700 hover:text-blue-800 dark:text-blue-400">+ Add component</button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <th className="px-2 py-2 w-10">#</th>
                <th className="px-2 py-2 min-w-[320px]">Item</th>
                <th className="px-2 py-2 w-28 text-right">Qty / kit</th>
                <th className="px-2 py-2 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {components.map((c, i) => (
                <tr key={i} className="align-top">
                  <td className="px-2 py-2 text-gray-500">{i + 1}</td>
                  <td className="px-2 py-2">
                    <ProductPicker
                      products={products}
                      value={c.description}
                      onChange={(v) => setComp(i, { description: v.description, master_product_id: v.master_product_id ?? null })}
                      inputClassName={inputCls}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input type="number" min="0" step="0.01" value={c.quantity_per_kit} onChange={(e) => setComp(i, { quantity_per_kit: e.target.value })} className={`${inputCls} text-right tabular-nums`} />
                  </td>
                  <td className="px-2 py-2">
                    <button type="button" onClick={() => removeComp(i)} className="text-gray-400 hover:text-red-600" disabled={components.length === 1}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex items-center justify-between gap-3">
        {mode === "edit" ? (
          <button type="button" onClick={deleteKit} disabled={busy} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-red-900/20">
            Delete kit
          </button>
        ) : <span />}
        <div className="flex gap-2">
          <button type="button" onClick={() => router.back()} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">Cancel</button>
          <button disabled={busy} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900">
            {busy ? "Saving…" : mode === "create" ? "Create kit" : "Save changes"}
          </button>
        </div>
      </div>
    </form>
  );
}
