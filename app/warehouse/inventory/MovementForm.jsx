"use client";

// Shared post-a-movement form. Used by Inward and Outward pages.
// `kind` controls per-type behaviour:
//   inward  → asks for to_location, optional unit_cost, no from_location
//   outward → asks for from_location, no unit_cost, no reject_reason
// We deliberately don't try to be a transfer/adjustment form here; those are
// less frequent and will get their own UI in Phase 3.

import { useMemo, useState } from "react";

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

export default function MovementForm({ kind, items, locations, onPosted }) {
  const reasons = REASON_BY_KIND[kind] || [];
  // Receiving locations: hide REJECT (that's auto-posted via the reject flow).
  const receivingLocs = useMemo(
    () => locations.filter((l) => l.code !== "BWD-REJECT"),
    [locations],
  );

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
              // Reject line — override target to BWD-REJECT.
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
      // Reset form for next entry. Keep date + reason for muscle memory.
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
              return (
                <tr key={i} className="align-top">
                  <Td>
                    <ItemPicker
                      items={items}
                      value={ln.item_id}
                      onChange={(v) => updateLine(i, { item_id: v })}
                    />
                  </Td>
                  {kind === "outward" && (
                    <Td>
                      <CompactSelect
                        value={ln.from_location_id}
                        onChange={(v) => updateLine(i, { from_location_id: v })}
                        options={[{ value: "", label: "—" }, ...receivingLocs.map((l) => ({ value: l.id, label: l.code }))]}
                      />
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
                    />
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

function CompactInput({ value, onChange, type = "text", placeholder, step, min, suffix }) {
  return (
    <div className="relative">
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        step={step}
        min={min}
        className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
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

// SKU picker: searchable datalist. Datalists work natively on mobile and
// keep the row compact. Items are pre-sorted by sku in lib.
function ItemPicker({ items, value, onChange }) {
  const selected = items.find((i) => i.id === value);
  const [text, setText] = useState(selected ? `${selected.sku} — ${selected.name}` : "");
  function handleChange(e) {
    const v = e.target.value;
    setText(v);
    // Try exact match by "SKU — Name" or by SKU prefix
    const skuPart = v.split(" — ")[0].trim();
    const match = items.find((i) => i.sku === skuPart) || items.find((i) => i.sku.toLowerCase() === v.toLowerCase());
    onChange(match ? match.id : "");
  }
  return (
    <>
      <input
        list="warehouse-items-list"
        value={text}
        onChange={handleChange}
        placeholder="Search SKU…"
        className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
      />
      <datalist id="warehouse-items-list">
        {items.map((i) => (
          <option key={i.id} value={`${i.sku} — ${i.name}`} />
        ))}
      </datalist>
    </>
  );
}
