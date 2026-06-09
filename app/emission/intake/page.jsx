"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../_components/AuthProvider";
import { Eyebrow, Title, Field, Divider, PhoneInput } from "../_components/ui";
import SignaturePad from "../_components/SignaturePad";
import { listStaff, createJob, updateJob, findJobsByPhone } from "../_lib/data";
import { uploadObject } from "../_lib/client";
import { BUCKETS } from "../_lib/config";
import { JobIntake } from "../_lib/schemas";
import { todayISO, fmtDate, statusLabel } from "../_lib/format";

function IntakeInner() {
  const { session } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const historical = params.get("historical") === "1";
  const isAdmin = session?.role === "admin";

  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState({
    date_received: todayISO(),
    customer_name: "", phone: "", model: "", brand: "", serial_no: "",
    address: "", email: "", complaint: "", accessories: "", remarks: "Sub to check",
    technician_id: "", inspection_charge: "600",
  });
  const [isWarranty, setIsWarranty] = useState(false);
  const [serialNotLegible, setSerialNotLegible] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [priorJobs, setPriorJobs] = useState([]);
  const sigRef = useRef(null);

  useEffect(() => {
    if (session) listStaff(session).then(setStaff).catch(() => {});
  }, [session]);

  // Repeat-customer recognition: debounced lookup of prior jobs by phone.
  useEffect(() => {
    const d = (form.phone || "").replace(/\D/g, "").slice(-10);
    if (!session || historical || d.length < 10) { setPriorJobs([]); return; }
    let live = true;
    const t = setTimeout(() => {
      findJobsByPhone(session, form.phone).then((r) => { if (live) setPriorJobs(r || []); }).catch(() => {});
    }, 400);
    return () => { live = false; clearTimeout(t); };
  }, [form.phone, session, historical]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setErr("");

    // serial rule: warranty jobs hard-require a serial.
    if (isWarranty && !form.serial_no.trim()) {
      setErr("Warranty job — serial number is required.");
      return;
    }
    const payload = {
      date_received: form.date_received,
      customer_name: form.customer_name.trim(),
      phone: form.phone.trim(),
      model: form.model.trim(),
      brand: form.brand.trim() || null,
      serial_no: serialNotLegible ? "NOT LEGIBLE" : (form.serial_no.trim() || null),
      address: form.address.trim() || null,
      email: form.email.trim() || null,
      complaint: form.complaint.trim() || null,
      accessories: form.accessories.trim() || null,
      remarks: form.remarks.trim() || null,
      technician_id: form.technician_id || null,
      is_historical: historical,
    };
    const parsed = JobIntake.safeParse(payload);
    if (!parsed.success) {
      setErr(parsed.error.issues[0]?.message || "Check the required fields.");
      return;
    }
    // Admins may set the inspection charge at intake; staff lack the column
    // grant, so we omit it and the DB default (₹600) applies.
    if (isAdmin && form.inspection_charge !== "" && Number(form.inspection_charge) !== 600) {
      payload.inspection_charge = Number(form.inspection_charge);
    }

    setBusy(true);
    try {
      const job = await createJob(session, payload);
      const jobNo = job.job_no;

      // intake photos (skipped silently for historical entries)
      for (let i = 0; i < photos.length; i++) {
        const f = photos[i];
        const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
        await uploadObject(BUCKETS.intakePhotos, `job_${jobNo}/intake_${i + 1}.${ext}`, f, session.token).catch(() => {});
      }

      // customer signature
      if (!historical && sigRef.current?.isDirty()) {
        const blob = await sigRef.current.getBlob();
        if (blob) {
          const path = `job_${jobNo}/customer.png`;
          await uploadObject(BUCKETS.signatures, path, blob, session.token, "image/png").catch(() => {});
          await updateJob(session, job.id, { customer_signature_path: `${BUCKETS.signatures}/${path}` }).catch(() => {});
        }
      }

      router.push(`/emission/jobs/${jobNo}`);
    } catch (e2) {
      setErr(e2.message || "Could not create job.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Eyebrow>{historical ? "BACK-ENTRY" : "JOB INTAKE"}</Eyebrow>
      <Title lead={historical ? "Historical" : "New"} tail={historical ? "job entry" : "job in"} style={{ fontSize: 28, marginTop: 6, marginBottom: 16 }} />

      {historical ? (
        <div className="em-card" style={{ padding: "10px 14px", marginBottom: 16 }}>
          <span className="em-label" style={{ textTransform: "none", letterSpacing: "0.03em" }}>
            Back-entry mode · marks <b>is_historical</b> · photos &amp; signature not required · date is back-datable.
          </span>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 14 }}>
        {/* Phone-first, large targets */}
        <Field label="Phone" required>
          <PhoneInput value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} autoFocus />
        </Field>

        {priorJobs.length ? (
          <div className="em-card" style={{ padding: 12, borderColor: "var(--em-ink)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <span className="em-eyebrow">↻ RETURNING CUSTOMER · {priorJobs.length} PRIOR JOB{priorJobs.length > 1 ? "S" : ""}</span>
              {!form.customer_name && priorJobs[0]?.customer_name ? (
                <button type="button" className="em-link em-label" style={{ background: "none", border: 0, textTransform: "none", letterSpacing: "0.03em" }}
                  onClick={() => setForm((f) => ({ ...f, customer_name: priorJobs[0].customer_name }))}>
                  Use “{priorJobs[0].customer_name}”
                </button>
              ) : null}
            </div>
            <div style={{ marginTop: 8 }}>
              {priorJobs.slice(0, 4).map((j) => (
                <a key={j.job_no} href={`/emission/jobs/${j.job_no}`} target="_blank" rel="noreferrer"
                  style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "4px 0", textDecoration: "none", color: "inherit" }}>
                  <span style={{ fontSize: 13 }}><span className="em-mono">#{j.job_no}</span> · {[j.brand, j.model].filter(Boolean).join(" ") || "—"}</span>
                  <span className="em-meta-k" style={{ whiteSpace: "nowrap" }}>{statusLabel(j.status)} · {fmtDate(j.date_received)}</span>
                </a>
              ))}
            </div>
          </div>
        ) : null}

        <Field label="Customer name" required>
          <input className="em-input" value={form.customer_name} onChange={set("customer_name")} placeholder="Full name" />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Brand">
            <input className="em-input" list="em-brands" value={form.brand} onChange={set("brand")} placeholder="Yamaha…" />
            <datalist id="em-brands">
              <option value="Yamaha" /><option value="Korg" /><option value="Roland" /><option value="Casio" /><option value="Boss" />
            </datalist>
          </Field>
          <Field label="Model" required>
            <input className="em-input" value={form.model} onChange={set("model")} placeholder="PSR-215" />
          </Field>
        </div>

        <div className="em-card" style={{ padding: 14 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <input type="checkbox" checked={isWarranty} onChange={(e) => setIsWarranty(e.target.checked)} style={{ width: 18, height: 18 }} />
            <span className="em-label" style={{ textTransform: "none", letterSpacing: "0.03em", fontSize: 13 }}>Warranty job (serial required)</span>
          </label>
          <div style={{ marginTop: 12 }}>
            <Field label="Serial number" required={isWarranty}>
              <input className="em-input" value={serialNotLegible ? "" : form.serial_no} onChange={set("serial_no")} disabled={serialNotLegible} placeholder="Serial / SR No" />
            </Field>
            {!isWarranty ? (
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={serialNotLegible} onChange={(e) => setSerialNotLegible(e.target.checked)} />
                <span className="em-label" style={{ textTransform: "none", letterSpacing: "0.03em" }}>Serial not legible (paid job)</span>
              </label>
            ) : null}
          </div>
        </div>

        <Field label="Complaint">
          <textarea className="em-textarea" value={form.complaint} onChange={set("complaint")} placeholder="Reported fault…" />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Accessories"><input className="em-input" value={form.accessories} onChange={set("accessories")} placeholder="Bag + Adaptor" /></Field>
          <Field label="Remarks"><input className="em-input" value={form.remarks} onChange={set("remarks")} /></Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Technician">
            <select className="em-select" value={form.technician_id} onChange={set("technician_id")}>
              <option value="">— assign later —</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}{s.role ? ` · ${s.role}` : ""}</option>)}
            </select>
          </Field>
          <Field label="Date received" hint={historical ? "back-datable" : null}>
            <input className="em-input" type="date" value={form.date_received} onChange={set("date_received")} max={todayISO()} />
          </Field>
        </div>

        {isAdmin ? (
          <Field label="Inspection charge (₹)" hint="Owner-editable. Staff intake defaults to ₹600.">
            <input className="em-input em-mono" type="number" inputMode="numeric" value={form.inspection_charge} onChange={set("inspection_charge")} />
          </Field>
        ) : (
          <div className="em-label" style={{ textTransform: "none", letterSpacing: "0.03em" }}>Inspection charge ₹600 applies (owner can adjust later).</div>
        )}

        <Field label="Email"><input className="em-input" type="email" value={form.email} onChange={set("email")} placeholder="optional" /></Field>
        <Field label="Address"><textarea className="em-textarea" value={form.address} onChange={set("address")} placeholder="optional" /></Field>

        {!historical ? (
          <>
            <Divider style={{ margin: "4px 0" }} />
            <Field label="Intake photos" hint="Snap the unit + accessories">
              <input className="em-input" type="file" accept="image/*" multiple onChange={(e) => setPhotos(Array.from(e.target.files || []))} />
              {photos.length ? <div className="em-label" style={{ marginTop: 6 }}>{photos.length} photo(s) ready</div> : null}
            </Field>
            <Field label="Customer signature">
              <SignaturePad ref={sigRef} />
            </Field>
          </>
        ) : null}
      </div>

      {err ? <div className="em-card" style={{ padding: 12, marginTop: 14, borderColor: "var(--em-ink)" }}>{err}</div> : null}

      <button type="submit" className="em-btn em-btn--primary em-btn--block" style={{ marginTop: 18 }} disabled={busy}>
        {busy ? "CREATING…" : "CREATE JOB & GET NUMBER"}
      </button>
    </form>
  );
}

export default function IntakePage() {
  return (
    <Suspense fallback={<div className="em-label" style={{ padding: 24 }}>LOADING…</div>}>
      <IntakeInner />
    </Suspense>
  );
}
