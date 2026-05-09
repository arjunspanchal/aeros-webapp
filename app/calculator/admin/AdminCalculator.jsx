"use client";
import { useEffect, useMemo, useState } from "react";
import { Card, Field, Toggle, PillBtn, Row, SectionHeader, inputCls } from "@/app/calculator/_components/ui";
import { exportQuoteCSV, exportQuotePDF, exportAdminQuotePDF } from "@/app/calculator/_components/export";
import {
  calculate, computeRateCurve, optimizationTips,
  JODHANI_RATES, OM_SHIVAAY_RATES, JODHANI_DISCOUNT, WET_STRENGTH_EXTRA,
  PRINTING_RATES, PLATE_COST_PER_COLOUR, USD_RATE,
  getJodhaniGsmBucket, getJodhaniRate, getOmShivaayRate, getDefaultWastage,
  QTY_TIERS, HANDLE_DEFAULT_COST, isHandleBag,
} from "@/lib/calc/calculator";

const MILLS_BY_TYPE = {
  "Brown Kraft": ["Ajit", "Jodhani", "Om Shivaay"],
  "Bleach Kraft White": ["JK", "BILT", "Pudumjee"],
  "OGR": ["JK", "BILT", "Pudumjee"],
  "MG": ["Khateema", "Jani Mill"],
};

