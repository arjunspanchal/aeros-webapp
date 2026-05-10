"use client";

import { useMemo, useRef, useState } from "react";

// Keyline = KLD = outline (same artefact). Collapsing keeps uploaders
// from agonising over which dropdown value to pick.
const FILE_TYPES = ["Keyline", "Mockup", "Other"];
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // mirrors server cap

const filterSelectCls =
  "rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100";

const inputCls =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500";

export default function DesignClient({ initialProducts, canManage }) {
  const [products, setProducts] = useState(initialProducts);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [hasFilesFilter, setHasFilesFilter] = useState(""); // "" | "with" | "without"

  const categories = useMemo(() => {
    const set = new Set();
    products.forEach((p) => p.category && set.add(p.category));
    return Array.from(set).sort();
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryFilter && p.category !== categoryFilter) return false;
      if (hasFilesFilter === "with" && p.fileCount === 0) return false;
      if (hasFilesFilter === "without" && p.fileCount > 0) return false;
      if (!q) return true;
      const hay = `${p.productName} ${p.sku} ${p.category} ${p.material} ${p.colour} ${p.sizeVolume}`.toLowerCase();
      return hay.includes(q);
    });
  }, [products, search, categoryFilter, hasFilesFilter]);

  function bumpFileCount(productId, delta, fileType) {
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== productId) return p;
        const filesByType = { ...(p.filesByType || {}) };
        if (fileType) {
          filesByType[fileType] = Math.max(0, (filesByType[fileType] || 0) + delta);
        }
        return {
          ...p,
          fileCount: Math.max(0, p.fileCount + delta),
          filesByType,
        };
      }),
    );
  }

  return (
    <div>
      {/* Filter bar */}
      <div className="mb-6 space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-wrap gap-3">
          <input
            type="search"
            placeholder="Search by product name, SKU, material, colour…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
          />
          <select
            className={filterSelectCls}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Category"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            className={filterSelectCls}
            value={hasFilesFilter}
            onChange={(e) => setHasFilesFilter(e.target.value)}
            aria-label="File presence"
          >
            <option value="">All products</option>
            <option value="with">Has design files</option>
            <option value="without">No files yet</option>
          </select>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {filtered.length} of {products.length} products shown
          {!canManage && " · view-only — ask Admin / FM / FE for upload access"}
        </p>
      </div>

      {/* Product list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
            No products match your filters.
          </div>
        ) : (
          filtered.map((p) => (
            <ProductRow
              key={p.id}
              product={p}
              canManage={canManage}
              onFileAdded={(fileType) => bumpFileCount(p.id, +1, fileType)}
              onFileRemoved={(fileType) => bumpFileCount(p.id, -1, fileType)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// Product row — collapsed by default (just summary + file count). Click
// the chevron / row to expand and load the file list lazily.
function ProductRow({ product, canManage, onFileAdded, onFileRemoved }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [error, setError] = useState(null);

  async function ensureLoaded() {
    if (files !== null || loadingFiles) return;
    setLoadingFiles(true);
    setError(null);
    try {
      const res = await fetch(`/api/design/products/${product.id}/files`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Load failed (${res.status})`);
      }
      const { files: list } = await res.json();
      setFiles(list || []);
    } catch (e) {
      setError(e.message);
      setFiles([]);
    } finally {
      setLoadingFiles(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) ensureLoaded();
  }

  function handleFileAdded(file) {
    setFiles((prev) => [file, ...(prev || [])]);
    onFileAdded?.(file.fileType);
  }
  function handleFileRemoved(fileId, fileType) {
    setFiles((prev) => (prev || []).filter((f) => f.id !== fileId));
    onFileRemoved?.(fileType);
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      {/* Header — clickable to expand */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/40"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <ChevronIcon open={open} />
            <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
              {product.productName}
            </h3>
          </div>
          <div className="mt-1 ml-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
            {product.sku && (
              <span className="font-mono text-gray-400 dark:text-gray-500">{product.sku}</span>
            )}
            {product.category && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 dark:bg-gray-800 dark:text-gray-300">
                {product.category}
              </span>
            )}
            {product.sizeVolume && <span>{product.sizeVolume}</span>}
            {product.material && <span>{product.material}</span>}
            {product.colour && <span>{product.colour}</span>}
            {product.gsm != null && <span>{product.gsm} gsm</span>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={
              "rounded-full px-2.5 py-0.5 text-xs font-medium " +
              (product.fileCount > 0
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400")
            }
          >
            {product.fileCount === 0
              ? "No files"
              : `${product.fileCount} file${product.fileCount === 1 ? "" : "s"}`}
          </span>
          {product.fileCount > 0 && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
              {summariseTypes(product.filesByType)}
            </span>
          )}
        </div>
      </button>

      {/* Expanded panel */}
      {open && (
        <div className="border-t border-gray-200 px-4 py-3 dark:border-gray-800">
          {loadingFiles && (
            <p className="text-xs text-gray-500 dark:text-gray-400">Loading files…</p>
          )}
          {error && (
            <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </p>
          )}
          {files && files.length === 0 && !loadingFiles && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              No design files attached yet.
              {canManage ? " Upload one below." : " Ask the design team to upload."}
            </p>
          )}
          {files && files.length > 0 && (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {files.map((f) => (
                <FileRow
                  key={f.id}
                  file={f}
                  canManage={canManage}
                  onDeleted={() => handleFileRemoved(f.id, f.fileType)}
                />
              ))}
            </ul>
          )}

          {canManage && (
            <UploadForm productId={product.id} onUploaded={handleFileAdded} />
          )}
        </div>
      )}
    </div>
  );
}

