"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const SCOPE_OPTIONS = [
  { value: "full",      label: "Full warehouse" },
  { value: "category",  label: "By category" },
  { value: "location",  label: "By location" },
  { value: "item-list", label: "Specific SKUs" },
];

function todayISO() { return new Date().toISOString().slice(0, 10); }

export default function NewAuditClient({ locations, categories, items, currentUserEmail }) {
  const router = useRouter();
  const [scope, setScope] = useState("full");
  const [scheduledDate, setScheduledDate] = useState(todayISO());
  const [auditManager, setAuditManager] = useState(currentUserEmail);
  const [freezeMovements, setFreezeMovements] = useState(true);
  const [notes, setNotes] = useState("");

  const [category, setCategory] = useState(categories[0] || "");
  const [locationId, setLocationId] = useState(locations[0]?.id || "");
  const [itemSearch, setItemSearch] = useState("");
  const [pickedItemIds, setPickedItemIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const itemMatches = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return items.slice(0, 30);
    return items.filter((i) =>
      (i.sku || "").toLowerCase().includes(q) ||
      (i.name || "").toLowerCase().includes(q),
    ).slice(0, 30);
  }, [items, itemSearch]);

  function toggleItem(id) {
    setPickedItemIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function submit(e) {
    e.preventDefault();
    setErr("");
    let scope_filter = {};
    if (scope === "category") {
      if (!category) { setErr("Pick a category"); return; }
      scope_filter = { category };
    } else if (scope === "location") {
      if (!locationId) { setErr("Pick a location"); return; }
      const loc = locations.find((l) => l.id === locationId);
      scope_filter = { location_id: locationId, location_code: loc?.code };
    } else if (scope === "item-list") {
      if (pickedItemIds.length === 0) { setErr("Pick at least one item"); return; }
      scope_filter = { item_ids: pickedItemIds };
    }
    if (!auditManager.trim()) { setErr("Audit manager email is required"); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/warehouse/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope, scope_filter,
          scheduled_date: scheduledDate,
          audit_manager_email: auditManager.trim(),
          freeze_movements: freezeMovements,
          notes: notes.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Create failed");
      router.push(`/warehouse/inventory/audits/${data.audit.id}`);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-5 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select label="Scope *" value={scope} onChange={setScope} options={SCOPE_OPTIONS} />
        <Field label="Scheduled date *" type="date" value={scheduledDate} onChange={setScheduledDate} />
        <Field label="Audit manager email *" value={auditManager} onChange={setAuditManager} placeholder="fm@aeros-x.com" />
        <label className="flex items-end gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={freezeMovements}
            onChange={(e) => setFreezeMovements(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          <span>
            Freeze movements during count
            <span className="block text-[11px] text-gray-500 dark:text-gray-400">Advisory only — coordinator should pause inwards/outwards manually.</span>
          </span>
        </label>
        <Field label="Notes" value={notes} onChange={setNotes} placeholder="Optional context for the team" />
      </div>

      {scope === "category" && (
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            {categories.length === 0 && <option value="">— no categories yet —</option>}
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}

      {scope === "location" && (
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Location</label>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            {locations.map((l) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
          </select>
        </div>
      )}

      {scope === "item-list" && (
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Pick items ({pickedItemIds.length} selected)</label>
          <input
            type="text"
            value={itemSearch}
            onChange={(e) => setItemSearch(e.target.value)}
            placeholder="Search SKU or name…"
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-800">
            {itemMatches.map((it) => (
              <label key={it.id} className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 text-sm last:border-b-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/40">
                <input
                  type="checkbox"
                  checked={pickedItemIds.includes(it.id)}
                  onChange={() => toggleItem(it.id)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span className="font-mono text-xs text-gray-600 dark:text-gray-400">{it.sku}</span>
                <span className="text-gray-900 dark:text-gray-100">{it.name}</span>
                {it.brand_customer && <span className="text-xs text-gray-500">· {it.brand_customer}</span>}
              </label>
            ))}
            {itemMatches.length === 0 && <p className="px-3 py-4 text-center text-xs text-gray-500">No matches.</p>}
          </div>
        </div>
      )}

      {err && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>}

      <div className="flex justify-end gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {busy ? "Creating…" : "Create audit & start counting"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, value, onChange, type = "text", placeholder }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-600 dark:text-gray-400">{label}</span>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
      />
    </label>
  );
}
function Select({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-600 dark:text-gray-400">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