const GSM_OPTIONS = [50, 60, 70, 80, 90, 100, 110, 120, 130, 140];
const BF_OPTIONS = [16, 18, 20, 22, 24, 26, 28];
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
  jodhaniGsmBucket: "", wetStrength: false, transportRate: "",
  tptRate: "", basePaperRate: 92, paperRate: 92,
  casePack: 100, handleCost: 0.85, customWastage: "", profitPercent: 10,
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

  const isJodhani = form.millName === "Jodhani";
  const isOmShivaay = form.millName === "Om Shivaay";

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

  function selectBagCode(id) {
    const c = bagCodes.find((x) => x.id === id);
    if (!c) { set("selectedCodeId", ""); return; }
    setForm((f) => {
      const next = { ...f, selectedCodeId: id, width: c.width, gusset: c.gusset, height: c.height };
      if (c.bagType) {
        next.bagType = c.bagType;
        if (HANDLE_DEFAULT_COST[c.bagType] !== undefined) next.handleCost = HANDLE_DEFAULT_COST[c.bagType];
      }
      if (c.casePack) next.casePack = c.casePack;
      if (c.paperType) next.paperType = c.paperType;
      if (c.millName) next.millName = c.millName;
      if (c.gsm) next.gsm = c.gsm;
      if (c.bf) next.bf = String(c.bf);
      if (c.lockedWastage) next.customWastage = String(c.lockedWastage);
      next.printing = !!c.printing;
      if (c.colours) next.colours = c.colours;
      if (c.coverage) next.coverage = c.coverage;
      next.wetStrength = false;
      next.transportRate = c.millName === "Jodhani" ? "5" : "";
      next.tptRate = ["Pudumjee", "JK", "BILT", "Ajit"].includes(c.millName) ? "5" : "";
      next.jodhaniGsmBucket = "";
      if (c.millName === "Jodhani" && c.gsm && c.bf) {
        const bucket = getJodhaniGsmBucket(c.gsm);
        next.jodhaniGsmBucket = bucket;
        const base = getJodhaniRate(bucket, parseInt(c.bf));
        if (base) {
          const rate = Math.round((base - JODHANI_DISCOUNT + WET_STRENGTH_EXTRA) * 100) / 100;
          next.paperRate = rate; next.basePaperRate = rate;
        }
      } else if (c.millName === "Om Shivaay" && c.gsm && c.bf) {
        const rate = getOmShivaayRate(c.gsm, c.bf);
        if (rate) { next.paperRate = rate; next.basePaperRate = rate; }
      }
      return next;
    });
  }

  function setJodhani(updates) {
    setForm((f) => {
      const next = { ...f, ...updates };
      const base = getJodhaniRate(next.jodhaniGsmBucket, next.bf ? parseInt(next.bf) : null);
      if (base) {
        let rate = base - JODHANI_DISCOUNT;
        if (next.wetStrength) rate += WET_STRENGTH_EXTRA;
        if (next.transportRate && !isNaN(parseFloat(next.transportRate))) rate += parseFloat(next.transportRate);
        next.paperRate = Math.round(rate * 100) / 100;
      }
      return next;
    });
  }

  function setManualPaperRate(v) {
    const base = parseFloat(v) || 0;
    const tpt = parseFloat(form.tptRate) || 0;
    setForm((f) => ({ ...f, basePaperRate: base, paperRate: Math.round((base + tpt) * 100) / 100 }));
  }

  function setTpt(v) {
    const tpt = parseFloat(v) || 0;
    setForm((f) => ({ ...f, tptRate: v, paperRate: Math.round((f.basePaperRate + tpt) * 100) / 100 }));
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
          <div className="grid grid-cols-2 gap-3">
            <Field label="Paper Type">
              <select className={inputCls} value={form.paperType} onChange={(e) => setForm((f) => ({ ...f, paperType: e.target.value, millName: "" }))}>
                <option value="">Select…</option>
                <option value="Brown Kraft">Brown Kraft (MF)</option>
                <option value="MG">Brown Kraft (MG)</option>
                <option value="Bleach Kraft White">Bleach Kraft White</option>
                <option value="OGR">OGR</option>
              </select>
            </Field>
            <Field label="Mill">
              <select className={inputCls} value={form.millName} disabled={!form.paperType} onChange={(e) => setForm((f) => ({ ...f, millName: e.target.value, jodhaniGsmBucket: "", tptRate: ["Pudumjee", "JK", "BILT", "Ajit"].includes(e.target.value) ? "5" : "", transportRate: e.target.value === "Jodhani" ? "5" : "" }))}>
                <option value="">{form.paperType ? "Select…" : "Select paper type first"}</option>
                {(MILLS_BY_TYPE[form.paperType] || []).map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            {isJodhani ? (
              <Field label="GSM">
                <select className={inputCls} value={form.jodhaniGsmBucket} onChange={(e) => setJodhani({ jodhaniGsmBucket: e.target.value, gsm: parseInt(e.target.value) || form.gsm })}>
                  <option value="">Select…</option>
                  {[100, 110, 120, 130, 140, 90, 82].map((g) => <option key={g} value={String(g)}>{g}</option>)}
                </select>
              </Field>
            ) : isOmShivaay ? (
              <Field label="GSM">
                <select className={inputCls} value={[60, 70].includes(form.gsm) ? String(form.gsm) : ""} onChange={(e) => {
                  const g = parseInt(e.target.value);
                  const rate = getOmShivaayRate(g, form.bf);
                  setForm((f) => ({ ...f, gsm: g, ...(rate ? { paperRate: rate, basePaperRate: rate } : {}) }));
                }}>
                  <option value="">Select…</option>
                  <option value="60">60</option>
                  <option value="70">70</option>
                </select>
              </Field>
            ) : (
              <Field label="GSM">
                <select className={inputCls} value={form.gsm} onChange={(e) => num("gsm", e.target.value)}>
                  {GSM_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </Field>
            )}
            <Field label="BF">
              {isJodhani ? (
                <select className={inputCls} value={form.bf} onChange={(e) => setJodhani({ bf: e.target.value })}>
                  <option value="">Select…</option>
                  <option value="24">24 BF</option><option value="26">26 BF</option><option value="28">28 BF</option>
                </select>
              ) : isOmShivaay ? (
                <select className={inputCls} value={form.bf} onChange={(e) => {
                  const bf = e.target.value;
                  const rate = getOmShivaayRate(form.gsm, bf);
                  setForm((f) => ({ ...f, bf, ...(rate ? { paperRate: rate, basePaperRate: rate } : {}) }));
                }}>
                  <option value="">Select…</option>
                  <option value="28">28 BF</option>
                </select>
              ) : (
                <select className={inputCls} value={form.bf} onChange={(e) => set("bf", e.target.value)}>
                  <option value="">Select…</option>
                  {BF_OPTIONS.map((b) => <option key={b} value={b}>{b} BF</option>)}
                </select>
              )}
            </Field>
          </div>
          {isJodhani && (
            <div className="mt-4 space-y-3 border-t border-gray-100 pt-3 dark:border-gray-800">
              <Toggle value={form.wetStrength} onChange={() => setJodhani({ wetStrength: !form.wetStrength })} label="Wet Strength Paper" sub="+₹5/kg" />
              <Field label="Transport (₹/kg)">
                <input type="number" className={inputCls} value={form.transportRate} onChange={(e) => setJodhani({ transportRate: e.target.value })} min="0" step="0.5" />
              </Field>
              {form.jodhaniGsmBucket && form.bf && (
                <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <p className="text-xs text-green-700 font-medium">Effective RM Rate: ₹{form.paperRate}/kg</p>
                </div>
              )}
            </div>
          )}
          {!isJodhani && !isOmShivaay && form.millName && (
            <div className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-800">
              <Field label="TPT (₹/kg)">
                <input type="number" className={inputCls} value={form.tptRate} onChange={(e) => setTpt(e.target.value)} min="0" step="0.5" />
              </Field>
            </div>
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
            <Field label="Paper Rate (₹/kg)">
              <input
                type="number"
                className={`${inputCls} ${(isJodhani && form.jodhaniGsmBucket && form.bf) || (isOmShivaay && form.bf) ? "bg-green-50 border-green-300" : ""}`}
                value={isJodhani || isOmShivaay ? form.paperRate : form.basePaperRate}
                onChange={(e) => { if (!isJodhani && !isOmShivaay) setManualPaperRate(e.target.value); }}
                readOnly={(isJodhani && !!form.jodhaniGsmBucket && !!form.bf) || (isOmShivaay && [60, 70].includes(form.gsm) && form.bf === "28")}
                min="1"
              />
            </Field>
            <Field label="Case Pack"><input type="number" className={inputCls} value={form.casePack} onChange={(e) => num("casePack", e.target.value)} min="1" /></Field>
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
