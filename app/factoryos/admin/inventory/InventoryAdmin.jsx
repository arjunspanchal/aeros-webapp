"use client";
import { useMemo, useState } from "react";
import { inputCls, labelCls } from "@/app/factoryos/_components/ui";

const FORMS = ["", "Rolls", "Sheets", "Reams"];
const STATUSES = ["", "In Stock", "Reserved", "Low", "Depleted"];

const EMPTY = {
  name: "",
  masterPaperId: "",
  masterRmName: "",
  paperType: "",
  gsm: "",
  bf: "",
  sizeMm: "",
  lengthMm: "",
  form: "",
  supplier: "",
  qtyRolls: "",
  qtyKgs: "",
  coating: "",
  location: "",
  status: "",
  notes: "",
  active: true,
};

function toForm(rm) {
  return {
    name: rm.name || "",
    masterPaperId: "",
    masterRmName: rm.masterRmName || "",
    paperType: rm.paperType || "",
    gsm: rm.gsm != null ? String(rm.gsm) : "",
    bf: rm.bf != null ? String(rm.bf) : "",
    sizeMm: rm.sizeMm != null ? String(rm.sizeMm) : "",
    lengthMm: rm.lengthMm != null ? String(rm.lengthMm) : "",
    form: rm.form || "",
    supplier: rm.supplier || "",
    qtyRolls: rm.qtyRolls != null ? String(rm.qtyRolls) : "",
    qtyKgs: rm.qtyKgs != null ? String(rm.qtyKgs) : "",
    coating: rm.coating || "",
    location: rm.location || "",
    status: rm.status || "",
    notes: rm.notes || "",
    active: rm.active !== false,
  };
}

function toBody(form) {
  const num = (v) => (v === "" ? undefined : Number(v));
  return {
    name: form.name.trim(),
    masterRmName: form.masterRmName.trim(),
    paperType: form.paperType.trim(),
    gsm: num(form.gsm),
    bf: num(form.bf),
    sizeMm: num(form.sizeMm),
    // Only send lengthMm for sheet-style forms — clears stale values if the user switched from Sheets back to Rolls.
    lengthMm: form.form === "Rolls" ? undefined : num(form.lengthMm),
    form: form.form,
    supplier: form.supplier.trim(),
    qtyRolls: num(form.qtyRolls),
    qtyKgs: num(form.qtyKgs),
    coating: form.coating.trim(),
    location: form.location.trim(),
    status: form.status,
    notes: form.notes,
    active: form.active,
  };
}

const STATUS_COLORS = {
  "In Stock": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200",
  "Reserved": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
  "Low": "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200",
  "Depleted": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200",
};

const TODAY = () => new Date().toISOString().slice(0, 10);
const EMPTY_LINE = { masterPaperId: "", masterPaperName: "", paperType: "", gsm: "", bf: "", sizeMm: "", form: "", coating: "", qtyRolls: "", qtyKgs: "" };

