"use client";
import { useEffect, useRef, useState } from "react";
import { inputCls, labelCls } from "@/app/factoryos/_components/ui";

const num = (n) => (typeof n === "number" ? n.toLocaleString("en-IN") : n);

// Zoho SO number with a live, read-only lookup (customer, date, status, items
// and quantities — never rates). Calls onResolved(so | null) after each check
// so the parent can prefill the PO number or block saving.
export default function ZohoSoField({ value, onChange, onResolved, required = true, label = "Zoho SO number", currentJobId = null }) {
  const [state, setState] = useState({ loading: false, so: null, error: "", linkedJobs: [], checked: "" });
  const timer = useRef(null);

  async function check(raw) {
    const v = String(raw || "").trim();
    if (!v) { setState({ loading: false, so: null, error: "", linkedJobs: [], checked: "" }); onResolved && onResolved(null); return; }
    setState((s) => ({ ...s, loading: true, error: "" }));
    const res = await fetch(`/api/factoryos/zoho/so?number=${encodeURIComponent(v)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setState({ loading: false, so: null, error: data.error || "Lookup failed", linkedJobs: [], checked: v }); onResolved && onResolved(null); return; }
    if (!data.found) { setState({ loading: false, so: null, error: `${data.number} is not in Zoho`, linkedJobs: [], checked: v }); onResolved && onResolved(null); return; }
    const others = (data.linkedJobs || []).filter((j) => j.id !== currentJobId);
    if (others.length) {
      // One SO, one job (Arjun, 18-Nov-2026).
      setState({ loading: false, so: data.so, error: `${data.number} already has job J# ${others.map((j) => j.jNumber).join(", ")}. One SO, one job.`, linkedJobs: others, checked: v });
      onResolved && onResolved(null);
      return;
    }
    setState({ loading: false, so: data.so, error: "", linkedJobs: [], checked: v });
    onResolved && onResolved(data.so);
  }

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => check(value), 600);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const so = state.so;
  return (
    <div className="sm:col-span-2">
      <label className={labelCls}>{label} {required && <span className="text-red-500">*</span>}</label>
      <input
        className={`${inputCls} max-w-xs font-mono`}
        value={value}
        placeholder="SO-14612"
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => check(value)}
      />
      {state.loading && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Checking Zoho…</p>}
      {state.error && !state.loading && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{state.error}</p>}
      {so && !state.loading && (
        <div className={`mt-2 rounded-lg border px-3 py-2 text-xs ${so.status === "void" ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-900/20" : "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-900/20"} text-gray-800 dark:text-gray-200`}>
          <div className="font-medium">
            {so.number} · {so.customer} · {so.date} · <span className="uppercase">{so.status}</span>
            {so.reference ? <> · ref {so.reference}</> : null}
          </div>
          {so.lines && so.lines.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {so.lines.slice(0, 8).map((l, i) => (
                <li key={i}>{l.name} — {num(l.qty)} {l.unit}{l.invoiced ? ` (${num(l.invoiced)} invoiced)` : ""}</li>
              ))}
              {so.lines.length > 8 && <li>+ {so.lines.length - 8} more lines</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
