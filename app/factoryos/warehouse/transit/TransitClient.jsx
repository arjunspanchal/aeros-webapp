"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHead, Section, Card, Empty, ErrorText, Btn, Pill, postJson, inputCls, num, today, fmtDate, who, boxes } from "../_components/ui";

function DeliverControls({ onDeliver, busy, minDate }) {
  const [date, setDate] = useState(today());
  return (
    <div className="flex items-end gap-2">
      <input type="date" aria-label="Delivery date" className={`${inputCls} w-auto`} value={date} min={minDate || undefined} onChange={(e) => setDate(e.target.value)} />
      <Btn tone="good" onClick={() => onDeliver(date)} disabled={busy || !date} className="shrink-0">{busy ? "Saving…" : "Delivered"}</Btn>
    </div>
  );
}

function InvoiceCard({ r, canDeliver, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function deliver(deliveredOn) {
    setBusy(true); setErr("");
    const res = await postJson(`/api/warehouse/zoho-invoices/records/${r.id}/deliver`, { deliveredOn });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    onDone(`${r.invoiceNumber} marked delivered.${(res.data.warnings || []).length ? ` ${res.data.warnings.join(" ")}` : ""}`);
  }
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-sm font-semibold text-gray-900 dark:text-white">{r.invoiceNumber}</span>
            <Pill tone={r.daysOut > 7 ? "late" : r.daysOut > 3 ? "warn" : "neutral"}>{r.daysOut === 0 ? "left today" : `${r.daysOut} day${r.daysOut === 1 ? "" : "s"} out`}</Pill>
          </div>
          <div className="mt-0.5 truncate text-sm text-gray-800 dark:text-gray-200">{r.customer}</div>
          <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {[`Left ${fmtDate(r.dispatchedOn)}`, r.transportMode, r.lrOrVehicleNumber, boxes(r.cartons, "carton"), r.driverContact, r.jNumber ? `job ${r.jNumber}` : "", r.soNumber].filter(Boolean).join(" · ")}
          </div>
        </div>
        {canDeliver && <DeliverControls onDeliver={deliver} busy={busy} minDate={r.dispatchedOn} />}
      </div>
      <ErrorText>{err}</ErrorText>
    </Card>
  );
}

function JobCard({ j, canDeliver, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function deliver(deliveredOn) {
    setBusy(true); setErr("");
    const res = await postJson(`/api/factoryos/jobs/${j.id}`, { stage: "Delivered", stepFields: { deliveredOn } }, "PATCH");
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    onDone(`Job ${j.jNumber} marked delivered.`);
  }
  const last = j.lots[j.lots.length - 1];
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/factoryos/manager/${j.id}`} className="text-sm font-semibold text-gray-900 underline dark:text-white">{j.jNumber}</Link>
            <Pill tone={j.waitingDays > 10 ? "late" : "neutral"}>{j.waitingDays ?? 0} days out</Pill>
          </div>
          <div className="mt-0.5 truncate text-sm text-gray-800 dark:text-gray-200">{j.brand || j.clientName} · {j.item}</div>
          <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {last ? [`Left ${fmtDate(last.dispatchedOn)}`, last.transportMode, last.lrOrVehicleNumber, `invoice ${last.zohoInvoiceNo}`].filter(Boolean).join(" · ") : `${num(j.fgQty ?? j.qty)} pcs · no dispatch details were recorded`}
          </div>
        </div>
        {canDeliver && <DeliverControls onDeliver={deliver} busy={busy} />}
      </div>
      <ErrorText>{err}</ErrorText>
    </Card>
  );
}

export default function TransitClient({ data, canDeliver }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const match = (text) => !q.trim() || text.toLowerCase().includes(q.trim().toLowerCase());
  const invoices = useMemo(() => data.invoices.filter((r) => match(`${r.invoiceNumber} ${r.customer} ${r.lrOrVehicleNumber} ${r.jNumber} ${r.soNumber}`)), [data.invoices, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const jobs = useMemo(() => data.jobs.filter((j) => match(`${j.jNumber} ${j.brand} ${j.clientName} ${j.item}`)), [data.jobs, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = (m) => { setMsg(m); router.refresh(); };
  return (
    <div>
      <PageHead
        title="In transit"
        sub={`${data.invoices.length + data.jobs.length} dispatch${data.invoices.length + data.jobs.length === 1 ? "" : "es"} out, waiting for delivery to be confirmed`}
        right={<input className={`${inputCls} max-w-xs`} placeholder="Search invoice, customer, LR, job…" value={q} onChange={(e) => setQ(e.target.value)} />}
      />
      {msg && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">{msg}</p>}

      <Section title="Invoices out" count={invoices.length}>
        <div className="space-y-2">{invoices.length ? invoices.map((r) => <InvoiceCard key={r.id} r={r} canDeliver={canDeliver} onDone={done} />) : <Empty>No loaded invoice is waiting for delivery.</Empty>}</div>
      </Section>

      {data.jobs.length > 0 && (
        <Section title="Jobs out with no invoice recorded here" count={jobs.length} hint="Dispatched before the warehouse started recording invoices, or from the job page.">
          <div className="space-y-2">{jobs.map((j) => <JobCard key={j.id} j={j} canDeliver={canDeliver} onDone={done} />)}</div>
        </Section>
      )}

      <Section title="Recently delivered">
        {data.delivered.length ? (
          <Card className="divide-y divide-gray-100 !py-1 dark:divide-gray-800">
            {data.delivered.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <div className="min-w-0">
                  <span className="font-mono font-medium text-gray-900 dark:text-white">{r.invoiceNumber}</span>
                  <span className="text-gray-600 dark:text-gray-300"> · {r.customer}</span>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{[`Delivered ${fmtDate(r.deliveredOn)}`, `left ${fmtDate(r.dispatchedOn)}`, r.transportMode, r.deliveredBy ? who(r.deliveredBy) : ""].filter(Boolean).join(" · ")}</div>
                </div>
                {r.zohoAckSynced ? <Pill tone="good">ticked in Zoho</Pill> : <Pill tone="warn">not ticked in Zoho</Pill>}
              </div>
            ))}
          </Card>
        ) : <Empty>No delivery confirmed yet.</Empty>}
      </Section>
    </div>
  );
}
