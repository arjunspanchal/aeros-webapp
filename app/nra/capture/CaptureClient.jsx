"use client";

// Trade-show lead capture. Three modes:
//   - "form"   : visitor-facing self-registration (default)
//   - "thanks" : success screen with vCard download + 10s auto-reset
//   - "owner"  : private dashboard for Arjun (unlocked via 5 taps on the
//                Aeros wordmark within 3 seconds, persisted in sessionStorage)
//
// Submissions POST to /api/nra/leads. If the network is down (or the API
// errors), the payload is queued in localStorage under "aeros:nra2026:outbox"
// and a background sweep retries on mount + on the `online` event. The
// visitor never sees a failure.
//
// Owner mode reads/edits/deletes via /api/nra/leads — the API gates GET /
// PATCH / DELETE on a staff-admin hub session. The 5-tap gesture is the UX
// gate; the cookie is the real security boundary.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const CATEGORIES = [
  "Operator", "Distributor", "Disposables", "Packaging", "Equipment",
  "Refrigeration", "Beverage", "Smallwares", "Cleaning", "POS / Tech", "Other",
];
const INTERESTS = [
  "Marketplace", "Aeros Select", "Factory OS", "Show offer", "Just exploring",
];

const OUTBOX_KEY = "aeros:nra2026:outbox";
const OWNER_FLAG = "aeros:nra2026:owner";
const SHOW = "nra-2026";

const EMPTY_FORM = {
  name: "", company: "", role: "", email: "", phone: "",
  category: "", booth: "", interests: [], notes: "",
};

// ─── helpers ────────────────────────────────────────────────────────────────

function firstName(full) {
  if (!full) return "there";
  return full.trim().split(/\s+/)[0] || "there";
}

