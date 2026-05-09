"use client";

import { useMemo, useRef, useState } from "react";

const SOURCE_OPTIONS = ["FG", "RM", "Clearance", "Other"];
const UOM_OPTIONS = ["pcs", "kg", "sheets", "box", "roll", "set"];

// Photo upload constraints — must match the bucket spec (10 MB, image types).
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif",
]);

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || "");
      resolve(s.slice(s.indexOf(",") + 1));
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function formatBytes(b) {
  if (b == null) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

const EMPTY_DRAFT = {
  sku: "",
  name: "",
  category: "",
  brand: "",
  uom: "pcs",
  case_pack: "",
  source: "FG",
  gsm: "",
  rm_form: "",
  rm_type: "",
  notes: "",
};

export default function ItemsAdminClient({ initialItems }) {
  const [items, setItems] = useState(initialItems);
  const [search, setSearch] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterTab, setFilterTab] = useState("all"); // all | plain | branded | needs_review | inactive
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (filterTab === "plain" && it.brand_customer) return false;
      if (filterTab === "branded" && !it.brand_customer) return false;
      if (filterTab === "needs_review" && !it.needs_review) return false;
      if (filterTab === "inactive" && it.is_active) return false;
      if (filterTab !== "inactive" && !it.is_active) return false;
      if (filterSource && it.source !== filterSource) return false;
      if (!q) return true;
      return (
        (it.sku || "").toLowerCase().includes(q) ||
        (it.name || "").toLowerCase().includes(q) ||
        (it.brand || "").toLowerCase().includes(q) ||
        (it.brand_customer || "").toLowerCase().includes(q)
      );
    });
  }, [items, search, filterSource, filterTab]);

  const counts = useMemo(() => {
    const c = { all: 0, plain: 0, branded: 0, needs_review: 0, inactive: 0 };
    for (const it of items) {
      if (!it.is_active) { c.inactive++; continue; }
      c.all++;
      if (it.brand_customer) c.branded++;
      else c.plain++;
      if (it.needs_review) c.needs_review++;
    }
    return c;
  }, [items]);

  async function createItem(e) {
    e.preventDefault();
    setError("");
    if (!draft.sku.trim()) { setError("SKU is required"); return; }
    if (!draft.name.trim()) { setError("Name is required"); return; }
    setBusyId("__new__");
    try {
      const res = await fetch("/api/warehouse/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Create failed");
      setItems((prev) => [data.item, ...prev]);
      setDraft(EMPTY_DRAFT);
      setCreating(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditDraft({
      name: item.name || "",
      category: item.category || "",
      brand: item.brand || "",
      uom: item.uom || "pcs",
      case_pack: item.case_pack ?? "",
      source: item.source || "FG",
      gsm: item.gsm ?? "",
      rm_form: item.rm_form || "",
      rm_type: item.rm_type || "",
      notes: item.notes || "",
      needs_review: !!item.needs_review,
    });
  }

  async function saveEdit(id) {
    setBusyId(id);
    setError("");
    try {
      const res = await fetch(`/api/warehouse/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editDraft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setItems((prev) => prev.map((it) => (it.id === id ? data.item : it)));
      setEditingId(null);
      setEditDraft(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(item) {
    setBusyId(item.id);
    setError("");
    try {
      const res = item.is_active
        ? await fetch(`/api/warehouse/items/${item.id}`, { method: "DELETE" })
        : await fetch(`/api/warehouse/items/${item.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_active: true }),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Toggle failed");
      setItems((prev) => prev.map((it) => (it.id === item.id ? data.item : it)));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      {/* Tabs */}
      <div className="mb-4 flex flex-wrap items-center gap-1 border-b border-gray-200 dark:border-gray-800">
        {[
          { key: "all", label: `All (${counts.all})` },
          { key: "plain", label: `Plain (${counts.plain})` },
          { key: "branded", label: `Branded (${counts.branded})` },
          { key: "needs_review", label: `Needs review (${counts.needs_review})` },
          { key: "inactive", label: `Inactive (${counts.inactive})` },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setFilterTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              filterTab === t.key
                ? "border-blue-600 text-blue-700 dark:text-blue-400"
                : "border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search SKU, name, brand, customer…"
            className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          <select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            <option value="">All sources</option>
            {SOURCE_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => { setCreating(true); setError(""); }}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          + New plain SKU
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Create form */}
      {creating && (
        <form onSubmit={createItem} className="mb-6 rounded-lg border border-blue-200 bg-blue-50/40 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">New plain SKU</h2>
            <button type="button" onClick={() => setCreating(false)} className="text-sm text-gray-500 hover:text-gray-700">
              Cancel
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="SKU *" value={draft.sku} onChange={(v) => setDraft({ ...draft, sku: v })} mono placeholder="CUP-DW-8OZ-PLAIN" />
            <Field label="Name *" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} placeholder="8 oz DW paper cup (plain)" />
            <Field label="Category" value={draft.category} onChange={(v) => setDraft({ ...draft, category: v })} placeholder="Paper Cup" />
            <Field label="Brand" value={draft.brand} onChange={(v) => setDraft({ ...draft, brand: v })} placeholder="Aeros" />
            <Select label="UOM" value={draft.uom} onChange={(v) => setDraft({ ...draft, uom: v })} options={UOM_OPTIONS} />
            <Field label="Case pack" value={draft.case_pack} onChange={(v) => setDraft({ ...draft, case_pack: v })} type="number" placeholder="1000" />
            <Select label="Source" value={draft.source} onChange={(v) => setDraft({ ...draft, source: v })} options={SOURCE_OPTIONS} />
            <Field label="GSM" value={draft.gsm} onChange={(v) => setDraft({ ...draft, gsm: v })} type="number" placeholder="280" />
            <Field label="RM form" value={draft.rm_form} onChange={(v) => setDraft({ ...draft, rm_form: v })} placeholder="Roll / Sheet" />
            <Field label="RM type" value={draft.rm_type} onChange={(v) => setDraft({ ...draft, rm_type: v })} placeholder="FBB / Cup Stock" />
            <div className="sm:col-span-2 lg:col-span-3">
              <Field label="Notes" value={draft.notes} onChange={(v) => setDraft({ ...draft, notes: v })} placeholder="Anything operators should know" />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="submit"
              disabled={busyId === "__new__"}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {busyId === "__new__" ? "Saving…" : "Create SKU"}
            </button>
          </div>
        </form>
      )}

      {/* Items table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-gray-800/50">
            <tr>
              <Th>Photo</Th>
              <Th>SKU</Th>
              <Th>Name</Th>
              <Th>Source</Th>
              <Th>Customer</Th>
              <Th>UOM</Th>
              <Th right>Avg cost (₹)</Th>
              <Th>Flags</Th>
              <Th right>Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-500">
                  {items.length === 0
                    ? "No SKUs yet. Click “+ New plain SKU” to add the first."
                    : "No matches for the current filters."}
                </td>
              </tr>
            ) : (
              filtered.map((it) => {
                const isEditing = editingId === it.id;
                if (isEditing) {
                  return (
                    <tr key={it.id} className="bg-blue-50/40 dark:bg-blue-950/20">
                      <td className="px-3 py-2 align-top">
                        <Thumbnail item={it} />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs align-top">{it.sku}</td>
                      <td colSpan={6} className="px-3 py-2">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          <Field compact label="Name" value={editDraft.name} onChange={(v) => setEditDraft({ ...editDraft, name: v })} />
                          <Field compact label="Category" value={editDraft.category} onChange={(v) => setEditDraft({ ...editDraft, category: v })} />
                          <Field compact label="Brand" value={editDraft.brand} onChange={(v) => setEditDraft({ ...editDraft, brand: v })} />
                          <Select compact label="UOM" value={editDraft.uom} onChange={(v) => setEditDraft({ ...editDraft, uom: v })} options={UOM_OPTIONS} />
                          <Field compact label="Case pack" value={editDraft.case_pack} onChange={(v) => setEditDraft({ ...editDraft, case_pack: v })} type="number" />
                          <Select compact label="Source" value={editDraft.source} onChange={(v) => setEditDraft({ ...editDraft, source: v })} options={SOURCE_OPTIONS} />
                          <Field compact label="GSM" value={editDraft.gsm} onChange={(v) => setEditDraft({ ...editDraft, gsm: v })} type="number" />
                          <Field compact label="RM form" value={editDraft.rm_form} onChange={(v) => setEditDraft({ ...editDraft, rm_form: v })} />
                          <Field compact label="RM type" value={editDraft.rm_type} onChange={(v) => setEditDraft({ ...editDraft, rm_type: v })} />
                          <div className="sm:col-span-2 lg:col-span-3">
                            <Field compact label="Notes" value={editDraft.notes} onChange={(v) => setEditDraft({ ...editDraft, notes: v })} />
                          </div>
                          <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                            <input
                              type="checkbox"
                              checked={!!editDraft.needs_review}
                              onChange={(e) => setEditDraft({ ...editDraft, needs_review: e.target.checked })}
                              className="h-4 w-4 rounded border-gray-300"
                            />
                            Needs review (flag for FM)
                          </label>
                        </div>
                        {/* Photos panel — uploads, delete, "Make thumbnail". Owns its own
                            fetches so the parent's editDraft state is only fields. */}
                        <div className="mt-4 border-t border-blue-100 pt-3 dark:border-blue-900/40">
                          <PhotosPanel
                            item={it}
                            onItemUpdate={(updated) => setItems((prev) => prev.map((row) => (row.id === updated.id ? updated : row)))}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => { setEditingId(null); setEditDraft(null); }}
                            className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => saveEdit(it.id)}
                            disabled={busyId === it.id}
                            className="rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                          >
                            {busyId === it.id ? "Saving…" : "Save"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={it.id} className={`${it.is_active ? "" : "opacity-60"} hover:bg-gray-50 dark:hover:bg-gray-800/40`}>
                    <Td>
                      <Thumbnail item={it} />
                    </Td>
                    <Td mono>{it.sku}</Td>
                    <Td>
                      <div className="font-medium text-gray-900 dark:text-gray-100">{it.name}</div>
                      {it.brand && <div className="text-xs text-gray-500">{it.brand}</div>}
                    </Td>
                    <Td><SourceBadge source={it.source} /></Td>
                    <Td>{it.brand_customer || "—"}</Td>
                    <Td>{it.uom}</Td>
                    <Td right>{Number(it.avg_cost ?? 0).toFixed(2)}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {it.needs_review && <Pill tone="warn">Needs review</Pill>}
                        {it.parent_sku && <Pill tone="info">Variant of {it.parent_sku}</Pill>}
                        {!it.is_active && <Pill tone="muted">Inactive</Pill>}
                      </div>
                    </Td>
                    <Td right>
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => startEdit(it)}
                          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => toggleActive(it)}
                          disabled={busyId === it.id}
                          className={`rounded border px-2 py-1 text-xs font-medium disabled:opacity-60 ${
                            it.is_active
                              ? "border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-950/30"
                              : "border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                          }`}
                        >
                          {busyId === it.id ? "…" : it.is_active ? "Deactivate" : "Reactivate"}
                        </button>
                      </div>
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, mono, compact }) {
  return (
    <label className="block">
      <span className={`block ${compact ? "text-[11px]" : "text-xs"} font-medium text-gray-600 dark:text-gray-400`}>{label}</span>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`mt-1 w-full rounded-md border border-gray-300 bg-white ${compact ? "px-2 py-1 text-xs" : "px-3 py-2 text-sm"} dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 ${mono ? "font-mono" : ""}`}
      />
    </label>
  );
}

