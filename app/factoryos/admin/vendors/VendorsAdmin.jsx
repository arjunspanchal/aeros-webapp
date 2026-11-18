"use client";
import { useMemo, useRef, useState } from "react";
import { inputCls, labelCls } from "@/app/factoryos/_components/ui";
import { VENDOR_TYPES } from "@/lib/factoryos/constants";

const EMPTY = {
  name: "",
  type: "Printing",
  contactPerson: "",
  phone: "",
  email: "",
  active: true,
  notes: "",
};

export default function VendorsAdmin({ initialVendors }) {
  const [vendors, setVendors] = useState(initialVendors);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("all");
  const formRef = useRef(null);

  const isEditing = editingId !== null;

  const filtered = useMemo(() => {
    if (filter === "all") return vendors;
    return vendors.filter((v) => v.type === filter);
  }, [vendors, filter]);

  function startEdit(v) {
    setEditingId(v.id);
    setForm({
      name: v.name || "",
      type: v.type || "Printing",
      contactPerson: v.contactPerson || "",
      phone: v.phone || "",
      email: v.email || "",
      active: v.active !== false,
      notes: v.notes || "",
    });
    setErr("");
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY);
    setErr("");
  }

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const url = isEditing ? `/api/factoryos/vendors/${editingId}` : "/api/factoryos/vendors";
    const method = isEditing ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setBusy(false);
    if (!res.ok) {
      setErr((await res.json()).error || "Failed");
      return;
    }
    const data = await res.json();
    if (isEditing) {
      setVendors((prev) =>
        prev.map((v) => (v.id === editingId ? data.vendor : v)).sort((a, b) => a.name.localeCompare(b.name))
      );
    } else {
      setVendors((prev) => [...prev, data.vendor].sort((a, b) => a.name.localeCompare(b.name)));
    }
    cancelEdit();
  }

  async function removeVendor(v) {
    if (!confirm(`Delete "${v.name}"? This cannot be undone.\n\nTip: set Active to off instead to keep historical references intact.`)) return;
    const res = await fetch(`/api/factoryos/vendors/${v.id}`, { method: "DELETE" });
    if (!res.ok) {
      alert((await res.json()).error || "Failed to delete");
      return;
    }
    setVendors((prev) => prev.filter((x) => x.id !== v.id));
    if (editingId === v.id) cancelEdit();
  }

  return (
    <div className="mt-6 grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6">
      <form
        ref={formRef}
        onSubmit={submit}
        className={`lg:col-span-2 bg-white rounded-xl p-4 sm:p-5 space-y-3 dark:bg-gray-900 border-2 lg:sticky lg:top-4 lg:self-start transition-colors ${isEditing ? "border-blue-500 dark:border-blue-400" : "border-gray-200 dark:border-gray-800"}`}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className={`text-sm sm:text-base font-semibold ${isEditing ? "text-blue-600 dark:text-blue-400" : "text-gray-900 dark:text-white"}`}>
            {isEditing ? "✏️ Edit vendor" : "Add vendor"}
          </h2>
          {isEditing && (
            <button
              type="button"
              onClick={cancelEdit}
              className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 whitespace-nowrap font-medium"
            >
              ✕ Cancel
            </button>
          )}
        </div>
        <div>
          <label className={labelCls}>Name</label>
          <input
            className={`${inputCls} text-base`}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Creative Ink"
            required
          />
        </div>
        <div>
          <label className={labelCls}>Type</label>
          <select
            className={`${inputCls} text-base`}
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            {VENDOR_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Contact person</label>
          <input
            className={`${inputCls} text-base`}
            value={form.contactPerson}
            onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
            placeholder="Optional — who do we speak to?"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Phone</label>
            <input
              className={`${inputCls} text-base`}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+91 …"
            />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input
              type="email"
              className={`${inputCls} text-base`}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="name@vendor.com"
            />
          </div>
        </div>
        <div>
          <label className={labelCls}>Notes</label>
          <textarea
            className={`${inputCls} text-base`}
            rows={3}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Rates, specialties, payment terms — anything useful"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
            className="w-4 h-4 rounded border-gray-300 accent-blue-600 cursor-pointer"
          />
          Active (show in job dropdowns)
        </label>
        <button
          disabled={busy}
          className={`w-full text-white text-sm sm:text-base font-medium px-4 py-2.5 sm:py-2 rounded-lg transition-colors ${isEditing ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"} disabled:opacity-60`}
        >
          {busy ? (isEditing ? "Saving…" : "Adding…") : isEditing ? "✓ Save changes" : "Add vendor"}
        </button>
        {err && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-2 text-xs sm:text-sm text-red-700 dark:text-red-300 font-medium">
            ⚠️ {err}
          </div>
        )}
      </form>

      <div className="lg:col-span-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Filter:</span>
          <FilterPill active={filter === "all"} onClick={() => setFilter("all")}>
            All ({vendors.length})
          </FilterPill>
          {VENDOR_TYPES.map((t) => {
            const count = vendors.filter((v) => v.type === t).length;
            return (
              <FilterPill key={t} active={filter === t} onClick={() => setFilter(t)}>
                {t} ({count})
              </FilterPill>
            );
          })}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block bg-white border border-gray-200 rounded-xl dark:bg-gray-900 dark:border-gray-800" style={{ overflow: "hidden" }}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase dark:bg-gray-800/50 dark:text-gray-400">
                <tr>
                  <th className="text-left px-4 py-2 font-medium whitespace-nowrap">Name</th>
                  <th className="text-left px-4 py-2 font-medium whitespace-nowrap">Type</th>
                  <th className="text-left px-4 py-2 font-medium whitespace-nowrap">Contact</th>
                  <th className="text-left px-4 py-2 font-medium whitespace-nowrap">Phone</th>
                  <th className="text-right px-4 py-2 font-medium whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.map((v) => (
                  <tr key={v.id} className={editingId === v.id ? "bg-blue-50 dark:bg-blue-900/20" : ""}>
                    <td className="px-4 py-2 text-sm text-gray-900 dark:text-white font-medium whitespace-nowrap">
                      {v.name}
                      {!v.active && <span className="ml-2 text-xs text-gray-400">(inactive)</span>}
                    </td>
                    <td className="px-4 py-2 text-xs whitespace-nowrap">
                      <TypePill type={v.type} />
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {v.contactPerson || "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {v.phone || "—"}
                    </td>
                    <td className="px-4 py-2 text-right space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => startEdit(v)}
                        className="text-xs px-3 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => removeVendor(v)}
                        className="text-xs px-3 py-1 rounded-md bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50 font-medium"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-sm text-gray-500 py-8 dark:text-gray-400">
                      {vendors.length === 0 ? "No vendors yet. Add your first one on the left." : "No vendors match this filter."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-3">
          {filtered.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-4 text-center text-sm text-gray-500 dark:bg-gray-900 dark:border-gray-800 dark:text-gray-400">
              {vendors.length === 0 ? "No vendors yet." : "No vendors match this filter."}
            </div>
          ) : (
            filtered.map((v) => (
              <div
                key={v.id}
                className={`bg-white border border-gray-200 rounded-lg p-4 space-y-3 dark:bg-gray-900 dark:border-gray-800 ${editingId === v.id ? "ring-2 ring-blue-500" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{v.name}</p>
                    {v.contactPerson && <p className="text-xs text-gray-500 dark:text-gray-400">{v.contactPerson}</p>}
                  </div>
                  <TypePill type={v.type} />
                </div>
                {v.phone && <p className="text-xs text-gray-600 dark:text-gray-300">📞 {v.phone}</p>}
                {v.email && <p className="text-xs text-gray-600 dark:text-gray-300 truncate">✉️ {v.email}</p>}
                {v.notes && <p className="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{v.notes}</p>}
                {!v.active && <p className="text-xs text-gray-400">Inactive</p>}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => startEdit(v)}
                    className="flex-1 text-xs font-medium px-3 py-2 rounded-md bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => removeVendor(v)}
                    className="flex-1 text-xs font-medium px-3 py-2 rounded-md bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function FilterPill({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
        active
          ? "bg-blue-600 text-white"
          : "bg-white text-gray-600 border border-gray-200 hover:border-gray-300 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-800"
      }`}
    >
      {children}
    </button>
  );
}

function TypePill({ type }) {
  const cls =
    type === "Printing"
      ? "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300"
      : type === "RM Supplier"
      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
      : type === "Transport"
      ? "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300"
      : "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300";
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{type}</span>;
}
