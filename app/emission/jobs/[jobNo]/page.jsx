"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "../../_components/AuthProvider";
import { Eyebrow, Title, StatusLabel, Meta, Field, Divider, PhoneInput } from "../../_components/ui";
import SignaturePad from "../../_components/SignaturePad";
import {
  getJobByNo, updateJob, listLineItems, addLineItem, updateLineItem,
  getClaim, createClaim, updateClaim, listStaff, listJobEvents, addJobNote,
} from "../../_lib/data";
import { uploadObject } from "../../_lib/client";
import { BUCKETS } from "../../_lib/config";
import { inr, fmtDate, daysSince, todayISO, timeAgo, PAYMENT_LABEL, ITEM_TYPE_LABEL, CLAIM_LABEL, statusLabel } from "../../_lib/format";
import { JobStatus, LIFECYCLE, TERMINAL_BRANCHES, TERMINAL_STATUSES, ItemType, ClaimStatus, PaymentMethod } from "../../_lib/schemas";

export default function JobDetailPage({ params }) {
  const { session } = useAuth();
  const isAdmin = session?.role === "admin";
  const jobNo = params.jobNo;

  const [job, setJob] = useState(null);
  const [items, setItems] = useState([]);
  const [claim, setClaim] = useState(null);
  const [staff, setStaff] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const reload = useCallback(async () => {
    if (!session) return;
    try {
      const j = await getJobByNo(session, jobNo);
      setJob(j);
      if (j) {
        const [li, cl, ev] = await Promise.all([
          listLineItems(session, j.id),
          getClaim(session, j.id),
          listJobEvents(session, j.id).catch(() => []),
        ]);
        setItems(li);
        setClaim(cl);
        setEvents(ev || []);
      }
      setErr("");
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, [session, jobNo]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { if (session) listStaff(session).then(setStaff).catch(() => {}); }, [session]);

  if (loading) return <div className="em-label" style={{ padding: 24 }}>LOADING…</div>;
  if (err) return <div className="em-card" style={{ padding: 16 }}>{err}</div>;
  if (!job) return <div className="em-label" style={{ padding: 24 }}>JOB #{jobNo} NOT FOUND</div>;

  const open = !TERMINAL_STATUSES.includes(job.status);
  const age = daysSince(job.date_received);
  const techName = staff.find((s) => s.id === job.technician_id)?.name;
  const itemsTotal = items.reduce((s, it) => s + Number(it.amount || 0), 0);
  const phoneDigits = (job.phone || "").replace(/\D/g, "");
  const waText = encodeURIComponent(`Hi ${job.customer_name}, regarding your ${[job.brand, job.model].filter(Boolean).join(" ")} (Job #${job.job_no}) at Emission Electronics — `);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Link href="/emission/jobs" className="em-label" style={{ textDecoration: "none" }}>← JOB LIST</Link>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {phoneDigits ? <a href={`tel:+${phoneDigits}`} className="em-btn em-btn--ghost em-btn--sm" style={{ textDecoration: "none" }}>📞 CALL</a> : null}
          {phoneDigits ? <a href={`https://wa.me/${phoneDigits}?text=${waText}`} target="_blank" rel="noreferrer" className="em-btn em-btn--ghost em-btn--sm" style={{ textDecoration: "none" }}>💬 WHATSAPP</a> : null}
          <Link href={`/emission/jobs/${job.job_no}/slip`} className="em-btn em-btn--ghost em-btn--sm" style={{ textDecoration: "none" }}>🖨 SLIP</Link>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginTop: 10 }}>
        <div>
          <Eyebrow>{`JOB #${job.job_no}${job.is_historical ? " · HISTORICAL" : ""}`}</Eyebrow>
          <Title lead={job.customer_name} style={{ fontSize: 26, marginTop: 6 }} />
          <div className="em-meta-k" style={{ marginTop: 4 }}>{[job.brand, job.model].filter(Boolean).join(" · ") || "—"}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <StatusLabel status={job.status} muted={!open} />
          {open && age != null ? <div className="em-meta-k" style={{ marginTop: 4 }}>{age}d open</div> : null}
        </div>
      </div>

      <div className="em-card" style={{ padding: 16, marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Meta k="Phone" v={job.phone} />
        <Meta k="Serial" v={job.serial_no} />
        <Meta k="Received" v={fmtDate(job.date_received)} />
        <Meta k="Delivered" v={job.date_delivered ? fmtDate(job.date_delivered) : "—"} />
        <Meta k="Technician" v={techName || "—"} mono={false} />
        <Meta k="Accessories" v={job.accessories || "—"} mono={false} />
      </div>

      <JobActivity session={session} job={job} events={events} onChange={reload} />

      <Section title="STATUS">
        <StatusControls session={session} job={job} onChange={reload} />
      </Section>

      <Section title="WORK & ASSIGNMENT">
        <AssignmentEditor session={session} job={job} staff={staff} onChange={reload} />
      </Section>

      <Section title="DETAILS">
        <DetailsEditor session={session} job={job} onChange={reload} />
      </Section>

      <Section title="LINE ITEMS" hint="GST & invoice in Zoho — amounts here are reference only">
        <LineItems session={session} job={job} items={items} onChange={reload} isAdmin={isAdmin} />
        <Divider style={{ margin: "12px 0" }} />
        <Row k="Parts & service subtotal" v={inr(itemsTotal)} />
        {isAdmin ? (
          <>
            <Row k="Inspection charge" v={inr(job.inspection_charge)} />
            <Row k="Job total" v={inr(itemsTotal + Number(job.inspection_charge || 0))} strong />
          </>
        ) : null}
      </Section>

      <Section title="WARRANTY CLAIM">
        <WarrantyClaim session={session} job={job} claim={claim} onChange={reload} isAdmin={isAdmin} />
      </Section>

      {isAdmin ? (
        <Section title="MONEY · DELIVERY" hint="Owner only">
          <MoneyPanel session={session} job={job} onChange={reload} />
        </Section>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
function Section({ title, hint, children }) {
  return (
    <section style={{ marginTop: 22 }}>
      <Eyebrow>{title}</Eyebrow>
      {hint ? <div className="em-label" style={{ textTransform: "none", letterSpacing: "0.03em", marginTop: 3 }}>{hint}</div> : null}
      <div className="em-card" style={{ padding: 16, marginTop: 8 }}>{children}</div>
    </section>
  );
}
function Row({ k, v, strong }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
      <span className="em-meta-k">{k}</span>
      <span className="em-mono" style={{ fontWeight: strong ? 700 : 500, fontSize: strong ? 15 : 13 }}>{v}</span>
    </div>
  );
}
function Saver({ onClick, busy, ok, label = "SAVE" }) {
  return (
    <button className="em-btn em-btn--ghost em-btn--sm" onClick={onClick} disabled={busy}>
      {busy ? "SAVING…" : ok ? "SAVED ✓" : label}
    </button>
  );
}

function JobActivity({ session, job, events, onChange }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  async function add() {
    const t = note.trim();
    if (!t) return;
    setBusy(true);
    try { await addJobNote(session, job.id, t); setNote(""); await onChange(); } catch (e) { alert(e.message); }
    setBusy(false);
  }

  const shown = open ? events : events.slice(0, 5);
  function label(ev) {
    if (ev.event_type === "created") return `Job created · ${statusLabel(ev.to_status)}`;
    if (ev.event_type === "status_change") return `${statusLabel(ev.from_status)} → ${statusLabel(ev.to_status)}`;
    return ev.note;
  }

  return (
    <Section title="ACTIVITY" hint="Auto-logged status changes + staff notes">
      <div style={{ display: "flex", gap: 8 }}>
        <input className="em-input" placeholder="Add a note (e.g. customer called, part ordered)…" value={note}
          onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <button className="em-btn em-btn--ghost em-btn--sm" onClick={add} disabled={busy} style={{ whiteSpace: "nowrap" }}>{busy ? "…" : "+ NOTE"}</button>
      </div>
      <div style={{ marginTop: 14 }}>
        {events.length === 0 ? (
          <div className="em-label" style={{ textTransform: "none", letterSpacing: "0.03em" }}>No activity yet.</div>
        ) : (
          shown.map((ev, i) => (
            <div key={ev.id} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "8px 0", borderTop: i > 0 ? "1px solid var(--em-g200)" : "none" }}>
              <div style={{ width: 7, height: 7, borderRadius: 99, marginTop: 6, flex: "0 0 auto", background: ev.event_type === "note" ? "var(--em-g300)" : "var(--em-ink)" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: "var(--em-ink)" }}>{label(ev)}</div>
                <div className="em-meta-k">{(ev.actor || "system")} · {timeAgo(ev.created_at)}</div>
              </div>
            </div>
          ))
        )}
        {events.length > 5 ? (
          <button onClick={() => setOpen((o) => !o)} className="em-link em-label" style={{ background: "none", border: 0, marginTop: 8, textTransform: "none", letterSpacing: "0.03em" }}>
            {open ? "Show less" : `Show all ${events.length}`}
          </button>
        ) : null}
      </div>
    </Section>
  );
}

function StatusControls({ session, job, onChange }) {
  const [busy, setBusy] = useState(false);
  const idx = LIFECYCLE.indexOf(job.status);
  const next = idx >= 0 && idx < LIFECYCLE.length - 1 ? LIFECYCLE[idx + 1] : null;

  async function setStatus(status) {
    setBusy(true);
    const patch = { status };
    if (status === "delivered" && !job.date_delivered) patch.date_delivered = todayISO();
    try { await updateJob(session, job.id, patch); await onChange(); } catch (e) { alert(e.message); }
    setBusy(false);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {next ? (
          <button className="em-btn em-btn--primary em-btn--sm" disabled={busy} onClick={() => setStatus(next)}>
            ADVANCE → {statusLabel(next)}
          </button>
        ) : null}
        <select className="em-select" style={{ width: "auto", flex: 1, minWidth: 160 }} value={job.status} disabled={busy}
          onChange={(e) => setStatus(e.target.value)}>
          {JobStatus.options.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        {TERMINAL_BRANCHES.map((t) => (
          <button key={t} className="em-chip" disabled={busy} onClick={() => setStatus(t)}>{statusLabel(t)}</button>
        ))}
      </div>
    </div>
  );
}

function AssignmentEditor({ session, job, staff, onChange }) {
  const [tech, setTech] = useState(job.technician_id || "");
  const [defect, setDefect] = useState(job.defect_found || "");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const sigRef = useRef(null);

  async function save() {
    setBusy(true); setOk(false);
    try {
      await updateJob(session, job.id, { technician_id: tech || null, defect_found: defect.trim() || null });
      if (sigRef.current?.isDirty()) {
        const blob = await sigRef.current.getBlob();
        if (blob) {
          const path = `job_${job.job_no}/technician.png`;
          await uploadObject(BUCKETS.signatures, path, blob, session.token, "image/png");
          await updateJob(session, job.id, { technician_signature_path: `${BUCKETS.signatures}/${path}` });
        }
      }
      setOk(true); await onChange();
    } catch (e) { alert(e.message); }
    setBusy(false);
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Field label="Technician">
        <select className="em-select" value={tech} onChange={(e) => { setTech(e.target.value); setOk(false); }}>
          <option value="">— unassigned —</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}{s.role ? ` · ${s.role}` : ""}</option>)}
        </select>
      </Field>
      <Field label="Defect found">
        <textarea className="em-textarea" value={defect} onChange={(e) => { setDefect(e.target.value); setOk(false); }} placeholder="Diagnosis…" />
      </Field>
      <Field label="Technician signature">
        <SignaturePad ref={sigRef} height={140} />
        {job.technician_signature_path ? <div className="em-label" style={{ marginTop: 4 }}>signed ✓ (re-sign to replace)</div> : null}
      </Field>
      <div><Saver onClick={save} busy={busy} ok={ok} /></div>
    </div>
  );
}

