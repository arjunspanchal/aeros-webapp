"use client";
// Structured editor for a rate-card line item.
//
// Flow:
//   1. Admin picks an SKU from the Aeros Products Master (catalog base). Pick
//      auto-fills product name / material / carton / case pack / cup spec.
//   2. Admin overlays brand + print (plain/printed) per item.
//   3. Pricing mode chooses between:
//        • cup_formula — live rate from computeCupRateCurve() against
//          current paper rates (prices auto-update on RM change).
//        • fixed       — admin types per-tier rates manually.

import { useEffect, useMemo, useState } from "react";
import { Field, inputCls } from "@/app/calculator/_components/ui";
import { SIZE_OPTS, CUP_QTY_TIERS } from "@/lib/calc/cup-calculator";

const WALL_TYPES = ["Single Wall", "Double Wall", "Ripple"];
const COATING_OPTS = ["None", "PE", "2PE", "PLA", "Aqueous"];
const COVERAGE_OPTS = [10, 30, 100];

const EMPTY_CUP_SPEC = {
  wallType: "Double Wall",
  size: "8oz",
  casePack: "",
  inner: { gsm: "", coating: "PE", print: false, colours: "", coverage: 30 },
  outer: { gsm: "", coating: "PE", print: false, colours: "", coverage: 30 },
};

function mergeCupSpec(spec) {
  if (!spec) return { ...EMPTY_CUP_SPEC };
  return {
    ...EMPTY_CUP_SPEC,
    ...spec,
    inner: { ...EMPTY_CUP_SPEC.inner, ...(spec.inner || {}) },
    outer: { ...EMPTY_CUP_SPEC.outer, ...(spec.outer || {}) },
  };
}

function normaliseTiers(raw) {
  // Accept either `[30000, 50000]` or `[{qty, rate}, ...]`.
  if (!Array.isArray(raw)) return [];
  return raw.map((t) => (typeof t === "number" ? { qty: t, rate: "" } : { qty: Number(t.qty) || 0, rate: t.rate ?? "" }));
}

