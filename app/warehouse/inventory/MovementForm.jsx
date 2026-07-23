"use client";

// Shared post-a-movement form. Used by Inward and Outward pages.
// `kind` controls per-type behaviour:
//   inward  → asks for to_location, optional unit_cost, no from_location
//   outward → asks for from_location (restricted to where the item has stock),
//             no unit_cost, no reject_reason
//
// Item selection is a searchable, name-first combobox (searches name / SKU /
// category / customer, shows on-hand). For outward the "from location" is
// restricted to locations that actually hold the selected item, each labelled
// with its on-hand qty — so a picker can see and dispatch across the two
// positions an item may sit in.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const REASON_BY_KIND = {
  inward:  ["supplier", "return", "opening", "manual"],
  outward: ["customer", "job", "sample", "scrap", "manual"],
};

const REJECT_REASONS = ["", "discard", "lost", "damaged"];

const blankLine = () => ({
  item_id: "",
  qty: "",
  to_location_id: "",
  from_location_id: "",
  unit_cost: "",
  reject_reason: "",
  remarks: "",
});

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmt(n) {
  return Number(n || 0).toLocaleString("en-IN");
}

export default function MovementForm({ kind, items, locations, stock = [], onPosted }) {
  const reasons = REASON_BY_KIND[kind] || [];
  // Receiving locations: hide REJECT (that's auto-posted via the reject flow).
  const receivingLocs = useMemo(
    () => locations.filter((l) => l.code !== "BWD-REJECT"),
    [locations],
  );

  // item_id -> { total, byLoc: {code: qty} }
  const stockByItem = useMemo(() => {
    const m = {};
    for (const r of stock) m[r.item_id] = { total: r.total_qty || 0, byLoc: r.by_location || {} };
    return m;
  }, [stock]);
  const locByCode = useMemo(
    () => Object.fromEntries(locations.map((l) => [l.code, l])),
    [locations],
  );

  // Stock positions for an item, richest first: [{id, code, qty}]
  function positionsFor(itemId) {
    const byLoc = stockByItem[itemId]?.byLoc || {};
    return Object.entries(byLoc)
      .map(([code, qty]) => ({ id: locByCode[code]?.id || "", code, qty: Number(qty) || 0 }))
      .filter((p) => p.id && p.qty > 0)
      .sort((a, b) => b.qty - a.qty);
  }

  const [movementDate, setMovementDate] = useState(todayISO());
  const [referenceType, setReferenceType] = useState(reasons[0] || "");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState([blankLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function updateLine(i, patch) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() { setLines((prev) => [...prev, blankLine()]); }
  function removeLine(i) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  // Pick an item on a line. For outward, auto-select the from-location when the
  // item sits in exactly one position (the common case) so the picker doesn't
  // have to touch the location dropdown at all.
  function pickItem(i, itemId) {
    const patch = { item_id: itemId, from_location_id: "" };
    if (kind === "outward" && itemId) {
      const pos = positionsFor(itemId);
      if (pos.length === 1) patch.from_location_id = pos[0].id;
    }
    updateLine(i, patch);
  }

  // Split a dispatch across positions: add a sibling line for the same item,
  // pre-filled with the next position that isn't already used on another line.
  function addPosition(i) {
    const src = lines[i];
    if (!src.item_id) return;
    const used = new Set(
      lines.filter((l) => l.item_id === src.item_id && l.from_location_id).map((l) => l.from_location_id),
    );
    const next = positionsFor(src.item_id).find((p) => !used.has(p.id));
    setLines((prev) => {
      const copy = [...prev];
      copy.splice(i + 1, 0, { ...blankLine(), item_id: src.item_id, from_location_id: next?.id || "" });
      return copy;
    });
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const payload = {
      type: kind,
      reference_type: referenceType,
      reference: reference.trim(),
      movement_date: movementDate,
      notes: notes.trim(),
      lines: lines
        .filter((l) => l.item_id && Number(l.qty) > 0)
        .map((l) => {
          const out = {
            item_id: l.item_id,
            qty: Number(l.qty),
            remarks: l.remarks,
          };
          if (kind === "inward") {
            out.to_location_id = l.to_location_id;
            if (l.unit_cost) out.unit_cost = Number(l.unit_cost);
            if (l.reject_reason) {
              const reject = locations.find((x) => x.code === "BWD-REJECT");
              out.to_location_id = reject?.id || l.to_location_id;
              out.reject_reason = l.reject_reason;
            }
          } else if (kind === "outward") {
            out.from_location_id = l.from_location_id;
          }
          return out;
        }),
    };

    if (payload.lines.length === 0) {
      setError("Add at least one line with an item and qty.");
      return;
    }
    // Client-side guard for outward: block over-issue before the server does.
    if (kind === "outward") {
      for (const [idx, l] of lines.entries()) {
        if (!l.item_id || !(Number(l.qty) > 0)) continue;
        if (!l.from_location_id) {
          setError(`Line ${idx + 1}: choose a from-location.`);
          return;
        }
        const code = locations.find((x) => x.id === l.from_location_id)?.code;
        const onHand = Number(stockByItem[l.item_id]?.byLoc?.[code] || 0);
        // Sum sibling lines drawing from the same item+location.
        const drawn = lines
          .filter((x) => x.item_id === l.item_id && x.from_location_id === l.from_location_id)
          .reduce((s, x) => s + Number(x.qty || 0), 0);
        if (drawn > onHand) {
          setError(`Line ${idx + 1}: ${fmt(drawn)} exceeds ${fmt(onHand)} on hand at ${code}.`);
          return;
        }
      }
    }

    setBusy(true);
    try {
      const res = await fetch("/api/warehouse/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Post failed");
      setSuccess(`${data.movement?.movement_no || "Movement"} posted — ${data.movement?.line_count || payload.lines.length} line(s).`);
      setReference("");
      setNotes("");
      setLines([blankLine()]);
      onPosted?.(data.movement);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 sm:p-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Field label="Date *" type="date" value={movementDate} onChange={setMovementDate} />
        <Select label="Reason *" value={referenceType} onChange={setReferenceType} options={reasons} />
        <Field
          label={kind === "inward" ? "Reference (invoice / GRN no)" : "Reference (DC / order no)"}
          value={reference}
          onChange={setReference}
          placeholder={kind === "inward" ? "INV-12345" : "DC-2026-0001"}
        />
        <Field label="Notes" value={notes} onChange={setNotes} placeholder="Optional" />
      </div>

      <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-800">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-gray-800/50">
            <tr>
              <Th>Item *</Th>
              {kind === "outward" && <Th>From location *</Th>}
              {kind === "inward"  && <Th>To location *</Th>}
              <Th right>Qty *</Th>
              {kind === "inward" && <Th right>Unit cost (₹)</Th>}
              {kind === "inward" && <Th>Reject reason</Th>}
              <Th>Remarks</Th>
              <Th />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
            {lines.map((ln, i) => {
              const item = items.find((x) => x.id === ln.item_id);
              const positions = kind === "outward" && ln.item_id ? positionsFor(ln.item_id) : [];
              const chosenCode = locations.find((x) => x.id === ln.from_location_id)?.code;
              const onHandHere = Number(stockByItem[ln.item_id]?.byLoc?.[chosenCode] || 0);
              const over = kind === "outward" && ln.from_location_id && Number(ln.qty) > onHandHere;
              return (
                <tr key={i} className="align-top">
                  <Td>
                    <ItemPicker
                      items={items}
                      value={ln.item_id}
                      onChange={(v) => pickItem(i, v)}
                      stockByItem={stockByItem}
                      preferInStock={kind === "outward"}
                    />
                  </Td>
                  {kind === "outward" && (
                    <Td>
                      <PositionSelect
                        value={ln.from_location_id}
                        onChange={(v) => updateLine(i, { from_location_id: v })}
                        positions={positions}
                        hasItem={!!ln.item_id}
                      />
                      {ln.item_id && positions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => addPosition(i)}
                          className="mt-1 text-[11px] font-medium text-blue-700 hover:underline dark:text-blue-400"
                        >
                          ＋ dispatch from another position ({positions.length} in stock)
                        </button>
                      )}
                    </Td>
                  )}
                  {kind === "inward" && (
                    <Td>
                      <CompactSelect
                        value={ln.to_location_id}
                        onChange={(v) => updateLine(i, { to_location_id: v })}
                        options={[{ value: "", label: "—" }, ...receivingLocs.map((l) => ({ value: l.id, label: l.code }))]}
                        disabled={!!ln.reject_reason}
                      />
                    </Td>
                  )}
                  <Td right>
                    <CompactInput
                      type="number" step="any" min="0"
                      value={ln.qty}
                      onChange={(v) => updateLine(i, { qty: v })}
                      suffix={item?.uom}
                      invalid={over}
                    />
                    {over && (
                      <p className="mt-0.5 text-right text-[11px] text-red-600 dark:text-red-400">
                        only {fmt(onHandHere)} at {chosenCode}
                      </p>
                    )}
                  </Td>
                  {kind === "inward" && (
                    <Td right>
                      <CompactInput
                        type="number" step="any" min="0"
                        value={ln.unit_cost}
                        onChange={(v) => updateLine(i, { unit_cost: v })}
                        placeholder="optional"
                      />
                    </Td>
                  )}
                  {kind === "inward" && (
                    <Td>
                      <CompactSelect
                        value={ln.reject_reason}
                        onChange={(v) => updateLine(i, { reject_reason: v })}
                        options={REJECT_REASONS.map((r) => ({ value: r, label: r || "—" }))}
                      />
                    </Td>
                  )}
                  <Td>
                    <CompactInput
                      value={ln.remarks}
                      onChange={(v) => updateLine(i, { remarks: v })}
                      placeholder=""
                    />
                  </Td>
                  <Td right>
                    <button
                      type="button"
                      onClick={() => removeLine(i)}
                      disabled={lines.length === 1}
                      className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:hover:bg-gray-800"
                    >
                      ✕
                    </button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={addLine}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          + Add line
        </button>
        <div className="flex items-center gap-3">
          {error && <span className="text-sm text-red-700 dark:text-red-300">{error}</span>}
          {success && <span className="text-sm text-emerald-700 dark:text-emerald-300">{success}</span>}
          <button
            type="submit"
            disabled={busy}
            className={`rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
              kind === "inward" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {busy ? "Posting…" : kind === "inward" ? "Post inward" : "Post outward"}
          </button>
        </div>
      </div>

      {kind === "inward" && (
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          Reject lines are routed to <span className="font-mono">BWD-REJECT</span> automatically. Unit cost (when set) updates the SKU&apos;s weighted moving average.
        </p>
      )}
    </form>
  );
}

// --- compact form atoms ---

function Th({ children, right }) {
  return (
    <th className={`px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}
function Td({ children, right }) {
  return <td className={`px-2 py-2 text-sm ${right ? "text-right" : ""}`}>{children}</td>;
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
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

function CompactInput({ value, onChange, type = "text", placeholder, step, min, suffix, invalid }) {
  return (
    <div className="relative">
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        step={step}
        min={min}
        className={`w-full rounded border bg-white px-2 py-1 text-sm dark:bg-gray-900 dark:text-gray-100 ${
          invalid ? "border-red-400 dark:border-red-600" : "border-gray-300 dark:border-gray-700"
        }`}
      />
      {suffix && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">{suffix}</span>}
    </div>
  );
}
function CompactSelect({ value, onChange, options, disabled }) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm disabled:bg-gray-100 disabled:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// From-location dropdown restricted to positions that actually hold the item,
// each labelled with its on-hand qty. This is what makes an item's positions
// visible during dispatch.
function PositionSelect({ value, onChange, positions, hasItem }) {
  if (!hasItem) {
    return <CompactSelect value="" onChange={() => {}} options={[{ value: "", label: "pick an item first" }]} disabled />;
  }
  if (positions.length === 0) {
    return <CompactSelect value="" onChange={() => {}} options={[{ value: "", label: "no stock on hand" }]} disabled />;
  }
  return (
    <CompactSelect
      value={value}
      onChange={onChange}
      options={[
        { value: "", label: "— choose position —" },
        ...positions.map((p) => ({ value: p.id, label: `${p.code} · ${fmt(p.qty)}` })),
      ]}
    />
  );
}

// Searchable, name-first item combobox. Searches name / SKU / category /
// customer; shows on-hand and customer; renders in a portal so the dropdown is
// never clipped by the table's overflow. Keyboard: ↑/↓ to move, Enter select,
// Esc close.
function ItemPicker({ items, value, onChange, stockByItem, preferInStock }) {
  const selected = items.find((i) => i.id === value);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const [rect, setRect] = useState(null);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    const tokens = query.split(/\s+/).filter(Boolean);
    let list = items;
    if (tokens.length) {
      list = items.filter((it) => {
        const hay = `${it.name} ${it.sku} ${it.category || ""} ${it.brand_customer || ""}`.toLowerCase();
        return tokens.every((t) => hay.includes(t));
      });
    }
    const rank = (it) => {
      const s = stockByItem[it.id]?.total || 0;
      const starts = (it.name || "").toLowerCase().startsWith(query) ? 1 : 0;
      return [preferInStock && s > 0 ? 1 : 0, starts, s];
    };
    return [...list]
      .sort((a, b) => {
        const ra = rank(a), rb = rank(b);
        for (let k = 0; k < ra.length; k++) if (ra[k] !== rb[k]) return rb[k] - ra[k];
        return (a.name || "").localeCompare(b.name || "");
      })
      .slice(0, 60);
  }, [items, q, stockByItem, preferInStock]);

  function reposition() {
    if (inputRef.current) setRect(inputRef.current.getBoundingClientRect());
  }
  useLayoutEffect(() => { if (open) reposition(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const h = () => reposition();
    window.addEventListener("scroll", h, true);
    window.addEventListener("resize", h);
    return () => {
      window.removeEventListener("scroll", h, true);
      window.removeEventListener("resize", h);
    };
  }, [open]);

  function choose(it) {
    onChange(it.id);
    setQ("");
    setOpen(false);
  }
  function onKeyDown(e) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) { setOpen(true); setActive(0); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (results[active]) choose(results[active]); }
    else if (e.key === "Escape") { setOpen(false); }
  }

  const display = open ? q : (selected ? selected.name : "");

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={display}
        onChange={(e) => { setQ(e.target.value); setActive(0); if (!open) setOpen(true); }}
        onFocus={() => { setOpen(true); setActive(0); }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
        placeholder="Search name or SKU…"
        className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
      />
      {selected && !open && (
        <span className="mt-0.5 block truncate text-[11px] text-gray-400">
          {selected.sku}{selected.brand_customer ? ` · ${selected.brand_customer}` : ""}
        </span>
      )}
      {open && rect && createPortal(
        <ul
          style={{ position: "fixed", top: rect.bottom + 2, left: rect.left, width: Math.max(rect.width, 320), zIndex: 9999 }}
          className="max-h-72 overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
          onMouseDown={(e) => e.preventDefault()}
        >
          {results.length === 0 && (
            <li className="px-3 py-2 text-sm text-gray-400">No items match “{q}”.</li>
          )}
          {results.map((it, idx) => {
            const oh = stockByItem[it.id]?.total || 0;
            return (
              <li
                key={it.id}
                onMouseEnter={() => setActive(idx)}
                onClick={() => choose(it)}
                className={`flex cursor-pointer items-start justify-between gap-3 px-3 py-1.5 ${
                  idx === active ? "bg-blue-600 text-white" : "text-gray-900 dark:text-gray-100"
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{it.name}</span>
                  <span className={`block truncate text-[11px] ${idx === active ? "text-blue-100" : "text-gray-400"}`}>
                    {it.sku}{it.category ? ` · ${it.category}` : ""}{it.brand_customer ? ` · ${it.brand_customer}` : ""}
                  </span>
                </span>
                <span className={`shrink-0 whitespace-nowrap text-[11px] tabular-nums ${
                  idx === active ? "text-blue-100" : oh > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400"
                }`}>
                  {oh > 0 ? `${fmt(oh)} on hand` : "0"}
                </span>
              </li>
            );
          })}
        </ul>,
        document.body,
      )}
    </div>
  );
}
