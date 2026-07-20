"use client";
// Editor for the public /internship page's content — highlight badges + FAQ.
// Saves the whole kit in one PATCH; changes are live on the public form
// immediately (it reads the same Supabase row). Any HR user can edit.
import { useState } from "react";
import { inputCls, labelCls } from "@/app/factoryos/_components/ui";

export default function KitEditor({ initial }) {
  const [intro, setIntro] = useState(initial.intro || "");
  const [contactName, setContactName] = useState(initial.contactName || "");
  const [contactPhone, setContactPhone] = useState(initial.contactPhone || "");
  const [contactEmail, setContactEmail] = useState(initial.contactEmail || "");
  const [highlights, setHighlights] = useState(initial.highlights || []);
  const [faqs, setFaqs] = useState(initial.faqs || []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // highlights ----------------------------------------------------------------
  const setHl = (i, v) => setHighlights((h) => h.map((x, idx) => (idx === i ? v : x)));
  const addHl = () => setHighlights((h) => [...h, ""]);
  const rmHl = (i) => setHighlights((h) => h.filter((_, idx) => idx !== i));

  // faqs ----------------------------------------------------------------------
  const setFaq = (i, key, v) => setFaqs((f) => f.map((x, idx) => (idx === i ? { ...x, [key]: v } : x)));
  const addFaq = () => setFaqs((f) => [...f, { q: "", a: "" }]);
  const rmFaq = (i) => setFaqs((f) => f.filter((_, idx) => idx !== i));
  const moveFaq = (i, dir) => setFaqs((f) => {
    const j = i + dir;
    if (j < 0 || j >= f.length) return f;
    const next = [...f];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  async function save() {
    setBusy(true); setErr(""); setMsg("");
    const payload = {
      intro: intro.trim(),
      contactName: contactName.trim(),
      contactPhone: contactPhone.trim(),
      contactEmail: contactEmail.trim(),
      highlights: highlights.map((h) => h.trim()).filter(Boolean),
      faqs: faqs.map((f) => ({ q: f.q.trim(), a: f.a.trim() })).filter((f) => f.q && f.a),
    };
    try {
      const res = await fetch("/api/hr/internship-kit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.error || "Save failed"); return; }
      setHighlights(data.kit.highlights);
      setFaqs(data.kit.faqs);
      setIntro(data.kit.intro);
      setContactName(data.kit.contactName || "");
      setContactPhone(data.kit.contactPhone || "");
      setContactEmail(data.kit.contactEmail || "");
      setMsg("Saved — live on the public form now.");
    } catch {
      setErr("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-8">
      {/* HR contact */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">HR contact</h2>
        <p className="mt-1 text-xs text-gray-400">Shown at the bottom of the public form for candidates who want to reach out directly.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <label className={labelCls}>Name (optional)</label>
            <input className={inputCls} value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="e.g. Prabhnoor" />
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input className={inputCls} value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+91 90537 65050" inputMode="tel" />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input className={inputCls} value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="hr@aeros-x.com" type="email" />
          </div>
        </div>
      </section>

      {/* Highlights */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Highlight badges</h2>
          <button onClick={addHl} className="text-xs font-medium px-2.5 py-1.5 rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700">+ Add badge</button>
        </div>
        <p className="mt-1 text-xs text-gray-400">Short pills shown under the page title (e.g. stipend, PPO track).</p>
        <div className="mt-3 space-y-2">
          {highlights.length === 0 && <p className="text-sm text-gray-400">No badges.</p>}
          {highlights.map((h, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className={inputCls} value={h} onChange={(e) => setHl(i, e.target.value)} placeholder="e.g. ₹10,000–15,000 / month" />
              <button onClick={() => rmHl(i)} className="text-gray-400 hover:text-red-600 text-sm px-1" title="Remove">✕</button>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">FAQ</h2>
          <button onClick={addFaq} className="text-xs font-medium px-2.5 py-1.5 rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700">+ Add question</button>
        </div>
        <p className="mt-1 text-xs text-gray-400">Shown as an accordion below the form, in this order.</p>
        <div className="mt-3 space-y-4">
          {faqs.length === 0 && <p className="text-sm text-gray-400">No questions.</p>}
          {faqs.map((f, i) => (
            <div key={i} className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-gray-400">Q{i + 1}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => moveFaq(i, -1)} disabled={i === 0} className="text-xs px-1.5 py-0.5 text-gray-500 hover:text-gray-800 disabled:opacity-30 dark:text-gray-400" title="Move up">↑</button>
                  <button onClick={() => moveFaq(i, 1)} disabled={i === faqs.length - 1} className="text-xs px-1.5 py-0.5 text-gray-500 hover:text-gray-800 disabled:opacity-30 dark:text-gray-400" title="Move down">↓</button>
                  <button onClick={() => rmFaq(i)} className="text-xs px-1.5 py-0.5 text-gray-400 hover:text-red-600" title="Remove">✕</button>
                </div>
              </div>
              <input className={`${inputCls} mt-1`} value={f.q} onChange={(e) => setFaq(i, "q", e.target.value)} placeholder="Question" />
              <textarea className={`${inputCls} mt-2 h-24`} value={f.a} onChange={(e) => setFaq(i, "a", e.target.value)} placeholder="Answer" />
            </div>
          ))}
        </div>
      </section>

      <div className="sticky bottom-4 flex items-center gap-3 rounded-xl border border-gray-200 bg-white/90 p-3 backdrop-blur dark:border-gray-800 dark:bg-gray-900/90">
        <button onClick={save} disabled={busy} className="text-sm font-medium px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
          {busy ? "Saving…" : "Save changes"}
        </button>
        {msg && <span className="text-sm text-emerald-600 dark:text-emerald-400">{msg}</span>}
        {err && <span className="text-sm text-red-600">{err}</span>}
      </div>
    </div>
  );
}
