"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  PageHead, Section, Card, Empty, Notice, ErrorText, Field, Segmented, Btn, Pill,
  ItemMatch, LocationSelect, lineState, choicesPayload, postJson, inputCls, num, today, fmtDate, who, boxes,
} from "../_components/ui";

// ---------- Vendor PO ----------

function PoLine({ line, items, locations, stockByItem, choice, setChoice }) {
  if (!line.goods) return <div className="py-2 text-sm text-gray-500 dark:text-gray-400">{line.name} · not goods, nothing to receive</div>;
  const st = lineState(line, choice);
  const holding = st.itemId ? stockByItem[st.itemId] || [] : [];
  return (
    <div className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0 text-sm font-medium text-gray-900 dark:text-white">{line.name}</div>
        <div className="shrink-0 text-sm tabular-nums text-gray-700 dark:text-gray-300">
          ordered {num(line.qty)} {line.unit}{line.receivedSoFar > 0 ? ` · ${num(line.receivedSoFar)} in so far` : ""}
        </div>
      </div>
      {line.description && <div className="line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{line.description}</div>}
      <div className="mt-2 grid gap-3 sm:grid-cols-4">
        <Field label="Received now">
          <input inputMode="decimal" className={inputCls} value={choice.qtyReceived ?? ""} onChange={(e) => setChoice({ qtyReceived: e.target.value })} />
        </Field>
        <Field label="Rejected or damaged">
          <input inputMode="decimal" className={inputCls} value={choice.qtyRejected ?? ""} onChange={(e) => setChoice({ qtyRejected: e.target.value })} placeholder="0" />
        </Field>
        <div className="sm:col-span-2">
          <ItemMatch line={line} items={items} choice={choice} setChoice={setChoice}
            onItem={(id) => { const pos = id ? stockByItem[id] || [] : []; if (pos.length) setChoice({ toLocationId: pos[0].locationId }); }} />
        </div>
        {!st.notStock && (st.itemId || st.isNew) && (
          <Field label="Put in" className="sm:col-span-2">
            <LocationSelect locations={locations} holding={holding} value={choice.toLocationId} onChange={(v) => setChoice({ toLocationId: v })} />
          </Field>
        )}
      </div>
    </div>
  );
}

function PoPanel({ po, items, locations, stockByItem, reasons, canWork, onDone }) {
  const [detail, setDetail] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("received");
  const [choices, setChoices] = useState({});
  const [f, setF] = useState({ receivedOn: today(), challanNo: "", vehicleNo: "", cartons: "", note: "", closeShort: false, reason: reasons[0], reasonText: "" });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const setChoice = (lineId) => (patch) => setChoices((p) => ({ ...p, [lineId]: { ...(p[lineId] || {}), ...patch } }));

  useEffect(() => {
    let live = true;
    fetch(`/api/warehouse/inward/po/${po.id}`).then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (!live) return;
      if (!r.ok) { setErr(d.error || "Could not open this purchase order"); return; }
      setDetail(d);
      const init = {};
      for (const l of d.po.lines.filter((x) => x.goods)) {
        init[l.lineId] = { qtyReceived: l.balance > 0 ? String(l.balance) : "", toLocationId: l.stock?.[0]?.locationId || "" };
      }
      setChoices(init);
      setF((p) => ({ ...p, cartons: d.po.cartons ?? "" }));
    }).catch(() => live && setErr("Could not open this purchase order"));
    return () => { live = false; };
  }, [po.id]);

  async function save() {
    setBusy(true); setErr("");
    const body = mode === "not"
      ? { status: "not_to_warehouse", reason: f.reason === "Other" ? f.reasonText : f.reason, note: f.note }
      : {
          status: "received", receivedOn: f.receivedOn, challanNo: f.challanNo, vehicleNo: f.vehicleNo, cartons: f.cartons, note: f.note,
          complete: f.closeShort ? true : undefined,
          lines: choicesPayload(detail.po.lines, choices, (l, c) => ({ qtyReceived: c.qtyReceived || "", qtyRejected: c.qtyRejected || "", toLocationId: c.toLocationId || "" })),
        };
    const res = await postJson(`/api/warehouse/inward/po/${po.id}`, body);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    onDone(res.data, po.number);
  }

  if (err && !detail) return <ErrorText>{err}</ErrorText>;
  if (!detail) return <p className="text-sm text-gray-500 dark:text-gray-400">Reading the purchase order from Zoho…</p>;
  return (
    <div className="space-y-4">
      {detail.po.deliverTo && <p className="text-xs text-gray-500 dark:text-gray-400">Deliver to: {detail.po.deliverTo}</p>}
      {canWork && <Segmented value={mode} onChange={setMode} options={[{ value: "received", label: "Received at the warehouse" }, { value: "not", label: "Not coming to the warehouse" }]} />}
      {mode === "not" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Why"><select className={inputCls} value={f.reason} onChange={(e) => set("reason", e.target.value)}>{reasons.map((r) => <option key={r}>{r}</option>)}</select></Field>
          {f.reason === "Other" && <Field label="Reason"><input className={inputCls} value={f.reasonText} onChange={(e) => set("reasonText", e.target.value)} /></Field>}
        </div>
      ) : (
        <>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {detail.po.lines.map((l) => <PoLine key={l.lineId} line={l} items={items} locations={locations} stockByItem={stockByItem} choice={choices[l.lineId] || {}} setChoice={setChoice(l.lineId)} />)}
          </div>
          {canWork && (
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Received on"><input type="date" className={inputCls} value={f.receivedOn} onChange={(e) => set("receivedOn", e.target.value)} /></Field>
              <Field label="Vendor challan or bill no."><input className={inputCls} value={f.challanNo} onChange={(e) => set("challanNo", e.target.value)} /></Field>
              <Field label="Vehicle (optional)"><input className={inputCls} value={f.vehicleNo} onChange={(e) => set("vehicleNo", e.target.value)} /></Field>
              <Field label="Cartons"><input inputMode="numeric" className={inputCls} value={f.cartons} onChange={(e) => set("cartons", e.target.value)} /></Field>
            </div>
          )}
          {canWork && (
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={f.closeShort} onChange={(e) => set("closeShort", e.target.checked)} />
              Nothing more is coming on this PO (close it even if short)
            </label>
          )}
        </>
      )}
      {canWork && <Field label="Note (optional)"><input className={inputCls} value={f.note} onChange={(e) => set("note", e.target.value)} /></Field>}
      <ErrorText>{err}</ErrorText>
      {canWork && <Btn onClick={save} disabled={busy}>{busy ? "Saving…" : mode === "not" ? "Save as not coming" : "Receive"}</Btn>}
    </div>
  );
}

