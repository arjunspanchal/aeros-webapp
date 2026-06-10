"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "../_components/AuthProvider";
import { Eyebrow, Title, Field } from "../_components/ui";
import {
  listProducts, createProduct, updateProduct, deleteProduct,
  listVendors, createVendor, updateVendor, deleteVendor,
} from "../_lib/data";
import { ProductDraft, VendorDraft, exwAeros, CATALOGUE_MARKUP, PRODUCT_TYPES } from "../_lib/schemas";
import { inr } from "../_lib/format";

const MARKUP_PCT = Math.round(CATALOGUE_MARKUP * 100);
const EMPTY_PRODUCT = { brand: "", vendor: "", product_type: "", category: "", sub_category: "", model_name: "", purchase_rate: "", mrp: "", remark: "Distribution", active: true };
const EMPTY_VENDOR = { name: "", vendor_type: "authorised_distributor", region: "India", city: "", contact_person: "", phone: "", email: "", website: "", gst_no: "", payment_terms: "", lead_time_days: "", notes: "", active: true };

const rate = (v) => (v == null || v === "" ? "—" : inr(v));

export default function ProductsPage() {
  const { session, ready } = useAuth();
  const isAdmin = session?.role === "admin";

  const [tab, setTab] = useState("catalogue");
  const [rows, setRows] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [query, setQuery] = useState("");
  const [brandFilter, setBrandFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState(null);      // product editor: null | "new" | id
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [vEditing, setVEditing] = useState(null);    // vendor editor
  const [vForm, setVForm] = useState(EMPTY_VENDOR);

  async function reload() {
    setLoading(true);
    try {
      const [p, v] = await Promise.all([listProducts(session), listVendors(session)]);
      setRows(p); setVendors(v); setErr("");
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (ready && isAdmin) reload(); /* eslint-disable-next-line */ }, [ready, isAdmin]);

  const vendorNames = useMemo(() => [...new Set(vendors.map((v) => v.name).filter(Boolean))].sort(), [vendors]);
  const categories = useMemo(() => [...new Set(rows.map((r) => r.category).filter(Boolean))].sort(), [rows]);
  const brandCounts = useMemo(() => {
    const m = new Map();
    for (const r of rows) m.set(r.brand || "—", (m.get(r.brand || "—") || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);
  const pricedPct = useMemo(() => {
    if (!rows.length) return 0;
    return Math.round((rows.filter((r) => r.purchase_rate != null).length / rows.length) * 100);
  }, [rows]);

  // filter + group by brand
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    let f = rows;
    if (brandFilter !== "all") f = f.filter((r) => (r.brand || "—") === brandFilter);
    if (q) f = f.filter((r) => [r.model_name, r.brand, r.vendor, r.category, r.product_type, r.remark].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
    const byBrand = new Map();
    for (const r of f) { const b = r.brand || "—"; if (!byBrand.has(b)) byBrand.set(b, []); byBrand.get(b).push(r); }
    return [...byBrand.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([brand, items]) => ({ brand, items: items.sort((a, b) => (a.category || "").localeCompare(b.category || "") || (a.model_name || "").localeCompare(b.model_name || "")) }));
  }, [rows, query, brandFilter]);

  // ---- product editor ----
  function openNew() {
    const nextOrder = rows.reduce((m, r) => Math.max(m, r.sort_order ?? 0), 0) + 1;
    setForm({ ...EMPTY_PRODUCT, brand: brandFilter !== "all" ? brandFilter : "", sort_order: nextOrder });
    setEditing("new"); setErr("");
  }
  function openEdit(r) {
    setForm({
      brand: r.brand || "", vendor: r.vendor || "", product_type: r.product_type || "",
      category: r.category || "", sub_category: r.sub_category || "", model_name: r.model_name || "",
      purchase_rate: r.purchase_rate == null ? "" : String(r.purchase_rate),
      mrp: r.mrp == null ? "" : String(r.mrp),
      remark: r.remark || "", sort_order: r.sort_order ?? 0, active: r.active !== false,
    });
    setEditing(r.id); setErr("");
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  async function save(e) {
    e.preventDefault(); setErr("");
    const payload = {
      brand: form.brand.trim(),
      vendor: form.vendor?.trim() || null,
      product_type: form.product_type?.trim() || null,
      category: (form.category || form.product_type || "Other").trim(),
      sub_category: form.sub_category?.trim() || form.product_type?.trim() || null,
      model_name: form.model_name.trim(),
      purchase_rate: form.purchase_rate === "" ? null : Number(form.purchase_rate),
      mrp: form.mrp === "" ? null : Number(form.mrp),
      remark: form.remark?.trim() || null,
      active: form.active !== false,
    };
    if (form.sort_order !== undefined && form.sort_order !== "") payload.sort_order = Number(form.sort_order);
    const parsed = ProductDraft.safeParse(payload);
    if (!parsed.success) { setErr(parsed.error.issues[0]?.message || "Check the fields."); return; }
    setBusy(true);
    try {
      if (editing === "new") await createProduct(session, parsed.data);
      else await updateProduct(session, editing, parsed.data);
      setEditing(null); setForm(EMPTY_PRODUCT); await reload();
    } catch (e2) { setErr(e2.message || "Could not save."); }
    finally { setBusy(false); }
  }
  async function remove(r) {
    if (!window.confirm(`Delete ${r.brand} ${r.model_name}?`)) return;
    setBusy(true);
    try { await deleteProduct(session, r.id); await reload(); } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  // ---- vendor editor ----
  function vOpenNew() { setVForm(EMPTY_VENDOR); setVEditing("new"); setErr(""); }
  function vOpenEdit(v) {
    setVForm({ name: v.name || "", vendor_type: v.vendor_type || "", region: v.region || "", city: v.city || "", contact_person: v.contact_person || "", phone: v.phone || "", email: v.email || "", website: v.website || "", gst_no: v.gst_no || "", payment_terms: v.payment_terms || "", lead_time_days: v.lead_time_days == null ? "" : String(v.lead_time_days), notes: v.notes || "", active: v.active !== false, _brands: (v.brands || []).join(", ") });
    setVEditing(v.id); setErr("");
  }
  const vSet = (k) => (e) => setVForm((f) => ({ ...f, [k]: e.target.value }));
  async function vSave(e) {
    e.preventDefault(); setErr("");
    const payload = {
      name: vForm.name.trim(), vendor_type: vForm.vendor_type?.trim() || null, region: vForm.region?.trim() || null,
      city: vForm.city?.trim() || null, contact_person: vForm.contact_person?.trim() || null, phone: vForm.phone?.trim() || null,
      email: vForm.email?.trim() || null, website: vForm.website?.trim() || null, gst_no: vForm.gst_no?.trim() || null,
      payment_terms: vForm.payment_terms?.trim() || null, lead_time_days: vForm.lead_time_days === "" ? null : Number(vForm.lead_time_days),
      notes: vForm.notes?.trim() || null, active: vForm.active !== false,
    };
    const parsed = VendorDraft.safeParse(payload);
    if (!parsed.success) { setErr(parsed.error.issues[0]?.message || "Check the fields."); return; }
    const row = { ...parsed.data };
    if (vForm._brands !== undefined) row.brands = vForm._brands.split(",").map((s) => s.trim()).filter(Boolean);
    setBusy(true);
    try {
      if (vEditing === "new") await createVendor(session, row);
      else await updateVendor(session, vEditing, row);
      setVEditing(null); setVForm(EMPTY_VENDOR); await reload();
    } catch (e2) { setErr(e2.message || "Could not save vendor."); }
    finally { setBusy(false); }
  }
  async function vRemove(v) {
    if (!window.confirm(`Delete vendor ${v.name}?`)) return;
    setBusy(true);
    try { await deleteVendor(session, v.id); await reload(); } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  if (ready && !isAdmin) {
    return (
      <div className="em-dark" style={{ margin: "-20px -16px -80px", padding: "40px 16px" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <Eyebrow onDark>OWNER · PRICE LIST</Eyebrow>
          <Title lead="Admin" tail="PIN required" onDark style={{ fontSize: 26, marginTop: 8 }} />
          <p style={{ color: "rgba(255,255,255,0.6)", marginTop: 12 }}>Purchase rates and vendors are owner-only. Lock and re-enter with the 6-digit admin PIN.</p>
          <Link href="/emission/jobs" className="em-btn em-btn--gold em-btn--sm" style={{ marginTop: 16, textDecoration: "none" }}>← BACK TO JOBS</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="em-dark" style={{ margin: "-20px -16px -80px", padding: "24px 16px 80px" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
          <div>
            <Eyebrow onDark>OWNER · CATALOGUE</Eyebrow>
            <Title lead="Electronics" tail="price list" onDark style={{ fontSize: 28, marginTop: 6 }} />
          </div>
          <div style={{ display: "flex", gap: 18 }}>
            <button onClick={() => setTab("catalogue")} className={`em-tab ${tab === "catalogue" ? "em-tab--on" : ""}`} style={{ background: "none", border: 0, cursor: "pointer" }}>CATALOGUE · {rows.length}</button>
            <button onClick={() => setTab("vendors")} className={`em-tab ${tab === "vendors" ? "em-tab--on" : ""}`} style={{ background: "none", border: 0, cursor: "pointer" }}>VENDORS · {vendors.length}</button>
          </div>
        </div>

        <div className="em-eyebrow em-eyebrow--ondark" style={{ marginTop: 8, textTransform: "none", letterSpacing: "0.04em" }}>
          {rows.length} models · {brandCounts.length} brands · {pricedPct}% priced · rates INR EXW (cost) · EXW Aeros = purchase + {MARKUP_PCT}%
        </div>

        {err ? <div className="em-card em-card--dark" style={{ padding: 14, marginTop: 14, color: "#fff" }}>{err}</div> : null}

        {tab === "catalogue" ? (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
              <input className="em-input" placeholder="Search model / brand / vendor / type…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: 1, minWidth: 200, padding: "8px 10px", fontSize: 13 }} />
              <button onClick={openNew} className="em-btn em-btn--gold em-btn--sm" style={{ whiteSpace: "nowrap" }}>+ ADD MODEL</button>
            </div>

            {/* brand filter chips */}
            <div style={{ display: "flex", gap: 8, overflowX: "auto", marginTop: 12, paddingBottom: 4 }} className="no-scrollbar">
              <Chip on={brandFilter === "all"} onClick={() => setBrandFilter("all")}>ALL · {rows.length}</Chip>
              {brandCounts.map(([b, n]) => <Chip key={b} on={brandFilter === b} onClick={() => setBrandFilter(b)}>{b} · {n}</Chip>)}
            </div>

            {editing ? <ProductEditor editing={editing} form={form} set={set} setForm={setForm} save={save} busy={busy} cancel={() => setEditing(null)} vendorNames={vendorNames} categories={categories} /> : null}

            {loading ? <div className="em-eyebrow em-eyebrow--ondark" style={{ padding: 28 }}>LOADING…</div>
              : groups.length === 0 ? <div className="em-card em-card--dark" style={{ padding: 18, marginTop: 14 }}><span className="em-eyebrow em-eyebrow--ondark">{query ? "NO MATCHES" : "NO PRODUCTS"}</span></div>
              : groups.map((g) => (
                <div key={g.brand} className="em-card em-card--dark" style={{ padding: 18, marginTop: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ color: "#fff", fontWeight: 800, fontSize: 16 }}>{g.brand}</span>
                    <span className="em-eyebrow em-eyebrow--ondark">{g.items.length} models</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 100px 100px 70px", gap: 10, marginTop: 12, paddingBottom: 6 }}>
                    <span className="em-eyebrow em-eyebrow--ondark">MODEL · TYPE</span>
                    <span className="em-eyebrow em-eyebrow--ondark">VENDOR</span>
                    <span className="em-eyebrow em-eyebrow--ondark" style={{ textAlign: "right" }}>PURCHASE</span>
                    <span className="em-eyebrow em-eyebrow--ondark" style={{ textAlign: "right" }}>EXW AEROS</span>
                    <span />
                  </div>
                  {g.items.map((r) => (
                    <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1fr 130px 100px 100px 70px", gap: 10, alignItems: "center", padding: "9px 0", borderTop: "1px solid rgba(255,255,255,0.06)", opacity: r.active === false ? 0.45 : 1 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>{r.model_name}{r.active === false ? " · inactive" : ""}</div>
                        <div className="em-eyebrow em-eyebrow--ondark" style={{ textTransform: "none", letterSpacing: "0.03em" }}>{r.product_type || r.sub_category || r.category || "—"}</div>
                      </div>
                      <span className="em-eyebrow em-eyebrow--ondark" style={{ textTransform: "none", letterSpacing: "0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.vendor || "—"}</span>
                      <span className="em-mono" style={{ color: r.purchase_rate == null ? "rgba(255,255,255,0.35)" : "#fff", fontSize: 13, textAlign: "right", whiteSpace: "nowrap" }}>{rate(r.purchase_rate)}</span>
                      <span className="em-mono" style={{ color: exwAeros(r.purchase_rate) == null ? "rgba(255,255,255,0.3)" : "var(--em-gold)", fontSize: 13, fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>{exwAeros(r.purchase_rate) == null ? "—" : inr(exwAeros(r.purchase_rate))}</span>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button onClick={() => openEdit(r)} className="em-tab" style={{ background: "none", border: 0, color: "rgba(255,255,255,0.85)", cursor: "pointer", padding: 0, fontSize: 11 }}>EDIT</button>
                        <button onClick={() => remove(r)} disabled={busy} className="em-tab" style={{ background: "none", border: 0, color: "rgba(255,255,255,0.5)", cursor: "pointer", padding: 0, fontSize: 11 }}>DEL</button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
          </>
        ) : (
          <VendorsTab vendors={vendors} loading={loading} busy={busy} vEditing={vEditing} vForm={vForm} vSet={vSet} setVForm={setVForm} vSave={vSave} vOpenNew={vOpenNew} vOpenEdit={vOpenEdit} vRemove={vRemove} cancel={() => setVEditing(null)} />
        )}
      </div>
    </div>
  );
}

function Chip({ on, onClick, children }) {
  return <button onClick={onClick} className={`em-chip ${on ? "em-chip--on" : ""}`} style={on ? { background: "var(--em-gold)", borderColor: "var(--em-gold)", color: "var(--em-ink)" } : { background: "transparent", color: "rgba(255,255,255,0.7)", borderColor: "rgba(255,255,255,0.15)" }}>{children}</button>;
}

function ProductEditor({ editing, form, set, setForm, save, busy, cancel, vendorNames, categories }) {
  return (
    <form onSubmit={save} className="em-card em-card--dark" style={{ padding: 18, marginTop: 14, borderColor: "rgba(201,168,76,0.5)" }}>
      <span className="em-eyebrow em-eyebrow--ondark">{editing === "new" ? "ADD MODEL" : "EDIT MODEL"}</span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginTop: 12 }}>
        <Field label="Brand" required><input className="em-input" value={form.brand} onChange={set("brand")} placeholder="Pioneer DJ" /></Field>
        <Field label="Vendor"><input className="em-input" list="em-vendors" value={form.vendor} onChange={set("vendor")} placeholder="AlphaTheta / Pioneer DJ India" /><datalist id="em-vendors">{vendorNames.map((v) => <option key={v} value={v} />)}</datalist></Field>
        <Field label="Product type"><input className="em-input" list="em-ptypes" value={form.product_type} onChange={set("product_type")} placeholder="DJ Controller" /><datalist id="em-ptypes">{PRODUCT_TYPES.map((t) => <option key={t} value={t} />)}</datalist></Field>
        <Field label="Category"><input className="em-input" list="em-cats" value={form.category} onChange={set("category")} placeholder="DJ" /><datalist id="em-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist></Field>
        <Field label="Model name" required><input className="em-input" value={form.model_name} onChange={set("model_name")} placeholder="DDJ-FLX4" /></Field>
        <Field label="Purchase ₹ (EXW)" hint={form.purchase_rate ? `EXW Aeros: ${inr(exwAeros(form.purchase_rate))}` : "blank = to be priced"}><input className="em-input em-mono" type="number" inputMode="numeric" value={form.purchase_rate} onChange={set("purchase_rate")} placeholder="" /></Field>
        <Field label="MRP ₹ (optional)"><input className="em-input em-mono" type="number" inputMode="numeric" value={form.mrp} onChange={set("mrp")} /></Field>
        <Field label="Remark"><input className="em-input" value={form.remark} onChange={set("remark")} /></Field>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, cursor: "pointer", color: "#fff" }}>
        <input type="checkbox" checked={form.active !== false} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} style={{ width: 16, height: 16 }} />
        <span className="em-label" style={{ textTransform: "none", letterSpacing: "0.03em", color: "rgba(255,255,255,0.7)" }}>Active</span>
      </label>
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button type="submit" className="em-btn em-btn--gold em-btn--sm" disabled={busy}>{busy ? "SAVING…" : "SAVE"}</button>
        <button type="button" onClick={cancel} className="em-tab" style={{ background: "none", border: 0, color: "rgba(255,255,255,0.6)", cursor: "pointer" }}>CANCEL</button>
      </div>
    </form>
  );
}

function VendorsTab({ vendors, loading, busy, vEditing, vForm, vSet, setVForm, vSave, vOpenNew, vOpenEdit, vRemove, cancel }) {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
        <button onClick={vOpenNew} className="em-btn em-btn--gold em-btn--sm">+ ADD VENDOR</button>
      </div>
      {vEditing ? (
        <form onSubmit={vSave} className="em-card em-card--dark" style={{ padding: 18, marginTop: 14, borderColor: "rgba(201,168,76,0.5)" }}>
          <span className="em-eyebrow em-eyebrow--ondark">{vEditing === "new" ? "ADD VENDOR" : "EDIT VENDOR"}</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginTop: 12 }}>
            <Field label="Vendor name" required><input className="em-input" value={vForm.name} onChange={vSet("name")} /></Field>
            <Field label="Type"><input className="em-input" value={vForm.vendor_type} onChange={vSet("vendor_type")} placeholder="authorised_distributor" /></Field>
            <Field label="Brands (comma-sep)"><input className="em-input" value={vForm._brands || ""} onChange={vSet("_brands")} placeholder="JBL, AKG" /></Field>
            <Field label="Region"><input className="em-input" value={vForm.region} onChange={vSet("region")} /></Field>
            <Field label="City"><input className="em-input" value={vForm.city} onChange={vSet("city")} /></Field>
            <Field label="Contact person"><input className="em-input" value={vForm.contact_person} onChange={vSet("contact_person")} /></Field>
            <Field label="Phone"><input className="em-input" value={vForm.phone} onChange={vSet("phone")} /></Field>
            <Field label="Email"><input className="em-input" value={vForm.email} onChange={vSet("email")} /></Field>
            <Field label="GST no"><input className="em-input" value={vForm.gst_no} onChange={vSet("gst_no")} /></Field>
            <Field label="Payment terms"><input className="em-input" value={vForm.payment_terms} onChange={vSet("payment_terms")} placeholder="30 days" /></Field>
            <Field label="Lead time (days)"><input className="em-input em-mono" type="number" value={vForm.lead_time_days} onChange={vSet("lead_time_days")} /></Field>
            <Field label="Notes"><input className="em-input" value={vForm.notes} onChange={vSet("notes")} /></Field>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button type="submit" className="em-btn em-btn--gold em-btn--sm" disabled={busy}>{busy ? "SAVING…" : "SAVE"}</button>
            <button type="button" onClick={cancel} className="em-tab" style={{ background: "none", border: 0, color: "rgba(255,255,255,0.6)", cursor: "pointer" }}>CANCEL</button>
          </div>
        </form>
      ) : null}

      {loading ? <div className="em-eyebrow em-eyebrow--ondark" style={{ padding: 28 }}>LOADING…</div>
        : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14, marginTop: 14 }}>
            {vendors.map((v) => (
              <div key={v.id} className="em-card em-card--dark" style={{ padding: 16, opacity: v.active === false ? 0.5 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{v.name}</span>
                  <span className="em-eyebrow em-eyebrow--ondark" style={{ whiteSpace: "nowrap" }}>{v.region || ""}</span>
                </div>
                <div className="em-eyebrow em-eyebrow--ondark" style={{ marginTop: 4 }}>{(v.vendor_type || "").replace(/_/g, " ")}</div>
                {v.brands?.length ? <div className="em-eyebrow em-eyebrow--ondark" style={{ textTransform: "none", letterSpacing: "0.02em", marginTop: 8, color: "rgba(255,255,255,0.7)" }}>{v.brands.join(" · ")}</div> : null}
                {v.notes ? <div className="em-eyebrow em-eyebrow--ondark" style={{ textTransform: "none", letterSpacing: "0.02em", marginTop: 8 }}>{v.notes}</div> : null}
                {(v.contact_person || v.phone || v.email) ? <div className="em-mono" style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 8 }}>{[v.contact_person, v.phone, v.email].filter(Boolean).join(" · ")}</div> : null}
                <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                  <button onClick={() => vOpenEdit(v)} className="em-tab" style={{ background: "none", border: 0, color: "rgba(255,255,255,0.85)", cursor: "pointer", padding: 0, fontSize: 11 }}>EDIT</button>
                  <button onClick={() => vRemove(v)} disabled={busy} className="em-tab" style={{ background: "none", border: 0, color: "rgba(255,255,255,0.5)", cursor: "pointer", padding: 0, fontSize: 11 }}>DEL</button>
                </div>
              </div>
            ))}
          </div>}
    </>
  );
}
