"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";

// Column header the CSV is parsed against — kept in sync with
// lib/warehouse/importStock.js IMPORT_COLUMNS.
const TEMPLATE =
  "sku,name,qty,unit_cost,location_code,category,uom,brand,case_pack,source,gsm\n" +
  "CUP-DW-8OZ-PLAIN,8 oz DW paper cup (plain),50000,2.85,BWD-FG-A,Paper Cup,pcs,Aeros,1000,FG,280\n";

// Minimal client-side CSV → objects (mirror of the server parser so the
// preview request sends structured rows, not raw text).
function parseCsv(text) {
  const rows = [];
  let field = "", row = [], inQuotes = false;
  const s = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); field = ""; row = []; }
    else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => String(cell).trim() !== ""));
}
function csvToObjects(text) {
  const grid = parseCsv(text);
  if (!grid.length) return [];
  const headers = grid[0].map((h) => String(h).trim().toLowerCase().replace(/\s+/g, "_"));
  return grid.slice(1).map((cells) => {
    const o = {};
    headers.forEach((h, i) => { o[h] = cells[i] != null ? String(cells[i]).trim() : ""; });
    return o;
  });
}

function fmtINR(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default function ImportClient({ locations }) {
  const fileRef = useRef(null);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState(null);   // { rows, summary }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);          // commit result
  const [reference, setReference] = useState("");
  const [movementDate, setMovementDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [ackWarnings, setAckWarnings] = useState(false);

  const rawRows = useMemo(() => csvToObjects(text), [text]);

  function loadFile(file) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => { setText(String(r.result || "")); setPreview(null); setDone(null); setError(""); };
    r.readAsText(file);
  }

  async function runPreview() {
    setError(""); setDone(null);
    if (rawRows.length === 0) { setError("No rows found — paste or upload a CSV with a header row."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/warehouse/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "preview", rows: rawRows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Preview failed");
      setPreview(data);
      setAckWarnings(false);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function commit() {
    if (!preview) return;
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/warehouse/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "commit", rows: rawRows, reference, movementDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setDone(data.result);
      setPreview(null);
      setText("");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "opening-stock-template.csv";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  const s = preview?.summary;
  const warnCount = s?.warnings || 0;
  const canCommit = s && s.total > 0 && s.errors === 0 && (warnCount === 0 || ackWarnings);

  // ---- success state ----
  if (done) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-900/40 dark:bg-emerald-950/30">
        <h2 className="text-lg font-semibold text-emerald-900 dark:text-emerald-200">Opening stock imported</h2>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Movement" value={done.movement_no || "—"} />
          <Stat label="Lines posted" value={Number(done.lines_posted || 0).toLocaleString("en-IN")} />
          <Stat label="Items created" value={Number(done.items_created || 0).toLocaleString("en-IN")} />
          <Stat label="Opening value" value={fmtINR(done.total_value)} />
        </dl>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/warehouse/inventory" className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
            View Stock Position →
          </Link>
          {done.movement_id && (
            <Link href={`/warehouse/inventory/movements/${done.movement_id}`} className="rounded-md border border-emerald-300 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 dark:text-emerald-200">
              View movement
            </Link>
          )}
          <button onClick={() => setDone(null)} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300">
            Import another batch
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Instructions */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-300">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium text-gray-900 dark:text-gray-100">CSV format</p>
          <button onClick={downloadTemplate} className="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
            Download template
          </button>
        </div>
        <p className="mt-2">
          Header row required. <strong>sku</strong>, <strong>qty</strong>, <strong>location_code</strong> are mandatory;
          <strong> name</strong> is required for new SKUs; <strong>unit_cost</strong> is strongly recommended (seeds ₹ value).
          One row per (SKU × location) — the same SKU can appear in several zones.
        </p>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Locations: {locations.map((l) => l.code).join(" · ") || "none configured"}
        </p>
      </div>

      {/* Input */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => fileRef.current?.click()} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
            Upload CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => loadFile(e.target.files?.[0])} />
          <span className="text-xs text-gray-500 dark:text-gray-400">…or paste below</span>
          {rawRows.length > 0 && (
            <span className="text-xs text-gray-500 dark:text-gray-400">{rawRows.length} data row{rawRows.length === 1 ? "" : "s"} detected</span>
          )}
        </div>
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setPreview(null); setDone(null); }}
          rows={8}
          placeholder={TEMPLATE}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={runPreview}
            disabled={busy || rawRows.length === 0}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy && !preview ? "Validating…" : "Validate & preview"}
          </button>
          {error && <span className="text-sm text-red-700 dark:text-red-300">{error}</span>}
        </div>
      </div>

      {/* Preview */}
      {preview && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Kpi label="Rows" value={s.total} />
            <Kpi label="Ready" value={s.ready} tone={s.ready ? "ok" : "default"} />
            <Kpi label="Errors" value={s.errors} tone={s.errors ? "err" : "default"} />
            <Kpi label="New SKUs" value={s.newItems} />
            <Kpi label="Opening value" value={fmtINR(s.totalValue)} />
          </div>

          {s.errors > 0 && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
              {s.errors} row(s) have blocking errors. Opening loads are all-or-nothing — fix the CSV and re-validate.
            </div>
          )}

          {/* Row table */}
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
            <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr>
                  <Th>#</Th><Th>SKU</Th><Th>Name</Th><Th>Item</Th><Th>Location</Th>
                  <Th right>Qty</Th><Th right>Unit ₹</Th><Th right>Line ₹</Th><Th>Status</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
                {preview.rows.map((r) => (
                  <tr key={r.idx} className={r.errors.length ? "bg-red-50/50 dark:bg-red-950/20" : r.warnings.length ? "bg-amber-50/40 dark:bg-amber-950/15" : ""}>
                    <Td>{r.idx + 1}</Td>
                    <Td mono>{r.sku || "—"}</Td>
                    <Td>{r.name || "—"}</Td>
                    <Td>{r.itemStatus === "new" ? <Pill tone="info">new</Pill> : <Pill tone="muted">existing</Pill>}</Td>
                    <Td mono>{r.locationCode || "—"}</Td>
                    <Td right>{r.qty != null ? r.qty.toLocaleString("en-IN") : "—"}</Td>
                    <Td right>{r.unitCost != null ? r.unitCost : "—"}</Td>
                    <Td right>{r.qty != null && r.unitCost != null ? fmtINR(r.qty * r.unitCost) : "—"}</Td>
                    <Td>
                      {r.errors.length > 0 ? (
                        <span className="text-xs text-red-700 dark:text-red-300">{r.errors.join("; ")}</span>
                      ) : r.warnings.length > 0 ? (
                        <span className="text-xs text-amber-700 dark:text-amber-300">{r.warnings.join("; ")}</span>
                      ) : (
                        <span className="text-xs text-emerald-700 dark:text-emerald-400">ready</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Commit controls */}
          {s.errors === 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="block text-xs font-medium text-gray-600 dark:text-gray-400">Reference (shown on the movement)</span>
                  <input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="Opening audit — Jun 2026"
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-gray-600 dark:text-gray-400">Movement date</span>
                  <input
                    type="date"
                    value={movementDate}
                    onChange={(e) => setMovementDate(e.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                  />
                </label>
              </div>

              {warnCount > 0 && (
                <label className="mt-3 flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200">
                  <input type="checkbox" checked={ackWarnings} onChange={(e) => setAckWarnings(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300" />
                  <span>
                    {warnCount} row(s) carry warnings (already-stocked locations or in-file duplicates) — these post and
                    <strong> add</strong> to existing stock. I've reviewed them.
                  </span>
                </label>
              )}

              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={commit}
                  disabled={busy || !canCommit}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {busy ? "Posting…" : `Post opening stock (${s.ready} line${s.ready === 1 ? "" : "s"})`}
                </button>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Posts one opening Inward. Run once per batch — re-running double-counts.
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">{label}</dt>
      <dd className="mt-1 font-mono text-sm text-emerald-900 dark:text-emerald-100">{value}</dd>
    </div>
  );
}
function Kpi({ label, value, tone = "default" }) {
  const cls = tone === "ok" ? "text-emerald-700 dark:text-emerald-300"
    : tone === "err" ? "text-red-700 dark:text-red-300"
    : "text-gray-900 dark:text-gray-100";
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
      <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
function Th({ children, right }) {
  return <th className={`px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 ${right ? "text-right" : "text-left"}`}>{children}</th>;
}
function Td({ children, right, mono }) {
  return <td className={`px-3 py-2 ${right ? "text-right" : ""} ${mono ? "font-mono text-xs text-gray-700 dark:text-gray-300" : "text-gray-900 dark:text-gray-100"}`}>{children}</td>;
}
const PILL = {
  info: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  muted: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};
function Pill({ children, tone = "muted" }) {
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${PILL[tone]}`}>{children}</span>;
}