export default function ItemForm({ initial, submitLabel, onSubmit, onCancel }) {
  const [products, setProducts] = useState(null); // null = loading
  const [productQuery, setProductQuery] = useState("");
  // Source mode: "master" pulls from the Aeros catalogue (default — almost
  // all rate-card items are catalogued SKUs); "custom" lets admin type a
  // one-off item that isn't in the master (e.g. a bespoke variant the
  // customer asked for that we're trial-quoting before committing to the
  // master). On open, we pick the mode from existing data: rows with a
  // productId came from the master; rows without are custom.
  const [source, setSource] = useState(initial.productId ? "master" : (initial.productName ? "custom" : "master"));
  const [f, setF] = useState({
    section: initial.section || "",
    sortOrder: initial.sortOrder || 0,
    productId: initial.productId || "",
    productSku: initial.productSku || "",
    productName: initial.productName || "",
    brand: initial.brand || "",
    printing: initial.printing || "",
    material: initial.material || "",
    dimension: initial.dimension || "",
    cartonSize: initial.cartonSize || "",
    casePack: initial.casePack || "",
    moq: initial.moq || "",
    pricingMode: initial.pricingMode || "fixed",
    cupSpec: mergeCupSpec(initial.cupSpec),
    notes: initial.notes || "",
  });

  // Switching source clears product-link metadata so a master pick can't
  // leak into a custom row's saved payload (and vice versa). We DON'T clear
  // the spec fields — admin may have already typed a name/material/dim.
  function switchSource(next) {
    if (next === source) return;
    setSource(next);
    setF((d) => ({ ...d, productId: "", productSku: "" }));
  }

  useEffect(() => {
    fetch("/api/rate-cards/products")
      .then((r) => r.ok ? r.json() : [])
      .then((list) => setProducts(Array.isArray(list) ? list : []))
      .catch(() => setProducts([]));
  }, []);

  const filteredProducts = useMemo(() => {
    const list = products || [];
    const q = productQuery.trim().toLowerCase();
    if (!q) return list.slice(0, 200);
    return list
      .filter((p) => `${p.productName} ${p.sku} ${p.category} ${p.sizeVolume} ${p.material}`.toLowerCase().includes(q))
      .slice(0, 200);
  }, [products, productQuery]);

  function onPickProduct(id) {
    const p = (products || []).find((x) => x.id === id);
    if (!p) {
      setF((d) => ({ ...d, productId: "", productSku: "" }));
      return;
    }
    setF((d) => {
      // Auto-fill display fields and cup spec from the master, but only when
      // those fields are still empty — don't clobber an admin-entered override.
      const wallType = ["Single Wall", "Double Wall", "Ripple"].includes(p.wallType) ? p.wallType : d.cupSpec.wallType;
      const size = SIZE_OPTS.includes(p.sizeVolume) ? p.sizeVolume : d.cupSpec.size;
      return {
        ...d,
        productId: p.id,
        productSku: p.sku || "",
        productName: d.productName || p.productName || "",
        material: d.material || p.material || "",
        cartonSize: d.cartonSize || p.cartonDimensions || "",
        casePack: d.casePack || (p.unitsPerCase != null ? String(p.unitsPerCase) : ""),
        cupSpec: {
          ...d.cupSpec,
          wallType,
          size,
          inner: {
            ...d.cupSpec.inner,
            gsm: d.cupSpec.inner.gsm || (p.gsm != null ? String(p.gsm) : ""),
            coating: d.cupSpec.inner.coating || p.coating || "None",
          },
        },
      };
    });
  }
  const [tiers, setTiers] = useState(() => {
    const base = initial.pricingMode === "fixed"
      ? (initial.fixedRates?.length ? initial.fixedRates : normaliseTiers(initial.tierQtys))
      : normaliseTiers(initial.tierQtys?.length ? initial.tierQtys : CUP_QTY_TIERS);
    return base.length ? base : [{ qty: 30000, rate: "" }];
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const set = (k, v) => setF((d) => ({ ...d, [k]: v }));
  const setCup = (path, v) => setF((d) => {
    const next = { ...d, cupSpec: { ...d.cupSpec, inner: { ...d.cupSpec.inner }, outer: { ...d.cupSpec.outer } } };
    if (path[0] === "inner" || path[0] === "outer") next.cupSpec[path[0]][path[1]] = v;
    else next.cupSpec[path[0]] = v;
    return next;
  });

  function setTierQty(idx, qty) {
    setTiers((t) => t.map((row, i) => i === idx ? { ...row, qty: Number(qty) || 0 } : row));
  }
  function setTierRate(idx, rate) {
    setTiers((t) => t.map((row, i) => i === idx ? { ...row, rate } : row));
  }
  function addTier() { setTiers((t) => [...t, { qty: 0, rate: "" }]); }
  function removeTier(idx) { setTiers((t) => t.filter((_, i) => i !== idx)); }

  async function submit(e) {
    e.preventDefault();
    setErr("");
    // productId required only when sourcing from the master. Custom items
    // skip the master link and store productId/SKU as empty strings so the
    // viewer / pricing layers know there's no upstream catalog row.
    if (source === "master" && !f.productId) { setErr("Pick a product from the Aeros master catalogue."); return; }
    if (!f.productName) { setErr("Product name is required."); return; }

    const validTiers = tiers.filter((t) => Number(t.qty) > 0);
    if (validTiers.length === 0) { setErr("Add at least one quantity tier."); return; }

    const payload = {
      section: f.section,
      sortOrder: Number(f.sortOrder) || 0,
      productId: f.productId,
      productSku: f.productSku,
      productName: f.productName,
      brand: f.brand,
      printing: f.printing,
      material: f.material,
      dimension: f.dimension,
      cartonSize: f.cartonSize,
      casePack: f.casePack ? Number(f.casePack) : null,
      moq: f.moq,
      pricingMode: f.pricingMode,
      tierQtys: validTiers.map((t) => Number(t.qty)),
      notes: f.notes,
    };

    if (f.pricingMode === "cup_formula") {
      payload.cupSpec = f.cupSpec;
      payload.fixedRates = [];
    } else {
      payload.cupSpec = null;
      payload.fixedRates = validTiers.map((t) => ({ qty: Number(t.qty), rate: Number(t.rate) || 0 }));
    }

    setSaving(true);
    const ok = await onSubmit(payload);
    setSaving(false);
    if (ok === false) return;
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* 1 — Source: master picker vs custom one-off. Default is master so
          the common path (catalogued SKU) stays one-click. Custom mode
          unlocks free-text name/SKU/spec for items not yet in the
          Aeros Products Master. */}
      <div className="border border-gray-200 rounded-lg p-3 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Item source
          </div>
          <div className="inline-flex rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => switchSource("master")}
              className={`px-3 py-1.5 transition-colors ${source === "master"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"}`}
            >
              From Aeros master
            </button>
            <button
              type="button"
              onClick={() => switchSource("custom")}
              className={`px-3 py-1.5 transition-colors border-l border-gray-200 dark:border-gray-700 ${source === "custom"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"}`}
            >
              Custom (not in master)
            </button>
          </div>
        </div>

        {source === "master" ? (
          <>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] text-gray-400 dark:text-gray-500">
                Product from Aeros master <span className="text-red-500">*</span>
              </div>
              <div className="text-[11px] text-gray-400 dark:text-gray-500">
                {products === null ? "Loading catalogue…" : `${products.length} products`}
              </div>
            </div>
            <input
              className={`${inputCls} mb-2`}
              placeholder="Search by name / SKU / size / material…"
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
            />
            <select
              required
              className={inputCls}
              value={f.productId}
              onChange={(e) => onPickProduct(e.target.value)}
            >
              <option value="">— Select a master product —</option>
              {filteredProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.productName}{p.sku ? ` (${p.sku})` : ""}{p.sizeVolume ? ` · ${p.sizeVolume}` : ""}
                </option>
              ))}
            </select>
            {products !== null && products.length === 0 && (
              <p className="mt-2 text-xs text-red-500">
                No master products loaded. Check <code>CATALOG_BASE_ID</code> / <code>CATALOG_TABLE_ID</code> env vars.
              </p>
            )}
            {f.productSku && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                SKU: <strong>{f.productSku}</strong> — master spec auto-filled below. Edit only to override for this card.
              </p>
            )}
          </>
        ) : (
          <div className="space-y-2">
            <div className="rounded-md bg-amber-50/80 border border-amber-200 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-200">
              Custom item — fill the spec fields below by hand. Leave Custom SKU
              blank if there isn&apos;t one yet; the row stays unlinked from the
              Aeros Products Master.
            </div>
            <Field label="Custom SKU" hint="Optional internal code for this one-off (free text)">
              <input
                className={inputCls}
                value={f.productSku}
                onChange={(e) => set("productSku", e.target.value)}
                placeholder="e.g. CUSTOM-PCKG-001"
              />
            </Field>
          </div>
        )}
      </div>

      {/* 2 — Brand / print overlay */}
      <div className="border border-gray-200 rounded-lg p-3 dark:border-gray-700">
        <div className="text-xs font-medium text-gray-500 mb-2 dark:text-gray-400">
          Brand / print overlay
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Brand" hint="Defaults to card brand if blank">
            <input className={inputCls} value={f.brand} onChange={(e) => set("brand", e.target.value)} placeholder="Salt City Coffee" />
          </Field>
          <Field label="Print">
            <select className={inputCls} value={f.printing} onChange={(e) => set("printing", e.target.value)}>
              <option value="">—</option>
              <option value="Plain">Plain</option>
              <option value="Printed">Printed</option>
            </select>
          </Field>
          <Field label="MOQ" hint="e.g. 30k, 50k">
            <input className={inputCls} value={f.moq} onChange={(e) => set("moq", e.target.value)} placeholder="30k" />
          </Field>
        </div>
      </div>

      {/* 3 — Display fields (pre-filled from master, editable) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field
          label="Product name *"
          hint={source === "master"
            ? "Pre-filled from master; edit to customise display"
            : "Type the custom item's display name"}
        >
          <input required className={inputCls} value={f.productName} onChange={(e) => set("productName", e.target.value)} />
        </Field>
        <Field label="Section" hint="Group header, e.g. Paper Hot Cups — Printed">
          <input className={inputCls} value={f.section} onChange={(e) => set("section", e.target.value)} />
        </Field>
        <Field label="Material">
          <input className={inputCls} value={f.material} onChange={(e) => set("material", e.target.value)} placeholder="260 gsm Aqua + 240 gsm (DW)" />
        </Field>
        <Field label="Dimension (mm)">
          <input className={inputCls} value={f.dimension} onChange={(e) => set("dimension", e.target.value)} placeholder="90 TD x 60 BD x 85 H" />
        </Field>
        <Field label="Carton size (mm)">
          <input className={inputCls} value={f.cartonSize} onChange={(e) => set("cartonSize", e.target.value)} placeholder="460 x 370 x 500" />
        </Field>
        <Field label="Case pack (pcs)">
          <input type="number" className={inputCls} value={f.casePack} onChange={(e) => set("casePack", e.target.value)} placeholder="500" />
        </Field>
        <Field label="Sort order" hint="Lower shows first in the card">
          <input type="number" className={inputCls} value={f.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} />
        </Field>
      </div>

      {/* Pricing mode */}
      <div>
        <div className="text-xs font-medium text-gray-500 mb-2 dark:text-gray-400">Pricing mode</div>
        <div className="flex gap-2">
          <ModeBtn active={f.pricingMode === "fixed"} onClick={() => set("pricingMode", "fixed")}>
            Fixed rates
            <span className="block text-xs font-normal opacity-80">Admin-entered per tier. Used for PET, lids, anything without a paper RM index.</span>
          </ModeBtn>
          <ModeBtn active={f.pricingMode === "cup_formula"} onClick={() => set("pricingMode", "cup_formula")}>
            Cup formula (live)
            <span className="block text-xs font-normal opacity-80">Paper cup spec → rate curve. Recomputes when paper rates change.</span>
          </ModeBtn>
        </div>
      </div>

      {/* Cup spec */}
      {f.pricingMode === "cup_formula" && (
        <div className="border border-gray-200 rounded-lg p-3 dark:border-gray-700">
          <div className="text-xs font-medium text-gray-500 mb-2 dark:text-gray-400">Cup specification</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Wall type">
              <select className={inputCls} value={f.cupSpec.wallType} onChange={(e) => setCup(["wallType"], e.target.value)}>
                {WALL_TYPES.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
            </Field>
            <Field label="Size">
              <select className={inputCls} value={f.cupSpec.size} onChange={(e) => setCup(["size"], e.target.value)}>
                {SIZE_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Case pack override" hint="Blank = use default for size/wall">
              <input type="number" className={inputCls} value={f.cupSpec.casePack} onChange={(e) => setCup(["casePack"], e.target.value)} />
            </Field>
          </div>

          <PaperBlock
            label="Inner (sidewall)"
            paper={f.cupSpec.inner}
            onChange={(k, v) => setCup(["inner", k], v)}
          />
          {(f.cupSpec.wallType === "Double Wall" || f.cupSpec.wallType === "Ripple") && (
            <PaperBlock
              label="Outer fan"
              paper={f.cupSpec.outer}
              onChange={(k, v) => setCup(["outer", k], v)}
            />
          )}

          <p className="text-xs text-gray-400 mt-2 dark:text-gray-500">
            Paper rates and conversion costs come from <code>lib/calc/cup-calculator.js</code> (<code>CUSTOMER_DEFAULTS</code>). Update those to shift all rate cards at once.
          </p>
        </div>
      )}

      {/* Tiers */}
      <div className="border border-gray-200 rounded-lg p-3 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
            {f.pricingMode === "fixed" ? "Quantity tiers + rates" : "Quantity tiers (rates computed live)"}
          </div>
          <button type="button" onClick={addTier} className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400">+ Add tier</button>
        </div>
        <div className="space-y-2">
          {tiers.map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="number" className={`${inputCls} w-40`} placeholder="Qty (e.g. 30000)"
                value={t.qty || ""} onChange={(e) => setTierQty(i, e.target.value)} />
              {f.pricingMode === "fixed" && (
                <>
                  <span className="text-xs text-gray-400 dark:text-gray-500">@</span>
                  <input type="number" step="0.01" className={`${inputCls} w-32`} placeholder="Rate (₹)"
                    value={t.rate ?? ""} onChange={(e) => setTierRate(i, e.target.value)} />
                </>
              )}
              <button type="button" onClick={() => removeTier(i)} className="text-xs text-red-500 hover:text-red-600 px-2">✕</button>
            </div>
          ))}
        </div>
      </div>

      <Field label="Notes">
        <textarea rows={2} className={inputCls} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
      </Field>

      <div className="flex items-center gap-3">
        <button disabled={saving} className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60">
          {saving ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            Cancel
          </button>
        )}
        {err && <p className="text-xs text-red-500">{err}</p>}
      </div>
    </form>
  );
}

