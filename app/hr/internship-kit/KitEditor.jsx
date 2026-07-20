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
  const [whoCanApply, setWhoCanApply] = useState(initial.whoCanApply || "");
  const [tracks, setTracks] = useState(initial.tracks || []);
  const [program, setProgram] = useState(initial.program || []);
  const [gains, setGains] = useState(initial.gains || []);
  const [highlights, setHighlights] = useState(initial.highlights || []);
  const [faqs, setFaqs] = useState(initial.faqs || []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // highlights ----------------------------------------------------------------
  const setHl = (i, v) => setHighlights((h) => h.map((x, idx) => (idx === i ? v : x)));
  const addHl = () => setHighlights((h) => [...h, ""]);
  const rmHl = (i) => setHighlights((h) => h.filter((_, idx) => idx !== i));

  // gains (string list, like highlights) -------------------------------------
  const setGn = (i, v) => setGains((g) => g.map((x, idx) => (idx === i ? v : x)));
  const addGn = () => setGains((g) => [...g, ""]);
  const rmGn = (i) => setGains((g) => g.filter((_, idx) => idx !== i));

  // program at a glance ({label, value, note}) --------------------------------
  const setPg = (i, key, v) => setProgram((p) => p.map((x, idx) => (idx === i ? { ...x, [key]: v } : x)));
  const addPg = () => setProgram((p) => [...p, { label: "", value: "", note: "" }]);
  const rmPg = (i) => setProgram((p) => p.filter((_, idx) => idx !== i));

  // tracks ({title, points[]}); points edited as newline-separated text -------
  const setTkTitle = (i, v) => setTracks((t) => t.map((x, idx) => (idx === i ? { ...x, title: v } : x)));
  const setTkPoints = (i, v) => setTracks((t) => t.map((x, idx) => (idx === i ? { ...x, points: v.split("\n") } : x)));
  const addTk = () => setTracks((t) => [...t, { title: "", points: [] }]);
  const rmTk = (i) => setTracks((t) => t.filter((_, idx) => idx !== i));

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
      whoCanApply: whoCanApply.trim(),
      tracks: tracks
        .map((t) => ({ title: t.title.trim(), points: (t.points || []).map((p) => p.trim()).filter(Boolean) }))
        .filter((t) => t.title),
      program: program
        .map((p) => ({ label: p.label.trim(), value: p.value.trim(), note: (p.note || "").trim() }))
        .filter((p) => p.label && p.value),
      gains: gains.map((g) => g.trim()).filter(Boolean),
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
      setWhoCanApply(data.kit.whoCanApply || "");
      setTracks(data.kit.tracks || []);
      setProgram(data.kit.program || []);
      setGains(data.kit.gains || []);
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

      {/* Roles / tracks */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Roles we&apos;re hiring for</h2>
          <button onClick={addTk} className="text-xs font-medium px-2.5 py-1.5 rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700">+ Add track</button>
        </div>
        <p className="mt-1 text-xs text-gray-400">Each track shows a title and its responsibilities (one per line).</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {tracks.map((t, i) => (
            <div key={i} className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-gray-400">Track {i + 1}</span>
                <button onClick={() => rmTk(i)} className="text-xs text-gray-400 hover:text-red-600" title="Remove">✕</button>
              </div>
              <input className={`${inputCls} mt-1`} value={t.title} onChange={(e) => setTkTitle(i, e.target.value)} placeholder="Track title" />
              <textarea className={`${inputCls} mt-2 h-28`} value={(t.points || []).join("\n")} onChange={(e) => setTkPoints(i, e.target.value)} placeholder={"Responsibility 1\nResponsibility 2"} />
            </div>
          ))}
        </div>
      </section>

      {/* Program at a glance */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Program at a glance</h2>
          <button onClick={addPg} className="text-xs font-medium px-2.5 py-1.5 rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700">+ Add item</button>
        </div>
        <p className="mt-1 text-xs text-gray-400">Label / value / optional note (e.g. Stipend · ₹10,000–15,000 · per month).</p>
        <div className="mt-3 space-y-2">
          {program.map((p, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-center">
              <input className={inputCls} value={p.label} onChange={(e) => setPg(i, "label", e.target.value)} placeholder="Label" />
              <input className={inputCls} value={p.value} onChange={(e) => setPg(i, "value", e.target.value)} placeholder="Value" />
              <input className={inputCls} value={p.note} onChange={(e) => setPg(i, "note", e.target.value)} placeholder="Note (optional)" />
              <button onClick={() => rmPg(i)} className="justify-self-start text-gray-400 hover:text-red-600 text-sm px-1" title="Remove">✕</button>
            </div>
          ))}
        </div>
      </section>

      {/* What you'll gain */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">What you&apos;ll gain</h2>
          <button onClick={addGn} className="text-xs font-medium px-2.5 py-1.5 rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700">+ Add point</button>
        </div>
        <div className="mt-3 space-y-2">
          {gains.map((g, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className={inputCls} value={g} onChange={(e) => setGn(i, e.target.value)} placeholder="e.g. Direct mentorship from the leadership team" />
              <button onClick={() => rmGn(i)} className="text-gray-400 hover:text-red-600 text-sm px-1" title="Remove">✕</button>
            </div>
          ))}
        </div>
      </section>

      {/* Who can apply */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Who can apply</h2>
        <textarea className={`${inputCls} mt-3 h-20`} value={whoCanApply} onChange={(e) => setWhoCanApply(e.target.value)} placeholder="Eligibility — streams, year, what you value in candidates." />
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
