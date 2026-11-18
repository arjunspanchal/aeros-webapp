"use client";
import { useMemo, useState } from "react";
import { PageHead, Card, Empty, ErrorText, Field, Btn, Pill, Segmented, postJson, inputCls, num } from "../../_components/ui";

const SOURCE_LABEL = { FG: "Made by us", RM: "Raw material", Traded: "Traded", Clearance: "Clearance", Other: "Other" };
const BLANK = { sku: "", name: "", uom: "pcs", source: "Traded", industry: "", category: "", case_pack: "", brand_customer: "", notes: "" };

function ItemForm({ value, onChange, sources, units, industries, categories, isNew }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {isNew && <Field label="Code"><input className={`${inputCls} font-mono`} value={value.sku} onChange={set("sku")} placeholder="e.g. BRG-6204" /></Field>}
      <Field label="Name" className={isNew ? "lg:col-span-3" : "sm:col-span-2 lg:col-span-4"}><input className={inputCls} value={value.name} onChange={set("name")} /></Field>
      <Field label="Unit">
        <input className={inputCls} list="wh-units" value={value.uom} onChange={set("uom")} />
        <datalist id="wh-units">{units.map((u) => <option key={u} value={u} />)}</datalist>
      </Field>
      <Field label="Type"><select className={inputCls} value={value.source} onChange={set("source")}>{sources.map((s) => <option key={s} value={s}>{SOURCE_LABEL[s] || s}</option>)}</select></Field>
      <Field label="Line of goods">
        <input className={inputCls} list="wh-industries" value={value.industry || ""} onChange={set("industry")} placeholder="Packaging, Bearings, Fasteners…" />
        <datalist id="wh-industries">{industries.map((u) => <option key={u} value={u} />)}</datalist>
      </Field>
      <Field label="Category (as in the Aeros Listing)">
        <select className={inputCls} value={value.category || ""} onChange={set("category")}>
          <option value="">Choose…</option>
          {value.category && !categories.includes(value.category) && <option value={value.category}>{value.category} (old, not in the listing)</option>}
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Pack size (units per carton)"><input inputMode="numeric" className={inputCls} value={value.case_pack ?? ""} onChange={set("case_pack")} /></Field>
      <Field label="Customer it is kept for (if any)"><input className={inputCls} value={value.brand_customer || ""} onChange={set("brand_customer")} /></Field>
      <Field label="Note" className="sm:col-span-2"><input className={inputCls} value={value.notes || ""} onChange={set("notes")} /></Field>
    </div>
  );
}

export default function ItemsClient({ initialItems, sources, units, categories }) {
  const [items, setItems] = useState(initialItems);
  const [q, setQ] = useState("");
  const [show, setShow] = useState("active");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(BLANK);
  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const industries = useMemo(() => [...new Set(["Packaging", ...items.map((i) => i.industry).filter(Boolean)])], [items]);
  const rows = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return items
      .filter((i) => (show === "active" ? i.is_active : show === "review" ? i.is_active && i.needs_review : !i.is_active))
      .filter((i) => { const t = `${i.sku} ${i.name} ${i.industry || ""} ${i.category || ""} ${i.brand_customer || ""}`.toLowerCase(); return words.every((w) => t.includes(w)); })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items, q, show]);
  const toReview = items.filter((i) => i.is_active && i.needs_review).length;

  async function add() {
    setBusy(true); setErr("");
    const res = await postJson("/api/warehouse/items", draft);
    setBusy(false);
    if (!res.ok) { setErr(/duplicate|23505/.test(res.error) ? "That code is already used by another item." : res.error); return; }
    setItems((p) => [res.data.item, ...p]); setDraft(BLANK); setAdding(false);
  }
  async function save(id, patch) {
    setBusy(true); setErr("");
    const res = await postJson(`/api/warehouse/items/${id}`, patch, "PATCH");
    setBusy(false);
    if (!res.ok) { setErr(res.error); return false; }
    setItems((p) => p.map((i) => (i.id === id ? { ...i, ...res.data.item } : i)));
    return true;
  }

  return (
    <div>
      <PageHead title="Items" sub="Everything the warehouse can hold, in any line of goods. New items are also added on the spot from a Zoho invoice or purchase order."
        right={<Btn onClick={() => { setAdding((v) => !v); setErr(""); }}>{adding ? "Cancel" : "Add item"}</Btn>} />
      {adding && (
        <Card className="mb-5 space-y-3">
          <ItemForm value={draft} onChange={setDraft} sources={sources} units={units} industries={industries} categories={categories} isNew />
          <ErrorText>{err}</ErrorText>
          <Btn onClick={add} disabled={busy || !draft.sku.trim() || !draft.name.trim()}>{busy ? "Saving…" : "Save item"}</Btn>
        </Card>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input className={`${inputCls} max-w-sm`} placeholder="Search name, code, line of goods, customer…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Segmented value={show} onChange={setShow} options={[{ value: "active", label: "Active" }, { value: "review", label: `To review${toReview ? ` (${toReview})` : ""}` }, { value: "off", label: "Switched off" }]} />
      </div>
      {show === "review" && <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">Items added quickly from a Zoho document. Check the name, unit and pack size, then mark them checked.</p>}
      {rows.length === 0 ? <Empty>No item matches.</Empty> : (
        <Card className="divide-y divide-gray-100 !p-0 dark:divide-gray-800">
          {rows.slice(0, 300).map((i) => (
            <div key={i.id} className="px-4 py-3">
              {editId === i.id ? (
                <div className="space-y-3">
                  <ItemForm value={edit} onChange={setEdit} sources={sources} units={units} industries={industries} categories={categories} />
                  <ErrorText>{err}</ErrorText>
                  <div className="flex flex-wrap items-center gap-3">
                    <Btn disabled={busy || !edit.name.trim()} onClick={async () => { if (await save(i.id, { ...edit, needs_review: false })) setEditId(null); }}>{busy ? "Saving…" : "Save"}</Btn>
                    <Btn tone="ghost" onClick={() => setEditId(null)}>Cancel</Btn>
                    <Btn tone="danger" disabled={busy} onClick={async () => { if (window.confirm(`Switch off ${i.name}? It stays in history but can no longer be picked.`) && await save(i.id, { is_active: false })) setEditId(null); }}>Switch off</Btn>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-gray-900 dark:text-white">{i.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      <span className="font-mono">{i.sku}</span>
                      {[i.uom, SOURCE_LABEL[i.source] || i.source, i.industry, i.category, i.case_pack ? `${num(i.case_pack)} per carton` : "", i.brand_customer].filter(Boolean).map((x) => ` · ${x}`).join("")}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {i.needs_review && i.is_active && <Pill tone="warn">to review</Pill>}
                    {i.is_active
                      ? <Btn tone="ghost" onClick={() => { setEditId(i.id); setEdit({ name: i.name, uom: i.uom || "pcs", source: i.source || "Other", industry: i.industry || "", category: i.category || "", case_pack: i.case_pack ?? "", brand_customer: i.brand_customer || "", notes: i.notes || "" }); setErr(""); }}>Edit</Btn>
                      : <Btn tone="ghost" disabled={busy} onClick={() => save(i.id, { is_active: true })}>Switch on</Btn>}
                  </div>
                </div>
              )}
            </div>
          ))}
          {rows.length > 300 && <p className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">Showing the first 300 of {num(rows.length)}. Search to narrow down.</p>}
        </Card>
      )}
    </div>
  );
}
