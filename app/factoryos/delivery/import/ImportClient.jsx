"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

// Target fields we import into. `required` ones must be mapped to a column.
const TARGETS = [
  { key: "poNumber", label: "PO #", required: true, hints: ["po", "po #", "po number", "po#"] },
  { key: "sku", label: "SKU", required: true, hints: ["sku", "item", "product", "description"] },
  { key: "poDate", label: "PO Date", required: false, hints: ["po date", "date", "order date"] },
  { key: "ordered", label: "Ordered", required: true, hints: ["ordered", "order qty", "qty", "quantity"] },
  { key: "received", label: "Received", required: false, hints: ["received", "grn", "delivered"] },
  { key: "rate", label: "Rate", required: false, hints: ["rate", "price", "₹", "unit price"] },
];

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim().length) || "";
  return firstLine.includes("\t") ? "\t" : ",";
}

// Minimal CSV/TSV line splitter that respects double-quoted fields.
function splitLine(line, delim) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseTable(text) {
  const delim = detectDelimiter(text);
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = splitLine(lines[0], delim);
  const rows = lines.slice(1).map((l) => splitLine(l, delim));
  return { headers, rows };
}

function autoMap(headers) {
  const map = {};
  const lc = headers.map((h) => h.toLowerCase());
  for (const t of TARGETS) {
    let idx = -1;
    for (const hint of t.hints) {
      idx = lc.findIndex((h) => h === hint);
      if (idx >= 0) break;
    }
    if (idx < 0) {
      for (const hint of t.hints) {
        idx = lc.findIndex((h) => h.includes(hint));
        if (idx >= 0) break;
      }
    }
    map[t.key] = idx;
  }
  return map;
}

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// Normalise common date strings to ISO (YYYY-MM-DD). Returns "" if unparseable.
function toIsoDate(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // "17 Feb 26" / "17 Feb 2026" / "17-Feb-26"
  let m = s.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,})[\s-]+(\d{2,4})$/);
  if (m) {
    const day = +m[1];
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    let yr = +m[3];
    if (yr < 100) yr += 2000;
    if (mon) return `${yr}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  // "17/02/26" or "17/02/2026" (DD/MM/YY)
  m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/);
  if (m) {
    const day = +m[1];
    const mon = +m[2];
    let yr = +m[3];
    if (yr < 100) yr += 2000;
    return `${yr}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return "";
}

