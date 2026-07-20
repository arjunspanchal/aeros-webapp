"use client";
// Public internship application form. Client-side validation on the required
// fields, resume read as base64 and POSTed to /api/internship, then a
// thank-you confirmation replaces the form. Uses the editorial UI primitives
// so it matches the public rate sheets.
import { useRef, useState } from "react";
import { Input } from "@/app/components/ui/Input";
import { Button } from "@/app/components/ui/Button";

const TRACKS = ["Supply Chain & Operations", "Management", "E-commerce Sales"];

const RESUME_MAX_BYTES = 5 * 1024 * 1024;
const RESUME_ACCEPT = ".pdf,.doc,.docx";
const RESUME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const EMPTY = {
  fullName: "",
  email: "",
  phone: "",
  college: "",
  degreeSpecialization: "",
  graduationYear: "",
  preferredTrack: "",
  availableStartDate: "",
  canCommit6Months: "",
  canWorkBhiwandiOffice: "",
  linkedinUrl: "",
  note: "",
  source: "",
};

const REQUIRED = {
  fullName: "Full name",
  email: "Email",
  phone: "Phone",
  college: "College",
  degreeSpecialization: "Degree / specialization",
  graduationYear: "Graduation year",
  preferredTrack: "Preferred track",
};

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function InternshipForm() {
  const [form, setForm] = useState(EMPTY);
  const [resume, setResume] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const honeypotRef = useRef(null);
  const fileRef = useRef(null);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (errors[k]) setErrors((prev) => ({ ...prev, [k]: undefined }));
  };

  function pickFile(e) {
    const f = e.target.files?.[0] || null;
    setErrors((prev) => ({ ...prev, resume: undefined }));
    if (!f) return setResume(null);
    if (f.size > RESUME_MAX_BYTES) {
      setResume(null);
      if (fileRef.current) fileRef.current.value = "";
      return setErrors((prev) => ({ ...prev, resume: "File is too large (max 5 MB)." }));
    }
    if (f.type && !RESUME_TYPES.includes(f.type)) {
      setResume(null);
      if (fileRef.current) fileRef.current.value = "";
      return setErrors((prev) => ({ ...prev, resume: "Please attach a PDF or Word document." }));
    }
    setResume(f);
  }

  function validate() {
    const next = {};
    for (const [k, label] of Object.entries(REQUIRED)) {
      if (!String(form[k]).trim()) next[k] = `${label} is required.`;
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = "Enter a valid email address.";
    }
    if (form.graduationYear) {
      const y = Number(form.graduationYear);
      if (!Number.isInteger(y) || y < 1990 || y > 2100) next.graduationYear = "Enter a valid year.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setFormError("");
    if (!validate()) {
      setFormError("Please fix the highlighted fields.");
      return;
    }
    setBusy(true);
    try {
      const payload = { ...form, company_website: honeypotRef.current?.value || "" };
      if (resume) {
        payload.resumeBase64 = await fileToBase64(resume);
        payload.resumeContentType = resume.type || "application/octet-stream";
        payload.resumeFilename = resume.name;
      }
      const res = await fetch("/api/internship", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data.error || "Something went wrong. Please try again.");
        return;
      }
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setFormError("Network error — please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-md border border-ink-200 bg-white p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-royal-600/10">
          <svg className="h-6 w-6 text-royal-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="mt-4 text-xl font-bold text-ink-900">Application received</h2>
        <p className="mx-auto mt-2 max-w-sm text-ink-600">
          Thanks, {form.fullName.split(" ")[0] || "and"} — your internship application is in. If your
          background matches what we&apos;re looking for, someone from the Aeros team will reach out
          by email.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-8">
      {/* Honeypot — visually hidden, off-screen; bots fill it, humans don't. */}
      <input
        ref={honeypotRef}
        type="text"
        name="company_website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute left-[-9999px] h-px w-px opacity-0"
      />

      <Section title="About you">
        <Input label="Full name *" value={form.fullName} onChange={set("fullName")} error={errors.fullName} autoComplete="name" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Email *" type="email" value={form.email} onChange={set("email")} error={errors.email} autoComplete="email" />
          <Input label="Phone *" type="tel" value={form.phone} onChange={set("phone")} error={errors.phone} autoComplete="tel" />
        </div>
      </Section>

      <Section title="Education">
        <Input label="College / University *" value={form.college} onChange={set("college")} error={errors.college} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Degree & specialization *" value={form.degreeSpecialization} onChange={set("degreeSpecialization")} error={errors.degreeSpecialization} helper="e.g. B.Tech, Mechanical" />
          <Input label="Graduation year *" type="number" inputMode="numeric" value={form.graduationYear} onChange={set("graduationYear")} error={errors.graduationYear} placeholder="2026" />
        </div>
      </Section>

      <Section title="The internship">
        <Select label="Preferred track *" value={form.preferredTrack} onChange={set("preferredTrack")} error={errors.preferredTrack}>
          <option value="">Select a track…</option>
          {TRACKS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Select>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Available start date" type="date" value={form.availableStartDate} onChange={set("availableStartDate")} />
          <div />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <YesNo
            label="Can you commit to 6 months?"
            value={form.canCommit6Months}
            onChange={(v) => setForm((f) => ({ ...f, canCommit6Months: v }))}
          />
          <YesNo
            label="Can you work from the Bhiwandi office?"
            value={form.canWorkBhiwandiOffice}
            onChange={(v) => setForm((f) => ({ ...f, canWorkBhiwandiOffice: v }))}
          />
        </div>
      </Section>

      <Section title="Resume & links">
        <div>
          <label className="block text-sm text-ink-600 mb-1.5">Resume (PDF or Word, max 5 MB)</label>
          <input
            ref={fileRef}
            type="file"
            accept={RESUME_ACCEPT}
            onChange={pickFile}
            className="block w-full text-sm text-ink-600 file:mr-3 file:rounded file:border file:border-ink-200 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink-800 hover:file:bg-ink-50"
          />
          {errors.resume ? (
            <p className="text-xs text-red-600 mt-1.5">{errors.resume}</p>
          ) : resume ? (
            <p className="text-xs text-ink-400 mt-1.5">Attached: {resume.name}</p>
          ) : null}
        </div>
        <Input label="LinkedIn URL" type="url" value={form.linkedinUrl} onChange={set("linkedinUrl")} placeholder="https://linkedin.com/in/…" />
        <div>
          <label htmlFor="note" className="block text-sm text-ink-600 mb-1.5">Why Aeros?</label>
          <textarea
            id="note"
            value={form.note}
            onChange={set("note")}
            rows={4}
            className="w-full rounded border border-ink-200 bg-white px-3 py-2 text-ink-800 placeholder:text-ink-400 focus:border-royal-600 focus:outline-none focus:ring-1 focus:ring-royal-600"
            placeholder="A few lines on what draws you to this role."
          />
        </div>
        <Input label="How did you hear about us? / Placement cell" value={form.source} onChange={set("source")} helper="Optional — college placement cell, referral, etc." />
      </Section>

      {formError && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" loading={busy}>Submit application</Button>
        <span className="text-xs text-ink-400">Fields marked * are required.</span>
      </div>
    </form>
  );
}

function Section({ title, children }) {
  return (
    <section className="rounded-md border border-ink-200 bg-white p-5 md:p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Select({ label, value, onChange, error, children }) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return (
    <div className="w-full">
      {label && <label htmlFor={id} className="block text-sm text-ink-600 mb-1.5">{label}</label>}
      <select
        id={id}
        value={value}
        onChange={onChange}
        aria-invalid={error ? "true" : undefined}
        className={`h-12 w-full rounded border bg-white px-3 text-ink-800 focus:outline-none focus:ring-1 ${
          error ? "border-red-600 focus:border-red-600 focus:ring-red-600" : "border-ink-200 focus:border-royal-600 focus:ring-royal-600"
        }`}
      >
        {children}
      </select>
      {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
    </div>
  );
}

function YesNo({ label, value, onChange }) {
  const opts = [
    { v: "yes", t: "Yes" },
    { v: "no", t: "No" },
  ];
  return (
    <div>
      <span className="block text-sm text-ink-600 mb-1.5">{label}</span>
      <div className="flex gap-2">
        {opts.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(value === o.v ? "" : o.v)}
            aria-pressed={value === o.v}
            className={`h-11 flex-1 rounded border text-sm font-medium transition-colors ${
              value === o.v
                ? "border-royal-600 bg-royal-600/10 text-royal-700"
                : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
            }`}
          >
            {o.t}
          </button>
        ))}
      </div>
    </div>
  );
}
