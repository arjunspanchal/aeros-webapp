"use client";

// Internal lead-capture tool for NRA Show 2026. Two tabs:
//   - "capture" : scan a business card OR fill the form manually  (default)
//   - "list"    : every lead captured this show, with search + export
//
// The page is gated server-side in page.jsx — anyone reaching this client
// component is a verified staff admin. Submit POSTs to /api/nra/leads with
// a localStorage outbox fallback in case the wifi at McCormick is patchy.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const CATEGORIES = [
  "Operator", "Distributor", "Disposables", "Packaging", "Equipment",
  "Refrigeration", "Beverage", "Smallwares", "Cleaning", "POS / Tech", "Other",
];
const INTERESTS = [
  "Marketplace", "Aeros Select", "Factory OS", "Show offer", "Just exploring",
];
const RECORD_TYPES = ["exhibitor", "visitor"];
const PRIORITIES = ["P0", "P1", "P2"];
const PRIORITY_LABEL = {
  P0: "P0 — hot, follow up this week",
  P1: "P1 — interested, follow up post-show",
  P2: "P2 — captured, no urgency",
};

const OUTBOX_KEY = "aeros:nra2026:outbox";
const SHOW = "nra-2026";

const EMPTY_FORM = {
  name: "", company: "", role: "", email: "", phone: "",
  category: "", booth: "", interests: [], notes: "",
  record_type: "exhibitor", priority: "P2", country: "",
};

// ─── country code → country lookup ──────────────────────────────────────────
// Compact subset focused on the demographics most likely at NRA (food-service
// industry tradeshow in Chicago). Longest-prefix wins (e.g. "+971" beats "+9").
const COUNTRY_CODES = {
  // 3-digit
  "971": "United Arab Emirates", "972": "Israel", "973": "Bahrain",
  "966": "Saudi Arabia", "974": "Qatar", "965": "Kuwait", "968": "Oman",
  "961": "Lebanon", "962": "Jordan", "964": "Iraq",
  "212": "Morocco", "213": "Algeria", "216": "Tunisia", "218": "Libya",
  "234": "Nigeria", "254": "Kenya", "255": "Tanzania", "256": "Uganda",
  "351": "Portugal", "352": "Luxembourg", "353": "Ireland", "354": "Iceland",
  "356": "Malta", "357": "Cyprus", "358": "Finland", "359": "Bulgaria",
  "370": "Lithuania", "371": "Latvia", "372": "Estonia",
  "374": "Armenia", "375": "Belarus", "380": "Ukraine",
  "381": "Serbia", "385": "Croatia", "386": "Slovenia",
  "420": "Czech Republic", "421": "Slovakia",
  "593": "Ecuador", "595": "Paraguay", "598": "Uruguay",
  "880": "Bangladesh", "886": "Taiwan",
  "960": "Maldives", "977": "Nepal", "992": "Tajikistan", "994": "Azerbaijan",
  "995": "Georgia", "998": "Uzbekistan",
  // 2-digit
  "20": "Egypt", "27": "South Africa", "30": "Greece", "31": "Netherlands",
  "32": "Belgium", "33": "France", "34": "Spain", "36": "Hungary",
  "39": "Italy", "40": "Romania", "41": "Switzerland", "43": "Austria",
  "44": "United Kingdom", "45": "Denmark", "46": "Sweden", "47": "Norway",
  "48": "Poland", "49": "Germany",
  "51": "Peru", "52": "Mexico", "54": "Argentina", "55": "Brazil",
  "56": "Chile", "57": "Colombia", "58": "Venezuela",
  "60": "Malaysia", "61": "Australia", "62": "Indonesia", "63": "Philippines",
  "64": "New Zealand", "65": "Singapore", "66": "Thailand",
  "81": "Japan", "82": "South Korea", "84": "Vietnam", "86": "China",
  "90": "Turkey", "91": "India", "92": "Pakistan", "94": "Sri Lanka",
  // 1-digit
  "1": "United States / Canada",
  "7": "Russia / Kazakhstan",
};