function toNum(raw) {
  const s = String(raw ?? "").replace(/[, ₹]/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export default function ImportClient({ clients }) {
  const router = useRouter();
  const [clientId, setClientId] = useState(clients[0]?.id || "");
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState(null); // { headers, rows }
  const [map, setMap] = useState({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");

  function doParse(text) {
    const p = parseTable(text);
    setParsed(p.headers.length ? p : null);
    setMap(p.headers.length ? autoMap(p.headers) : {});
    setResult(null);
    setErr("");
  }

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      setRaw(text);
      doParse(text);
    };
    reader.readAsText(file);
  }

  // Build the structured rows from the current mapping.
  const mappedRows = useMemo(() => {
    if (!parsed) return [];
    const col = (key) => map[key];
    const val = (r, key) => {
      const i = col(key);
      return i >= 0 && i != null ? r[i] : "";
    };
    return parsed.rows
      .map((r) => ({
        poNumber: String(val(r, "poNumber") || "").trim(),
        sku: String(val(r, "sku") || "").trim(),
        poDate: toIsoDate(val(r, "poDate")),
        ordered: toNum(val(r, "ordered")),
        received: toNum(val(r, "received")) ?? 0,
        rate: toNum(val(r, "rate")),
      }))
      .filter((r) => r.poNumber || r.sku);
  }, [parsed, map]);

  const missingRequired = TARGETS.filter((t) => t.required && (map[t.key] == null || map[t.key] < 0));

  async function confirmImport() {
    setErr("");
    if (!clientId) { setErr("Pick a customer first."); return; }
    if (missingRequired.length) { setErr(`Map required columns: ${missingRequired.map((t) => t.label).join(", ")}`); return; }
    if (!mappedRows.length) { setErr("No rows to import."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/factoryos/delivery/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, rows: mappedRows }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Import failed");
      setResult(data);
      router.refresh();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const labelCls = "block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1";
  const inputCls =
    "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="mt-5 space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Customer</label>
          <select className={inputCls} value={clientId} onChange={(e) => setClientId(e.target.value)}>
            {clients.length === 0 && <option value="">No customers</option>}
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>…or upload a CSV</label>
          <input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={onFile} className="text-sm text-gray-600 dark:text-gray-300" />
        </div>
      </div>

      <div>
        <label className={labelCls}>Paste rows (include the header row)</label>
        <textarea
          rows={6}
          className={`${inputCls} font-mono text-xs`}
          placeholder={"PO #\tPO Date\tSKU\tOrdered\tReceived\tRate\n132537\t17 Feb 26\tab.Sealing Foil\t32000\t0\t0.72"}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onBlur={() => raw.trim() && doParse(raw)}
        />
        <button
          onClick={() => doParse(raw)}
          disabled={!raw.trim()}
          className="mt-2 px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200"
        >
          Parse
        </button>
      </div>

      {parsed && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 dark:bg-gray-900 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Match columns</h2>
          <div className="grid sm:grid-cols-3 gap-3">
            {TARGETS.map((t) => (
              <div key={t.key}>
                <label className={labelCls}>
                  {t.label}{t.required && <span className="text-red-500"> *</span>}
                </label>
                <select
                  className={inputCls}
                  value={map[t.key] ?? -1}
                  onChange={(e) => setMap({ ...map, [t.key]: Number(e.target.value) })}
                >
                  <option value={-1}>— none —</option>
                  {parsed.headers.map((h, i) => (
                    <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {parsed && mappedRows.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 dark:bg-gray-900 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
            Preview ({mappedRows.length} line{mappedRows.length === 1 ? "" : "s"})
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400">
                  <th className="py-1 pr-3">PO #</th>
                  <th className="py-1 pr-3">SKU</th>
                  <th className="py-1 pr-3">PO Date</th>
                  <th className="py-1 pr-3 text-right">Ordered</th>
                  <th className="py-1 pr-3 text-right">Received</th>
                  <th className="py-1 pr-3 text-right">Balance</th>
                  <th className="py-1 pr-3 text-right">Rate</th>
                </tr>
              </thead>
              <tbody>
                {mappedRows.slice(0, 100).map((r, i) => (
                  <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="py-1 pr-3">{r.poNumber || <span className="text-red-500">—</span>}</td>
                    <td className="py-1 pr-3">{r.sku || <span className="text-red-500">—</span>}</td>
                    <td className="py-1 pr-3">{r.poDate || <span className="text-gray-400">—</span>}</td>
                    <td className="py-1 pr-3 text-right">{r.ordered ?? "—"}</td>
                    <td className="py-1 pr-3 text-right">{r.received ?? 0}</td>
                    <td className="py-1 pr-3 text-right">{r.ordered != null ? Math.max(0, r.ordered - (r.received || 0)) : "—"}</td>
                    <td className="py-1 pr-3 text-right">{r.rate ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {mappedRows.length > 100 && (
              <p className="text-[11px] text-gray-400 mt-2">…and {mappedRows.length - 100} more (all will be imported).</p>
            )}
          </div>
          <button
            onClick={confirmImport}
            disabled={busy || missingRequired.length > 0}
            className="mt-4 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Importing…" : `Import ${mappedRows.length} line${mappedRows.length === 1 ? "" : "s"}`}
          </button>
        </div>
      )}

      {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm dark:bg-green-900/20 dark:border-green-900">
          <p className="font-medium text-green-800 dark:text-green-300">
            Imported: {result.summary.created} created · {result.summary.updated} updated
            {result.summary.skipped ? ` · ${result.summary.skipped} skipped` : ""}
            {result.summary.error ? ` · ${result.summary.error} errored` : ""}
          </p>
          <a href="/factoryos/delivery" className="inline-block mt-2 text-blue-600 dark:text-blue-400 underline">
            Go to the Delivery Plan board →
          </a>
        </div>
      )}
    </div>
  );
}