function DetailsEditor({ session, job, onChange }) {
  const fields = ["customer_name", "phone", "brand", "model", "serial_no", "complaint", "accessories", "remarks", "email", "address", "date_received"];
  const [f, setF] = useState(() => Object.fromEntries(fields.map((k) => [k, job[k] ?? ""])));
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const set = (k) => (e) => { setF((p) => ({ ...p, [k]: e.target.value })); setOk(false); };

  async function save() {
    setBusy(true); setOk(false);
    const patch = {};
    for (const k of fields) patch[k] = f[k] === "" ? null : f[k];
    try { await updateJob(session, job.id, patch); setOk(true); await onChange(); } catch (e) { alert(e.message); }
    setBusy(false);
  }
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Customer"><input className="em-input" value={f.customer_name} onChange={set("customer_name")} /></Field>
        <Field label="Phone"><PhoneInput value={f.phone} onChange={(v) => { setF((p) => ({ ...p, phone: v })); setOk(false); }} /></Field>
        <Field label="Brand"><input className="em-input" value={f.brand} onChange={set("brand")} /></Field>
        <Field label="Model"><input className="em-input" value={f.model} onChange={set("model")} /></Field>
        <Field label="Serial"><input className="em-input" value={f.serial_no} onChange={set("serial_no")} /></Field>
        <Field label="Received"><input className="em-input" type="date" value={f.date_received} onChange={set("date_received")} max={todayISO()} /></Field>
      </div>
      <Field label="Complaint"><textarea className="em-textarea" value={f.complaint} onChange={set("complaint")} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Accessories"><input className="em-input" value={f.accessories} onChange={set("accessories")} /></Field>
        <Field label="Remarks"><input className="em-input" value={f.remarks} onChange={set("remarks")} /></Field>
        <Field label="Email"><input className="em-input" value={f.email} onChange={set("email")} /></Field>
        <Field label="Address"><input className="em-input" value={f.address} onChange={set("address")} /></Field>
      </div>
      <div><Saver onClick={save} busy={busy} ok={ok} /></div>
    </div>
  );
}