export default function InventoryAdmin({ initialInventory, masterPapers = [] }) {
  const [inventory, setInventory] = useState(initialInventory);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [masterQuery, setMasterQuery] = useState("");

  // Receive-stock (invoice) flow
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receipt, setReceipt] = useState({
    invoiceNumber: "",
    invoiceDate: TODAY(),
    supplier: "",
    notes: "",
    lines: [{ ...EMPTY_LINE }],
  });
  const [receiveBusy, setReceiveBusy] = useState(false);
  const [receiveErr, setReceiveErr] = useState("");
  const [receiveOk, setReceiveOk] = useState(false);

  function updateLine(idx, patch) {
    setReceipt((r) => ({ ...r, lines: r.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)) }));
  }

  function pickMasterForLine(idx, masterId) {
    const mp = masterPapers.find((x) => x.id === masterId);
    if (!mp) { updateLine(idx, { masterPaperId: "" }); return; }
    updateLine(idx, {
      masterPaperId: mp.id,
      masterPaperName: mp.materialName,
      paperType: mp.type || "",
      gsm: mp.gsm != null ? String(mp.gsm) : "",
      bf: mp.bf != null ? String(mp.bf) : "",
      form: mp.form || "",
      // Pre-coated mill SKUs (e.g. ITC IndoBev) carry a Mill Coating tag. Stamp it
      // on the stock line so the PE coating send-out page naturally skips this stock.
      coating: mp.millCoating ? `Mill ${mp.millCoating}` : "",
      // infer supplier on the invoice level if empty
    });
    setReceipt((r) => (r.supplier ? r : { ...r, supplier: mp.supplier || "" }));
  }

  function addLine() { setReceipt((r) => ({ ...r, lines: [...r.lines, { ...EMPTY_LINE }] })); }
  function removeLine(idx) {
    setReceipt((r) => ({ ...r, lines: r.lines.length === 1 ? r.lines : r.lines.filter((_, i) => i !== idx) }));
  }

  async function submitReceipt(e) {
    e.preventDefault();
    setReceiveErr(""); setReceiveOk(false);
    if (!receipt.invoiceNumber.trim()) { setReceiveErr("Invoice number required"); return; }
    const nonEmpty = receipt.lines.filter((l) => l.masterPaperName && (Number(l.qtyRolls) > 0 || Number(l.qtyKgs) > 0));
    if (nonEmpty.length === 0) { setReceiveErr("Add at least one line with a spec and quantity"); return; }
    setReceiveBusy(true);
    const res = await fetch("/api/factoryos/rm-receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoiceNumber: receipt.invoiceNumber.trim(),
        invoiceDate: receipt.invoiceDate || null,
        supplier: receipt.supplier || "",
        notes: receipt.notes || "",
        lines: nonEmpty,
      }),
    });
    setReceiveBusy(false);
    if (!res.ok) { setReceiveErr((await res.json()).error || "Failed"); return; }
    // Refetch the inventory so the new rolls/kgs show in the table below.
    const inv = await fetch("/api/factoryos/inventory").then((r) => r.json());
    setInventory(inv.inventory || []);
    setReceipt({
      invoiceNumber: "",
      invoiceDate: TODAY(),
      supplier: "",
      notes: "",
      lines: [{ ...EMPTY_LINE }],
    });
    setReceiveOk(true);
    setTimeout(() => setReceiveOk(false), 2500);
  }

  const isEditing = editingId !== null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inventory.filter((rm) => {
      if (statusFilter !== "all" && rm.status !== statusFilter) return false;
      if (!q) return true;
      return `${rm.name} ${rm.masterRmName} ${rm.supplier} ${rm.paperType} ${rm.gsm ?? ""} ${rm.bf ?? ""} ${rm.sizeMm ?? ""} ${rm.form} ${rm.location}`.toLowerCase().includes(q);
    });
  }, [inventory, query, statusFilter]);

  const totals = useMemo(() => {
    const t = { rolls: 0, kgs: 0, lines: 0, low: 0 };
    for (const rm of inventory) {
      if (rm.qtyRolls) t.rolls += rm.qtyRolls;
      if (rm.qtyKgs) t.kgs += rm.qtyKgs;
      if (rm.qtyRolls || rm.qtyKgs) t.lines++;
      if (rm.status === "Low" || rm.status === "Depleted") t.low++;
    }
    return t;
  }, [inventory]);

  const filteredMasters = useMemo(() => {
    const q = masterQuery.trim().toLowerCase();
    if (!q) return masterPapers.slice(0, 200);
    return masterPapers
      .filter((mp) => `${mp.materialName} ${mp.supplier} ${mp.type} ${mp.gsm ?? ""}`.toLowerCase().includes(q))
      .slice(0, 200);
  }, [masterPapers, masterQuery]);

  function onPickMaster(id) {
    const mp = masterPapers.find((x) => x.id === id);
    if (!mp) { setForm((f) => ({ ...f, masterPaperId: "" })); return; }
    // If the master is pre-coated at the mill (e.g. ITC IndoBev), stamp the stock
    // line's Coating so the PE coating send-out page naturally skips it.
    const coatingFromMill = mp.millCoating ? `Mill ${mp.millCoating}` : "";
    setForm((f) => ({
      ...f,
      masterPaperId: id,
      masterRmName: mp.materialName,
      paperType: mp.type || f.paperType,
      gsm: mp.gsm != null ? String(mp.gsm) : f.gsm,
      bf: mp.bf != null ? String(mp.bf) : f.bf,
      form: mp.form || f.form,
      supplier: mp.supplier || f.supplier,
      // Only overwrite coating when the master says so — don't clobber a human-entered
      // value on an uncoated master.
      coating: coatingFromMill || f.coating,
    }));
  }

  function startEdit(rm) {
    setEditingId(rm.id);
    const populated = toForm(rm);
    // If the saved masterRmName matches a master record, remember its id so the picker shows it selected.
    const match = rm.masterRmName ? masterPapers.find((mp) => mp.materialName === rm.masterRmName) : null;
    setForm(match ? { ...populated, masterPaperId: match.id } : populated);
    setErr("");
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY);
    setErr("");
  }

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const url = isEditing ? `/api/factoryos/inventory/${editingId}` : "/api/factoryos/inventory";
    const method = isEditing ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toBody(form)),
    });
    setBusy(false);
    if (!res.ok) { setErr((await res.json()).error || "Failed"); return; }
    const data = await res.json();
    const rm = data.stockLine;
    setInventory((prev) => {
      const next = isEditing ? prev.map((x) => (x.id === editingId ? rm : x)) : [...prev, rm];
      return next.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    });
    cancelEdit();
  }

  async function requestDelete(rm) {
    if (!window.confirm(`Delete "${rm.name || "this stock line"}"? This cannot be undone.`)) return;
    setBusy(true);
    const res = await fetch(`/api/factoryos/inventory/${rm.id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) { alert(`Delete failed: ${(await res.json()).error || "unknown"}`); return; }
    setInventory((prev) => prev.filter((x) => x.id !== rm.id));
    if (editingId === rm.id) cancelEdit();
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {inventory.length} SKUs · {totals.rolls.toLocaleString("en-IN")} rolls · {totals.kgs.toLocaleString("en-IN", { maximumFractionDigits: 1 })} kgs
        </div>
        <button
          type="button"
          onClick={() => setReceiveOpen((v) => !v)}
          className="bg-emerald-600 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-emerald-700"
        >
          {receiveOpen ? "Hide receive form" : "+ Record receipt"}
        </button>
      </div>

      {receiveOpen && (
        <form onSubmit={submitReceipt} className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-5 space-y-4 dark:bg-emerald-950/20 dark:border-emerald-900">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Receive stock from supplier</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">One invoice, multiple paper specs. Pick each spec from the Paper RM Database; we'll add the quantity to the matching inventory line (or create it if it doesn't exist yet).</p>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className={labelCls}>Invoice number</label>
              <input className={inputCls} value={receipt.invoiceNumber} onChange={(e) => setReceipt({ ...receipt, invoiceNumber: e.target.value })} placeholder="e.g. JODH-2026-042" required />
            </div>
            <div>
              <label className={labelCls}>Invoice date</label>
              <input type="date" className={inputCls} value={receipt.invoiceDate} onChange={(e) => setReceipt({ ...receipt, invoiceDate: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Supplier / mill</label>
              <input className={inputCls} value={receipt.supplier} onChange={(e) => setReceipt({ ...receipt, supplier: e.target.value })} placeholder="Jodhani, BILT, Ajit Mill…" />
            </div>
          </div>

          <div className="space-y-3">
            {receipt.lines.map((line, idx) => (
              <div key={idx} className="bg-white border border-gray-200 rounded-lg p-3 dark:bg-gray-900 dark:border-gray-800">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Line {idx + 1}</div>
                  {receipt.lines.length > 1 && (
                    <button type="button" onClick={() => removeLine(idx)} className="text-xs text-red-600 hover:underline dark:text-red-400">Remove</button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Paper spec (from master database)</label>
                    <select className={inputCls} value={line.masterPaperId} onChange={(e) => pickMasterForLine(idx, e.target.value)} required>
                      <option value="">— Pick spec —</option>
                      {masterPapers.map((mp) => (
                        <option key={mp.id} value={mp.id}>
                          {mp.materialName}
                          {mp.bf != null ? ` · ${mp.bf} BF` : ""}
                        </option>
                      ))}
                    </select>
                    {line.masterPaperName && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{line.paperType}{line.gsm ? ` · ${line.gsm} GSM` : ""}{line.bf ? ` · ${line.bf} BF` : ""}{line.form ? ` · ${line.form}` : ""}</p>
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>Qty (rolls)</label>
                    <input type="number" className={inputCls} value={line.qtyRolls} onChange={(e) => updateLine(idx, { qtyRolls: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>Qty (kgs)</label>
                    <input type="number" step="0.01" className={inputCls} value={line.qtyKgs} onChange={(e) => updateLine(idx, { qtyKgs: e.target.value })} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <button type="button" onClick={addLine} className="text-xs text-blue-600 hover:underline dark:text-blue-400">+ Add another line</button>
            <div className="flex items-center gap-3">
              {receiveOk && <span className="text-xs text-green-700 dark:text-green-400">Stock updated</span>}
              {receiveErr && <span className="text-xs text-red-500">{receiveErr}</span>}
              <button disabled={receiveBusy} className="bg-emerald-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-60">
                {receiveBusy ? "Saving…" : "Save receipt"}
              </button>
            </div>
          </div>

          <div>
            <label className={labelCls}>Notes (optional)</label>
            <textarea rows={2} className={inputCls} value={receipt.notes} onChange={(e) => setReceipt({ ...receipt, notes: e.target.value })} placeholder="e.g. LR number, vehicle, condition on arrival" />
          </div>
        </form>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard label="SKUs tracked" value={inventory.length} />
        <StatCard label="Stock lines" value={totals.lines} />
        <StatCard label="Total rolls" value={totals.rolls.toLocaleString("en-IN")} />
        <StatCard label="Total kgs" value={totals.kgs.toLocaleString("en-IN", { maximumFractionDigits: 1 })} tone={totals.low ? "warn" : "ok"} sub={totals.low ? `${totals.low} low/depleted` : null} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <form onSubmit={submit} className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-5 space-y-3 dark:bg-gray-900 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
              {isEditing ? "Edit stock line" : "Add stock line"}
            </h2>
            {isEditing && (
              <button type="button" onClick={cancelEdit} className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                Cancel
              </button>
            )}
          </div>

          <div>
            <label className={labelCls}>Link to Paper RM Database (autofills supplier, paper type, GSM)</label>
            <input
              className={`${inputCls} mb-2`}
              placeholder={`Search ${masterPapers.length} master papers…`}
              value={masterQuery}
              onChange={(e) => setMasterQuery(e.target.value)}
            />
            <select className={inputCls} value={form.masterPaperId} onChange={(e) => onPickMaster(e.target.value)}>
              <option value="">— None (enter manually below) —</option>
              {filteredMasters.map((mp) => (
                <option key={mp.id} value={mp.id}>
                  {mp.materialName}
                  {mp.bf != null ? ` · ${mp.bf} BF` : ""}
                </option>
              ))}
            </select>
            {form.masterRmName && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Linked: <span className="font-medium text-gray-700 dark:text-gray-200">{form.masterRmName}</span></p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Supplier</label>
              <input className={inputCls} value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} placeholder="BILT, Ajit Mill…" />
            </div>
            <div>
              <label className={labelCls}>Paper type</label>
              <input className={inputCls} value={form.paperType} onChange={(e) => setForm({ ...form, paperType: e.target.value })} placeholder="Brown Kraft…" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>GSM</label>
              <input type="number" className={inputCls} value={form.gsm} onChange={(e) => setForm({ ...form, gsm: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>BF</label>
              <input type="number" className={inputCls} value={form.bf} onChange={(e) => setForm({ ...form, bf: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Form</label>
              <select className={inputCls} value={form.form} onChange={(e) => setForm({ ...form, form: e.target.value })}>
                {FORMS.map((f) => <option key={f} value={f}>{f || "—"}</option>)}
              </select>
            </div>
          </div>
          {/*
            Dimension fields adapt to Form:
              Rolls → single Width (mm)
              Sheets / Reams → Length × Width (mm)
              (blank form) → single Size (mm), generic until the user picks a form
          */}
          {form.form === "Rolls" ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Width (mm)</label>
                <input type="number" className={inputCls} value={form.sizeMm} onChange={(e) => setForm({ ...form, sizeMm: e.target.value })} placeholder="890" />
              </div>
              <div>
                <label className={labelCls}>Coating</label>
                <input className={inputCls} value={form.coating} onChange={(e) => setForm({ ...form, coating: e.target.value })} placeholder="None / Matt / Gloss" />
              </div>
            </div>
          ) : form.form === "Sheets" || form.form === "Reams" ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Length (mm)</label>
                  <input type="number" className={inputCls} value={form.lengthMm} onChange={(e) => setForm({ ...form, lengthMm: e.target.value })} placeholder="700" />
                </div>
                <div>
                  <label className={labelCls}>Width (mm)</label>
                  <input type="number" className={inputCls} value={form.sizeMm} onChange={(e) => setForm({ ...form, sizeMm: e.target.value })} placeholder="500" />
                </div>
              </div>
              <div>
                <label className={labelCls}>Coating</label>
                <input className={inputCls} value={form.coating} onChange={(e) => setForm({ ...form, coating: e.target.value })} placeholder="None / Matt / Gloss" />
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Size (mm)</label>
                <input type="number" className={inputCls} value={form.sizeMm} onChange={(e) => setForm({ ...form, sizeMm: e.target.value })} placeholder="Pick a Form above" />
              </div>
              <div>
                <label className={labelCls}>Coating</label>
                <input className={inputCls} value={form.coating} onChange={(e) => setForm({ ...form, coating: e.target.value })} placeholder="None / Matt / Gloss" />
              </div>
            </div>
          )}

          <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
            <h3 className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2 dark:text-gray-400">Stock on hand</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Qty (rolls)</label>
                <input type="number" className={inputCls} value={form.qtyRolls} onChange={(e) => setForm({ ...form, qtyRolls: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Qty (kgs)</label>
                <input type="number" step="0.01" className={inputCls} value={form.qtyKgs} onChange={(e) => setForm({ ...form, qtyKgs: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Status</label>
                <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s || "—"}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Location</label>
                <input className={inputCls} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Warehouse / Factory" />
              </div>
            </div>
          </div>

          <div>
            <label className={labelCls}>Display name (auto-generated if blank)</label>
            <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Leave blank to auto-label from supplier/type/GSM" />
          </div>
          <div>
            <label className={labelCls}>Notes</label>
            <textarea rows={2} className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Active
          </label>
          <button disabled={busy} className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60">
            {busy ? (isEditing ? "Saving…" : "Adding…") : (isEditing ? "Save changes" : "Add stock line")}
          </button>
          {err && <p className="text-xs text-red-500">{err}</p>}
        </form>

        <div className="lg:col-span-3 bg-white border border-gray-200 rounded-xl overflow-hidden dark:bg-gray-900 dark:border-gray-800">
          <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row gap-2">
            <input
              className={`${inputCls} flex-1`}
              placeholder={`Search ${inventory.length} stock lines…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select className={`${inputCls} sm:w-40`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              {STATUSES.filter(Boolean).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase dark:bg-gray-800/50 dark:text-gray-400">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Name / Spec</th>
                  <th className="text-left px-4 py-2 font-medium">Master RM</th>
                  <th className="text-right px-4 py-2 font-medium">Rolls</th>
                  <th className="text-right px-4 py-2 font-medium">Kgs</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-right px-4 py-2 font-medium">&nbsp;</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.map((rm) => {
                  return (
                    <tr key={rm.id} className={editingId === rm.id ? "bg-blue-50 dark:bg-blue-900/20" : rm.active ? "" : "opacity-60"}>
                      <td className="px-4 py-2">
                        <div className="text-gray-900 dark:text-white">{rm.name || "—"}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {rm.paperType || "—"}
                          {rm.gsm != null ? ` · ${rm.gsm} GSM` : ""}
                          {rm.bf != null ? ` · ${rm.bf} BF` : ""}
                          {rm.lengthMm && rm.sizeMm
                            ? ` · ${rm.lengthMm}×${rm.sizeMm}mm`
                            : rm.sizeMm ? ` · ${rm.sizeMm}mm` : ""}
                          {rm.form ? ` · ${rm.form}` : ""}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {rm.masterRmName ? (
                          <span className="text-gray-700 dark:text-gray-200">{rm.masterRmName}</span>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500">unlinked</span>
                        )}
                        {rm.supplier && <div className="text-gray-500 dark:text-gray-400">{rm.supplier}</div>}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-900 dark:text-white">{rm.qtyRolls != null ? rm.qtyRolls.toLocaleString("en-IN") : "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-900 dark:text-white">{rm.qtyKgs != null ? rm.qtyKgs.toLocaleString("en-IN", { maximumFractionDigits: 1 }) : "—"}</td>
                      <td className="px-4 py-2">
                        {rm.status ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${STATUS_COLORS[rm.status] || ""}`}>{rm.status}</span>
                        ) : <span className="text-gray-400 dark:text-gray-500 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        <button onClick={() => startEdit(rm)} className="text-xs text-blue-600 hover:underline dark:text-blue-400 mr-3">Edit</button>
                        <button onClick={() => requestDelete(rm)} disabled={busy} className="text-xs text-red-600 hover:underline dark:text-red-400 disabled:opacity-50">Delete</button>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && <tr><td colSpan={6} className="text-center text-sm text-gray-500 py-8 dark:text-gray-400">{inventory.length === 0 ? "No stock lines yet." : "No matches."}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, tone }) {
  const border = tone === "warn" ? "border-amber-300 dark:border-amber-700" : "border-gray-200 dark:border-gray-800";
  return (
    <div className={`bg-white rounded-lg p-3 border ${border} dark:bg-gray-900`}>
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-lg font-bold text-gray-900 dark:text-white">{value}</div>
      {sub && <div className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">{sub}</div>}
    </div>
  );
}