function FileRow({ file, canManage, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  async function handleDelete() {
    if (!confirm(`Delete "${file.filename}"?`)) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/design/files/${file.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Delete failed (${res.status})`);
      }
      onDeleted?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
            {file.fileType}
          </span>
          <span className="truncate text-sm text-gray-900 dark:text-gray-100">{file.filename}</span>
        </div>
        <div className="ml-1 mt-0.5 flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
          {file.sizeBytes != null && <span>{formatBytes(file.sizeBytes)}</span>}
          {file.uploadedBy && <span>· by {file.uploadedBy}</span>}
          {file.createdAt && <span>· {formatDate(file.createdAt)}</span>}
        </div>
        {file.notes && (
          <p className="ml-1 mt-1 text-[11px] italic text-gray-500 dark:text-gray-400">{file.notes}</p>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <a
          href={`/api/design/files/${file.id}/download`}
          download={file.filename}
          className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
          </svg>
          Download
        </a>
        {canManage && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-red-50 hover:text-red-700 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-red-900/30 dark:hover:text-red-300"
            aria-label={`Delete ${file.filename}`}
            title="Delete"
          >
            {deleting ? "…" : "✕"}
          </button>
        )}
      </div>
      {error && (
        <p className="ml-2 text-[11px] text-red-600 dark:text-red-400">{error}</p>
      )}
    </li>
  );
}

function UploadForm({ productId, onUploaded }) {
  const fileRef = useRef(null);
  const [fileType, setFileType] = useState("Keyline");
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  async function handleFiles(files) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      // Upload sequentially so errors map cleanly to filenames.
      for (const file of files) {
        if (file.size > MAX_UPLOAD_BYTES) {
          throw new Error(`"${file.name}" is ${formatBytes(file.size)}. Max 8 MB per file.`);
        }
        const base64 = await fileToBase64(file);
        const res = await fetch(`/api/design/products/${productId}/files`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type || "application/octet-stream",
            fileBase64: base64,
            fileType,
            notes,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Upload failed (${res.status})`);
        }
        const { file: created } = await res.json();
        onUploaded?.(created);
      }
      setNotes("");
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="mt-3 rounded-md border border-dashed border-gray-300 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/40">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
        Upload design file
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Type</span>
          <select
            value={fileType}
            onChange={(e) => setFileType(e.target.value)}
            className={inputCls}
          >
            {FILE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Notes (optional)</span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. v2 — single-piece blank, 5mm bleed"
            className={inputCls}
          />
        </label>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {uploading ? "Uploading…" : "Choose file(s) to upload"}
        </button>
        <span className="text-[10px] text-gray-500 dark:text-gray-400">
          PDF · KLD · AI · EPS · SVG · DXF · DWG · ZIP · PNG · JPG · WEBP. Max 8 MB.
        </span>
      </div>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept=".pdf,.kld,.ai,.eps,.svg,.dxf,.dwg,.zip,.png,.jpg,.jpeg,.webp,application/pdf,application/postscript,image/svg+xml,application/zip,image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => handleFiles(Array.from(e.target.files || []))}
      />
      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}

// ---------- helpers ----------

function ChevronIcon({ open }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-90" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function summariseTypes(byType) {
  const entries = Object.entries(byType || {});
  if (entries.length === 0) return "";
  return entries.map(([k, v]) => `${v} ${k}`).join(" · ");
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error("read error"));
    reader.readAsDataURL(file);
  });
}
