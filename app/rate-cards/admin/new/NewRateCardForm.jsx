"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Field, inputCls } from "@/app/calculator/_components/ui";

export default function NewRateCardForm() {
  const router = useRouter();
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState("");
  const [title, setTitle] = useState("");
  const [brand, setBrand] = useState("");
  const [status, setStatus] = useState("Draft");
  const [terms, setTerms] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/calc/clients").then((r) => r.ok ? r.json() : []).then(setClients).catch(() => setClients([]));
  }, []);

  const selectedClient = clients.find((c) => c.id === clientId);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (!selectedClient) { setErr("Pick a customer."); return; }
    setSaving(true);
    const res = await fetch("/api/rate-cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientEmail: selectedClient.email,
        clientName: selectedClient.name || selectedClient.company,
        brand,
        title,
        status,
        terms,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error || "Failed to create card");
      return;
    }
    const card = await res.json();
    router.push(`/rate-cards/admin/${card.id}/edit`);
  }

  return (
    <Card>
      <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Customer">
          <select required className={inputCls} value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Select a customer…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || c.company || c.email} · {c.email}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Brand" hint="Optional — e.g. Salt City Coffee">
          <input className={inputCls} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Salt City Coffee" />
        </Field>
        <Field label="Title" hint="Shows at the top of the card">
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Salt City Coffee Cups & Lids" />
        </Field>
        <Field label="Status">
          <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="Draft">Draft (not visible to customer)</option>
            <option value="Published">Published</option>
            <option value="Archived">Archived</option>
          </select>
        </Field>
        <div className="md:col-span-2">
          <Field label="Terms & notes" hint="Freeform; shown at the bottom of the card">
            <textarea rows={4} className={inputCls} value={terms} onChange={(e) => setTerms(e.target.value)} />
          </Field>
        </div>
        <div className="md:col-span-2 flex items-center gap-3">
          <button disabled={saving} className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60">
            {saving ? "Creating…" : "Create card & add items →"}
          </button>
          {err && <p className="text-xs text-red-500">{err}</p>}
        </div>
      </form>
    </Card>
  );
}