function LineItems({ session, job, items, onChange, isAdmin }) {
  const [draft, setDraft] = useState({ item_type: "service", description: "", part_no: "", qty: "1", amount: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  async function add() {
    if (!draft.description.trim()) return;
    setBusy(true);
    try {
      await addLineItem(session, {
        job_id: job.id,
        sr_no: (items.at(-1)?.sr_no || 0) + 1,
        item_type: draft.item_type,
        description: draft.description.trim(),
        part_no: draft.part_no.trim() || null,
        qty: Number(draft.qty || 1),
        amount: draft.amount === "" ? null : Number(draft.amount),
      });
      setDraft({ item_type: "service", description: "", part_no: "", qty: "1", amount: "" });
      await onChange();
    } catch (e) { alert(e.message); }
    setBusy(false);
  }

  return (
    <div>
      {items.length === 0 ? <div className="em-label" style={{ paddingBottom: 8 }}>NO ITEMS YET</div> : (
        <div>
          {items.map((it, i) => (
            <div key={it.id}>
              {i > 0 ? <Divider /> : null}
              <div style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "8px 0" }}>
                <span className="em-meta-k" style={{ minWidth: 90 }}>{ITEM_TYPE_LABEL[it.item_type]}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14 }}>{it.description}</div>
                  {it.part_no ? <div className="em-meta-k">PART {it.part_no} · QTY {it.qty}</div> : <div className="em-meta-k">QTY {it.qty}</div>}
                </div>
                <span className="em-mono" style={{ fontSize: 13 }}>{it.amount == null ? "—" : inr(it.amount)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <Divider style={{ margin: "10px 0" }} />
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: 8 }}>
          <select className="em-select" value={draft.item_type} onChange={set("item_type")}>
            {ItemType.options.map((t) => <option key={t} value={t}>{ITEM_TYPE_LABEL[t]}</option>)}
          </select>
          <input className="em-input" placeholder="Description" value={draft.description} onChange={set("description")} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 100px", gap: 8 }}>
          <input className="em-input" placeholder="Part no" value={draft.part_no} onChange={set("part_no")} />
          <input className="em-input em-mono" placeholder="Qty" inputMode="numeric" value={draft.qty} onChange={set("qty")} />
          <input className="em-input em-mono" placeholder="₹ Amt" inputMode="numeric" value={draft.amount} onChange={set("amount")} />
        </div>
        <button className="em-btn em-btn--ghost em-btn--sm" onClick={add} disabled={busy}>{busy ? "ADDING…" : "+ ADD ITEM"}</button>
      </div>
    </div>
  );
}

function WarrantyClaim({ session, job, claim, onChange, isAdmin }) {
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  async function create() {
    setBusy(true);
    try { await createClaim(session, job.id); await onChange(); } catch (e) { alert(e.message); }
    setBusy(false);
  }

  if (!claim) {
    return (
      <div>
        <div className="em-label" style={{ textTransform: "none", letterSpacing: "0.03em", marginBottom: 10 }}>
          No claim on this job. Create one when warranty applies.
        </div>
        <button className="em-btn em-btn--ghost em-btn--sm" onClick={create} disabled={busy}>{busy ? "…" : "+ CREATE WARRANTY CLAIM"}</button>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <Row k="Claim status" v={CLAIM_LABEL[claim.claim_status]} />
        <Row k="Yamaha ref" v={claim.yamaha_ref_no || "—"} />
        <div className="em-label" style={{ textTransform: "none", letterSpacing: "0.03em" }}>Owner manages claim filing, amounts & payment.</div>
      </div>
    );
  }
  return <ClaimEditorAdmin session={session} job={job} claim={claim} onChange={onChange} fileRef={fileRef} />;
}

function ClaimEditorAdmin({ session, job, claim, onChange, fileRef }) {
  const [c, setC] = useState({
    claim_status: claim.claim_status,
    date_filed: claim.date_filed || "",
    date_paid: claim.date_paid || "",
    claim_amount: claim.claim_amount ?? "",
    amount_received: claim.amount_received ?? "",
    yamaha_ref_no: claim.yamaha_ref_no || "",
    rejection_reason: claim.rejection_reason || "",
  });
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const set = (k) => (e) => { setC((p) => ({ ...p, [k]: e.target.value })); setOk(false); };

  async function save() {
    setBusy(true); setOk(false);
    try {
      await updateClaim(session, claim.id, {
        claim_status: c.claim_status,
        date_filed: c.date_filed || null,
        date_paid: c.date_paid || null,
        claim_amount: c.claim_amount === "" ? null : Number(c.claim_amount),
        amount_received: c.amount_received === "" ? null : Number(c.amount_received),
        yamaha_ref_no: c.yamaha_ref_no.trim() || null,
        rejection_reason: c.rejection_reason.trim() || null,
      });
      setOk(true); await onChange();
    } catch (e) { alert(e.message); }
    setBusy(false);
  }

  async function uploadDoc(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      const ext = (f.name.split(".").pop() || "pdf").toLowerCase();
      await uploadObject(BUCKETS.claimDocs, `job_${job.job_no}/claim_${Date.now()}.${ext}`, f, session.token);
      alert("Document uploaded.");
    } catch (e2) { alert(e2.message); }
    setBusy(false);
    e.target.value = "";
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Field label="Claim status">
        <select className="em-select" value={c.claim_status} onChange={set("claim_status")}>
          {ClaimStatus.options.map((s) => <option key={s} value={s}>{CLAIM_LABEL[s]}</option>)}
        </select>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Date filed"><input className="em-input" type="date" value={c.date_filed} onChange={set("date_filed")} /></Field>
        <Field label="Date paid"><input className="em-input" type="date" value={c.date_paid} onChange={set("date_paid")} /></Field>
        <Field label="Claim amount (₹)"><input className="em-input em-mono" inputMode="numeric" value={c.claim_amount} onChange={set("claim_amount")} /></Field>
        <Field label="Received (₹)"><input className="em-input em-mono" inputMode="numeric" value={c.amount_received} onChange={set("amount_received")} /></Field>
      </div>
      <Field label="Yamaha ref no"><input className="em-input" value={c.yamaha_ref_no} onChange={set("yamaha_ref_no")} /></Field>
      <Field label="Rejection reason"><input className="em-input" value={c.rejection_reason} onChange={set("rejection_reason")} /></Field>
      <Field label="Claim document"><input ref={fileRef} className="em-input" type="file" accept="image/*,application/pdf" onChange={uploadDoc} /></Field>
      <div><Saver onClick={save} busy={busy} ok={ok} /></div>
    </div>
  );
}

function MoneyPanel({ session, job, onChange }) {
  const [m, setM] = useState({
    inspection_charge: job.inspection_charge ?? "600",
    payment_method: job.payment_method || "pending",
    zoho_invoice_no: job.zoho_invoice_no || "",
    date_delivered: job.date_delivered || "",
  });
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const set = (k) => (e) => { setM((p) => ({ ...p, [k]: e.target.value })); setOk(false); };

  async function save() {
    setBusy(true); setOk(false);
    try {
      await updateJob(session, job.id, {
        inspection_charge: Number(m.inspection_charge || 0),
        payment_method: m.payment_method,
        zoho_invoice_no: m.zoho_invoice_no.trim() || null,
        date_delivered: m.date_delivered || null,
      });
      setOk(true); await onChange();
    } catch (e) { alert(e.message); }
    setBusy(false);
  }
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Inspection charge (₹)"><input className="em-input em-mono" inputMode="numeric" value={m.inspection_charge} onChange={set("inspection_charge")} /></Field>
        <Field label="Payment method">
          <select className="em-select" value={m.payment_method} onChange={set("payment_method")}>
            {PaymentMethod.options.map((p) => <option key={p} value={p}>{PAYMENT_LABEL[p]}</option>)}
          </select>
        </Field>
        <Field label="Zoho invoice no"><input className="em-input" value={m.zoho_invoice_no} onChange={set("zoho_invoice_no")} /></Field>
        <Field label="Date delivered"><input className="em-input" type="date" value={m.date_delivered} onChange={set("date_delivered")} /></Field>
      </div>
      <div className="em-label" style={{ textTransform: "none", letterSpacing: "0.03em" }}>GST &amp; invoice live in Zoho. zoho_invoice_no reconciles done-vs-billed.</div>
      <div><Saver onClick={save} busy={busy} ok={ok} /></div>
    </div>
  );
}
