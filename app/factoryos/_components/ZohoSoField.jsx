"use client";
import { useEffect, useRef, useState } from "react";
import { inputCls, labelCls } from "@/app/factoryos/_components/ui";

const num = (n) => (typeof n === "number" ? n.toLocaleString("en-IN") : n);
const EMPTY = { loading: false, so: null, error: "", warn: "", linkedJobs: [], checked: "" };

// Zoho SO number with a live, read-only lookup (customer, date, status, items
// and quantities — never rates). One job per SO ITEM (Arjun, 18-Nov-2026): an
// SO with several items shows them as choices, and an item that already has a
// job is greyed out. Calls onResolved(so | null) after each check so the
// parent can prefill or block saving, and onLineChange(lineId, line) when the
// item is picked (straight away when the SO has only one).
export default function ZohoSoField({ value, onChange, onResolved, lineId = "", onLineChange, required = true, label = "Zoho SO number", currentJobId = null }) {
  const [state, setState] = useState(EMPTY);
  const timer = useRef(null);

  async function check(raw) {
    const v = String(raw || "").trim();
    if (!v) { setState(EMPTY); onResolved && onResolved(null); return; }
    setState((s) => ({ ...s, loading: true, error: "", warn: "" }));
    const res = await fetch(`/api/factoryos/zoho/so?number=${encodeURIComponent(v)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setState({ ...EMPTY, error: data.error || "Lookup failed", checked: v }); onResolved && onResolved(null); return; }
    const others = (data.linkedJobs || []).filter((j) => j.id !== currentJobId);
    if (data.unreachable) {
      // Zoho is down or over its daily limit: accept the number provisionally.
      const already = others.length ? ` It already has job J# ${others.map((j) => j.jNumber).join(", ")}; that is fine only if this job is for a different item on the SO.` : "";
      setState({ ...EMPTY, warn: `Zoho isn't reachable right now. ${data.number} will be saved and checked automatically later. Make sure the number and customer are right.${already}`, linkedJobs: others, checked: v });
      onResolved && onResolved({ number: data.number, unverified: true });
      return;
    }
    if (!data.found) { setState({ ...EMPTY, error: `${data.number} is not in Zoho`, checked: v }); onResolved && onResolved(null); return; }
    const lines = (data.so.lines || []).filter((l) => l.id);
    if (others.length >= Math.max(lines.length, 1)) {
      setState({ ...EMPTY, so: data.so, error: `${data.number} has ${Math.max(lines.length, 1)} item${lines.length === 1 ? "" : "s"} and already ${others.length} job${others.length === 1 ? "" : "s"} (J# ${others.map((j) => j.jNumber).join(", ")}). One SO item, one job.`, linkedJobs: others, checked: v });
      onResolved && onResolved(null);
      return;
    }
    setState({ ...EMPTY, so: data.so, linkedJobs: others, checked: v });
    onResolved && onResolved(data.so);
    if (onLineChange) {
      const free = lines.filter((l) => !others.some((j) => j.lineId === l.id));
      const current = lines.find((l) => l.id === lineId && free.includes(l));
      if (lines.length === 1) onLineChange(lines[0].id, lines[0]);
      else if (!current) onLineChange("", null);
    }
  }

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => check(value), 600);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const so = state.so;
  const lines = so ? (so.lines || []) : [];
  const pickable = onLineChange && lines.filter((l) => l.id).length > 1 && !state.error;
  const takenBy = (l) => state.linkedJobs.find((j) => j.lineId && j.lineId === l.id);
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
      {state.warn && !state.loading && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{state.warn}</p>}
      {so && !state.loading && (
        <div className={`mt-2 rounded-lg border px-3 py-2 text-xs ${so.status === "void" ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-900/20" : "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-900/20"} text-gray-800 dark:text-gray-200`}>
          <div className="font-medium">
            {so.number} · {so.customer} · {so.date} · <span className="uppercase">{so.status}</span>
            {so.reference ? <> · ref {so.reference}</> : null}
          </div>
          {pickable ? (
            <fieldset className="mt-2">
              <legend className="mb-1 font-medium text-gray-900 dark:text-white">This SO has {lines.length} items. Which one is this job for?</legend>
              <div className="space-y-1">
                {lines.map((l) => {
                  const taken = takenBy(l);
                  return (
                    <label key={l.id} className={`flex items-start gap-2 rounded px-1.5 py-1 ${taken ? "opacity-60" : "cursor-pointer hover:bg-white/60 dark:hover:bg-black/20"}`}>
                      <input type="radio" name={`so-line-${so.number}`} className="mt-0.5" disabled={!!taken} checked={lineId === l.id} onChange={() => onLineChange(l.id, l)} />
                      <span>
                        {l.name} — {num(l.qty)} {l.unit}
                        {taken ? <span className="ml-1 font-medium">(already job J# {taken.jNumber})</span> : null}
                      </span>
                    </label>
                  );
                })}
              </div>
              {!lineId && <p className="mt-1 font-medium text-amber-700 dark:text-amber-300">Pick the item to continue.</p>}
            </fieldset>
          ) : lines.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {lines.slice(0, 8).map((l, i) => (
                <li key={i}>{l.name} — {num(l.qty)} {l.unit}{l.invoiced ? ` (${num(l.invoiced)} invoiced)` : ""}</li>
              ))}
              {lines.length > 8 && <li>+ {lines.length - 8} more lines</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
