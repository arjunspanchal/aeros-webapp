"use client";
import { useState } from "react";
import { Card, Field, inputCls } from "@/app/calculator/_components/ui";

export default function CardHeaderForm({ card, onSaved }) {
  const [draft, setDraft] = useState(card);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const dirty =
    draft.title !== card.title ||
    draft.brand !== card.brand ||
    draft.status !== card.status ||
    draft.terms !== card.terms;

  async function save() {
    setSaving(true); setMsg("");
    const res = await fetch(`/api/rate-cards/${card.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: draft.title,
        brand: draft.brand,
        status: draft.status,
        terms: draft.terms,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setMsg((await res.json().catch(() => ({}))).error || "Save failed");
      return;
    }
    const updated = await res.json();
    onSaved(updated);
    setDraft(updated);
    setMsg("Saved ✓");
    setTimeout(() => setMsg(""), 2000);
  }

  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <Card title="Card details">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Title">
          <input className={inputCls} value={draft.title || ""} onChange={(e) => set("title", e.target.value)} />
        </Field>
        <Field label="Brand">
          <input className={inputCls} value={draft.brand || ""} onChange={(e) => set("brand", e.target.value)} />
        </Field>
        <Field label="Status">
          <select className={inputCls} value={draft.status || "Draft"} onChange={(e) => set("status", e.target.value)}>
            <option value="Draft">Draft (hidden from customer)</option>
            <option value="Published">Published</option>
            <option value="Archived">Archived</option>
          </select>
        </Field>
        <Field label="Customer email" hint="Read-only — cannot reassign a card">
          <input className={inputCls} value={card.clientEmail} disabled />
        </Field>
        <div className="md:col-span-2">
          <Field label="Terms & notes">
            <textarea rows={4} className={inputCls} value={draft.terms || ""} onChange={(e) => set("terms", e.target.value)} />
          </Field>
        </div>
        <div className="md:col-span-2 flex items-center gap-3">
          <button onClick={save} disabled={!dirty || saving}
            className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Saving…" : "Save header"}
          </button>
          {msg && <span className="text-xs text-gray-500 dark:text-gray-400">{msg}</span>}
        </div>
      </div>
    </Card>
  );
}