function Select({ label, value, onChange, options, compact }) {
  return (
    <label className="block">
      <span className={`block ${compact ? "text-[11px]" : "text-xs"} font-medium text-gray-600 dark:text-gray-400`}>{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 w-full rounded-md border border-gray-300 bg-white ${compact ? "px-2 py-1 text-xs" : "px-3 py-2 text-sm"} dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100`}
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

function Th({ children, right }) {
  return (
    <th className={`px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Td({ children, right, mono }) {
  return (
    <td className={`px-3 py-2 text-sm ${right ? "text-right" : ""} ${mono ? "font-mono text-xs text-gray-700 dark:text-gray-300" : "text-gray-900 dark:text-gray-100"}`}>
      {children}
    </td>
  );
}

const PILL_TONE = {
  warn:  "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  info:  "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  muted: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};
function Pill({ children, tone = "muted" }) {
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PILL_TONE[tone]}`}>{children}</span>;
}

// --------------- Photo UI atoms ---------------

function Thumbnail({ item }) {
  const first = item?.photos?.[0];
  if (!first) {
    return (
      <div className="flex h-12 w-12 items-center justify-center rounded-md border border-dashed border-gray-300 bg-gray-50 text-[9px] text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500">
        no photo
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={first.thumbnailUrl || first.url}
      alt={first.filename || "photo"}
      className="h-12 w-12 rounded-md border border-gray-200 object-contain dark:border-gray-800"
      loading="lazy"
    />
  );
}

// PhotosPanel — uploads, delete, "Make thumbnail". Mirrors the clearance
// 3-col grid but doesn't carry the shim-era quirks. After every mutation we
// fetch /api/warehouse/items/[id] which returns the normalized item with the
// fresh photos array.
function PhotosPanel({ item, onItemUpdate }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [error, setError] = useState(null);

  const photos = item.photos || [];

  async function refresh() {
    try {
      const res = await fetch(`/api/warehouse/items/${item.id}`);
      if (!res.ok) return;
      const data = await res.json();
      onItemUpdate?.(data.item);
    } catch {}
  }

  async function handleFiles(files) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of files) {
        if (!ALLOWED_PHOTO_TYPES.has(file.type)) {
          throw new Error(`"${file.name}": ${file.type || "unknown type"}. Allowed: JPEG / PNG / WebP / HEIC.`);
        }
        if (file.size > MAX_PHOTO_BYTES) {
          throw new Error(`"${file.name}" is ${formatBytes(file.size)}. Max 10 MB per file.`);
        }
        const base64 = await fileToBase64(file);
        const res = await fetch(`/api/warehouse/items/${item.id}/photos`, {
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
      }
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function deletePhoto(photoId) {
    if (!confirm("Delete this photo?")) return;
    setError(null);
    setBusyAction(true);
    try {
      const res = await fetch(`/api/warehouse/items/${item.id}/photos/${photoId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Delete failed (${res.status})`);
      }
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyAction(false);
    }
  }

  // Move the picked photo to position 0 (thumbnail), pushing the others back.
  async function makeThumbnail(photoId) {
    setError(null);
    setBusyAction(true);
    try {
      const orderedIds = [photoId, ...photos.filter((p) => p.id !== photoId).map((p) => p.id)];
      const res = await fetch(`/api/warehouse/items/${item.id}/photos`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordered_ids: orderedIds }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Reorder failed (${res.status})`);
      }
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyAction(false);
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
          Photos {photos.length > 0 && <span className="ml-1 text-gray-400">({photos.length})</span>}
        </h3>
        <span className="text-[11px] text-gray-500 dark:text-gray-500">
          First photo is the thumbnail. JPEG / PNG / WebP / HEIC, max 10 MB.
        </span>
      </div>
      {error && (
        <div className="mb-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">
          {error}
        </div>
      )}
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-6">
        {photos.map((p, idx) => (
          <div
            key={p.id}
            className={`group relative aspect-square overflow-hidden rounded-md border bg-gray-50 p-1 dark:bg-gray-800 ${
              idx === 0
                ? "border-blue-400 ring-1 ring-blue-300 dark:border-blue-600 dark:ring-blue-700"
                : "border-gray-200 dark:border-gray-700"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.thumbnailUrl || p.url}
              alt={p.filename || "photo"}
              className="h-full w-full object-contain"
              loading="lazy"
            />
            {idx === 0 && (
              <span className="pointer-events-none absolute left-1 top-1 rounded bg-blue-600 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
                Thumb
              </span>
            )}
            <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition group-hover:opacity-100">
              {idx > 0 && (
                <button
                  type="button"
                  onClick={() => makeThumbnail(p.id)}
                  disabled={busyAction}
                  title="Make thumbnail (move to first)"
                  aria-label="Make thumbnail"
                  className="rounded-full bg-white/90 p-1 text-gray-700 shadow-sm hover:bg-white hover:text-blue-600 disabled:opacity-40 dark:bg-gray-900/80 dark:text-gray-200 dark:hover:bg-gray-900"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                onClick={() => deletePhoto(p.id)}
                disabled={busyAction}
                title="Delete photo"
                aria-label={`Delete ${p.filename || "photo"}`}
                className="rounded-full bg-white/90 p-1 text-gray-700 shadow-sm hover:bg-white hover:text-red-600 disabled:opacity-40 dark:bg-gray-900/80 dark:text-gray-200 dark:hover:bg-gray-900"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || busyAction}
          className="flex aspect-square flex-col items-center justify-center gap-0.5 rounded-md border-2 border-dashed border-gray-300 text-[10px] font-medium text-gray-500 transition hover:border-blue-400 hover:text-blue-600 disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:border-blue-400 dark:hover:text-blue-400"
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
        accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
        multiple
        onChange={(e) => handleFiles(Array.from(e.target.files || []))}
        className="hidden"
      />
    </div>
  );
}

const SOURCE_TONE = {
  FG:        "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  RM:        "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  Clearance: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  Other:     "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};
function SourceBadge({ source }) {
  const cls = SOURCE_TONE[source] || SOURCE_TONE.Other;
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${cls}`}>{source || "—"}</span>;
}