function readOutbox() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(OUTBOX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function writeOutbox(items) {
  try {
    window.localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
  } catch { /* quota or private mode — accept silent failure */ }
}

function pushToOutbox(payload) {
  const items = readOutbox();
  items.push({ ...payload, queuedAt: Date.now() });
  writeOutbox(items);
}

async function flushOutbox() {
  const items = readOutbox();
  if (items.length === 0) return;
  const remaining = [];
  for (const item of items) {
    try {
      const { queuedAt, ...payload } = item;
      const res = await fetch("/api/nra/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) remaining.push(item);
    } catch {
      remaining.push(item);
    }
  }
  writeOutbox(remaining);
}

function buildVCard() {
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "FN:Aeros",
    "ORG:Aeros — Boson Machines OPC Pvt Ltd",
    "EMAIL;TYPE=INTERNET:hello@aeros.io",
    "URL:https://aeros.io",
    "NOTE:Met at NRA Show 2026 · Booth #12937 · McCormick Place, Chicago · May 16–19",
    "END:VCARD",
    "",
  ].join("\r\n");
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function leadsToCsv(leads) {
  const headers = [
    "created_at", "name", "company", "role", "email", "phone",
    "category", "booth", "interests", "notes", "source",
  ];
  const lines = [headers.join(",")];
  for (const l of leads) {
    lines.push([
      l.created_at,
      l.name, l.company, l.role, l.email, l.phone,
      l.category, l.booth, (l.interests || []).join("; "),
      l.notes, l.source,
    ].map(csvEscape).join(","));
  }
  return lines.join("\n");
}

// ─── tap-gesture hook ───────────────────────────────────────────────────────

function useTapGesture(target, onTrigger) {
  const taps = useRef([]);
  return useCallback(() => {
    const now = Date.now();
    taps.current = taps.current.filter((t) => now - t < 3000);
    taps.current.push(now);
    if (taps.current.length >= target) {
      taps.current = [];
      onTrigger();
    }
  }, [target, onTrigger]);
}

// ─── component ──────────────────────────────────────────────────────────────

export default function CaptureClient() {
  const [mode, setMode] = useState("form"); // form | thanks | owner
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submittedName, setSubmittedName] = useState("");
  const [countdown, setCountdown] = useState(10);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Owner-mode unlock via 5 taps on wordmark
  const enterOwner = useCallback(() => {
    try { window.sessionStorage.setItem(OWNER_FLAG, "1"); } catch {}
    setMode("owner");
  }, []);
  const handleWordmarkTap = useTapGesture(5, enterOwner);

  // Restore owner mode from sessionStorage on mount + flush outbox
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(OWNER_FLAG) === "1") setMode("owner");
    } catch {}
    flushOutbox().catch(() => {});
    const onOnline = () => flushOutbox().catch(() => {});
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  // Thanks-screen 10s countdown → reset to fresh form
  useEffect(() => {
    if (mode !== "thanks") return;
    setCountdown(10);
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(id);
          resetToForm();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [mode]);

  function resetToForm() {
    setForm(EMPTY_FORM);
    setSubmittedName("");
    setMode("form");
  }

  function validate() {
    if (!form.name.trim()) return "Please enter your name.";
    if (!form.company.trim()) return "Please enter your company.";
    if (!form.email.trim()) return "Please enter your email.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return "That email doesn't look right.";
    return null;
  }

  async function handleSubmit(e, source = "self") {
    e?.preventDefault?.();
    if (submitting) return;
    const err = validate();
    if (err) { alert(err); return; }
    setSubmitting(true);
    const payload = {
      ...form,
      name: form.name.trim(),
      company: form.company.trim(),
      role: form.role.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      booth: form.booth.trim(),
      notes: form.notes.trim(),
      source,
      show: SHOW,
    };
    try {
      const res = await fetch("/api/nra/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      pushToOutbox(payload);
    } finally {
      setSubmittedName(form.name);
      if (source === "owner") {
        // Owner-added lead — stay in owner mode, just clear the form.
        setForm(EMPTY_FORM);
        setSubmitting(false);
      } else {
        setSubmitting(false);
        setMode("thanks");
      }
    }
  }

  function handleSaveVCard() {
    downloadFile("aeros.vcf", buildVCard(), "text/vcard;charset=utf-8");
  }

  function exitOwner() {
    try { window.sessionStorage.removeItem(OWNER_FLAG); } catch {}
    resetToForm();
  }

  return (
    <div className="min-h-screen bg-ink-50 text-ink-800">
      <Header
        mode={mode}
        onWordmarkTap={handleWordmarkTap}
        onExitOwner={exitOwner}
      />

      {mode === "form" && (
        <FormView
          form={form}
          setField={setField}
          onSubmit={(e) => handleSubmit(e, "self")}
          submitting={submitting}
        />
      )}

      {mode === "thanks" && (
        <ThanksView
          name={submittedName}
          countdown={countdown}
          onAnother={resetToForm}
          onSaveVCard={handleSaveVCard}
        />
      )}

      {mode === "owner" && (
        <OwnerView
          form={form}
          setField={setField}
          setForm={setForm}
          onAddOwnerLead={(e) => handleSubmit(e, "owner")}
          submitting={submitting}
        />
      )}

      <footer className="border-t border-ink-200 px-5 py-6 text-center font-mono text-[11px] uppercase tracking-wider text-ink-400">
        Aeros · NRA 2026 · Booth 12937
      </footer>
    </div>
  );
}

// ─── header ─────────────────────────────────────────────────────────────────

function Header({ mode, onWordmarkTap, onExitOwner }) {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-200 bg-ink-50/95 backdrop-blur supports-[backdrop-filter]:bg-ink-50/80">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-5">
        <button
          type="button"
          onClick={onWordmarkTap}
          className="select-none font-logo text-[14px] font-semibold uppercase tracking-[0.06em] text-ink-900 active:opacity-70"
          aria-label="Aeros"
        >
          <span className="text-ink-400">/</span> AEROS
        </button>
        {mode === "owner" ? (
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] uppercase tracking-wider text-ink-400">
              Owner mode
            </span>
            <button
              type="button"
              onClick={onExitOwner}
              className="rounded-md border border-ink-200 bg-white px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-ink-800 active:bg-ink-100"
            >
              Exit
            </button>
          </div>
        ) : (
          <div className="text-right">
            <div className="font-mono text-[11px] uppercase tracking-wider text-ink-900">
              NRA 2026 · Booth #12937
            </div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-ink-400">
              Say hello
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

// ─── form view ──────────────────────────────────────────────────────────────

function FormView({ form, setField, onSubmit, submitting }) {
  const fresh = !form.name && !form.company && !form.email;
  return (
    <main className="mx-auto max-w-xl px-5 pb-16 pt-8">
      {fresh && (
        <section className="mb-10">
          <h1 className="font-sans text-[40px] font-bold leading-[1.05] tracking-[-0.025em] text-ink-900">
            Let&apos;s stay in touch.
          </h1>
          <p className="mt-4 text-[16px] leading-relaxed text-ink-600">
            Drop your details and we&apos;ll follow up after the show with
            anything you wanted to hear more about.
          </p>
        </section>
      )}

      <form onSubmit={onSubmit}>
        <FormFields form={form} setField={setField} />
        <div className="mt-8">
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-ink-900 px-5 py-4 text-[16px] font-semibold text-white transition-opacity active:opacity-80 disabled:opacity-60"
          >
            {submitting ? "Sending…" : "Submit"}
          </button>
          <p className="mt-3 text-center text-[13px] text-ink-400">
            We&apos;ll only use this to follow up about Aeros.
          </p>
        </div>
      </form>
    </main>
  );
}

// Shared form fields, used in both visitor mode and owner-add mode. The
// caller wraps these in a <form onSubmit={...}> with a submit button.
// `perspective` flips field copy: "self" reads like "your name / your booth"
// for a visitor self-registering; "owner" reads like "name / their booth #"
// for Arjun logging exhibitors he meets on the floor.
function FormFields({ form, setField, perspective = "self" }) {
  const owner = perspective === "owner";
  return (
    <div className="space-y-5">
      <Field
        label={owner ? "Name" : "Your name"}
        required
        value={form.name}
        onChange={(v) => setField("name", v)}
        autoComplete="name"
        autoCapitalize="words"
        spellCheck={false}
      />
      <Field
        label="Company"
        required
        value={form.company}
        onChange={(v) => setField("company", v)}
        autoComplete="organization"
      />
      <Field
        label="Role"
        value={form.role}
        onChange={(v) => setField("role", v)}
        autoComplete="organization-title"
        placeholder="Optional"
      />
      <Field
        label="Email"
        required
        type="email"
        value={form.email}
        onChange={(v) => setField("email", v)}
        autoComplete="email"
        inputMode="email"
        spellCheck={false}
      />
      <Field
        label="Phone"
        value={form.phone}
        onChange={(v) => setField("phone", v)}
        autoComplete="tel"
        inputMode="tel"
        placeholder="Optional"
      />
      <Field
        label={owner ? "Their booth #" : "Your booth (if exhibiting)"}
        value={form.booth}
        onChange={(v) => setField("booth", v)}
        inputMode="numeric"
        placeholder="Optional"
      />

      <fieldset className="space-y-2">
        <legend className="font-mono text-[11px] uppercase tracking-wider text-ink-400">
          {owner ? "What they do" : "What you do"}
        </legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => {
            const active = form.category === c;
            return (
              <button
                type="button"
                key={c}
                onClick={() => setField("category", active ? "" : c)}
                className={
                  "min-h-[44px] rounded-md border px-3 py-2 text-[14px] transition-colors " +
                  (active
                    ? "border-ink-900 bg-ink-900 text-white"
                    : "border-ink-200 bg-white text-ink-800 active:bg-ink-100")
                }
              >
                {c}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="font-mono text-[11px] uppercase tracking-wider text-ink-400">
          {owner ? "Topics to follow up on" : "Want to hear about"}
        </legend>
        <p className="text-[13px] text-ink-400">Pick all that apply</p>
        <div className="flex flex-wrap gap-2">
          {INTERESTS.map((i) => {
            const active = form.interests.includes(i);
            return (
              <button
                type="button"
                key={i}
                onClick={() => {
                  const next = active
                    ? form.interests.filter((x) => x !== i)
                    : [...form.interests, i];
                  setField("interests", next);
                }}
                className={
                  "min-h-[44px] rounded-md border px-3 py-2 text-[14px] transition-colors " +
                  (active
                    ? "border-ink-900 bg-ink-900 text-white"
                    : "border-ink-200 bg-white text-ink-800 active:bg-ink-100")
                }
              >
                {i}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div>
        <label className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-ink-400">
          Anything else?
        </label>
        <textarea
          value={form.notes}
          onChange={(e) => setField("notes", e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-ink-200 bg-white px-3 py-3 text-[16px] text-ink-800 placeholder:text-ink-400 focus:border-ink-800 focus:outline-none"
          placeholder="Optional"
        />
      </div>
    </div>
  );
}

function Field({ label, required, value, onChange, type = "text", ...rest }) {
  return (
    <div>
      <label className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-ink-400">
        {label}{required ? " *" : ""}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full rounded-lg border border-ink-200 bg-white px-3 py-3 text-[16px] text-ink-800 placeholder:text-ink-400 focus:border-ink-800 focus:outline-none"
        {...rest}
      />
    </div>
  );
}

// ─── thanks view ────────────────────────────────────────────────────────────

function ThanksView({ name, countdown, onAnother, onSaveVCard }) {
  return (
    <main className="mx-auto max-w-xl px-5 pb-16 pt-12">
      <div className="flex flex-col items-center text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-ink-900">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h1 className="mt-6 font-sans text-[36px] font-bold leading-[1.1] tracking-[-0.025em] text-ink-900">
          Thanks, {firstName(name)}.
        </h1>
        <p className="mt-3 max-w-sm text-[16px] leading-relaxed text-ink-600">
          We&apos;ll follow up after the show with what you wanted to hear about.
        </p>
      </div>

      <div className="mt-10 rounded-lg border border-ink-200 bg-white p-5">
        <div className="font-mono text-[11px] uppercase tracking-wider text-ink-400">
          Find us
        </div>
        <div className="mt-2 font-sans text-[18px] font-bold text-ink-900">
          Aeros · Booth #12937
        </div>
        <div className="mt-1 text-[14px] text-ink-600">
          McCormick Place, Chicago · May 16–19
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <button
          type="button"
          onClick={onSaveVCard}
          className="w-full rounded-lg bg-ink-900 px-5 py-4 text-[16px] font-semibold text-white transition-opacity active:opacity-80"
        >
          Save Aeros to your contacts
        </button>
        <button
          type="button"
          onClick={onAnother}
          className="w-full rounded-lg border border-ink-200 bg-white px-5 py-4 text-[16px] font-semibold text-ink-800 transition-colors active:bg-ink-100"
        >
          Register someone else
        </button>
      </div>

      <p className="mt-6 text-center font-mono text-[11px] uppercase tracking-wider text-ink-400">
        Resetting in {countdown}s
      </p>
    </main>
  );
}

// ─── owner view ─────────────────────────────────────────────────────────────

function OwnerView({ form, setField, setForm, onAddOwnerLead, submitting }) {
  const [tab, setTab] = useState("list"); // list | add
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editPatch, setEditPatch] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(`/api/nra/leads?show=${SHOW}`, { cache: "no-store" });
      if (res.status === 401) {
        setLoadError("Sign in to the Aeros hub as an admin to see leads.");
        setLeads([]);
      } else if (!res.ok) {
        throw new Error(String(res.status));
      } else {
        const data = await res.json();
        setLeads(data.leads || []);
      }
    } catch (e) {
      setLoadError(e?.message || "Failed to load leads");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) => {
      return [l.name, l.company, l.role, l.email, l.phone, l.category, l.notes]
        .some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [leads, query]);

  const outboxCount = typeof window !== "undefined" ? readOutbox().length : 0;

  async function handleSave(id) {
    if (!editPatch) return;
    try {
      const res = await fetch(`/api/nra/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editPatch),
      });
      if (!res.ok) throw new Error(String(res.status));
      setEditingId(null);
      setEditPatch(null);
      await refresh();
    } catch (e) {
      alert("Save failed: " + (e?.message || "unknown"));
    }
  }

  async function handleDelete(id) {
    if (!confirm("Delete this lead?")) return;
    try {
      const res = await fetch(`/api/nra/leads/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
      await refresh();
    } catch (e) {
      alert("Delete failed: " + (e?.message || "unknown"));
    }
  }

  function doDownloadCsv() {
    downloadFile(`nra-leads-${new Date().toISOString().slice(0,10)}.csv`, leadsToCsv(leads), "text/csv;charset=utf-8");
  }
  function doDownloadJson() {
    downloadFile(`nra-leads-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(leads, null, 2), "application/json");
  }
  async function doCopyCsv() {
    try {
      await navigator.clipboard.writeText(leadsToCsv(leads));
      alert(`Copied ${leads.length} leads to clipboard.`);
    } catch {
      alert("Copy failed — try Download CSV instead.");
    }
  }
  function doEmailCsv() {
    const csv = leadsToCsv(leads);
    const body = csv.length > 1800
      ? `${leads.length} leads — full CSV attached separately (too large for mailto).\n\nFirst rows:\n\n${csv.slice(0, 1500)}`
      : csv;
    const url = `mailto:arjun@aeros-x.com?subject=${encodeURIComponent("NRA 2026 leads — " + new Date().toISOString().slice(0,10))}&body=${encodeURIComponent(body)}`;
    window.location.href = url;
  }
  async function doClearAll() {
    if (!confirm(`Delete ALL ${leads.length} leads? This cannot be undone.`)) return;
    if (!confirm("Really delete everything?")) return;
    for (const l of leads) {
      try { await fetch(`/api/nra/leads/${l.id}`, { method: "DELETE" }); } catch {}
    }
    await refresh();
  }

  return (
    <main className="mx-auto max-w-3xl px-5 pb-16 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-ink-400">
            Captured leads
          </div>
          <div className="font-sans text-[28px] font-bold leading-[1.1] tracking-[-0.02em] text-ink-900">
            {loading ? "…" : leads.length}
            {outboxCount > 0 && (
              <span className="ml-2 align-middle font-mono text-[11px] uppercase tracking-wider text-ink-400">
                +{outboxCount} queued
              </span>
            )}
          </div>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setExportOpen((o) => !o)}
            className="rounded-md border border-ink-200 bg-white px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-ink-800 active:bg-ink-100"
          >
            Export ▾
          </button>
          {exportOpen && (
            <div className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-lg border border-ink-200 bg-white shadow-sm">
              {[
                ["Download CSV", doDownloadCsv],
                ["Download JSON (backup)", doDownloadJson],
                ["Copy CSV to clipboard", doCopyCsv],
                ["Email CSV to myself", doEmailCsv],
                ["Clear all", doClearAll],
              ].map(([label, fn]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => { setExportOpen(false); fn(); }}
                  className="block w-full px-4 py-3 text-left text-[14px] text-ink-800 hover:bg-ink-100 active:bg-ink-100"
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setTab("list")}
          className={"rounded-md border px-3 py-2 font-mono text-[11px] uppercase tracking-wider " + (tab === "list" ? "border-ink-900 bg-ink-900 text-white" : "border-ink-200 bg-white text-ink-800")}
        >
          List
        </button>
        <button
          type="button"
          onClick={() => setTab("add")}
          className={"rounded-md border px-3 py-2 font-mono text-[11px] uppercase tracking-wider " + (tab === "add" ? "border-ink-900 bg-ink-900 text-white" : "border-ink-200 bg-white text-ink-800")}
        >
          + Add lead
        </button>
      </div>

      {tab === "list" && (
        <>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, company, email…"
            className="mb-4 w-full rounded-lg border border-ink-200 bg-white px-3 py-3 text-[16px] text-ink-800 placeholder:text-ink-400 focus:border-ink-800 focus:outline-none"
          />

          {loading && <p className="text-[14px] text-ink-400">Loading…</p>}
          {loadError && (
            <div className="rounded-lg border border-ink-200 bg-white p-4 text-[14px] text-ink-800">
              <p className="font-semibold">Couldn&apos;t load leads.</p>
              <p className="mt-1 text-ink-400">{loadError}</p>
            </div>
          )}

          {!loading && !loadError && filtered.length === 0 && (
            <p className="text-[14px] text-ink-400">
              {leads.length === 0 ? "No leads yet." : "No leads match that search."}
            </p>
          )}

          <ul className="space-y-3">
            {filtered.map((l) => (
              <li key={l.id} className="rounded-lg border border-ink-200 bg-white p-4">
                {editingId === l.id ? (
                  <EditCard
                    initial={l}
                    patch={editPatch}
                    setPatch={setEditPatch}
                    onCancel={() => { setEditingId(null); setEditPatch(null); }}
                    onSave={() => handleSave(l.id)}
                  />
                ) : (
                  <LeadCard
                    lead={l}
                    onEdit={() => { setEditingId(l.id); setEditPatch({ ...l }); }}
                    onDelete={() => handleDelete(l.id)}
                  />
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {tab === "add" && (
        <div>
          <p className="mb-4 text-[14px] text-ink-600">
            Add a lead you met on the floor. Tagged as owner-added.
          </p>
          <CardScanner
            onScanned={(extracted) => {
              // Merge into the form, but only overwrite empty fields so the
              // user's typing never gets clobbered by a re-scan.
              const merge = (k) => extracted[k] && !form[k] ? extracted[k] : form[k];
              setForm({
                ...form,
                name:    merge("name"),
                company: merge("company"),
                role:    merge("role"),
                email:   merge("email"),
                phone:   merge("phone"),
                booth:   merge("booth"),
                notes:   extracted.notes && !form.notes ? extracted.notes : form.notes,
              });
            }}
          />
          <form onSubmit={onAddOwnerLead}>
            <FormFields form={form} setField={setField} perspective="owner" />
            <button
              type="submit"
              disabled={submitting}
              className="mt-6 w-full rounded-lg bg-ink-900 px-5 py-4 text-[16px] font-semibold text-white transition-opacity active:opacity-80 disabled:opacity-60"
            >
              {submitting ? "Saving…" : "Save lead"}
            </button>
          </form>
        </div>
      )}
    </main>
  );
}

function LeadCard({ lead, onEdit, onDelete }) {
  const date = lead.created_at
    ? new Date(lead.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "";
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-sans text-[16px] font-semibold text-ink-900">{lead.name}</span>
            <span className={"rounded-md border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider " + (lead.source === "owner" ? "border-ink-800 bg-ink-800 text-white" : "border-ink-200 text-ink-400")}>
              {lead.source}
            </span>
          </div>
          <div className="mt-0.5 truncate text-[14px] text-ink-600">
            {lead.company}{lead.role ? ` · ${lead.role}` : ""}
          </div>
        </div>
        <div className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-ink-400">
          {date}
        </div>
      </div>
      <div className="mt-2 space-y-0.5 text-[13px] text-ink-600">
        <div className="break-all">{lead.email}{lead.phone ? ` · ${lead.phone}` : ""}</div>
        {(lead.category || lead.booth) && (
          <div>
            {lead.category}{lead.category && lead.booth ? " · " : ""}{lead.booth ? `Booth ${lead.booth}` : ""}
          </div>
        )}
        {Array.isArray(lead.interests) && lead.interests.length > 0 && (
          <div className="font-mono text-[11px] uppercase tracking-wider text-ink-400">
            {lead.interests.join(" · ")}
          </div>
        )}
        {lead.notes && <p className="mt-1 whitespace-pre-wrap text-ink-800">{lead.notes}</p>}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md border border-ink-200 bg-white px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-ink-800 active:bg-ink-100"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md border border-ink-200 bg-white px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-ink-600 active:bg-ink-100"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function EditCard({ patch, setPatch, onCancel, onSave }) {
  if (!patch) return null;
  const set = (k, v) => setPatch({ ...patch, [k]: v });
  return (
    <div className="space-y-3">
      <Field label="Name" required value={patch.name} onChange={(v) => set("name", v)} />
      <Field label="Company" required value={patch.company} onChange={(v) => set("company", v)} />
      <Field label="Role" value={patch.role || ""} onChange={(v) => set("role", v)} />
      <Field label="Email" type="email" value={patch.email} onChange={(v) => set("email", v)} />
      <Field label="Phone" value={patch.phone || ""} onChange={(v) => set("phone", v)} />
      <Field label="Booth" value={patch.booth || ""} onChange={(v) => set("booth", v)} />
      <div>
        <label className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-ink-400">Notes</label>
        <textarea
          value={patch.notes || ""}
          onChange={(e) => set("notes", e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-ink-200 bg-white px-3 py-3 text-[16px] text-ink-800 focus:border-ink-800 focus:outline-none"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSave}
          className="rounded-lg bg-ink-900 px-4 py-2 text-[14px] font-semibold text-white active:opacity-80"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-ink-200 bg-white px-4 py-2 text-[14px] font-semibold text-ink-800 active:bg-ink-100"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── card scanner ───────────────────────────────────────────────────────────

// Wraps a hidden <input type="file" capture="environment"> so a tap launches
// the rear camera on iOS Safari and Chrome Android. After capture we resize
// the image client-side (network is unreliable at McCormick), POST to
// /api/nra/leads/scan, and call onScanned with the extracted fields.
//
// Always lets the user review before saving — OCR isn't perfect.
function CardScanner({ onScanned }) {
  const inputRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [warn, setWarn] = useState(""); // low-confidence warning

  async function handleFile(file) {
    if (!file) return;
    setError("");
    setWarn("");
    setScanning(true);
    try {
      const dataUrl = await resizeImage(file, 1600, 0.8);
      const res = await fetch("/api/nra/leads/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      if (res.status === 401) {
        throw new Error("Owner mode required (sign in as admin).");
      }
      if (res.status === 503) {
        throw new Error("Card scanner not configured yet.");
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Scan failed (${res.status})`);
      }
      const { extracted } = await res.json();
      onScanned(extracted);
      if (extracted.confidence === "low") {
        setWarn("Low confidence — double-check the fields below.");
      }
    } catch (e) {
      setError(e?.message || "Scan failed. Try again or fill manually.");
    } finally {
      setScanning(false);
      // Reset input so the same file can be re-selected next time.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-dashed border-ink-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="font-mono text-[11px] uppercase tracking-wider text-ink-400">
          Quick add
        </div>
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={scanning}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-ink-900 px-4 py-3 text-[15px] font-semibold text-white transition-opacity active:opacity-80 disabled:opacity-60"
      >
        {scanning ? (
          <>
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            Reading card…
          </>
        ) : (
          <>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            Scan business card
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <p className="mt-2 text-[12px] text-ink-400">
        Snap the card with your rear camera. You can edit anything before saving.
      </p>
      {warn && (
        <p className="mt-2 rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-[12px] text-ink-800">
          {warn}
        </p>
      )}
      {error && (
        <p className="mt-2 rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-[12px] text-ink-800">
          {error}
        </p>
      )}
    </div>
  );
}

// Resize + recompress a captured image client-side. Phone cameras produce
// 3000×4000 JPEGs that are wasteful for OCR — Claude only needs ~1600px on
// the long edge to read 8pt print. Cuts upload bytes by ~10x.
async function resizeImage(file, maxEdge = 1600, quality = 0.8) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}
