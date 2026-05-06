"use client";

import { useMemo, useRef, useState } from "react";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

const SORT_OPTIONS = [
  { value: "name-asc",   label: "Name (A → Z)" },
  { value: "name-desc",  label: "Name (Z → A)" },
  { value: "stock-desc", label: "Stock (high → low)" },
  { value: "stock-asc",  label: "Stock (low → high)" },
  { value: "rate-desc",  label: "Rate (high → low)" },
  { value: "rate-asc",   label: "Rate (low → high)" },
];

const STOCK_STATES = [
  { value: "in",      label: "In stock" },
  { value: "low",     label: "Low (≤ 10)" },
  { value: "out",     label: "Out of stock" },
  { value: "unknown", label: "Stock unknown" },
];

// Drop empties so they don't pollute the dropdowns.
function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

const filterSelectCls =
  "rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100";

export default function ManageClient({ initialItems }) {
  const [items, setItems] = useState(initialItems);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [stockFilter, setStockFilter] = useState("");
  const [photoFilter, setPhotoFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState(""); // "" | "finished" | "rm"
  const [sort, setSort] = useState("name-asc");

  const categories = useMemo(() => uniq(items.map((i) => i.category)), [items]);
  const brands     = useMemo(() => uniq(items.map((i) => i.brand)),    [items]);
  const statuses   = useMemo(() => uniq(items.map((i) => i.status)),   [items]);
  const locations  = useMemo(() => uniq(items.map((i) => i.location || "")), [items]);

  const anyFilterActive =
    !!search || !!categoryFilter || !!brandFilter || !!statusFilter ||
    !!locationFilter || !!stockFilter || !!photoFilter || !!typeFilter;

  function clearFilters() {
    setSearch("");
    setCategoryFilter("");
    setBrandFilter("");
    setStatusFilter("");
    setLocationFilter("");
    setStockFilter("");
    setPhotoFilter("");
    setTypeFilter("");
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = items.filter((it) => {
      if (categoryFilter && it.category !== categoryFilter) return false;
      if (brandFilter && it.brand !== brandFilter) return false;
      if (statusFilter && it.status !== statusFilter) return false;
      if (locationFilter && (it.location || "") !== locationFilter) return false;

      if (stockFilter) {
        const qty = it.stockQuantity;
        if (stockFilter === "in"      && !(typeof qty === "number" && qty > 0))   return false;
        if (stockFilter === "low"     && !(typeof qty === "number" && qty > 0 && qty <= 10)) return false;
        if (stockFilter === "out"     && !(typeof qty === "number" && qty <= 0))  return false;
        if (stockFilter === "unknown" && typeof qty === "number")                  return false;
      }

      if (photoFilter === "missing" && (it.photos?.length || 0) > 0) return false;
      if (photoFilter === "has"     && (it.photos?.length || 0) === 0) return false;

      if (typeFilter === "rm"       && !isRm(it)) return false;
      if (typeFilter === "finished" && isRm(it)) return false;

      if (!q) return true;
      // Broaden search across the fields admins commonly cite.
      const hay = [
        it.itemName, it.brand, it.category, it.status,
        it.specifications, it.description, it.location,
        // SKU isn't normalised today, but defensive: pick it up if it appears later.
        it.sku,
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });

    const cmp = (a, b) => {
      switch (sort) {
        case "name-desc":  return (b.itemName || "").localeCompare(a.itemName || "");
        case "stock-asc":  return (a.stockQuantity ?? Infinity) - (b.stockQuantity ?? Infinity);
        case "stock-desc": return (b.stockQuantity ?? -Infinity) - (a.stockQuantity ?? -Infinity);
        case "rate-asc":   return (a.price ?? Infinity) - (b.price ?? Infinity);
        case "rate-desc":  return (b.price ?? -Infinity) - (a.price ?? -Infinity);
        case "name-asc":
        default:           return (a.itemName || "").localeCompare(b.itemName || "");
      }
    };
    return [...list].sort(cmp);
  }, [items, search, categoryFilter, brandFilter, statusFilter, locationFilter, stockFilter, photoFilter, typeFilter, sort]);

  function updateItemLocally(id, patch) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  return (
    <div>
      {/* Filters — search + sort on top, dimension dropdowns below, count + Clear on the right. */}
      <div className="mb-6 space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-wrap gap-3">
          <input
            type="search"
            placeholder="Search name, brand, SKU, specs, location…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
          />
          <select className={filterSelectCls} value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          <select className={filterSelectCls} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className={filterSelectCls} value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} aria-label="Brand">
            <option value="">All brands</option>
            {brands.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select className={filterSelectCls} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
            <option value="">All statuses</option>
            {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className={filterSelectCls} value={stockFilter} onChange={(e) => setStockFilter(e.target.value)} aria-label="Stock state">
            <option value="">Any stock</option>
            {STOCK_STATES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          {locations.length > 0 && (
            <select className={filterSelectCls} value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} aria-label="Warehouse location">
              <option value="">All locations</option>
              {locations.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          )}
          <select className={filterSelectCls} value={photoFilter} onChange={(e) => setPhotoFilter(e.target.value)} aria-label="Photo state">
            <option value="">Any photos</option>
            <option value="has">Has photo</option>
            <option value="missing">Missing photo</option>
          </select>
          <select className={filterSelectCls} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Item type">
            <option value="">All item types</option>
            <option value="finished">Finished goods</option>
            <option value="rm">RM dead stock</option>
          </select>
        </div>

        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>{filtered.length} of {items.length} shown</span>
          {anyFilterActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
            No items match your filters.
          </div>
        ) : (
          filtered.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              onChange={(patch) => updateItemLocally(item.id, patch)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ItemRow({ item, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => toDraft(item));
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState(null);

  function startEdit() {
    setDraft(toDraft(item));
    setEditing(true);
    setError(null);
  }

  function cancelEdit() {
    setEditing(false);
    setError(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/clearance/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Save failed (${res.status})`);
      }
      const { item: updated } = await res.json();
      onChange(updated);
      setEditing(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-col gap-4 p-4 md:flex-row">
        {/* Photos column */}
        <PhotosColumn item={item} onChange={onChange} />

        {/* Fields column */}
        <div className="flex-1 min-w-0">
          {editing ? (
            <EditForm
              draft={draft}
              setDraft={setDraft}
              saving={saving}
              onCancel={cancelEdit}
              onSave={save}
              error={error}
            />
          ) : (
            <ReadView
              item={item}
              onEdit={startEdit}
              savedFlash={savedFlash}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function toDraft(item) {
  return {
    itemName: item.itemName || "",
    brand: item.brand || "",
    category: item.category || "",
    stockQuantity: item.stockQuantity == null ? "" : String(item.stockQuantity),
    unit: item.unit || "pcs",
    casePack: item.casePack == null ? "" : String(item.casePack),
    price: item.price == null ? "" : String(item.price),
    status: item.status || "",
    location: item.location || "",
    description: item.description || "",
    specifications: item.specifications || "",
    // RM dead-stock fields. All three NULL/empty for finished goods.
    gsm: item.gsm == null ? "" : String(item.gsm),
    rmForm: item.rmForm || "",
    rmType: item.rmType || "",
    // Optional override — stock in sheets, price in kg, etc.
    priceUnit: item.priceUnit || "",
  };
}

// RM dropdown choices. "Other" lets staff capture stock that doesn't match
// the standard grades without forcing a free-text fallback.
const RM_TYPES = ["FBB", "Cups Stock", "Brown Kraft Board", "Bleached Kraft", "Virgin Kraft", "Recycled Kraft", "Other"];
const RM_FORMS = ["Roll", "Sheet"];

// True when any RM field is populated. Drives the badge in ReadView.
function isRm(item) {
  return !!(item?.rmType || item?.rmForm || item?.gsm);
}

// Format a price in INR (₹). priceUnit overrides unit when present
// (e.g. RM stocked in sheets but priced per kg). Returns null if price
// is null so caller can render "—".
function formatPrice(price, unit, priceUnit) {
  if (price == null) return null;
  const formatted = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(price);
  const denom = priceUnit || unit;
  return denom ? `${formatted} / ${denom}` : formatted;
}

function ReadView({ item, onEdit, savedFlash }) {
  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">
            {item.itemName || <span className="text-gray-400 dark:text-gray-500">(no name)</span>}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
            {item.brand && <span>{item.brand}</span>}
            {item.category && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 dark:bg-gray-800 dark:text-gray-300">
                {item.category}
              </span>
            )}
            {item.status && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                {item.status}
              </span>
            )}
            {isRm(item) && (
              <span className="rounded-full bg-purple-50 px-2 py-0.5 font-medium text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                RM Dead Stock
              </span>
            )}
            {item.rmType && (
              <span className="rounded-full bg-purple-50 px-2 py-0.5 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                {item.rmType}
              </span>
            )}
            {item.rmForm && (
              <span className="rounded-full bg-purple-50 px-2 py-0.5 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                {item.rmForm}
              </span>
            )}
            {item.gsm != null && (
              <span className="rounded-full bg-purple-50 px-2 py-0.5 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                {item.gsm} GSM
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {savedFlash && (
            <span className="text-xs font-medium text-green-600 dark:text-green-400">Saved</span>
          )}
          <button
            onClick={onEdit}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Edit
          </button>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-5">
        <KV label="Stock">
          {item.stockQuantity != null
            ? `${item.stockQuantity.toLocaleString()} ${item.unit || ""}`
            : <span className="text-gray-400 dark:text-gray-500">—</span>}
        </KV>
        <KV label="Case pack">
          {item.casePack != null ? item.casePack.toLocaleString() : <span className="text-gray-400 dark:text-gray-500">—</span>}
        </KV>
        <KV label="Rate">
          {formatPrice(item.price, item.unit, item.priceUnit) || (
            <span className="italic text-gray-500 dark:text-gray-400">Rate Pending</span>
          )}
        </KV>
        <KV label="Unit">{item.unit || <span className="text-gray-400 dark:text-gray-500">—</span>}</KV>
        <KV label="Status">{item.status || <span className="text-gray-400 dark:text-gray-500">—</span>}</KV>
      </dl>

      {item.location && (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="font-medium">Warehouse:</span>
          <span>{item.location}</span>
          <span className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400">internal</span>
        </p>
      )}

      {(item.description || item.specifications) && (
        <div className="mt-3 space-y-1.5 text-xs text-gray-600 dark:text-gray-300">
          {item.description && (
            <p>
              <span className="font-medium text-gray-500 dark:text-gray-400">Description:</span>{" "}
              {item.description}
            </p>
          )}
          {item.specifications && (
            <p>
              <span className="font-medium text-gray-500 dark:text-gray-400">Specs:</span>{" "}
              {item.specifications}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function KV({ label, children }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</dt>
      <dd className="text-gray-700 dark:text-gray-200">{children}</dd>
    </div>
  );
}

function EditForm({ draft, setDraft, saving, onCancel, onSave, error }) {
  function set(key, value) {
    setDraft((d) => ({ ...d, [key]: value }));
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
      className="space-y-3"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Item name">
          <input
            value={draft.itemName}
            onChange={(e) => set("itemName", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Brand">
          <input
            value={draft.brand}
            onChange={(e) => set("brand", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Category">
          <input
            value={draft.category}
            onChange={(e) => set("category", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Status">
          <input
            value={draft.status}
            onChange={(e) => set("status", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Stock quantity">
          <input
            type="number"
            value={draft.stockQuantity}
            onChange={(e) => set("stockQuantity", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Unit">
          <input
            value={draft.unit}
            onChange={(e) => set("unit", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Case pack">
          <input
            type="number"
            value={draft.casePack}
            onChange={(e) => set("casePack", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Rate (₹ per unit)">
          <input
            type="number"
            step="0.01"
            min="0"
            value={draft.price}
            onChange={(e) => set("price", e.target.value)}
            placeholder="Leave blank for Rate Pending"
            className={inputCls}
          />
        </Field>
        <Field label="Price unit override">
          <input
            value={draft.priceUnit}
            onChange={(e) => set("priceUnit", e.target.value)}
            placeholder={`Leave blank to use "${draft.unit || "unit"}", or e.g. kg`}
            className={inputCls}
          />
        </Field>
        <Field label="Warehouse location (internal)">
          <input
            value={draft.location}
            onChange={(e) => set("location", e.target.value)}
            placeholder="e.g. Rack A-3, Warehouse 2"
            className={inputCls}
          />
        </Field>
      </div>
      <p className="-mt-2 text-[11px] text-gray-500 dark:text-gray-400">
        Warehouse location is staff-only — never shown on the public /clearance page.
      </p>

      {/* Raw-material dead-stock fields. Optional for finished goods —
          fill these in when listing paper rolls / sheets that need to clear.
          Stock quantity above carries kg (Roll) or sheet count (Sheet);
          set the Unit field to "kg" or "sheets" accordingly. */}
      <fieldset className="rounded-md border border-purple-200 bg-purple-50/40 p-3 dark:border-purple-900/50 dark:bg-purple-950/20">
        <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-300">
          Raw Material details (optional)
        </legend>
        <p className="mb-2 text-[11px] text-gray-500 dark:text-gray-400">
          Fill these in for paper / board RM dead stock. Leave blank for finished goods.
          For Rolls set Unit = <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">kg</code>;
          for Sheets use <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">sheets</code>.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="RM Type">
            <select
              value={draft.rmType}
              onChange={(e) => set("rmType", e.target.value)}
              className={inputCls}
            >
              <option value="">— not RM —</option>
              {RM_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Form">
            <select
              value={draft.rmForm}
              onChange={(e) => set("rmForm", e.target.value)}
              className={inputCls}
            >
              <option value="">—</option>
              {RM_FORMS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </Field>
          <Field label="GSM">
            <input
              type="number"
              min="0"
              value={draft.gsm}
              onChange={(e) => set("gsm", e.target.value)}
              placeholder="e.g. 280"
              className={inputCls}
            />
          </Field>
        </div>
      </fieldset>

      <Field label="Description">
        <textarea
          rows={2}
          value={draft.description}
          onChange={(e) => set("description", e.target.value)}
          className={inputCls}
        />
      </Field>
      <Field label="Specifications">
        <textarea
          rows={2}
          value={draft.specifications}
          onChange={(e) => set("specifications", e.target.value)}
          className={inputCls}
        />
      </Field>

      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

// Shared input styling used across text/number/textarea fields. Includes dark
// variants for the edit form background and borders, plus placeholder text.
const inputCls =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500";

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function PhotosColumn({ item, onChange }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  async function handleFiles(files) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      // Upload sequentially so Airtable's Content API rate limits don't trip.
      let latest = item;
      for (const file of files) {
        if (file.size > MAX_UPLOAD_BYTES) {
          throw new Error(
            `"${file.name}" is ${formatBytes(file.size)}. Max 5 MB per file.`,
          );
        }
        const base64 = await fileToBase64(file);
        const res = await fetch(`/api/clearance/items/${item.id}/photos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type || "application/octet-stream",
            fileBase64: base64,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Upload failed (${res.status})`);
        }
        const { item: updated } = await res.json();
        latest = updated;
      }
      onChange(latest);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function deletePhoto(attachmentId) {
    if (!confirm("Delete this photo?")) return;
    setError(null);
    try {
      const res = await fetch(
        `/api/clearance/items/${item.id}/photos?attachmentId=${attachmentId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Delete failed (${res.status})`);
      }
      const { item: updated } = await res.json();
      onChange(updated);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="w-full shrink-0 md:w-64">
      <div className="grid grid-cols-3 gap-1.5 md:grid-cols-3">
        {item.photos.map((p) => (
          <div
            key={p.id}
            className="group relative aspect-square overflow-hidden rounded-md border border-gray-200 bg-gray-50 p-1 dark:border-gray-800 dark:bg-gray-800"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.thumbnailUrl}
              alt={p.filename}
              className="h-full w-full object-contain"
              loading="lazy"
            />
            <button
              onClick={() => deletePhoto(p.id)}
              aria-label={`Delete ${p.filename}`}
              className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-gray-700 opacity-0 shadow-sm transition hover:bg-white hover:text-red-600 group-hover:opacity-100 dark:bg-gray-900/80 dark:text-gray-200 dark:hover:bg-gray-900 dark:hover:text-red-400"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex aspect-square flex-col items-center justify-center gap-0.5 rounded-md border-2 border-dashed border-gray-300 text-[10px] font-medium text-gray-500 transition hover:border-brand-400 hover:text-brand-600 disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:border-brand-400 dark:hover:text-brand-400"
        >
          {uploading ? (
            <span>Uploading…</span>
          ) : (
            <>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Add photo</span>
            </>
          )}
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(Array.from(e.target.files || []))}
      />
      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      <p className="mt-2 text-[10px] text-gray-400 dark:text-gray-500">Max 5 MB per file</p>
    </div>
  );
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      // result is "data:...;base64,XXXX" — strip prefix.
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error("read error"));
    reader.readAsDataURL(file);
  });
}
