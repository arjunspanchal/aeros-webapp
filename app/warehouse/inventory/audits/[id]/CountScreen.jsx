"use client";

// Mobile-friendly counting UI for an audit.
// Features:
//   • Quick-jump bar with manual SKU entry + camera scan (BarcodeDetector
//     where available; falls back to plain manual entry)
//   • Blind count toggle: hides system_qty until counter has typed a value
//   • "Uncounted only" filter to skip done lines
//   • Inline qty input per line; saves on blur or Enter
//   • Add ad-hoc line button (counter found unaccounted stock)

import { useEffect, useMemo, useRef, useState } from "react";

export default function CountScreen({ audit, items, locations, currentUserEmail, locked, onLineUpdated }) {
  const [lines, setLines] = useState(audit.lines);
  // Sync when parent refreshes the audit
  useEffect(() => { setLines(audit.lines); }, [audit.lines]);

  const [blind, setBlind] = useState(true);
  const [filter, setFilter] = useState("uncounted"); // 'uncounted' | 'all' | 'variance'
  const [search, setSearch] = useState("");
  const [scanFeedback, setScanFeedback] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [busyLineId, setBusyLineId] = useState(null);
  const [err, setErr] = useState("");

  const focusRefs = useRef({});

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lines.filter((l) => {
      if (filter === "uncounted" && l.counted_qty != null) return false;
      if (filter === "variance"  && (l.counted_qty == null || Number(l.variance) === 0)) return false;
      if (!q) return true;
      return (
        (l.inventory_items?.sku || "").toLowerCase().includes(q) ||
        (l.inventory_items?.name || "").toLowerCase().includes(q) ||
        (l.inventory_locations?.code || "").toLowerCase().includes(q)
      );
    });
  }, [lines, filter, search]);

  function focusLine(lineId) {
    setTimeout(() => {
      const el = focusRefs.current[lineId];
      if (el) {
        el.focus();
        el.select();
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 0);
  }

  function handleManualScan(text) {
    const v = (text || "").trim();
    if (!v) return;
    // Match by SKU exact, then by SKU prefix
    const sku = v.toUpperCase();
    const matchingLines = lines.filter((l) => (l.inventory_items?.sku || "").toUpperCase() === sku);
    if (matchingLines.length === 0) {
      // Try prefix
      const partials = lines.filter((l) => (l.inventory_items?.sku || "").toUpperCase().startsWith(sku));
      if (partials.length === 1) { focusLine(partials[0].id); setScanFeedback(`→ ${partials[0].inventory_items?.sku} @ ${partials[0].inventory_locations?.code}`); return; }
      setScanFeedback(`No matching line for "${v}"`);
      return;
    }
    if (matchingLines.length === 1) {
      focusLine(matchingLines[0].id);
      setScanFeedback(`→ ${matchingLines[0].inventory_items?.sku} @ ${matchingLines[0].inventory_locations?.code}`);
    } else {
      // Multiple locations for same SKU — focus first uncounted; user can scroll
      const first = matchingLines.find((l) => l.counted_qty == null) || matchingLines[0];
      focusLine(first.id);
      setScanFeedback(`${matchingLines.length} locations for ${first.inventory_items?.sku} — focused first uncounted`);
    }
  }

  async function saveCount(line, raw) {
    setErr("");
    setBusyLineId(line.id);
    try {
      const res = await fetch(`/api/warehouse/audits/${audit.id}/count`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          line_id: line.id,
          counted_qty: raw === "" ? null : raw,
          remarks: line.remarks || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      // Patch state
      setLines((prev) => prev.map((l) => l.id === line.id ? { ...l, ...data.line } : l));
      onLineUpdated?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusyLineId(null);
    }
  }

  return (
    <div className="mt-4 space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <ScanBar
          onScan={handleManualScan}
          openScanner={() => setScannerOpen(true)}
          disabled={locked}
        />
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={blind} onChange={(e) => setBlind(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
            Blind count
          </label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            <option value="uncounted">Uncounted only</option>
            <option value="variance">Variances only</option>
            <option value="all">All lines</option>
          </select>
        </div>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search SKU, name, or location…"
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 sm:max-w-md"
      />

      {scanFeedback && (
        <div className="rounded border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
          {scanFeedback}
        </div>
      )}
      {err && <div className="rounded border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-800">{err}</div>}

      {/* Lines list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="rounded-md border border-dashed border-gray-300 bg-white py-12 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900">
            {filter === "uncounted" && lines.every((l) => l.counted_qty != null)
              ? "All lines counted. Switch to “All lines” to review or close counting from the action bar above."
              : "No matching lines."}
          </p>
        ) : (
          filtered.map((l) => (
            <LineCard
              key={l.id}
              line={l}
              blind={blind}
              locked={locked}
              busy={busyLineId === l.id}
              focusRef={(el) => { if (el) focusRefs.current[l.id] = el; }}
              onSave={(raw) => saveCount(l, raw)}
            />
          ))
        )}
      </div>

      {/* Ad-hoc add (counter found unaccounted stock) */}
      {!locked && (
        <AddAdHocLine
          auditId={audit.id}
          items={items}
          locations={locations}
          existing={lines}
          onAdded={async () => { await onLineUpdated?.(); }}
        />
      )}

      {/* Camera barcode scanner modal */}
      {scannerOpen && (
        <CameraScannerModal
          onClose={() => setScannerOpen(false)}
          onCode={(code) => { setScannerOpen(false); handleManualScan(code); }}
        />
      )}
    </div>
  );
}

// ---------------- LineCard ----------------

function LineCard({ line, blind, locked, busy, focusRef, onSave }) {
  const [draft, setDraft] = useState(line.counted_qty == null ? "" : String(line.counted_qty));
  const [touched, setTouched] = useState(line.counted_qty != null);
  useEffect(() => {
    setDraft(line.counted_qty == null ? "" : String(line.counted_qty));
    setTouched(line.counted_qty != null);
  }, [line.counted_qty]);

  const counted = line.counted_qty != null;
  const variance = counted ? Number(line.variance || 0) : null;
  const showSystem = !blind || touched || counted;

  function commit() {
    const v = draft.trim();
    if (v === "" && line.counted_qty == null) return;        // nothing to save
    if (v !== "" && Number(v) === Number(line.counted_qty)) return; // unchanged
    onSave(v);
  }

  return (
    <div className={`rounded-lg border p-3 ${
      counted
        ? variance === 0
          ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20"
          : "border-amber-200 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20"
        : "border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
    }`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-xs text-gray-600 dark:text-gray-400">
            {line.inventory_items?.sku} · {line.inventory_locations?.code}
          </div>
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {line.inventory_items?.name}
            {line.inventory_items?.brand_customer && (
              <span className="ml-1 text-xs text-gray-500">· {line.inventory_items.brand_customer}</span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">System</div>
          <div className="font-mono text-sm text-gray-900 dark:text-gray-100">
            {showSystem
              ? `${Number(line.system_qty).toLocaleString("en-IN", { maximumFractionDigits: 4 })} ${line.inventory_items?.uom || ""}`
              : "●●●"}
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <input
          ref={focusRef}
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          disabled={locked || busy}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setTouched(true)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") { e.target.blur(); } }}
          placeholder="Counted qty"
          className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-base font-semibold dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
        {counted && (
          <span className={`rounded px-2 py-1 text-xs font-semibold ${
            variance === 0
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
              : variance > 0
              ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
              : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
          }`}>
            {variance === 0 ? "match" : `${variance > 0 ? "+" : ""}${variance}`}
          </span>
        )}
        {busy && <span className="text-xs text-gray-500">saving…</span>}
      </div>
    </div>
  );
}

// ---------------- ScanBar ----------------

function ScanBar({ onScan, openScanner, disabled }) {
  const [text, setText] = useState("");
  const supportsBarcode = typeof window !== "undefined" && "BarcodeDetector" in window;
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onScan(text); setText(""); }}
      className="flex flex-1 items-center gap-2"
    >
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Scan or type SKU then Enter"
        disabled={disabled}
        className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
      />
      <button type="submit" disabled={disabled} className="rounded-md bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-40">
        Find
      </button>
      {supportsBarcode && (
        <button
          type="button"
          onClick={openScanner}
          disabled={disabled}
          className="rounded-md border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          title="Scan with camera"
        >
          📷 Scan
        </button>
      )}
    </form>
  );
}

// ---------------- Camera scanner modal ----------------

function CameraScannerModal({ onClose, onCode }) {
  const videoRef = useRef(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let stream;
    let detector;
    let raf;
    let stopped = false;

    async function start() {
      try {
        if (!("BarcodeDetector" in window)) {
          setError("Barcode scanner not supported in this browser. Use the manual entry box.");
          return;
        }
        const supported = await window.BarcodeDetector.getSupportedFormats?.() || [];
        const formats = ["code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e", "qr_code"]
          .filter((f) => supported.length === 0 || supported.includes(f));
        detector = new window.BarcodeDetector({ formats });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setRunning(true);
          tick();
        }
      } catch (e) {
        setError(e.message || "Camera unavailable");
      }
    }
    async function tick() {
      if (stopped || !videoRef.current) return;
      try {
        const codes = await detector.detect(videoRef.current);
        if (codes && codes[0]) {
          stopped = true;
          onCode(codes[0].rawValue);
          return;
        }
      } catch {}
      raf = requestAnimationFrame(tick);
    }
    start();
    return () => {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-4 dark:bg-gray-900">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Scan barcode</h3>
          <button onClick={onClose} className="text-2xl leading-none text-gray-400 hover:text-gray-600">×</button>
        </div>
        <div className="mt-3 aspect-[4/3] overflow-hidden rounded-md bg-black">
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        {running && !error && <p className="mt-2 text-xs text-gray-500">Point at a Code-128 / Code-39 / QR / EAN / UPC barcode.</p>}
      </div>
    </div>
  );
}

// ---------------- Add ad-hoc line ----------------

function AddAdHocLine({ auditId, items, locations, existing, onAdded }) {
  const [open, setOpen] = useState(false);
  const [itemId, setItemId] = useState("");
  const [locationId, setLocationId] = useState(locations[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function add() {
    if (!itemId || !locationId) { setErr("Pick item and location"); return; }
    // Avoid dupes already in scope
    const exists = existing.some((l) => l.item_id === itemId && l.location_id === locationId);
    if (exists) { setErr("That (item, location) is already in the audit"); return; }
    setBusy(true); setErr("");
    try {
      const res = await fetch(`/api/warehouse/audits/${auditId}/lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId, location_id: locationId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Add failed");
      setOpen(false); setItemId("");
      await onAdded?.();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
      >
        + Add line (found unaccounted stock)
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/40">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <select
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        >
          <option value="">— Pick SKU —</option>
          {items.map((i) => <option key={i.id} value={i.id}>{i.sku} — {i.name}</option>)}
        </select>
        <select
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        >
          {locations.map((l) => <option key={l.id} value={l.id}>{l.code}</option>)}
        </select>
      </div>
      {err && <div className="mt-2 text-xs text-red-700">{err}</div>}
      <div className="mt-2 flex justify-end gap-2">
        <button onClick={() => setOpen(false)} className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">Cancel</button>
        <button onClick={add} disabled={busy} className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
          {busy ? "Adding…" : "Add line"}
        </button>
      </div>
    </div>
  );
}
