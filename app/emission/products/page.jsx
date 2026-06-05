"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "../_components/AuthProvider";
import { Eyebrow, Title, Field } from "../_components/ui";
import { listProducts, createProduct, updateProduct, deleteProduct } from "../_lib/data";
import { ProductDraft, exwAeros, YAMAHA_MARKUP } from "../_lib/schemas";
import { inr } from "../_lib/format";

const EMPTY = { category: "", sub_category: "", model_name: "", purchase_rate: "", remark: "Distribution", active: true };
const MARKUP_PCT = Math.round(YAMAHA_MARKUP * 100);

export default function ProductsPage() {
  const { session, ready } = useAuth();
  const isAdmin = session?.role === "admin";

  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // editor: null = closed, "new" = adding, or a row id = editing that row
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      setRows(await listProducts(session));
      setErr("");
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!ready || !isAdmin) return;
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, isAdmin]);

  const categories = useMemo(
    () => [...new Set(rows.map((r) => r.category).filter(Boolean))].sort(),
    [rows],
  );
  const subCategories = useMemo(
    () => [...new Set(rows.map((r) => r.sub_category).filter(Boolean))].sort(),
    [rows],
  );

  // filter, then group by category → sub_category, preserving sort_order.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) =>
          [r.model_name, r.category, r.sub_category, r.remark]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q)),
        )
      : rows;
    const byCat = new Map();
    for (const r of filtered) {
      if (!byCat.has(r.category)) byCat.set(r.category, []);
      byCat.get(r.category).push(r);
    }
    return [...byCat.entries()].map(([category, items]) => ({
      category,
      count: items.length,
      items: [...items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    }));
  }, [rows, query]);

  function openNew() {
    const nextOrder = rows.reduce((m, r) => Math.max(m, r.sort_order ?? 0), 0) + 1;
    setForm({ ...EMPTY, sort_order: nextOrder });
    setEditing("new");
    setErr("");
  }
  function openEdit(r) {
    setForm({
      category: r.category || "",
      sub_category: r.sub_category || "",
      model_name: r.model_name || "",
      purchase_rate: String(r.purchase_rate ?? ""),
      remark: r.remark || "",
      sort_order: r.sort_order ?? 0,
      active: r.active !== false,
    });
    setEditing(r.id);
    setErr("");
  }
  function cancel() {
    setEditing(null);
    setForm(EMPTY);
    setErr("");
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setErr("");
    const payload = {
      category: form.category.trim(),
      sub_category: form.sub_category?.trim() || null,
      model_name: form.model_name.trim(),
      purchase_rate: form.purchase_rate,
      remark: form.remark?.trim() || null,
      active: form.active !== false,
    };
    if (form.sort_order !== undefined && form.sort_order !== "") payload.sort_order = Number(form.sort_order);
    const parsed = ProductDraft.safeParse(payload);
    if (!parsed.success) {
      setErr(parsed.error.issues[0]?.message || "Check the fields.");
      return;
    }
    setBusy(true);
    try {
      if (editing === "new") await createProduct(session, parsed.data);
      else await updateProduct(session, editing, parsed.data);
      cancel();
      await reload();
    } catch (e2) {
      setErr(e2.message || "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(r) {
    if (!window.confirm(`Delete ${r.model_name}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await deleteProduct(session, r.id);
      await reload();
    } catch (e2) {
      setErr(e2.message || "Could not delete.");
    } finally {
      setBusy(false);
    }
  }

  // ---- gate (non-admins) ----------------------------------------------------
  if (ready && !isAdmin) {
    return (
      <div className="em-dark" style={{ margin: "-20px -16px -80px", padding: "40px 16px" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <Eyebrow onDark>OWNER · PRICE LIST</Eyebrow>
          <Title lead="Admin" tail="PIN required" onDark style={{ fontSize: 26, marginTop: 8 }} />
          <p style={{ color: "rgba(255,255,255,0.6)", marginTop: 12 }}>
            Purchase rates are owner-only. Lock and re-enter with the 6-digit admin PIN.
          </p>
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
            <Eyebrow onDark>OWNER · PRICE LIST</Eyebrow>
            <Title lead="Yamaha" tail="purchase rates" onDark style={{ fontSize: 28, marginTop: 6 }} />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              className="em-input"
              placeholder="Search model / category…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ width: 220, padding: "8px 10px", fontSize: 13 }}
            />
            <button onClick={openNew} className="em-btn em-btn--gold em-btn--sm" style={{ whiteSpace: "nowrap" }}>+ ADD MODEL</button>
          </div>
        </div>

        <div className="em-eyebrow em-eyebrow--ondark" style={{ marginTop: 10, textTransform: "none", letterSpacing: "0.04em" }}>
          {rows.length} models · rates are INR EXW (cost). EXW Aeros = purchase rate + {MARKUP_PCT}%.
        </div>

        {err ? <div className="em-card em-card--dark" style={{ padding: 14, marginTop: 14, color: "#fff" }}>{err}</div> : null}

        {/* Editor */}
        {editing ? (
          <form onSubmit={save} className="em-card em-card--dark" style={{ padding: 18, marginTop: 14, borderColor: "rgba(201,168,76,0.5)" }}>
            <span className="em-eyebrow em-eyebrow--ondark">{editing === "new" ? "ADD MODEL" : "EDIT MODEL"}</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginTop: 12 }}>
              <Field label="Category" required>
                <input className="em-input" list="em-prod-cats" value={form.category} onChange={set("category")} placeholder="GUITAR" />
                <datalist id="em-prod-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
              </Field>
              <Field label="Sub category">
                <input className="em-input" list="em-prod-subcats" value={form.sub_category} onChange={set("sub_category")} placeholder="Acoustic Guitar" />
                <datalist id="em-prod-subcats">{subCategories.map((c) => <option key={c} value={c} />)}</datalist>
              </Field>
              <Field label="Model name" required>
                <input className="em-input" value={form.model_name} onChange={set("model_name")} placeholder="APX600" />
              </Field>
              <Field label="Purchase rate ₹ (EXW)" required hint={form.purchase_rate ? `EXW Aeros: ${inr(exwAeros(form.purchase_rate))}` : null}>
                <input className="em-input em-mono" type="number" inputMode="numeric" value={form.purchase_rate} onChange={set("purchase_rate")} placeholder="30990" />
              </Field>
              <Field label="Remark">
                <input className="em-input" value={form.remark} onChange={set("remark")} placeholder="Distribution" />
              </Field>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, cursor: "pointer", color: "#fff" }}>
              <input type="checkbox" checked={form.active !== false} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} style={{ width: 16, height: 16 }} />
              <span className="em-label" style={{ textTransform: "none", letterSpacing: "0.03em", color: "rgba(255,255,255,0.7)" }}>Active (uncheck to hide a discontinued model)</span>
            </label>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button type="submit" className="em-btn em-btn--gold em-btn--sm" disabled={busy}>{busy ? "SAVING…" : "SAVE"}</button>
              <button type="button" onClick={cancel} className="em-tab" style={{ background: "none", border: 0, color: "rgba(255,255,255,0.6)", cursor: "pointer" }}>CANCEL</button>
            </div>
          </form>
        ) : null}

        {loading ? (
          <div className="em-eyebrow em-eyebrow--ondark" style={{ padding: 28 }}>LOADING…</div>
        ) : groups.length === 0 ? (
          <div className="em-card em-card--dark" style={{ padding: 18, marginTop: 14 }}>
            <span className="em-eyebrow em-eyebrow--ondark">{query ? "NO MATCHES" : "NO PRODUCTS YET"}</span>
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.category} className="em-card em-card--dark" style={{ padding: 18, marginTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span className="em-eyebrow em-eyebrow--ondark">{g.category}</span>
                <span className="em-eyebrow em-eyebrow--ondark">{g.count} models</span>
              </div>

              {/* column header */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px 92px", gap: 10, marginTop: 12, paddingBottom: 6 }}>
                <span className="em-eyebrow em-eyebrow--ondark">MODEL</span>
                <span className="em-eyebrow em-eyebrow--ondark" style={{ textAlign: "right" }}>PURCHASE</span>
                <span className="em-eyebrow em-eyebrow--ondark" style={{ textAlign: "right" }}>EXW AEROS</span>
                <span />
              </div>

              {g.items.map((r) => (
                <div
                  key={r.id}
                  style={{
                    display: "grid", gridTemplateColumns: "1fr 110px 110px 92px", gap: 10, alignItems: "center",
                    padding: "9px 0", borderTop: "1px solid rgba(255,255,255,0.06)",
                    opacity: r.active === false ? 0.45 : 1,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>
                      {r.model_name}{r.active === false ? " · inactive" : ""}
                    </div>
                    <div className="em-eyebrow em-eyebrow--ondark" style={{ textTransform: "none", letterSpacing: "0.03em" }}>
                      {[r.sub_category, r.remark].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  <span className="em-mono" style={{ color: "#fff", fontSize: 13, textAlign: "right", whiteSpace: "nowrap" }}>{inr(r.purchase_rate)}</span>
                  <span className="em-mono" style={{ color: "var(--em-gold)", fontSize: 13, fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>{inr(exwAeros(r.purchase_rate))}</span>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button onClick={() => openEdit(r)} className="em-tab" style={{ background: "none", border: 0, color: "rgba(255,255,255,0.85)", cursor: "pointer", padding: 0, fontSize: 11 }}>EDIT</button>
                    <button onClick={() => remove(r)} disabled={busy} className="em-tab" style={{ background: "none", border: 0, color: "rgba(255,255,255,0.5)", cursor: "pointer", padding: 0, fontSize: 11 }}>DEL</button>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