function detectCountry(phone) {
  if (typeof phone !== "string") return "";
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (!cleaned.startsWith("+")) return "";
  const digits = cleaned.slice(1);
  for (const len of [3, 2, 1]) {
    const code = digits.slice(0, len);
    if (COUNTRY_CODES[code]) return COUNTRY_CODES[code];
  }
  return "";
}

// ─── helpers ────────────────────────────────────────────────────────────────

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
    "created_at", "record_type", "priority", "name", "company", "role",
    "email", "phone", "country", "category", "booth", "interests", "notes",
  ];
  const lines = [headers.join(",")];
  for (const l of leads) {
    lines.push([
      l.created_at,
      l.record_type, l.priority,
      l.name, l.company, l.role,
      l.email, l.phone, l.country,
      l.category, l.booth, (l.interests || []).join("; "),
      l.notes,
    ].map(csvEscape).join(","));
  }
  return lines.join("\n");
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

// ─── root component ─────────────────────────────────────────────────────────

export default function CaptureClient({ session }) {
  const [tab, setTab] = useState("capture"); // capture | list
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [justSavedName, setJustSavedName] = useState("");

  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [outboxCount, setOutboxCount] = useState(0);

  const setField = (k, v) => setForm((f) => {
    const next = { ...f, [k]: v };
    // Auto-detect country from phone, but only if the user hasn't manually
    // typed a country yet (or the detection still matches what's there).
    if (k === "phone") {
      const detected = detectCountry(v);
      if (detected && (!f.country || f.country === detectCountry(f.phone))) {
        next.country = detected;
      }
    }
    return next;
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(`/api/nra/leads?show=${SHOW}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setLeads(data.leads || []);
    } catch (e) {
      setLoadError(e?.message || "Failed to load leads");
    } finally {
      setLoading(false);
      setOutboxCount(readOutbox().length);
    }
  }, []);

  useEffect(() => {
    refresh();
    flushOutbox().catch(() => {});
    const onOnline = () => {
      flushOutbox().then(refresh).catch(() => {});
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [refresh]);

  function validate() {
    if (!form.name.trim()) return "Please enter a name.";
    if (!form.company.trim()) return "Please enter a company.";
    const email = form.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return "Email looks off — leave it blank if unsure.";
    }
    return null;
  }

  async function handleSave(e) {
    e?.preventDefault?.();
    if (submitting) return;
    const err = validate();
    if (err) { alert(err); return; }
    setSubmitting(true);
    const payload = {
      name: form.name.trim(),
      company: form.company.trim(),
      role: form.role.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      booth: form.booth.trim(),
      category: form.category,
      interests: form.interests,
      notes: form.notes.trim(),
      record_type: form.record_type,
      priority: form.priority,
      country: form.country.trim(),
      source: "owner",
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
      setJustSavedName(form.name);
      setForm(EMPTY_FORM);
      setSubmitting(false);
      setOutboxCount(readOutbox().length);
      // Background refresh — no need to block the UI.
      refresh().catch(() => {});
      // Clear the toast after 4s.
      setTimeout(() => setJustSavedName(""), 4000);
    }
  }

  return (
    <div className="min-h-screen bg-ink-50 text-ink-800">
      <Header session={session} totalLeads={leads.length} outboxCount={outboxCount} />

      <div className="mx-auto max-w-3xl px-5 pt-4">
        <TabBar tab={tab} setTab={setTab} />
      </div>

      {tab === "capture" && (
        <CaptureView
          form={form}
          setField={setField}
          setForm={setForm}
          onSave={handleSave}
          submitting={submitting}
          justSavedName={justSavedName}
        />
      )}

      {tab === "list" && (
        <ListView
          leads={leads}
          loading={loading}
          loadError={loadError}
          refresh={refresh}
        />
      )}

      {tab === "data" && (
        <DataView leads={leads} loading={loading} loadError={loadError} />
      )}

      <footer className="border-t border-ink-200 px-5 py-6 text-center font-mono text-[11px] uppercase tracking-wider text-ink-400">
        Aeros · NRA 2026 · Booth #12937 · McCormick Place · 16–19 May
      </footer>
    </div>
  );
}

// ─── header ─────────────────────────────────────────────────────────────────

function Header({ session, totalLeads, outboxCount }) {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-200 bg-ink-50/95 backdrop-blur supports-[backdrop-filter]:bg-ink-50/80">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-5">
        <Link
          href="/hub"
          className="font-logo text-[14px] font-semibold uppercase tracking-[0.06em] text-ink-900 active:opacity-70"
        >
          <span className="text-ink-400">/</span> AEROS · NRA list
        </Link>
        <div className="text-right">
          <div className="font-mono text-[11px] uppercase tracking-wider text-ink-900">
            {totalLeads} leads
            {outboxCount > 0 && (
              <span className="ml-1 text-ink-400">+{outboxCount} queued</span>
            )}
          </div>
          {session?.email && (
            <div className="font-mono text-[10px] uppercase tracking-wider text-ink-400">
              {session.email}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function TabBar({ tab, setTab }) {
  return (
    <div className="mb-4 flex gap-2">
      <button
        type="button"
        onClick={() => setTab("capture")}
        className={
          "rounded-md border px-4 py-2 font-mono text-[11px] uppercase tracking-wider " +
          (tab === "capture"
            ? "border-ink-900 bg-ink-900 text-white"
            : "border-ink-200 bg-white text-ink-800")
        }
      >
        + Capture
      </button>
      <button
        type="button"
        onClick={() => setTab("list")}
        className={
          "rounded-md border px-4 py-2 font-mono text-[11px] uppercase tracking-wider " +
          (tab === "list"
            ? "border-ink-900 bg-ink-900 text-white"
            : "border-ink-200 bg-white text-ink-800")
        }
      >
        NRA list
      </button>
      <button
        type="button"
        onClick={() => setTab("data")}
        className={
          "rounded-md border px-4 py-2 font-mono text-[11px] uppercase tracking-wider " +
          (tab === "data"
            ? "border-ink-900 bg-ink-900 text-white"
            : "border-ink-200 bg-white text-ink-800")
        }
      >
        Data
      </button>
    </div>
  );
}

// ─── capture view (scan + form) ────────────────────────────────────────────

function CaptureView({ form, setField, setForm, onSave, submitting, justSavedName }) {
  return (
    <main className="mx-auto max-w-xl px-5 pb-16">
      {justSavedName && (
        <div className="mb-4 rounded-lg border border-ink-900 bg-ink-900 px-4 py-3 text-[14px] font-semibold text-white">
          ✓ Saved {justSavedName}
        </div>
      )}

      <CardScanner
        onScanned={(extracted) => {
          // Merge into the form; only overwrite empty fields so a typed
          // value never gets clobbered by a re-scan. Country is derived
          // from phone if the scan didn't return one explicitly.
          const merge = (k) => extracted[k] && !form[k] ? extracted[k] : form[k];
          const scannedCountry = extracted.country || detectCountry(extracted.phone || "");
          setForm({
            ...form,
            name:    merge("name"),
            company: merge("company"),
            role:    merge("role"),
            email:   merge("email"),
            phone:   merge("phone"),
            booth:   merge("booth"),
            country: scannedCountry && !form.country ? scannedCountry : form.country,
            notes:   extracted.notes && !form.notes ? extracted.notes : form.notes,
          });
        }}
      />

      <form onSubmit={onSave} className="mt-2">
        <FormFields form={form} setField={setField} />
        <button
          type="submit"
          disabled={submitting}
          className="mt-6 w-full rounded-lg bg-ink-900 px-5 py-4 text-[16px] font-semibold text-white transition-opacity active:opacity-80 disabled:opacity-60"
        >
          {submitting ? "Saving…" : "Save lead"}
        </button>
      </form>
    </main>
  );
}

// ─── form fields ────────────────────────────────────────────────────────────

function FormFields({ form, setField }) {
  return (
    <div className="space-y-5">
      <Field
        label="Name *"
        value={form.name}
        onChange={(v) => setField("name", v)}
        autoComplete="name"
        autoCapitalize="words"
        spellCheck={false}
        required
      />
      <Field
        label="Company *"
        value={form.company}
        onChange={(v) => setField("company", v)}
        autoComplete="organization"
        required
      />
      <Field
        label="Their booth #"
        value={form.booth}
        onChange={(v) => setField("booth", v)}
        inputMode="numeric"
        placeholder="e.g. 12937"
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
        type="email"
        value={form.email}
        onChange={(v) => setField("email", v)}
        autoComplete="email"
        inputMode="email"
        spellCheck={false}
        placeholder="Optional — leave blank if you don't have it"
      />
      <Field
        label="Phone"
        value={form.phone}
        onChange={(v) => setField("phone", v)}
        autoComplete="tel"
        inputMode="tel"
        placeholder='Optional — start with "+91", "+1", etc. to auto-detect country'
      />
      <Field
        label="Country"
        value={form.country}
        onChange={(v) => setField("country", v)}
        placeholder="Auto-detected from phone — edit if needed"
      />

      <fieldset className="space-y-2">
        <legend className="font-mono text-[11px] uppercase tracking-wider text-ink-400">
          Type of record
        </legend>
        <div className="flex gap-2">
          {RECORD_TYPES.map((t) => {
            const active = form.record_type === t;
            return (
              <button
                type="button"
                key={t}
                onClick={() => setField("record_type", t)}
                className={
                  "min-h-[44px] flex-1 rounded-md border px-3 py-2 text-[14px] capitalize transition-colors " +
                  (active
                    ? "border-ink-900 bg-ink-900 text-white"
                    : "border-ink-200 bg-white text-ink-800 active:bg-ink-100")
                }
              >
                {t}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="font-mono text-[11px] uppercase tracking-wider text-ink-400">
          Priority
        </legend>
        <div className="flex gap-2">
          {PRIORITIES.map((p) => {
            const active = form.priority === p;
            return (
              <button
                type="button"
                key={p}
                onClick={() => setField("priority", p)}
                title={PRIORITY_LABEL[p]}
                className={
                  "min-h-[44px] flex-1 rounded-md border px-3 py-2 text-[14px] font-semibold transition-colors " +
                  (active
                    ? "border-ink-900 bg-ink-900 text-white"
                    : "border-ink-200 bg-white text-ink-800 active:bg-ink-100")
                }
              >
                {p}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-ink-400">
          {PRIORITY_LABEL[form.priority]}
        </p>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="font-mono text-[11px] uppercase tracking-wider text-ink-400">
          What they do
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
          Topics to follow up on
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
          Notes
        </label>
        <textarea
          value={form.notes}
          onChange={(e) => setField("notes", e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-ink-200 bg-white px-3 py-3 text-[16px] text-ink-800 placeholder:text-ink-400 focus:border-ink-800 focus:outline-none"
          placeholder="What did they care about? What did you promise to follow up on?"
        />
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", required, ...rest }) {
  return (
    <div>
      <label className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-ink-400">
        {label}
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

// ─── list view ──────────────────────────────────────────────────────────────

function ListView({ leads, loading, loadError, refresh }) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editPatch, setEditPatch] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) =>
      [l.name, l.company, l.role, l.email, l.phone, l.category, l.booth, l.notes]
        .some((v) => (v || "").toLowerCase().includes(q))
    );
  }, [leads, query]);

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
    <main className="mx-auto max-w-3xl px-5 pb-16">
      <div className="mb-4 flex items-center justify-between gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, company, booth…"
          className="flex-1 rounded-lg border border-ink-200 bg-white px-3 py-3 text-[16px] text-ink-800 placeholder:text-ink-400 focus:border-ink-800 focus:outline-none"
        />
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setExportOpen((o) => !o)}
            className="rounded-md border border-ink-200 bg-white px-3 py-3 font-mono text-[11px] uppercase tracking-wider text-ink-800 active:bg-ink-100"
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

      {loading && <p className="text-[14px] text-ink-400">Loading…</p>}
      {loadError && (
        <div className="rounded-lg border border-ink-200 bg-white p-4 text-[14px] text-ink-800">
          <p className="font-semibold">Couldn&apos;t load leads.</p>
          <p className="mt-1 text-ink-400">{loadError}</p>
        </div>
      )}

      {!loading && !loadError && filtered.length === 0 && (
        <p className="text-[14px] text-ink-400">
          {leads.length === 0
            ? "No leads captured yet. Switch to + Capture to add the first one."
            : "No leads match that search."}
        </p>
      )}

      <ul className="space-y-3">
        {filtered.map((l) => (
          <li key={l.id} className="rounded-lg border border-ink-200 bg-white p-4">
            {editingId === l.id ? (
              <EditCard
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
            {lead.priority && (
              <span className={
                "shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider " +
                (lead.priority === "P0"
                  ? "border-ink-900 bg-ink-900 text-white"
                  : lead.priority === "P1"
                    ? "border-ink-800 text-ink-900"
                    : "border-ink-200 text-ink-400")
              }>
                {lead.priority}
              </span>
            )}
            {lead.record_type && (
              <span className="shrink-0 rounded-md border border-ink-200 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-400">
                {lead.record_type}
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-[14px] text-ink-600">
            {lead.company}{lead.role ? ` · ${lead.role}` : ""}
          </div>
        </div>
        <div className="shrink-0 text-right">
          {lead.booth && (
            <div className="font-mono text-[11px] uppercase tracking-wider text-ink-900">
              Booth {lead.booth}
            </div>
          )}
          <div className="font-mono text-[10px] uppercase tracking-wider text-ink-400">
            {date}
          </div>
        </div>
      </div>
      <div className="mt-2 space-y-0.5 text-[13px] text-ink-600">
        {(lead.email || lead.phone) && (
          <div className="break-all">
            {lead.email}{lead.email && lead.phone ? " · " : ""}{lead.phone}
          </div>
        )}
        {lead.country && (
          <div className="font-mono text-[11px] uppercase tracking-wider text-ink-400">
            {lead.country}
          </div>
        )}
        {lead.category && (
          <div className="font-mono text-[11px] uppercase tracking-wider text-ink-400">
            {lead.category}
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
      <Field label="Name *" value={patch.name} onChange={(v) => set("name", v)} required />
      <Field label="Company *" value={patch.company} onChange={(v) => set("company", v)} required />
      <Field label="Booth #" value={patch.booth || ""} onChange={(v) => set("booth", v)} inputMode="numeric" />
      <Field label="Role" value={patch.role || ""} onChange={(v) => set("role", v)} />
      <Field label="Email" type="email" value={patch.email || ""} onChange={(v) => set("email", v)} />
      <Field label="Phone" value={patch.phone || ""} onChange={(v) => set("phone", v)} />
      <Field label="Country" value={patch.country || ""} onChange={(v) => set("country", v)} />
      <div>
        <label className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-ink-400">Type</label>
        <div className="flex gap-2">
          {RECORD_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => set("record_type", t)}
              className={
                "min-h-[44px] flex-1 rounded-md border px-3 py-2 text-[14px] capitalize " +
                ((patch.record_type || "exhibitor") === t
                  ? "border-ink-900 bg-ink-900 text-white"
                  : "border-ink-200 bg-white text-ink-800")
              }
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-ink-400">Priority</label>
        <div className="flex gap-2">
          {PRIORITIES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => set("priority", p)}
              className={
                "min-h-[44px] flex-1 rounded-md border px-3 py-2 text-[14px] font-semibold " +
                ((patch.priority || "P2") === p
                  ? "border-ink-900 bg-ink-900 text-white"
                  : "border-ink-200 bg-white text-ink-800")
              }
            >
              {p}
            </button>
          ))}
        </div>
      </div>
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

// Hidden <input type="file" capture="environment"> opens the rear camera on
// iOS Safari and Chrome Android. After capture we downscale client-side
// (network is unreliable at McCormick), POST to /api/nra/leads/scan, and
// hand the extracted fields up via onScanned.
function CardScanner({ onScanned }) {
  const inputRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [warn, setWarn] = useState("");

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
        throw new Error("Session expired — sign in again.");
      }
      if (res.status === 503) {
        throw new Error("Card scanner not configured (ANTHROPIC_API_KEY missing).");
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
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="mb-6 rounded-lg border border-dashed border-ink-200 bg-white p-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={scanning}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-ink-900 px-4 py-4 text-[16px] font-semibold text-white transition-opacity active:opacity-80 disabled:opacity-60"
      >
        {scanning ? (
          <>
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            Reading card…
          </>
        ) : (
          <>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
      <p className="mt-2 text-center text-[12px] text-ink-400">
        Or type the details below. Booth # is the field that&apos;ll matter most later.
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

// ─── data view (stats breakdown) ────────────────────────────────────────────

// End-of-day quick-look: total count, plus breakdowns by record type,
// priority, country, and category. Pure read-only — switch to NRA list
// for per-row editing.
function DataView({ leads, loading, loadError }) {
  const stats = useMemo(() => buildStats(leads), [leads]);

  if (loading) {
    return <main className="mx-auto max-w-3xl px-5 pb-16"><p className="text-[14px] text-ink-400">Loading…</p></main>;
  }
  if (loadError) {
    return (
      <main className="mx-auto max-w-3xl px-5 pb-16">
        <div className="rounded-lg border border-ink-200 bg-white p-4 text-[14px] text-ink-800">
          <p className="font-semibold">Couldn&apos;t load leads.</p>
          <p className="mt-1 text-ink-400">{loadError}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-5 pb-16 space-y-6">
      <section>
        <div className="font-mono text-[11px] uppercase tracking-wider text-ink-400">Total captured</div>
        <div className="mt-1 font-sans text-[48px] font-bold leading-[1.0] tracking-[-0.025em] text-ink-900">
          {stats.total}
        </div>
      </section>

      <StatCardRow
        title="By type"
        rows={stats.byRecordType}
        total={stats.total}
        labelTransform={(k) => k}
      />

      <StatCardRow
        title="By priority"
        rows={stats.byPriority}
        total={stats.total}
        labelTransform={(k) => k}
      />

      <StatCardRow
        title="Top countries"
        rows={stats.byCountry.slice(0, 8)}
        total={stats.total}
        labelTransform={(k) => k || "Unknown"}
      />

      <StatCardRow
        title="Top categories"
        rows={stats.byCategory.slice(0, 8)}
        total={stats.total}
        labelTransform={(k) => k || "Unspecified"}
      />
    </main>
  );
}

function buildStats(leads) {
  const total = leads.length;
  const counter = () => new Map();
  const byType = counter();
  const byPriority = counter();
  const byCountry = counter();
  const byCategory = counter();
  for (const l of leads) {
    const t = l.record_type || "exhibitor";
    byType.set(t, (byType.get(t) || 0) + 1);
    const p = l.priority || "P2";
    byPriority.set(p, (byPriority.get(p) || 0) + 1);
    const c = (l.country || "").trim();
    byCountry.set(c, (byCountry.get(c) || 0) + 1);
    const cat = (l.category || "").trim();
    byCategory.set(cat, (byCategory.get(cat) || 0) + 1);
  }
  const sortDesc = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  return {
    total,
    byRecordType: sortDesc(byType),
    byPriority: sortDesc(byPriority),
    byCountry: sortDesc(byCountry),
    byCategory: sortDesc(byCategory),
  };
}

function StatCardRow({ title, rows, total, labelTransform }) {
  if (rows.length === 0) return null;
  return (
    <section>
      <div className="mb-3 font-mono text-[11px] uppercase tracking-wider text-ink-400">{title}</div>
      <div className="space-y-2">
        {rows.map(([key, count]) => {
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={key || "_blank"} className="rounded-lg border border-ink-200 bg-white p-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[14px] font-semibold capitalize text-ink-900">
                  {labelTransform(key)}
                </span>
                <span className="shrink-0 font-mono text-[12px] text-ink-600">
                  {count}{" "}
                  <span className="text-ink-400">({pct}%)</span>
                </span>
              </div>
              <div className="mt-2 h-1 w-full rounded-full bg-ink-100">
                <div
                  className="h-1 rounded-full bg-ink-900"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
