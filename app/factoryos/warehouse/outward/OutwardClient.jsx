"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  PageHead, Section, Card, Empty, Notice, ErrorText, Field, Segmented, Btn, Pill,
  ItemMatch, lineState, choicesPayload, postJson, inputCls, num, today, fmtDate, who, boxes,
} from "../_components/ui";

function LineRow({ line, items, stockByItem, jobStock, choice, setChoice }) {
  if (!line.goods) return <div className="py-2 text-sm text-gray-500 dark:text-gray-400">{line.name} · not goods, nothing to load</div>;
  const st = lineState(line, choice);
  const positions = st.itemId ? stockByItem[st.itemId] || [] : [];
  const from = choice.fromLocationId ?? "";
  const picked = positions.find((p) => p.locationId === from);
  const short = picked && picked.qty < line.qty;
  const useJobStock = () => setChoice({
    inventoryItemId: jobStock.item.id, createNew: false, notStock: false, touched: true,
    fromLocationId: jobStock.stock[0]?.locationId || "",
  });
  return (
    <div className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0 text-sm font-medium text-gray-900 dark:text-white">{line.name}</div>
        <div className="shrink-0 text-sm tabular-nums text-gray-700 dark:text-gray-300">{num(line.qty)}{line.boxes ? ` in ${boxes(line.boxes)}` : ` ${line.unit}`}</div>
      </div>
      {line.description && <div className="text-xs text-gray-500 dark:text-gray-400">{line.description}</div>}
      {jobStock && jobStock.stock.length > 0 && st.itemId !== jobStock.item.id && (
        <button type="button" onClick={useJobStock} className="mt-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-left text-xs font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          Use the goods received from the job: {num(jobStock.stock[0].qty)} at {jobStock.stock[0].code}
        </button>
      )}
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <ItemMatch line={line} items={items} choice={choice} setChoice={setChoice}
          onItem={(id) => { const pos = id ? stockByItem[id] || [] : []; setChoice({ fromLocationId: pos.length === 1 ? pos[0].locationId : "" }); }} />
        {!st.notStock && (st.itemId || st.isNew) && (
          <Field label="Taken from">
            <select className={inputCls} value={from} onChange={(e) => setChoice({ fromLocationId: e.target.value })}>
              <option value="">Not off the racks (came straight in and out)</option>
              {positions.map((p) => <option key={p.locationId} value={p.locationId}>{p.code} · {num(p.qty)} on hand</option>)}
            </select>
            {positions.length === 0 && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">None of this item is on the racks, so no stock will move.</p>}
            {short && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Only {num(picked.qty)} at {picked.code}; the invoice says {num(line.qty)}. Stock there will go below zero, so check the count.</p>}
          </Field>
        )}
      </div>
    </div>
  );
}

function LoadPanel({ inv, items, stockByItem, transportModes, reasons, canWork, onDone }) {
  const [detail, setDetail] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("loaded");
  const [choices, setChoices] = useState({});
  const [f, setF] = useState({ dispatchedOn: today(), transportMode: "", lrOrVehicleNumber: "", driverContact: "", cartons: "", ewayBillNo: "", note: "", jobId: "", jobQty: "", recordOnJob: true, jobComplete: false, reason: reasons[0], reasonText: "" });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const setChoice = (lineId) => (patch) => setChoices((p) => ({ ...p, [lineId]: { ...(p[lineId] || {}), ...patch } }));

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
        // Goods received from this invoice's job win over the remembered item.
        if (d.jobStock?.stock?.length && goods.length === 1) {
          init[l.lineId] = { inventoryItemId: d.jobStock.item.id, notStock: false, createNew: false, touched: true, fromLocationId: d.jobStock.stock[0].locationId };
        }
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
          jobId: f.jobId || undefined, recordOnJob: f.recordOnJob, jobQty: f.jobQty, jobComplete: f.jobComplete,
          lines: choicesPayload(detail.invoice.lines, choices, (l, c) => ({ fromLocationId: c.fromLocationId || "" })),
        };
    const res = await postJson(`/api/warehouse/zoho-invoices/${inv.id}`, body);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    onDone(res.data);
  }

  if (err && !detail) return <ErrorText>{err}</ErrorText>;
  if (!detail) return <p className="text-sm text-gray-500 dark:text-gray-400">Reading the invoice from Zoho…</p>;
  const job = detail.job || detail.jobChoices.find((j) => j.id === f.jobId) || null;
  const jobCanDispatch = detail.job ? detail.job.canDispatch : !!job;
  return (
    <div className="space-y-4">
      {canWork && (
        <Segmented value={mode} onChange={setMode} options={[{ value: "loaded", label: "Loaded from the warehouse" }, { value: "not", label: "Not from the warehouse" }]} />
      )}
      {mode === "not" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Why">
            <select className={inputCls} value={f.reason} onChange={(e) => set("reason", e.target.value)}>{reasons.map((r) => <option key={r}>{r}</option>)}</select>
          </Field>
          {f.reason === "Other" && <Field label="Reason"><input className={inputCls} value={f.reasonText} onChange={(e) => set("reasonText", e.target.value)} /></Field>}
        </div>
      ) : (
        <>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {detail.invoice.lines.map((l) => (
              <LineRow key={l.lineId} line={l} items={items} stockByItem={stockByItem} jobStock={detail.jobStock} choice={choices[l.lineId] || {}} setChoice={setChoice(l.lineId)} />
            ))}
          </div>
          {canWork && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Dispatch date"><input type="date" className={inputCls} value={f.dispatchedOn} onChange={(e) => set("dispatchedOn", e.target.value)} /></Field>
              <Field label={`Transport${detail.invoice.transport ? ` (Zoho: ${detail.invoice.transport.trim()})` : ""}`}>
                <select className={inputCls} value={f.transportMode} onChange={(e) => set("transportMode", e.target.value)}>
                  <option value="">Choose…</option>
                  {transportModes.map((m) => <option key={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="LR or vehicle number"><input className={inputCls} value={f.lrOrVehicleNumber} onChange={(e) => set("lrOrVehicleNumber", e.target.value)} /></Field>
              <Field label="Cartons"><input inputMode="numeric" className={inputCls} value={f.cartons} onChange={(e) => set("cartons", e.target.value)} /></Field>
              <Field label="Driver contact (optional)"><input className={inputCls} value={f.driverContact} onChange={(e) => set("driverContact", e.target.value)} /></Field>
              <Field label="E-way bill (optional)"><input className={inputCls} value={f.ewayBillNo} onChange={(e) => set("ewayBillNo", e.target.value)} /></Field>
            </div>
          )}
          {canWork && (
            <div className="rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-800">
              {detail.job ? (
                <div className="text-gray-900 dark:text-white">
                  Job <Link href={`/factoryos/manager/${detail.job.id}`} className="font-semibold underline">{detail.job.jNumber}</Link> is on {detail.invoice.soNumber} · {detail.job.item} · {detail.job.stage}
                </div>
              ) : (
                <Field label={detail.invoice.soNumber ? `No job is linked to ${detail.invoice.soNumber}. Is this invoice for a job?` : "This invoice has no sales order. Is it for a job?"}>
                  <select className={inputCls} value={f.jobId} onChange={(e) => set("jobId", e.target.value)}>
                    <option value="">No job (stock or traded goods)</option>
                    {detail.jobChoices.map((j) => <option key={j.id} value={j.id}>{j.jNumber} · {j.brand} · {j.item}</option>)}
                  </select>
                </Field>
              )}
              {job && jobCanDispatch && (
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300"><input type="checkbox" checked={f.recordOnJob} onChange={(e) => set("recordOnJob", e.target.checked)} /> Mark it on the job</label>
                  {f.recordOnJob && <Field label="Quantity sent for the job (pcs)"><input inputMode="numeric" className={inputCls} value={f.jobQty} onChange={(e) => set("jobQty", e.target.value)} /></Field>}
                  {f.recordOnJob && <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300"><input type="checkbox" checked={f.jobComplete} onChange={(e) => set("jobComplete", e.target.checked)} /> This completes the job</label>}
                </div>
              )}
              {detail.job && !detail.job.canDispatch && (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">The factory has not handed this job over yet (it is at {detail.job.stage}), so the job will not be marked dispatched from here.</p>
              )}
            </div>
          )}
        </>
      )}
      {canWork && <Field label="Note (optional)"><input className={inputCls} value={f.note} onChange={(e) => set("note", e.target.value)} /></Field>}
      <ErrorText>{err}</ErrorText>
      {canWork && <Btn onClick={save} disabled={busy}>{busy ? "Saving…" : mode === "not" ? "Save as not from the warehouse" : "Mark loaded"}</Btn>}
    </div>
  );
}

function PendingCard({ inv, canWork, ...rest }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-sm font-semibold text-gray-900 dark:text-white">{inv.number}</span>
            {inv.waitingDays > 2 ? <Pill tone="late">{inv.waitingDays} days</Pill> : inv.waitingDays > 0 ? <Pill tone="warn">{inv.waitingDays} day{inv.waitingDays === 1 ? "" : "s"}</Pill> : <Pill>today</Pill>}
            {inv.status === "draft" && <Pill>draft in Zoho</Pill>}
          </div>
          <div className="mt-0.5 truncate text-sm text-gray-800 dark:text-gray-200">{inv.customer}{inv.city ? ` · ${inv.city}` : ""}</div>
          <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {[fmtDate(inv.date), boxes(inv.cartons), inv.transport?.trim(), inv.soNumber, inv.job ? `job ${inv.job.jNumber}` : "", inv.handledBy].filter(Boolean).join(" · ")}
          </div>
        </div>
        <Btn tone={open ? "ghost" : "primary"} onClick={() => setOpen((v) => !v)} className="shrink-0">{open ? "Close" : canWork ? "Load" : "View"}</Btn>
      </div>
      {open && <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800"><LoadPanel inv={inv} canWork={canWork} {...rest} /></div>}
    </Card>
  );
}

function DoneRow({ r, isAdmin, onChange }) {
  const [busy, setBusy] = useState(false);
  async function undo() {
    if (!window.confirm(`Undo ${r.invoiceNumber}? Stock taken out goes back to its rack and the invoice returns to the list.`)) return;
    setBusy(true);
    const res = await postJson(`/api/warehouse/zoho-invoices/records/${r.id}`, undefined, "DELETE");
    setBusy(false);
    if (!res.ok) { window.alert(res.error); return; }
    if (res.data.jobLotKept) window.alert("Undone. The dispatch already marked on the job is still there; remove it on the job page if it was wrong.");
    onChange();
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
      <div className="min-w-0">
        <span className="font-mono font-medium text-gray-900 dark:text-white">{r.invoiceNumber}</span>
        <span className="text-gray-600 dark:text-gray-300"> · {r.customer}</span>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {r.status === "loaded"
            ? [`Loaded ${fmtDate(r.dispatchedOn)}`, r.transportMode, r.lrOrVehicleNumber, boxes(r.cartons, "carton"), r.movementNo ? `stock out ${r.movementNo}` : "no stock moved", r.jNumber ? `job ${r.jNumber}` : "", r.deliveredOn ? `delivered ${fmtDate(r.deliveredOn)}` : "in transit"].filter(Boolean).join(" · ")
            : `Not from the warehouse: ${r.reason}`}
          {r.createdByEmail ? ` · ${who(r.createdByEmail)}` : ""}
        </div>
      </div>
      {isAdmin && <Btn tone="danger" onClick={undo} disabled={busy}>{busy ? "Undoing…" : "Undo"}</Btn>}
    </div>
  );
}

export default function OutwardClient({ queue, items, stockByItem, transportModes, reasons, canWork, isAdmin }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const match = (text) => !q.trim() || text.toLowerCase().includes(q.trim().toLowerCase());
  const pending = useMemo(() => queue.pending.filter((i) => match(`${i.number} ${i.customer} ${i.city} ${i.soNumber} ${i.job?.jNumber || ""} ${i.handledBy}`)), [queue.pending, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const waitingSo = new Set(queue.pending.map((i) => (i.soNumber || "").toUpperCase()).filter(Boolean));
  const jobs = queue.readyJobs.filter((j) => match(`${j.jNumber} ${j.brand} ${j.clientName} ${j.item} ${j.zohoSoNo || ""}`));
  function done(d) {
    const parts = ["Saved."];
    if (d.movementNo) parts.push(`Stock out ${d.movementNo}.`);
    for (const w of d.warnings || []) parts.push(w);
    setMsg(parts.join(" "));
    router.refresh();
  }
  return (
    <div>
      <PageHead
        title="Outward"
        sub={`${queue.pending.length} Zoho invoice${queue.pending.length === 1 ? "" : "s"} dated from ${fmtDate(queue.since)} still to leave`}
        right={<input className={`${inputCls} max-w-xs`} placeholder="Search invoice, customer, SO, job…" value={q} onChange={(e) => setQ(e.target.value)} />}
      />
      {queue.error && <Notice>{queue.error}</Notice>}
      {msg && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">{msg}</p>}

      <Section title="Invoices to load" count={pending.length}>
        <div className="space-y-2">
          {pending.length
            ? pending.map((inv) => <PendingCard key={inv.id} inv={inv} items={items} stockByItem={stockByItem} transportModes={transportModes} reasons={reasons} canWork={canWork} onDone={done} />)
            : !queue.error && <Empty>Every invoice has been recorded.</Empty>}
        </div>
      </Section>

      <Section title="Handed over by the factory" count={jobs.length} hint="These jobs are ready and leave when their Zoho invoice is loaded above.">
        {jobs.length ? (
          <Card className="divide-y divide-gray-100 !p-0 dark:divide-gray-800">
            {jobs.map((j) => (
              <div key={j.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <Link href={`/factoryos/manager/${j.id}`} className="font-semibold text-gray-900 underline dark:text-white">{j.jNumber}</Link>
                  <span className="text-gray-600 dark:text-gray-300"> · {j.brand || j.clientName} · {j.item}</span>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{num(j.fgQty ?? j.qty)} pcs{j.fgCartons ? ` · ${boxes(j.fgCartons, "carton")}` : ""}{j.zohoSoNo ? ` · ${j.zohoSoNo}` : " · no SO on the job"}</div>
                </div>
                {j.zohoSoNo && waitingSo.has(j.zohoSoNo.toUpperCase()) ? <Pill tone="good">invoice is waiting above</Pill>
                  : <Pill tone={j.waitingDays > 7 ? "late" : "neutral"}>no invoice yet · {j.waitingDays ?? 0} days</Pill>}
              </div>
            ))}
          </Card>
        ) : <Empty>Nothing from the factory is waiting.</Empty>}
      </Section>

      <Section title="Recently recorded">
        {queue.done.length
          ? <Card className="divide-y divide-gray-100 !py-1 dark:divide-gray-800">{queue.done.map((r) => <DoneRow key={r.id} r={r} isAdmin={isAdmin} onChange={() => router.refresh()} />)}</Card>
          : <Empty>Nothing recorded yet.</Empty>}
      </Section>
    </div>
  );
}