function PoCard({ po, canWork, ...rest }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-sm font-semibold text-gray-900 dark:text-white">{po.number}</span>
            {po.overdueDays > 0 ? <Pill tone="late">{po.overdueDays} day{po.overdueDays === 1 ? "" : "s"} late</Pill> : po.expectedOn ? <Pill>due {fmtDate(po.expectedOn)}</Pill> : <Pill>no date</Pill>}
            {po.receivedSoFar > 0 && <Pill tone="warn">part received</Pill>}
          </div>
          <div className="mt-0.5 truncate text-sm text-gray-800 dark:text-gray-200">{po.vendor}</div>
          <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{[po.reference, boxes(po.cartons), po.transport, `PO dated ${fmtDate(po.date)}`].filter(Boolean).join(" · ")}</div>
        </div>
        <Btn tone={open ? "ghost" : "primary"} onClick={() => setOpen((v) => !v)} className="shrink-0">{open ? "Close" : canWork ? "Receive" : "View"}</Btn>
      </div>
      {open && <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800"><PoPanel po={po} canWork={canWork} {...rest} /></div>}
    </Card>
  );
}

// ---------- From the factory ----------

function JobCard({ job, locations, canWork, onDone }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const balance = Math.max(0, (job.qty || 0) - job.receivedSoFar);
  const [f, setF] = useState({ receivedOn: today(), qty: balance ? String(balance) : "", cartons: job.cartons ?? "", toLocationId: "", more: false, note: "" });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  async function save(status) {
    const body = status === "not_to_warehouse"
      ? { status, reason: "Sent direct from the factory" }
      : { status: "received", receivedOn: f.receivedOn, qty: f.qty, cartons: f.cartons, toLocationId: f.toLocationId, complete: !f.more, note: f.note };
    if (status === "not_to_warehouse" && !window.confirm(`Job ${job.jNumber} goes straight from the factory and never comes into the warehouse?`)) return;
    setBusy(true); setErr("");
    const res = await postJson(`/api/warehouse/inward/job/${job.id}`, body);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    onDone(res.data, `job ${job.jNumber}`);
  }
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/factoryos/manager/${job.id}`} className="text-sm font-semibold text-gray-900 underline dark:text-white">{job.jNumber}</Link>
            <Pill tone={job.waitingDays > 3 ? "late" : "neutral"}>{job.waitingDays === 0 ? "today" : `${job.waitingDays} day${job.waitingDays === 1 ? "" : "s"}`}</Pill>
            {job.receivedSoFar > 0 && <Pill tone="warn">{num(job.receivedSoFar)} in so far</Pill>}
          </div>
          <div className="mt-0.5 truncate text-sm text-gray-800 dark:text-gray-200">{job.brand} · {job.item}</div>
          <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{[`${num(job.qty)} pcs`, boxes(job.cartons, "carton"), job.soNumber, job.note ? `Note: ${job.note}` : ""].filter(Boolean).join(" · ")}</div>
        </div>
        {canWork && <Btn tone={open ? "ghost" : "primary"} onClick={() => setOpen((v) => !v)} className="shrink-0">{open ? "Close" : "Receive"}</Btn>}
      </div>
      {open && (
        <div className="mt-4 space-y-3 border-t border-gray-100 pt-4 dark:border-gray-800">
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Received on"><input type="date" className={inputCls} value={f.receivedOn} onChange={(e) => set("receivedOn", e.target.value)} /></Field>
            <Field label="Quantity (pcs)"><input inputMode="numeric" className={inputCls} value={f.qty} onChange={(e) => set("qty", e.target.value)} /></Field>
            <Field label="Cartons"><input inputMode="numeric" className={inputCls} value={f.cartons} onChange={(e) => set("cartons", e.target.value)} /></Field>
            <Field label="Put in"><LocationSelect locations={locations} value={f.toLocationId} onChange={(v) => set("toLocationId", v)} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><input type="checkbox" checked={f.more} onChange={(e) => set("more", e.target.checked)} /> More of this job is still to come</label>
          <Field label="Note (optional)"><input className={inputCls} value={f.note} onChange={(e) => set("note", e.target.value)} /></Field>
          <ErrorText>{err}</ErrorText>
          <div className="flex flex-wrap items-center gap-3">
            <Btn onClick={() => save("received")} disabled={busy}>{busy ? "Saving…" : "Receive"}</Btn>
            <button type="button" onClick={() => save("not_to_warehouse")} disabled={busy} className="text-xs font-medium text-gray-600 underline dark:text-gray-300">Going direct from the factory, not into the warehouse</button>
          </div>
        </div>
      )}
    </Card>
  );
}

function ReceiptRow({ r, isAdmin, onChange }) {
  const [busy, setBusy] = useState(false);
  async function undo() {
    if (!window.confirm("Undo this receipt? The stock it brought in is taken back out of its rack.")) return;
    setBusy(true);
    const res = await postJson(`/api/warehouse/inward/receipts/${r.id}`, undefined, "DELETE");
    setBusy(false);
    if (!res.ok) { window.alert(res.error); return; }
    onChange();
  }
  const label = r.source === "zoho_po" ? r.poNumber : `Job ${r.jNumber}`;
  const from = r.source === "zoho_po" ? r.vendor : `Factory · ${r.jobItem}`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
      <div className="min-w-0">
        <span className="font-mono font-medium text-gray-900 dark:text-white">{label}</span>
        <span className="text-gray-600 dark:text-gray-300"> · {from}</span>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {r.status === "received"
            ? [`Received ${fmtDate(r.receivedOn)}`, `${num(r.qty)} in`, r.rejected ? `${num(r.rejected)} rejected` : "", boxes(r.cartons, "carton"), r.challanNo ? `challan ${r.challanNo}` : "", r.movementNo ? `stock in ${r.movementNo}` : "no stock moved", r.complete ? "" : "more to come"].filter(Boolean).join(" · ")
            : `Not coming to the warehouse: ${r.reason}`}
          {r.createdByEmail ? ` · ${who(r.createdByEmail)}` : ""}
        </div>
      </div>
      {isAdmin && <Btn tone="danger" onClick={undo} disabled={busy}>{busy ? "Undoing…" : "Undo"}</Btn>}
    </div>
  );
}

export default function InwardClient({ queue, items, locations, stockByItem, reasons, canWork, isAdmin }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const match = (text) => !q.trim() || text.toLowerCase().includes(q.trim().toLowerCase());
  const pos = useMemo(() => queue.expected.filter((p) => match(`${p.number} ${p.vendor} ${p.reference}`)), [queue.expected, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const jobs = useMemo(() => queue.fromFactory.filter((j) => match(`${j.jNumber} ${j.brand} ${j.item} ${j.soNumber}`)), [queue.fromFactory, q]); // eslint-disable-line react-hooks/exhaustive-deps
  function done(d, what) {
    setMsg(`Saved ${what}.${d.movementNo ? ` Stock in ${d.movementNo}.` : ""}${d.complete === false ? " The rest stays on the list." : ""}`);
    router.refresh();
  }
  return (
    <div>
      <PageHead
        title="Inward"
        sub={`${queue.expected.length} purchase order${queue.expected.length === 1 ? "" : "s"} expected · ${queue.fromFactory.length} job${queue.fromFactory.length === 1 ? "" : "s"} handed over by the factory`}
        right={<input className={`${inputCls} max-w-xs`} placeholder="Search PO, vendor, job…" value={q} onChange={(e) => setQ(e.target.value)} />}
      />
      {queue.error && <Notice>{queue.error}</Notice>}
      {msg && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">{msg}</p>}

      <Section title="From vendors" count={pos.length} hint={`Zoho purchase orders dated from ${fmtDate(queue.since)}.`}>
        <div className="space-y-2">
          {pos.length
            ? pos.map((po) => <PoCard key={po.id} po={po} items={items} locations={locations} stockByItem={stockByItem} reasons={reasons} canWork={canWork} onDone={done} />)
            : !queue.error && <Empty>No purchase order is waiting.</Empty>}
        </div>
      </Section>

      <Section title="From the factory" count={jobs.length} hint="Jobs the factory has finished and handed over.">
        <div className="space-y-2">
          {jobs.length ? jobs.map((j) => <JobCard key={j.id} job={j} locations={locations} canWork={canWork} onDone={done} />) : <Empty>Nothing from the factory is waiting.</Empty>}
        </div>
      </Section>

      <Section title="Recently received">
        {queue.recent.length
          ? <Card className="divide-y divide-gray-100 !py-1 dark:divide-gray-800">{queue.recent.map((r) => <ReceiptRow key={r.id} r={r} isAdmin={isAdmin} onChange={() => router.refresh()} />)}</Card>
          : <Empty>Nothing received yet.</Empty>}
      </Section>
    </div>
  );
}
