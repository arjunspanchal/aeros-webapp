"use client";
// Shared pieces for the Warehouse screens. One look across Today, Inward,
// Outward, In transit and Stock: quiet neutral surfaces, one dark primary
// button, colour only for status. Built phone-first for the warehouse floor.
import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export const inputCls =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:border-gray-300 dark:focus:ring-gray-300";
export const labelCls = "mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400";

import { num, today, fmtDate, who, boxes } from "./format";
export { num, today, fmtDate, who, boxes };

const BTN = {
  primary: "bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200",
  ghost: "border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800",
  danger: "text-red-600 hover:underline dark:text-red-400",
  good: "bg-emerald-600 text-white hover:bg-emerald-700",
};
export function Btn({ tone = "primary", className = "", ...props }) {
  const pad = tone === "danger" ? "text-xs" : "rounded-lg px-3.5 py-2 text-sm font-medium";
  return <button type="button" {...props} className={`${pad} ${BTN[tone]} disabled:cursor-not-allowed disabled:opacity-50 ${className}`} />;
}

const PILL = {
  neutral: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  late: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  warn: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  good: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
};
export function Pill({ tone = "neutral", children }) {
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${PILL[tone]}`}>{children}</span>;
}

export function PageHead({ title, sub, right }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">{title}</h1>
        {sub && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Section({ title, count, hint, children }) {
  return (
    <section className="mb-8">
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h2>
        {count !== undefined && <span className="text-sm text-gray-500 dark:text-gray-400">{count}</span>}
      </div>
      {hint && <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
      {children}
    </section>
  );
}

export function Card({ children, className = "" }) {
  return <div className={`rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 ${className}`}>{children}</div>;
}
export function Empty({ children }) {
  return <p className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">{children}</p>;
}
export function Notice({ children }) {
  return <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">{children}</p>;
}
export function ErrorText({ children }) {
  return children ? <p className="text-sm text-red-600 dark:text-red-400">{children}</p> : null;
}
export function Field({ label, children, className = "" }) {
  return <div className={className}><div className={labelCls}>{label}</div>{children}</div>;
}
export function Segmented({ value, onChange, options }) {
  return (
    <div className="inline-flex rounded-lg border border-gray-300 p-0.5 dark:border-gray-700">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${value === o.value ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Tab strip across the top of every warehouse page (the sidebar is hidden on
// a phone, and the warehouse works on phones).
export function WarehouseTabs({ tabs }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Warehouse" className="-mx-4 mb-6 overflow-x-auto border-b border-gray-200 px-4 dark:border-gray-800 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1">
        {tabs.map((t) => {
          const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <li key={t.href}>
              <Link href={t.href} aria-current={active ? "page" : undefined}
                className={`block border-b-2 px-3 py-2.5 text-sm font-medium ${active ? "border-gray-900 text-gray-900 dark:border-white dark:text-white" : "border-transparent text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"}`}>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// ---------- Matching a Zoho line to a warehouse item ----------

// Type-to-search over the items master, with "add as a new item" when nothing
// fits. Works for any kind of goods.
export function ItemPicker({ items, value, isNew, newName, onPick, onNew }) {
  const [q, setQ] = useState("");
  const chosen = items.find((i) => i.id === value);
  const hits = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return items.filter((i) => { const t = `${i.sku} ${i.name} ${i.brand}`.toLowerCase(); return words.every((w) => t.includes(w)); }).slice(0, 8);
  }, [q, items]);
  if (chosen || isNew) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700">
        <span className="min-w-0 truncate text-gray-900 dark:text-white">
          {isNew ? <><Pill tone="warn">New item</Pill> <span className="ml-1">{newName}</span></> : <><span className="font-mono text-xs text-gray-500 dark:text-gray-400">{chosen.sku}</span> {chosen.name}</>}
        </span>
        <button type="button" onClick={() => onPick("")} className="shrink-0 text-xs font-medium text-gray-600 underline dark:text-gray-300">Change</button>
      </div>
    );
  }
  return (
    <div>
      <input className={inputCls} placeholder="Search warehouse items…" value={q} onChange={(e) => setQ(e.target.value)} />
      {(hits.length > 0 || q.trim()) && (
        <ul className="mt-1 max-h-60 overflow-auto rounded-lg border border-gray-200 bg-white text-sm shadow-sm dark:border-gray-700 dark:bg-gray-900">
          {hits.map((i) => (
            <li key={i.id}>
              <button type="button" onClick={() => { onPick(i.id); setQ(""); }} className="block w-full px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800">
                <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{i.sku}</span> <span className="text-gray-900 dark:text-white">{i.name}</span>
              </button>
            </li>
          ))}
          {onNew && (
            <li className="border-t border-gray-100 dark:border-gray-800">
              <button type="button" onClick={() => { onNew(); setQ(""); }} className="block w-full px-3 py-2 text-left font-medium text-gray-900 hover:bg-gray-50 dark:text-white dark:hover:bg-gray-800">
                + Add “{newName}” as a new warehouse item
              </button>
            </li>
          )}
        </ul>
      )}
      {onNew && !q.trim() && (
        <button type="button" onClick={onNew} className="mt-1 text-xs font-medium text-gray-600 underline dark:text-gray-300">Not in the list? Add it as a new item</button>
      )}
    </div>
  );
}

// Rack picker: racks already holding the item first, then every rack by zone.
export function LocationSelect({ locations, value, onChange, holding = [], blankLabel = "Choose a rack…" }) {
  const zones = useMemo(() => {
    const m = new Map();
    for (const l of locations) { const z = l.zone || "Other"; if (!m.has(z)) m.set(z, []); m.get(z).push(l); }
    return [...m.entries()];
  }, [locations]);
  return (
    <select className={inputCls} value={value || ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">{blankLabel}</option>
      {holding.length > 0 && (
        <optgroup label="Already holds this item">
          {holding.map((p) => <option key={`h-${p.locationId}`} value={p.locationId}>{p.code} · {num(p.qty)} on hand</option>)}
        </optgroup>
      )}
      {zones.map(([z, list]) => (
        <optgroup key={z} label={z}>
          {list.map((l) => <option key={l.id} value={l.id}>{l.code}{l.name && l.name !== l.code ? ` · ${l.name}` : ""}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

// What a line resolves to right now: the user's pick, else what was remembered.
export function lineState(line, choice = {}) {
  const touched = !!choice.touched;
  const notStock = touched ? !!choice.notStock : !!line.link?.notStock;
  const isNew = !notStock && !!choice.createNew;
  const itemId = notStock || isNew ? "" : (touched ? choice.inventoryItemId || "" : line.link?.item?.id || "");
  return { notStock, isNew, itemId, remembered: !touched && !!line.link };
}

export function ItemMatch({ line, items, choice, setChoice, onItem }) {
  const st = lineState(line, choice);
  return (
    <div>
      <div className={labelCls}>Warehouse item{st.remembered ? " (remembered)" : ""}</div>
      {st.notStock ? (
        <div className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300">Not a stock item</div>
      ) : (
        <ItemPicker items={items} value={st.itemId} isNew={st.isNew} newName={line.name}
          onPick={(id) => { setChoice({ inventoryItemId: id, createNew: false, notStock: false, touched: true }); onItem?.(id); }}
          onNew={() => { setChoice({ inventoryItemId: "", createNew: true, notStock: false, touched: true }); onItem?.(""); }} />
      )}
      <label className="mt-1.5 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
        <input type="checkbox" checked={st.notStock}
          onChange={(e) => { setChoice({ notStock: e.target.checked, inventoryItemId: "", createNew: false, touched: true }); onItem?.(""); }} />
        Not a stock item (never kept on the racks)
      </label>
    </div>
  );
}

// The line picks, in the shape the API wants.
export function choicesPayload(lines, choices, extra = () => ({})) {
  return lines.filter((l) => l.goods).map((l) => {
    const c = choices[l.lineId] || {};
    const st = lineState(l, c);
    return {
      lineId: l.lineId,
      ...(c.touched ? { inventoryItemId: st.itemId || undefined, createNew: st.isNew || undefined, notStock: st.notStock } : {}),
      ...extra(l, c, st),
    };
  });
}

export async function postJson(url, body, method = "POST") {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, error: res.ok ? "" : data.error || "Something went wrong" };
}