function ModeBtn({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex-1 text-left text-sm font-medium px-3 py-2 rounded-lg border transition-colors ${
        active
          ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-400"
          : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
      }`}>
      {children}
    </button>
  );
}

function PaperBlock({ label, paper, onChange }) {
  return (
    <div className="mt-3">
      <div className="text-xs text-gray-500 mb-2 dark:text-gray-400">{label}</div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Field label="GSM">
          <input type="number" className={inputCls} value={paper.gsm || ""} onChange={(e) => onChange("gsm", e.target.value)} placeholder="280" />
        </Field>
        <Field label="Coating">
          <select className={inputCls} value={paper.coating || "None"} onChange={(e) => onChange("coating", e.target.value)}>
            {["None", "PE", "2PE", "PLA", "Aqueous"].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Printed">
          <select className={inputCls} value={paper.print ? "yes" : "no"} onChange={(e) => onChange("print", e.target.value === "yes")}>
            <option value="no">Plain</option>
            <option value="yes">Printed (Flexo)</option>
          </select>
        </Field>
        <Field label="Colours">
          <input type="number" disabled={!paper.print} className={inputCls} value={paper.colours || ""} onChange={(e) => onChange("colours", e.target.value)} />
        </Field>
        <Field label="Coverage %">
          <select disabled={!paper.print} className={inputCls} value={paper.coverage || 30} onChange={(e) => onChange("coverage", Number(e.target.value))}>
            {[10, 30, 100].map((c) => <option key={c} value={c}>{c}%</option>)}
          </select>
        </Field>
      </div>
    </div>
  );
}
