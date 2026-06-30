"use client";
import { useEffect, useMemo, useState } from "react";
import { Card, Field, Toggle, PillBtn, Row, SectionHeader, inputCls } from "@/app/calculator/_components/ui";
import { exportQuoteCSV, exportQuotePDF, exportAdminQuotePDF } from "@/app/calculator/_components/export";
import {
  calculate, computeRateCurve, optimizationTips,
  WET_STRENGTH_EXTRA,
  PRINTING_RATES, PLATE_COST_PER_COLOUR, USD_RATE,
  getDefaultWastage,
  QTY_TIERS, HANDLE_DEFAULT_COST, isHandleBag,
} from "@/lib/calc/calculator";
import {
  deriveTypes, deriveSuppliers, supplierHasGsm, deriveGsms, deriveBfs,
  deriveMatches, findPaper,
} from "@/app/calculator/_components/paperCatalog";

// Friendly labels for the RM `type` values; anything else shows the raw type.
const TYPE_LABEL = { "Brown Kraft": "Brown Kraft (MF)", "MG": "Brown Kraft (MG)" };
// Legacy bag-code mill names → the supplier strings stored in master_papers.
const SUPPLIER_ALIAS = { Jodhani: "Jodhani Mill" };
const round2 = (v) => Math.round(v * 100) / 100;

const COLOUR_OPTIONS = [1, 2, 3, 4];
const MM_PER_UNIT = { mm: 1, cm: 10, in: 25.4 };
const toDisplay = (mm, unit) => {
  if (!mm) return 0;
  if (unit === "mm") return mm;
  return +(mm / MM_PER_UNIT[unit]).toFixed(unit === "cm" ? 1 : 2);
};
const fromDisplay = (v, unit) => {
  const n = parseFloat(v) || 0;
  if (unit === "mm") return Math.round(n);
  return Math.round(n * MM_PER_UNIT[unit]);
};
const unitLabel = { mm: "mm", cm: "cm", in: "in" };

const DEFAULT_FORM = {
  bagType: "sos", selectedCodeId: "",
  width: 230, gusset: 125, height: 335,
  paperType: "", millName: "",
  gsm: 120, bf: "",
  paperId: "", materialName: "",
  wetStrength: false,
  tptRate: "", basePaperRate: 92, paperRate: 92,
  casePack: 100, handleCost: 0.85, customWastage: "", profitPercent: 10,
  innerPack: 100, innerPolyRate: 2.0,
  printing: false, colours: 1, coverage: 30, orderQty: 15000,
  quoteRef: "",
};

