"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { inputCls, labelCls, formatDate } from "@/app/factoryos/_components/ui";

const num = (n) => (typeof n === "number" ? n.toLocaleString("en-IN") : "—");
const today = () => new Date().toISOString().slice(0, 10);
const btn = "rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60";
const NOT_WH_REASONS = ["Sent direct from vendor", "Service or charge, no goods", "Customer collected earlier", "Invoice will be cancelled", "Other"];

// Type-to-search over the warehouse items master.
function ItemPicker({ items, value, onPick }) {
  const [q, setQ] = useState("");
  const chosen = items.find((i) => i.id === value);
  const hits = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return items.filter((i) => { const t = `${i.sku} ${i.name} ${i.brand}`.toLowerCase(); return words.every((w) => t.includes(w)); }).slice(0, 8);
  }, [q, items]);
  if (chosen) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
        <span className="min-w-0 truncate text-gray-900 dark:text-white"><span className="font-mono text-xs text-gray-500 dark:text-gray-400">{chosen.sku}</span> {chosen.name}</span>
        <button type="button" onClick={() => onPick("")} className="shrink-0 text-xs text-blue-600 hover:underline dark:text-blue-400">Change</button>
      </div>
    );
  }
  return (
    <div>
      <input className={inputCls} placeholder="Search warehouse item by name or code…" value={q} onChange={(e) => setQ(e.target.value)} />
      {hits.length > 0 && (
        <ul className="mt-1 max-h-56 overflow-auto rounded-lg border border-gray-200 bg-white text-sm dark:border-gray-700 dark:bg-gray-900">
          {hits.map((i) => (
            <li key={i.id}>
              <button type="button" onClick={() => { onPick(i.id); setQ(""); }} className="block w-full px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800">
                <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{i.sku}</span> <span className="text-gray-900 dark:text-white">{i.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim() && hits.length === 0 && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">No warehouse item matches. Add it in Items master, or tick "Not a stock item".</p>}
    </div>
  );
}

function LineRow({ line, items, stockByItem, choice, setChoice }) {
  const remembered = line.link;
  const itemId = choice.inventoryItemId ?? remembered?.item?.id ?? "";
  const notStock = choice.notStock ?? !!remembered?.notStock;
  const positions = itemId ? stockByItem[itemId] || [] : [];
  const from = choice.fromLocationId ?? "";
  const picked = positions.find((p) => p.locationId === from);
  const short = picked && picked.qty < line.qty;
  if (!line.goods) {
    return (
      <div className="py-2 text-sm text-gray-500 dark:text-gray-400">{line.name} · not goods, nothing to load</div>
    );
  }
  return (
    <div className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0 text-sm font-medium text-gray-900 dark:text-white">{line.name}</div>
        <div className="shrink-0 text-sm text-gray-700 dark:text-gray-300">{num(line.qty)} {line.unit}{line.boxes ? ` · ${line.boxes} boxes` : ""}</div>
      </div>
      {line.description && <div className="text-xs text-gray-500 dark:text-gray-400">{line.description}</div>}
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div>
          <div className={labelCls}>Warehouse item{remembered && !choice.touched ? " (remembered)" : ""}</div>
          {notStock ? (
            <div className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300">Not a stock item</div>
          ) : (
            <ItemPicker items={items} value={itemId} onPick={(id) => {
              const pos = id ? stockByItem[id] || [] : [];
              setChoice({ inventoryItemId: id, notStock: false, fromLocationId: pos.length === 1 ? pos[0].locationId : "", touched: true });
            }} />
          )}
          <label className="mt-1 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
            <input type="checkbox" checked={notStock} onChange={(e) => setChoice({ notStock: e.target.checked, inventoryItemId: e.target.checked ? "" : itemId, fromLocationId: "", touched: true })} />
            Not a stock item (never kept on the racks)
          </label>
        </div>
        {!notStock && itemId && (
          <div>
            <div className={labelCls}>Taken from</div>
            <select className={inputCls} value={from} onChange={(e) => setChoice({ fromLocationId: e.target.value, touched: true })}>
              <option value="">Not off the racks (straight from production)</option>
              {positions.map((p) => <option key={p.locationId} value={p.locationId}>{p.code} · {num(p.qty)} on hand</option>)}
            </select>
            {positions.length === 0 && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">No stock of this item is on the racks, so no stock will move.</p>}
            {short && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Only {num(picked.qty)} at {picked.code}; the invoice says {num(line.qty)}. Stock there will go negative. Check the count.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function LoadPanel({ inv, items, stockByItem, transportModes, onDone }) {
  const [detail, setDetail] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("loaded"); // loaded | not
  const [choices, setChoices] = useState({});
  const [f, setF] = useState({ dispatchedOn: today(), transportMode: "", lrOrVehicleNumber: "", driverContact: "", cartons: "", ewayBillNo: "", note: "", jobQty: "", recordOnJob: true, jobComplete: false, reason: NOT_WH_REASONS[0], reasonText: "" });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    let live = true;
    fetch(`/api/warehouse/zoho-invoices/${inv.id}`).then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (!live) return;
      if (!r.ok) { setErr(d.error || "Could not open this invoice"); return; }
      setDetail(d);
      const goods = d.invoice.lines.filter((l) => l.goods);
      const init = {};
      for (const l of goods) {
        const pos = l.link?.item ? l.stock : [];
        init[l.lineId] = { fromLocationId: pos.length === 1 ? pos[0].locationId : "" };
      }
      setChoices(init);
      setF((p) => ({
        ...p,
        transportMode: d.suggestedTransport || "",
        cartons: d.invoice.cartons ?? "",
        ewayBillNo: d.invoice.ewayBillNo || "",
        lrOrVehicleNumber: d.invoice.vehicleNo || "",
        jobQty: goods.length === 1 ? String(goods[0].qty) : "",
      }));
    }).catch(() => live && setErr("Could not open this invoice"));
    return () => { live = false; };
  }, [inv.id]);

  async function save() {
    setBusy(true); setErr("");
    const body = mode === "not"
      ? { status: "not_from_warehouse", reason: f.reason === "Other" ? f.reasonText : f.reason, note: f.note }
      : {
          status: "loaded", dispatchedOn: f.dispatchedOn, transportMode: f.transportMode, lrOrVehicleNumber: f.lrOrVehicleNumber,
          driverContact: f.driverContact, cartons: f.cartons, ewayBillNo: f.ewayBillNo, note: f.note,
          recordOnJob: f.recordOnJob, jobQty: f.jobQty, jobComplete: f.jobComplete,
          lines: Object.entries(choices).map(([lineId, c]) => ({ lineId, inventoryItemId: c.inventoryItemId || undefined, notStock: c.notStock, fromLocationId: c.fromLocationId || "" })),
        };
    const res = await fetch(`/api/warehouse/zoho-invoices/${inv.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(d.error || "Could not save"); return; }
    onDone(d);
  }

  if (err && !detail) return <p className="text-sm text-red-600 dark:text-red-400">{err}</p>;
  if (!detail) return <p className="text-sm text-gray-500 dark:text-gray-400">Reading the invoice from Zoho…</p>;
  const job = detail.job;
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button type="button" onClick={() => setMode("loaded")} className={`${btn} ${mode === "loaded" ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "border border-gray-300 text-gray-700 dark:border-gray-700 dark:text-gray-300"}`}>Loaded from warehouse</button>
        <button type="button" onClick={() => setMode("not")} className={`${btn} ${mode === "not" ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "border border-gray-300 text-gray-700 dark:border-gray-700 dark:text-gray-300"}`}>Not from warehouse</button>
      </div>

      {mode === "not" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className={labelCls}>Why</div>
            <select className={inputCls} value={f.reason} onChange={(e) => set("reason", e.target.value)}>
              {NOT_WH_REASONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
          {f.reason === "Other" && (
            <div><div className={labelCls}>Reason</div><input className={inputCls} value={f.reasonText} onChange={(e) => set("reasonText", e.target.value)} /></div>
          )}
        </div>
      ) : (
        <>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {detail.invoice.lines.map((l) => (
              <LineRow key={l.lineId} line={l} items={items} stockByItem={stockByItem}
                choice={choices[l.lineId] || {}} setChoice={(patch) => setChoices((p) => ({ ...p, [l.lineId]: { ...(p[l.lineId] || {}), ...patch } }))} />
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><div className={labelCls}>Dispatch date</div><input type="date" className={inputCls} value={f.dispatchedOn} onChange={(e) => set("dispatchedOn", e.target.value)} /></div>
            <div>
              <div className={labelCls}>Transport{detail.invoice.transport ? ` (Zoho: ${detail.invoice.transport})` : ""}</div>
              <select className={inputCls} value={f.transportMode} onChange={(e) => set("transportMode", e.target.value)}>
                <option value="">Choose…</option>
                {transportModes.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div><div className={labelCls}>LR or vehicle number</div><input className={inputCls} value={f.lrOrVehicleNumber} onChange={(e) => set("lrOrVehicleNumber", e.target.value)} /></div>
            <div><div className={labelCls}>Cartons</div><input inputMode="numeric" className={inputCls} value={f.cartons} onChange={(e) => set("cartons", e.target.value)} /></div>
            <div><div className={labelCls}>Driver contact (optional)</div><input className={inputCls} value={f.driverContact} onChange={(e) => set("driverContact", e.target.value)} /></div>
            <div><div className={labelCls}>E-way bill (optional)</div><input className={inputCls} value={f.ewayBillNo} onChange={(e) => set("ewayBillNo", e.target.value)} /></div>
          </div>
          {job && (
            <div className="rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-800">
              <div className="text-gray-900 dark:text-white">
                Job <Link href={`/factoryos/manager/${job.id}`} className="font-semibold hover:underline">{job.jNumber}</Link> is on {detail.invoice.soNumber} · {job.item} · {job.stage}
              </div>
              {job.canDispatch ? (
                <div className="mt-2 grid gap-3 sm:grid-cols-3">
                  <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300"><input type="checkbox" checked={f.recordOnJob} onChange={(e) => set("recordOnJob", e.target.checked)} /> Record this on the job</label>
                  {f.recordOnJob && <div><div className={labelCls}>Qty sent for the job (pcs)</div><input inputMode="numeric" className={inputCls} value={f.jobQty} onChange={(e) => set("jobQty", e.target.value)} /></div>}
                  {f.recordOnJob && <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300"><input type="checkbox" checked={f.jobComplete} onChange={(e) => set("jobComplete", e.target.checked)} /> This completes the job</label>}
                </div>
              ) : (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">The factory has not handed this job over yet (it is at {job.stage}), so the job will not be marked dispatched from here.</p>
              )}
            </div>
          )}
        </>
      )}
      <div><div className={labelCls}>Note (optional)</div><input className={inputCls} value={f.note} onChange={(e) => set("note", e.target.value)} /></div>
      {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
      <button type="button" onClick={save} disabled={busy} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>
        {busy ? "Saving…" : mode === "not" ? "Save as not from warehouse" : "Mark loaded"}
      </button>
    </div>
  );
}

function PendingCard({ inv, ...rest }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 dark:bg-gray-900 dark:border-gray-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900 dark:text-white">
            <span className="font-mono">{inv.number}</span>
            <span className="font-normal text-gray-600 dark:text-gray-300"> · {inv.customer}{inv.city ? ` · ${inv.city}` : ""}</span>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {formatDate(inv.date)}
            {inv.cartons ? ` · ${inv.cartons} boxes` : ""}
            {inv.transport ? ` · ${inv.transport}` : ""}
            {inv.soNumber ? ` · ${inv.soNumber}` : ""}
            {inv.job ? ` · job ${inv.job.jNumber} (${inv.job.stage})` : ""}
            {inv.handledBy ? ` · ${inv.handledBy}` : ""}
            {inv.status === "draft" ? " · draft in Zoho" : ""}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={`text-xs font-medium ${inv.waitingDays > 2 ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400"}`}>
            {inv.waitingDays === 0 ? "today" : `${inv.waitingDays} day${inv.waitingDays === 1 ? "" : "s"}`}
          </div>
          <button type="button" onClick={() => setOpen((v) => !v)} className={`${btn} mt-1 bg-blue-600 text-white hover:bg-blue-700`}>{open ? "Close" : "Load"}</button>
        </div>
      </div>
      {open && <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800"><LoadPanel inv={inv} {...rest} /></div>}
    </div>
  );
}

function DoneRow({ r, isAdmin }) {
  const [busy, setBusy] = useState(false);
  async function undo() {
    if (!window.confirm(`Undo ${r.invoiceNumber}? Any stock taken out goes back to its rack and the invoice returns to the list.`)) return;
    setBusy(true);
    const res = await fetch(`/api/warehouse/zoho-invoices/records/${r.id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { window.alert(d.error || "Could not undo"); return; }
    if (d.jobLotKept) window.alert("Undone. The dispatch lot on the job is still there; remove it on the job page if it was wrong.");
    window.location.reload();
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
      <div className="min-w-0">
        <span className="font-mono font-medium text-gray-900 dark:text-white">{r.invoiceNumber}</span>
        <span className="text-gray-600 dark:text-gray-300"> · {r.customer}</span>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {r.status === "loaded"
            ? `Loaded ${formatDate(r.dispatchedOn)} · ${r.transportMode} · ${r.lrOrVehicleNumber}${r.cartons ? ` · ${r.cartons} cartons` : ""}${r.movementNo ? ` · stock out ${r.movementNo}` : " · no stock moved"}`
            : `Not from warehouse: ${r.reason}`}
          {r.createdByEmail ? ` · ${r.createdByEmail.split("@")[0]}` : ""}
        </div>
      </div>
      {isAdmin && <button type="button" onClick={undo} disabled={busy} className="text-xs text-red-600 hover:underline disabled:opacity-60 dark:text-red-400">{busy ? "Undoing…" : "Undo"}</button>}
    </div>
  );
}

export default function InvoiceQueueClient({ queue, goLive, items, stockByItem, transportModes, isAdmin }) {
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const match = (i) => !q.trim() || `${i.number} ${i.customer} ${i.city} ${i.soNumber} ${i.job?.jNumber || ""} ${i.handledBy}`.toLowerCase().includes(q.trim().toLowerCase());
  const pending = useMemo(() => queue.pending.filter(match), [queue.pending, q]); // eslint-disable-line react-hooks/exhaustive-deps
  function done(d) {
    const parts = ["Saved."];
    if (d.movementNo) parts.push(`Stock out ${d.movementNo}.`);
    for (const w of d.warnings || []) parts.push(w);
    setMsg(parts.join(" "));
    if ((d.warnings || []).length) window.alert(parts.join(" "));
    window.location.reload();
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Invoices to load</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {queue.pending.length} Zoho invoice{queue.pending.length === 1 ? "" : "s"} dated from {formatDate(queue.since)} not yet recorded
            {queue.since !== goLive ? <> · <Link href="/warehouse/invoices" className="text-blue-600 hover:underline dark:text-blue-400">back to {formatDate(goLive)} onward</Link></> : null}
          </p>
        </div>
        <input className={`${inputCls} max-w-xs`} placeholder="Search invoice, customer, SO…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {queue.error && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">{queue.error}</p>}
      {msg && <p className="text-sm text-green-700 dark:text-green-400">{msg}</p>}

      <section>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">To load ({pending.length})</h2>
        <div className="space-y-2">
          {pending.length ? pending.map((inv) => <PendingCard key={inv.id} inv={inv} items={items} stockByItem={stockByItem} transportModes={transportModes} onDone={done} />)
            : !queue.error && <p className="text-sm text-gray-500 dark:text-gray-400">Every invoice has been recorded.</p>}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Recently recorded</h2>
        <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white px-4 dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
          {queue.done.length ? queue.done.map((r) => <DoneRow key={r.id} r={r} isAdmin={isAdmin} />)
            : <p className="py-3 text-sm text-gray-500 dark:text-gray-400">Nothing recorded yet.</p>}
        </div>
      </section>
    </div>
  );
}