export default function AdminCalculator() {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [bagCodes, setBagCodes] = useState([]);
  const [saveStatus, setSaveStatus] = useState(null);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [unit, setUnit] = useState("mm");
  const [pastQuotes, setPastQuotes] = useState([]);
  const [loadedQuoteId, setLoadedQuoteId] = useState("");
  const [papers, setPapers] = useState([]);
  const [papersError, setPapersError] = useState(false);

  function loadPapers() {
    setPapersError(false);
    fetch("/api/calc/papers")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setPapers(d.papers || []))
      .catch(() => setPapersError(true));
  }

  async function refreshQuotes(autoLoadId) {
    try {
      const res = await fetch("/api/calc/quotes");
      if (res.ok) {
        const list = await res.json();
        setPastQuotes(list);
        if (autoLoadId && list.some((x) => x.id === autoLoadId)) {
          setTimeout(() => loadQuoteFromList(autoLoadId, list), 0);
        }
      }
    } catch {}
  }

  function loadQuoteFromList(id, list) {
    const q = list.find((x) => x.id === id);
    if (!q) return;
    setLoadedQuoteId(id);
    setForm((f) => ({
      ...f,
      selectedCodeId: "",
      bagType: bagTypeFromLabel(q.bagType),
      width: q.width || f.width, gusset: q.gusset || f.gusset, height: q.height || f.height,
      paperType: q.paperType || f.paperType,
      millName: q.mill || f.millName,
      paperId: q.paperId || "",
      materialName: q.materialName || "",
      gsm: q.gsm || f.gsm,
      bf: q.bf ? String(q.bf) : f.bf,
      casePack: q.casePack || f.casePack,
      printing: q.plainPrinted === "Printed",
      colours: q.colours || f.colours,
      coverage: q.coveragePct || f.coverage,
      orderQty: q.orderQty || f.orderQty,
      paperRate: q.paperRate || f.paperRate,
      basePaperRate: q.paperRate || f.basePaperRate,
      profitPercent: q.profitPct || f.profitPercent,
      customWastage: q.wastagePct != null ? String(q.wastagePct) : "",
      handleCost: q.handleCost || f.handleCost,
      quoteRef: q.quoteRef || "",
    }));
    setSaveStatus(null);
  }

  useEffect(() => {
    fetch("/api/calc/bag-specs").then((r) => r.ok ? r.json() : []).then(setBagCodes).catch(() => {});
    loadPapers();
    const saved = typeof window !== "undefined" ? localStorage.getItem("aeros_dim_unit") : null;
    if (saved === "in" || saved === "cm" || saved === "mm") setUnit(saved);
    const urlQuoteId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("quote") : null;
    refreshQuotes(urlQuoteId);
  }, []);

  const bagTypeFromLabel = (label) => ({
    "SOS": "sos", "Rope Handle": "rope_handle", "Flat Handle": "flat_handle",
    "V-Bottom": "v_bottom_gusset", "Handle": "rope_handle",
  })[label] || "sos";

  function loadQuote(id) {
    setLoadedQuoteId(id);
    if (!id) return;
    const q = pastQuotes.find((x) => x.id === id);
    if (!q) return;
    setForm((f) => ({
      ...f,
      selectedCodeId: "",
      bagType: bagTypeFromLabel(q.bagType),
      width: q.width || f.width, gusset: q.gusset || f.gusset, height: q.height || f.height,
      paperType: q.paperType || f.paperType,
      millName: q.mill || f.millName,
      paperId: q.paperId || "",
      materialName: q.materialName || "",
      gsm: q.gsm || f.gsm,
      bf: q.bf ? String(q.bf) : f.bf,
      casePack: q.casePack || f.casePack,
      printing: q.plainPrinted === "Printed",
      colours: q.colours || f.colours,
      coverage: q.coveragePct || f.coverage,
      orderQty: q.orderQty || f.orderQty,
      paperRate: q.paperRate || f.paperRate,
      basePaperRate: q.paperRate || f.basePaperRate,
      profitPercent: q.profitPct || f.profitPercent,
      customWastage: q.wastagePct != null ? String(q.wastagePct) : "",
      handleCost: q.handleCost || f.handleCost,
      quoteRef: q.quoteRef || "",
    }));
    setSaveStatus(null);
  }

  function updateUnit(u) {
    setUnit(u);
    if (typeof window !== "undefined") localStorage.setItem("aeros_dim_unit", u);
  }

  const setDim = (k, v) => setForm((f) => ({ ...f, [k]: fromDisplay(v, unit), selectedCodeId: "" }));
  const showDim = (mm) => toDisplay(mm, unit);

  // ---- RM paper cascade: Type → Supplier → GSM → BF → (Grade on collision) ----
  const paperTypes = useMemo(() => deriveTypes(papers), [papers]);
  const suppliers = useMemo(() => deriveSuppliers(papers, form.paperType), [papers, form.paperType]);
  const hasGsm = useMemo(() => supplierHasGsm(papers, form.paperType, form.millName), [papers, form.paperType, form.millName]);
  const gsms = useMemo(() => deriveGsms(papers, form.paperType, form.millName), [papers, form.paperType, form.millName]);
  const bfs = useMemo(() => deriveBfs(papers, form.paperType, form.millName, form.gsm), [papers, form.paperType, form.millName, form.gsm]);
  const matches = useMemo(() => {
    if (!form.paperType || !form.millName) return [];
    // Flat (null-gsm) suppliers price one row regardless of GSM — don't filter on
    // gsm/bf or the row drops out; the user still types a GSM for the weight calc.
    return hasGsm
      ? deriveMatches(papers, { type: form.paperType, supplier: form.millName, gsm: form.gsm, bf: form.bf })
      : deriveMatches(papers, { type: form.paperType, supplier: form.millName });
  }, [papers, form.paperType, form.millName, form.gsm, form.bf, hasGsm]);
  const showGrade = matches.length > 1;
  const selectedRow = useMemo(() => {
    if (form.paperId) return findPaper(papers, form.paperId);
    return matches.length === 1 ? matches[0] : null;
  }, [papers, form.paperId, matches]);

  // Sync the resolved row into the form (rate, ids, and gsm/bf when the row pins
  // them). Guarded so it runs once per row and never clobbers admin rate edits.
  useEffect(() => {
    if (!selectedRow) return;
    setForm((f) => {
      if (f.paperId === selectedRow.id && f.materialName === selectedRow.materialName) return f;
      const base = Number(selectedRow.effectiveRate) || 0;
      const tpt = parseFloat(f.tptRate) || 0;
      const wet = f.wetStrength ? WET_STRENGTH_EXTRA : 0;
      return {
        ...f,
        paperId: selectedRow.id,
        materialName: selectedRow.materialName,
        basePaperRate: base,
        paperRate: round2(base + tpt + wet),
        ...(selectedRow.gsm != null ? { gsm: Number(selectedRow.gsm) } : {}),
        ...(selectedRow.bf != null ? { bf: String(selectedRow.bf) } : {}),
      };
    });
  }, [selectedRow]);

  // Live result — calculated client-side for responsiveness; server will re-verify when saving.
  const result = useMemo(() => {
    try { return calculate(form); } catch { return null; }
  }, [form]);

  const curve = useMemo(() => {
    try { return computeRateCurve(form); } catch { return []; }
  }, [form]);

  const tips = useMemo(() => {
    if (!result) return [];
    return optimizationTips(form, result);
  }, [form, result]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const num = (k, v) => set(k, parseFloat(v) || 0);

  // Cascade selectors — each change clears the resolved row so it re-resolves
  // (or surfaces the grade picker on a collision).
  const chooseType = (t) => setForm((f) => ({ ...f, paperType: t, millName: "", bf: "", paperId: "", materialName: "", selectedCodeId: "" }));
  const chooseSupplier = (s) => setForm((f) => ({ ...f, millName: s, bf: "", paperId: "", materialName: "", tptRate: s && s !== "Om Shivaay" ? "5" : "", selectedCodeId: "" }));
  const chooseGsm = (g) => setForm((f) => ({ ...f, gsm: Number(g) || f.gsm, bf: "", paperId: "", materialName: "", selectedCodeId: "" }));
  const chooseBf = (b) => setForm((f) => ({ ...f, bf: b, paperId: "", materialName: "", selectedCodeId: "" }));
  const chooseGrade = (id) => setForm((f) => ({ ...f, paperId: id, materialName: "", selectedCodeId: "" }));

  function selectBagCode(id) {
    const c = bagCodes.find((x) => x.id === id);
    if (!c) { set("selectedCodeId", ""); return; }
    const supplier = c.millName ? (SUPPLIER_ALIAS[c.millName] || c.millName) : "";
    setForm((f) => {
      const next = { ...f, selectedCodeId: id, width: c.width, gusset: c.gusset, height: c.height };
      if (c.bagType) {
        next.bagType = c.bagType;
        if (HANDLE_DEFAULT_COST[c.bagType] !== undefined) next.handleCost = HANDLE_DEFAULT_COST[c.bagType];
      }
      if (c.casePack) next.casePack = c.casePack;
      if (c.paperType) next.paperType = c.paperType;
      next.millName = supplier;
      if (c.gsm) next.gsm = c.gsm;
      next.bf = c.bf ? String(c.bf) : "";
      if (c.lockedWastage) next.customWastage = String(c.lockedWastage);
      next.printing = !!c.printing;
      if (c.colours) next.colours = c.colours;
      if (c.coverage) next.coverage = c.coverage;
      next.wetStrength = false;
      next.tptRate = supplier && supplier !== "Om Shivaay" ? "5" : "";
      // Let the resolution effect pick the row (or the grade picker prompt).
      next.paperId = ""; next.materialName = "";
      return next;
    });
  }

  function setManualPaperRate(v) {
    const base = parseFloat(v) || 0;
    setForm((f) => {
      const tpt = parseFloat(f.tptRate) || 0;
      const wet = f.wetStrength ? WET_STRENGTH_EXTRA : 0;
      return { ...f, basePaperRate: base, paperRate: round2(base + tpt + wet) };
    });
  }

  function setTpt(v) {
    setForm((f) => {
      const tpt = parseFloat(v) || 0;
      const wet = f.wetStrength ? WET_STRENGTH_EXTRA : 0;
      return { ...f, tptRate: v, paperRate: round2(f.basePaperRate + tpt + wet) };
    });
  }

  function toggleWet() {
    setForm((f) => {
      const wet = !f.wetStrength ? WET_STRENGTH_EXTRA : 0;
      const tpt = parseFloat(f.tptRate) || 0;
      return { ...f, wetStrength: !f.wetStrength, paperRate: round2(f.basePaperRate + tpt + wet) };
    });
  }

  async function saveQuote({ asNew }) {
    if (!result) return;
    setSaving(true); setSaveStatus(null);
    const selected = bagCodes.find((c) => c.id === form.selectedCodeId);
    const payload = {
      quoteRef: form.quoteRef || `Q ${new Date().toISOString().split("T")[0]}`,
      bagType: form.bagType,
      bagCodeId: form.selectedCodeId || undefined,
      brand: selected?.brand,
      item: selected?.item,
      paperType: form.paperType, mill: form.millName,
      paperId: form.paperId || undefined, materialName: form.materialName || undefined,
      gsm: form.gsm, bf: form.bf,
      width: form.width, gusset: form.gusset, height: form.height,
      paperRate: form.paperRate, casePack: form.casePack,
      orderQty: form.orderQty,
      wastagePct: result.wastage, profitPct: result.profitPct,
      mfgCost: result.totalMfg, sellingPrice: result.sellingPrice,
      costPerCase: result.sellingPrice * form.casePack,
      orderTotal: result.sellingPrice * form.orderQty,
      printing: form.printing, colours: form.colours, coverage: form.coverage,
      handleCost: isHandleBag(form.bagType) ? form.handleCost : undefined,
    };
    const method = loadedQuoteId && !asNew ? "PATCH" : "POST";
    if (method === "PATCH") payload.id = loadedQuoteId;
    const res = await fetch("/api/calc/quotes", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (res.ok) {
      setSaveStatus(asNew ? "success_new" : loadedQuoteId ? "success_update" : "success");
      const saved = await res.json().catch(() => null);
      if (method === "POST" && saved?.id) setLoadedQuoteId(saved.id);
      refreshQuotes();
    } else {
      const errBody = await res.text().catch(() => "");
      console.error("Save quote failed", res.status, errBody);
      setSaveStatus("error");
      setSaveError(`${res.status}: ${errBody.slice(0, 200) || res.statusText}`);
    }
  }

  const plateCostPerBag = form.printing && form.orderQty > 0
    ? Math.round((result.plateCost / form.orderQty) * 10000) / 10000 : 0;

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="lg:w-2/5 space-y-4">
        {pastQuotes.length > 0 && (
          <Card title="Load a past quote" right={loadedQuoteId && (
            <button onClick={() => loadQuote("")} className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">Clear</button>
          )}>
            <select className={inputCls} value={loadedQuoteId} onChange={(e) => loadQuote(e.target.value)}>
              <option value="">— New quote —</option>
              {pastQuotes.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.quoteRef}{q.brand ? ` — ${q.brand}` : ""}{q.clientEmail ? ` · ${q.clientEmail}` : ""}{q.date ? ` · ${q.date}` : ""}
                </option>
              ))}
            </select>
            {loadedQuoteId && (
              <p className="text-xs text-gray-500 mt-2 dark:text-gray-400">
                Editing <strong>{pastQuotes.find((q) => q.id === loadedQuoteId)?.quoteRef}</strong>. After recalculating you can update it or save as a new quote.
              </p>
            )}
          </Card>
        )}

        <Card title="Bag Type">
          <div className="flex gap-2">
            {[["sos", "SOS"], ["rope_handle", "Rope Handle"], ["flat_handle", "Flat Handle"], ["v_bottom_gusset", "V-Bottom"]].map(([val, lbl]) => (
              <PillBtn key={val} active={form.bagType === val} onClick={() => {
                set("bagType", val);
                if (val === "rope_handle") set("handleCost", HANDLE_DEFAULT_COST.rope_handle);
                if (val === "flat_handle") set("handleCost", HANDLE_DEFAULT_COST.flat_handle);
              }}>{lbl}</PillBtn>
            ))}
          </div>
        </Card>

        <Card title="Bag Code">
          <select className={inputCls} value={form.selectedCodeId} onChange={(e) => selectBagCode(e.target.value)}>
            <option value="">Select a saved bag…</option>
            {bagCodes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}{c.brand || c.item ? ` — ${[c.brand, c.item].filter(Boolean).join(" · ")}` : ""}
              </option>
            ))}
          </select>
          {form.selectedCodeId && <p className="text-xs text-gray-400 mt-1.5 dark:text-gray-500">Specs auto-applied — edit below if needed.</p>}
        </Card>

        <Card title="Paper Specifications">
          {papersError ? (
            <div className="text-sm text-red-600 dark:text-red-400">
              Couldn&apos;t load the paper catalogue.{" "}
              <button onClick={loadPapers} className="underline font-medium">Retry</button>
            </div>
          ) : papers.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">Loading papers from RM database…</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Paper Type">
                  <select className={inputCls} value={form.paperType} onChange={(e) => chooseType(e.target.value)}>
                    <option value="">Select…</option>
                    {paperTypes.map((t) => <option key={t} value={t}>{TYPE_LABEL[t] || t}</option>)}
                  </select>
                </Field>
                <Field label="Supplier">
                  <select className={inputCls} value={form.millName} disabled={!form.paperType} onChange={(e) => chooseSupplier(e.target.value)}>
                    <option value="">{form.paperType ? "Select…" : "Select paper type first"}</option>
                    {suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="GSM">
                  {hasGsm ? (
                    <select className={inputCls} value={gsms.includes(Number(form.gsm)) ? form.gsm : ""} disabled={!form.millName} onChange={(e) => chooseGsm(e.target.value)}>
                      <option value="">Select…</option>
                      {gsms.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  ) : (
                    // Flat paper — rate is GSM-agnostic; GSM is a free input for the weight calc.
                    <input type="number" className={inputCls} value={form.gsm} disabled={!form.millName} onChange={(e) => num("gsm", e.target.value)} min="1" />
                  )}
                </Field>
                {hasGsm && bfs.length > 0 && !(bfs.length === 1 && bfs[0] == null) && (
                  <Field label="BF">
                    <select className={inputCls} value={form.bf} onChange={(e) => chooseBf(e.target.value)}>
                      <option value="">Select…</option>
                      {bfs.filter((b) => b != null).map((b) => <option key={b} value={b}>{b} BF</option>)}
                    </select>
                  </Field>
                )}
              </div>

              {showGrade && (
                <div className="mt-3">
                  <Field label="Grade / Material">
                    <select className={inputCls} value={form.paperId} onChange={(e) => chooseGrade(e.target.value)}>
                      <option value="">Pick a grade…</option>
                      {matches.map((m) => (
                        <option key={m.id} value={m.id}>{m.materialName} · ₹{m.effectiveRate}/kg</option>
                      ))}
                    </select>
                  </Field>
                </div>
              )}

              {form.millName && matches.length === 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">No priced grade for this combination — pick a different GSM/BF.</p>
              )}

              {form.millName && (
                <div className="mt-4 space-y-3 border-t border-gray-100 pt-3 dark:border-gray-800">
                  <Toggle value={form.wetStrength} onChange={toggleWet} label="Wet Strength Paper" sub="+₹5/kg" />
                  <Field label="Transport (₹/kg)">
                    <input type="number" className={inputCls} value={form.tptRate} onChange={(e) => setTpt(e.target.value)} min="0" step="0.5" />
                  </Field>
                  {selectedRow && (
                    <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 dark:bg-green-900/20 dark:border-green-800">
                      <p className="text-xs text-green-700 font-medium dark:text-green-300">{selectedRow.materialName} — Effective ₹{form.paperRate}/kg</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </Card>

        <Card title={`Dimensions (${unitLabel[unit]})`} right={
          <div className="flex gap-1">
            {["mm", "cm", "in"].map((u) => (
              <button key={u} onClick={() => updateUnit(u)} className={`text-xs px-2 py-1 rounded ${unit === u ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}>{u}</button>
            ))}
          </div>
        }>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Width">
              <input type="number" step={unit === "mm" ? "1" : "0.1"} className={inputCls}
                value={showDim(form.width)} onChange={(e) => setDim("width", e.target.value)} min="0" />
            </Field>
            <Field label="Gusset">
              <input type="number" step={unit === "mm" ? "1" : "0.1"} className={inputCls}
                value={showDim(form.gusset)} onChange={(e) => setDim("gusset", e.target.value)} min="0" />
            </Field>
            <Field label="Height">
              <input type="number" step={unit === "mm" ? "1" : "0.1"} className={inputCls}
                value={showDim(form.height)} onChange={(e) => setDim("height", e.target.value)} min="0" />
            </Field>
          </div>
        </Card>

        <Card title="Paper & Cost">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Paper Rate (₹/kg base)">
              <input
                type="number"
                className={`${inputCls} ${selectedRow ? "bg-green-50 border-green-300 dark:bg-green-900/20 dark:border-green-800" : ""}`}
                value={form.basePaperRate}
                onChange={(e) => setManualPaperRate(e.target.value)}
                min="1"
                title="Auto-filled from the RM database; edit to override. Transport + wet-strength are added on top."
              />
            </Field>
            <Field label="Case Pack"><input type="number" className={inputCls} value={form.casePack} onChange={(e) => num("casePack", e.target.value)} min="1" /></Field>
            {form.bagType === "v_bottom_gusset" && (
              <>
                <Field label="Inner Poly Pack (pcs/poly)"><input type="number" className={inputCls} value={form.innerPack} onChange={(e) => num("innerPack", e.target.value)} min="1" title="V-Bottom bags ship bundled in an inner poly bag — mandatory in packing cost." /></Field>
                <Field label="Inner Poly Cost (₹/poly)"><input type="number" className={inputCls} value={form.innerPolyRate} onChange={(e) => num("innerPolyRate", e.target.value)} min="0" step="0.01" /></Field>
              </>
            )}
            {isHandleBag(form.bagType) && (
              <Field label={`Handle Cost (₹/bag) — default ${HANDLE_DEFAULT_COST[form.bagType]}`}>
                <input type="number" className={inputCls} value={form.handleCost} onChange={(e) => num("handleCost", e.target.value)} min="0" step="0.01" />
              </Field>
            )}
            <Field label="Order Quantity">
              <select className={inputCls} value={form.orderQty} onChange={(e) => set("orderQty", parseInt(e.target.value))}>
                {QTY_TIERS.map((t) => <option key={t} value={t}>{t.toLocaleString()}</option>)}
                <option value={form.orderQty}>Custom: {form.orderQty.toLocaleString()}</option>
              </select>
            </Field>
          </div>
        </Card>

        <Card title="Printing">
          <Toggle value={form.printing} onChange={() => set("printing", !form.printing)} label="Printing Required" />
          {form.printing && (
            <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
              <Field label="No. of Colours">
                <div className="flex gap-2">
                  {COLOUR_OPTIONS.map((c) => (
                    <PillBtn key={c} active={form.colours === c} onClick={() => set("colours", c)}>{c}</PillBtn>
                  ))}
                </div>
              </Field>
              <Field label="Ink Coverage">
                <div className="flex gap-2">
                  {[[10, "10%"], [30, "30%"], [100, "100%"]].map(([val, lbl]) => (
                    <PillBtn key={val} active={form.coverage === val} onClick={() => set("coverage", val)}>{lbl}</PillBtn>
                  ))}
                </div>
              </Field>
            </div>
          )}
        </Card>

        <Card title="Advanced">
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Wastage % (default ${getDefaultWastage(form.bagType)}%)`}>
              <input type="number" className={inputCls} value={form.customWastage} onChange={(e) => set("customWastage", e.target.value)} placeholder={`${getDefaultWastage(form.bagType)}`} min="0" />
            </Field>
            <Field label="Profit %">
              <input type="number" className={inputCls} value={form.profitPercent} onChange={(e) => num("profitPercent", e.target.value)} min="0" />
            </Field>
          </div>
        </Card>
      </div>

      <div className="lg:w-3/5 space-y-4">
        {!result ? null : (
          <>
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-5 text-white shadow">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-blue-200 text-xs mb-0.5">Selling Price / bag</p>
                  <p className="text-2xl font-bold">₹{result.sellingPrice.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-blue-200 text-xs mb-0.5">Cost / Case ({form.casePack})</p>
                  <p className="text-2xl font-bold">₹{(result.sellingPrice * form.casePack).toFixed(2)}</p>
                  <p className="text-blue-200 text-xs mt-0.5">${((result.sellingPrice * form.casePack) / USD_RATE).toFixed(2)} @ ₹{USD_RATE}/$</p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-blue-500">
                <p className="text-blue-200 text-xs mb-0.5">Order Total — {form.orderQty.toLocaleString()} bags</p>
                <p className="text-2xl font-bold">₹{(result.sellingPrice * form.orderQty).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </div>

            <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-5 text-white shadow flex flex-wrap gap-6">
              <div><p className="text-red-200 text-xs">Manufacturing Cost</p><p className="text-3xl font-bold">₹{result.totalMfg.toFixed(4)}</p></div>
              <div className="border-l border-red-400 pl-6"><p className="text-red-200 text-xs">Profit ({result.profitPct}%)</p><p className="text-3xl font-bold">₹{result.profit.toFixed(4)}</p></div>
            </div>

            <Card title="Rate Curve by Quantity">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase border-b border-gray-100 dark:text-gray-500 dark:border-gray-800">
                    <th className="text-left pb-2 font-medium">Qty</th>
                    <th className="text-right pb-2 font-medium">Mfg / Bag</th>
                    <th className="text-right pb-2 font-medium">Rate / Bag</th>
                    <th className="text-right pb-2 font-medium">Order Total</th>
                  </tr>
                </thead>
                <tbody>
                  {curve.map((c) => (
                    <tr key={c.qty} className={c.qty === form.orderQty ? "bg-blue-50 dark:bg-blue-900/30" : "border-b border-gray-50 dark:border-gray-800"}>
                      <td className="py-2 font-medium dark:text-gray-200">{c.qty.toLocaleString()}</td>
                      <td className="py-2 text-right dark:text-gray-200">₹{c.mfgPerBag.toFixed(4)}</td>
                      <td className="py-2 text-right dark:text-gray-200">₹{c.ratePerBag.toFixed(4)}</td>
                      <td className="py-2 text-right font-medium dark:text-gray-200">₹{c.orderTotal.toLocaleString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card title="Cost Breakdown">
              <table className="w-full">
                <tbody>
                  <SectionHeader label="Geometry" />
                  <Row label="Pasting Width" value={`${result.pw} mm`} />
                  <Row label="Roll Width" value={`${result.rw} mm`} />
                  <Row label="Height of Tube" value={`${result.th} mm`} />
                  <Row label="Paper weight per bag" value={`${(result.wkg * 1000).toFixed(2)} g`} />
                  {result.handleWeight > 0 && (
                    <Row label="Handle weight" value={`${(result.handleWeight * 1000).toFixed(0)} g`} />
                  )}
                  <Row label="Total weight per bag" value={`${(result.totalWeight * 1000).toFixed(2)} g`} highlight />
                  {result.box && (
                    <Row
                      label="Approx Box Size"
                      value={`${result.box.L} × ${result.box.W} × ${result.box.D} mm`}
                      sub={`for ${form.casePack} bags / case`}
                    />
                  )}
                  <SectionHeader label="Costs (₹ / bag)" />
                  <Row label="Paper" value={`₹${result.paperCost.toFixed(4)}`} />
                  <Row label="Glue" value={`₹${result.glueCost.toFixed(4)}`} />
                  <Row label="Case Packing" value={`₹${result.cpCost.toFixed(4)}`} />
                  {form.bagType === "v_bottom_gusset" && (
                    <Row label={`Inner Poly (₹${result.innerPolyRate}/poly ÷ ${result.innerPack})`} value={`₹${result.innerPolyCost.toFixed(4)}`} />
                  )}
                  <Row label={`Wastage (${result.wastage}%)`} value={`₹${result.wastageCost.toFixed(4)}`} />
                  <Row label={`Conversion Labour (₹${result.convRate}/kg)`} value={`₹${result.labourCost.toFixed(4)}`} />
                  {isHandleBag(form.bagType) && <Row label="Handle" value={`₹${result.handleCost.toFixed(4)}`} />}
                  {form.printing && <Row label={`Printing — ${form.coverage}% (₹${result.printRate}/kg)`} value={`₹${result.printCost.toFixed(4)}`} />}
                  <Row
                    label="Setup (amortised)"
                    value={`₹${result.setupAmortised.toFixed(4)}`}
                    sub={`₹${result.setupCost.toLocaleString()} run setup over ${form.orderQty.toLocaleString()} bags`}
                  />
                  {form.printing && result.plateCost > 0 && (
                    <Row
                      label="Plate (amortised)"
                      value={`₹${result.plateAmortised.toFixed(4)}`}
                      sub={`${form.colours} colour × ₹5,000 over ${form.orderQty.toLocaleString()} bags`}
                    />
                  )}
                  <Row label="Total Manufacturing" value={`₹${result.totalMfg.toFixed(4)}`} highlight />
                  <Row label={`Profit (${result.profitPct}%)`} value={`₹${result.profit.toFixed(4)}`} />
                  <Row label="Selling Price" value={`₹${result.sellingPrice.toFixed(4)}`} highlight />
                  {form.printing && result.plateCost > 0 && (
                    <>
                      <SectionHeader label="Plate (one-time total)" />
                      <Row label={`${form.colours} Colour${form.colours > 1 ? "s" : ""} × ₹5,000`} value={`₹${result.plateCost.toLocaleString()}`} />
                    </>
                  )}
                </tbody>
              </table>
            </Card>

            <Card title="Export">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  onClick={() => exportQuoteCSV({
                    form: { ...form, brand: bagCodes.find((c) => c.id === form.selectedCodeId)?.brand || "" },
                    result: {
                      curve,
                      result: {
                        box: result.box, wkg: result.wkg,
                        handleWeight: result.handleWeight, totalWeight: result.totalWeight,
                      },
                    },
                    currency: "INR",
                    unit,
                  })}
                  className="bg-white border border-gray-200 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700">
                  Download Excel (.csv)
                </button>
                <button
                  title="Internal review — full cost breakdown, mfg cost, margin, paper rate"
                  onClick={() => exportAdminQuotePDF({
                    form: { ...form, brand: bagCodes.find((c) => c.id === form.selectedCodeId)?.brand || "" },
                    breakdown: result,
                    curve,
                    currency: "INR",
                    unit,
                  })}
                  className="bg-white border border-gray-200 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700">
                  Admin PDF
                </button>
                <button
                  title="Customer-facing — only the rate, specs, weight, box, and rate ladder. No internal margins or cost breakdown."
                  onClick={() => exportQuotePDF({
                    form: { ...form, brand: bagCodes.find((c) => c.id === form.selectedCodeId)?.brand || "" },
                    result: {
                      curve,
                      result: {
                        box: result.box, wkg: result.wkg,
                        handleWeight: result.handleWeight, totalWeight: result.totalWeight,
                      },
                    },
                    currency: "INR",
                    unit,
                  })}
                  className="bg-blue-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-blue-700">
                  Customer PDF
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2 dark:text-gray-500">
                Use <strong>Customer PDF</strong> for what you send the customer; <strong>Admin PDF</strong> includes the full cost breakdown for internal review.
              </p>
            </Card>

            <Card title="Save Quote">
              <input className={`${inputCls} mb-3`} placeholder="Quote ref (e.g. Q042 — Zepto SOS)" value={form.quoteRef} onChange={(e) => set("quoteRef", e.target.value)} />
              {loadedQuoteId ? (
                <div className="flex gap-2">
                  <button onClick={() => saveQuote({ asNew: false })} disabled={saving}
                    className="flex-1 bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60">
                    {saving ? "Saving…" : "Update this quote"}
                  </button>
                  <button onClick={() => saveQuote({ asNew: true })} disabled={saving}
                    className="flex-1 bg-white border border-blue-600 text-blue-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-50 disabled:opacity-60 dark:bg-transparent dark:text-blue-400 dark:hover:bg-blue-900/30">
                    Save as new
                  </button>
                </div>
              ) : (
                <button onClick={() => saveQuote({ asNew: false })} disabled={saving}
                  className="w-full bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60">
                  {saving ? "Saving…" : "Save"}
                </button>
              )}
              {saveStatus === "success" && <p className="text-xs text-green-600 mt-2">✓ Saved to Quotes.</p>}
              {saveStatus === "success_update" && <p className="text-xs text-green-600 mt-2">✓ Quote updated.</p>}
              {saveStatus === "success_new" && <p className="text-xs text-green-600 mt-2">✓ Saved as new quote.</p>}
              {saveStatus === "error" && (
                <div className="mt-2">
                  <p className="text-xs text-red-500">Save failed. {saveError ? <span className="font-mono text-[10px] break-all">({saveError})</span> : "Try again."}</p>
                </div>
              )}
            </Card>

            {tips.length > 0 && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                <h2 className="text-sm font-semibold text-amber-800 mb-2">Optimization Tips</h2>
                <ul className="space-y-1">
                  {tips.map((tip, i) => (
                    <li key={i} className="text-sm text-amber-700 flex gap-2"><span className="mt-0.5 shrink-0">•</span><span>{tip}</span></li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
