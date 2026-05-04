"use client";
import { useEffect, useMemo, useState } from "react";
import { Card, Field, PillBtn, Row, SectionHeader, inputCls } from "@/app/calculator/_components/ui";
import { calculate, PP_PRESETS, PP_RM_GRADES, SIMPLE_MODEL_OVERRIDES } from "@/lib/calc/pp-calculator";
import { exportPpCSV, exportPpPDF } from "@/app/calculator/_components/pp-export";

const DEFAULT_FORM = {
  preset: "custom",
  itemName: "",
  quoteRef: "",
  ...PP_PRESETS.custom,
  rmRate: 116,
};

export default function AdminPpCalculator() {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [pastQuotes, setPastQuotes] = useState([]);
  const [loadedQuoteId, setLoadedQuoteId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const num = (k, v) => set(k, parseFloat(v) || 0);

  function applyPreset(key) {
    const p = PP_PRESETS[key];
    if (!p) return;
    setForm((f) => ({ ...f, ...p, preset: key, itemName: p.label, rmRate: f.rmRate }));
  }

  function applySimpleModel() {
    setForm((f) => ({ ...f, ...SIMPLE_MODEL_OVERRIDES }));
  }

  async function refreshQuotes(autoLoadId) {
    try {
      const res = await fetch("/api/calc/pp-quotes");
      if (!res.ok) return;
      const list = await res.json();
      setPastQuotes(Array.isArray(list) ? list : []);
      if (autoLoadId && Array.isArray(list) && list.some((q) => q.id === autoLoadId)) {
        setTimeout(() => loadQuoteFromList(autoLoadId, list), 0);
      }
    } catch {}
  }

  function loadQuoteFromList(id, list) {
    const q = list.find((x) => x.id === id);
    if (!q) return;
    setLoadedQuoteId(id);
    setForm((f) => ({
      ...f,
      preset: q.presetKey || "custom",
      itemName: q.itemName || "",
      quoteRef: q.quoteRef || "",
      itemWeight: q.itemWeight ?? f.itemWeight,
      itemsPerShot: q.cavities ?? f.itemsPerShot,
      cycleTime: q.cycleTime ?? f.cycleTime,
      shiftHrs: q.shiftHrs ?? f.shiftHrs,
      shiftsPerDay: q.shiftsPerDay ?? f.shiftsPerDay,
      labourCostPerDay: q.labourCostPerDay ?? f.labourCostPerDay,
      rmRate: q.rmRate ?? f.rmRate,
      runnerWeightPerShot: q.runnerWeightPerShot ?? f.runnerWeightPerShot,
      regrindCapturePercent: q.regrindCapturePercent ?? f.regrindCapturePercent,
      machinePowerKw: q.machinePowerKw ?? f.machinePowerKw,
      electricityRate: q.electricityRate ?? f.electricityRate,
      moldCost: q.moldCost ?? f.moldCost,
      moldLifeShots: q.moldLifeShots ?? f.moldLifeShots,
      rejectPercent: q.rejectPercent ?? f.rejectPercent,
      innerSleeveCost: q.innerSleeveCost ?? f.innerSleeveCost,
      innerPackingLabour: q.innerPackingLabour ?? f.innerPackingLabour,
      unitsPerSleeve: q.unitsPerSleeve ?? f.unitsPerSleeve,
      cartonCost: q.cartonCost ?? f.cartonCost,
      casePack: q.casePack ?? f.casePack,
      profitPercent: q.profitPct ?? f.profitPercent,
    }));
    setSaveStatus(null);
  }

  function loadQuote(id) {
    setLoadedQuoteId(id);
    setSaveStatus(null);
    if (!id) return;
    loadQuoteFromList(id, pastQuotes);
  }

  useEffect(() => {
    const urlQuoteId = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("quote")
      : null;
    refreshQuotes(urlQuoteId);
  }, []);

  const result = useMemo(() => calculate(form), [form]);

  async function saveQuote({ asNew }) {
    setSaving(true);
    setSaveStatus(null);
    const payload = {
      quoteRef: form.quoteRef || `PP ${new Date().toISOString().split("T")[0]}${form.itemName ? ` — ${form.itemName}` : ""}`,
      itemName: form.itemName || PP_PRESETS[form.preset]?.label || "",
      presetKey: form.preset,
      itemWeight: form.itemWeight,
      cavities: form.itemsPerShot,
      cycleTime: form.cycleTime,
      shiftHrs: form.shiftHrs,
      shiftsPerDay: form.shiftsPerDay,
      labourCostPerDay: form.labourCostPerDay,
      rmRate: form.rmRate,
      runnerWeightPerShot: form.runnerWeightPerShot,
      regrindCapturePercent: form.regrindCapturePercent,
      machinePowerKw: form.machinePowerKw,
      electricityRate: form.electricityRate,
      moldCost: form.moldCost,
      moldLifeShots: form.moldLifeShots,
      rejectPercent: form.rejectPercent,
      innerSleeveCost: form.innerSleeveCost,
      innerPackingLabour: form.innerPackingLabour,
      unitsPerSleeve: form.unitsPerSleeve,
      cartonCost: form.cartonCost,
      casePack: form.casePack,
      profitPct: form.profitPercent,
      mfgCost: result.totalMfg,
      sellingPrice: result.sellingPrice,
      spPerCase: result.spPerCase,
    };
    const method = loadedQuoteId && !asNew ? "PATCH" : "POST";
    if (method === "PATCH") payload.id = loadedQuoteId;

    try {
      const res = await fetch("/api/calc/pp-quotes", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSaving(false);
      if (!res.ok) {
        setSaveStatus("error");
        return;
      }
      const saved = await res.json().catch(() => null);
      setSaveStatus(asNew ? "success_new" : loadedQuoteId ? "success_update" : "success");
      if (method === "POST" && saved?.id) setLoadedQuoteId(saved.id);
      refreshQuotes();
    } catch {
      setSaving(false);
      setSaveStatus("error");
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Left: inputs */}
      <div className="lg:col-span-2 space-y-4">
        <Card title="Load a past quote" right={loadedQuoteId && (
          <button onClick={() => loadQuote("")} className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">Clear</button>
        )}>
          <select
            className={inputCls}
            value={loadedQuoteId}
            onChange={(e) => loadQuote(e.target.value)}
            disabled={pastQuotes.length === 0}
          >
            <option value="">— New quote —</option>
            {pastQuotes.map((q) => (
              <option key={q.id} value={q.id}>
                {q.quoteRef}{q.itemName && !q.quoteRef.includes(q.itemName) ? ` — ${q.itemName}` : ""}{q.date ? ` · ${q.date}` : ""}
              </option>
            ))}
          </select>
          {pastQuotes.length === 0 && (
            <p className="text-xs text-gray-400 mt-2 dark:text-gray-500">
              No saved quotes yet — save one below to enable updates.
            </p>
          )}
          {loadedQuoteId && (
            <p className="text-xs text-gray-500 mt-2 dark:text-gray-400">
              Editing <strong>{pastQuotes.find((q) => q.id === loadedQuoteId)?.quoteRef}</strong>. After recalculating you can update it or save as new.
            </p>
          )}
        </Card>

        <Card title="PP Item">
          <Field label="Preset">
            <select
              className={inputCls}
              value={form.preset}
              onChange={(e) => applyPreset(e.target.value)}
            >
              {Object.entries(PP_PRESETS).map(([k, p]) => (
                <option key={k} value={k}>{p.label}</option>
              ))}
            </select>
          </Field>
          <div className="mt-3">
            <Field label="Item Name (for quote ref)">
              <input
                type="text"
                className={inputCls}
                value={form.itemName}
                onChange={(e) => set("itemName", e.target.value)}
                placeholder="e.g. 600 mL PP Cup with Lid"
              />
            </Field>
          </div>
        </Card>

        <Card title="Raw Material">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Item Weight (g)">
              <input
                type="number"
                className={inputCls}
                value={form.itemWeight}
                onChange={(e) => num("itemWeight", e.target.value)}
                min="0"
                step="0.01"
              />
            </Field>
            <Field label="RM Rate (₹/kg)">
              <input
                type="number"
                className={inputCls}
                value={form.rmRate}
                onChange={(e) => num("rmRate", e.target.value)}
                min="0"
                step="0.5"
              />
            </Field>
          </div>
          <div className="flex gap-2 mt-3">
            {PP_RM_GRADES.map((g) => (
              <PillBtn
                key={g.key}
                active={form.rmRate === g.rate}
                onClick={() => set("rmRate", g.rate)}
              >
                {g.label}
              </PillBtn>
            ))}
          </div>
        </Card>

        <Card title="Runner & Regrind" right={
          <span className="text-xs text-gray-400 dark:text-gray-500">cold-runner waste</span>
        }>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Runner Weight per Shot (g)" hint="Sprue + gates per cycle (0 for hot runner)">
              <input
                type="number"
                className={inputCls}
                value={form.runnerWeightPerShot}
                onChange={(e) => num("runnerWeightPerShot", e.target.value)}
                min="0"
                step="0.5"
              />
            </Field>
            <Field label="Regrind Capture (%)" hint="% of runner reground in-house">
              <input
                type="number"
                className={inputCls}
                value={form.regrindCapturePercent}
                onChange={(e) => num("regrindCapturePercent", e.target.value)}
                min="0"
                max="100"
                step="0.5"
              />
            </Field>
          </div>
          <p className="text-xs text-gray-400 mt-3 dark:text-gray-500">
            Runner share: {result.runnerSharePerItem} g/item · Regrind credit: ₹{result.regrindCredit.toFixed(4)}
          </p>
        </Card>

        <Card title="Forming">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cycle Time (sec)">
              <input
                type="number"
                className={inputCls}
                value={form.cycleTime}
                onChange={(e) => num("cycleTime", e.target.value)}
                min="0"
                step="0.1"
              />
            </Field>
            <Field label="Items per Shot">
              <input
                type="number"
                className={inputCls}
                value={form.itemsPerShot}
                onChange={(e) => num("itemsPerShot", e.target.value)}
                min="1"
                step="1"
              />
            </Field>
            <Field label="Shift Hours">
              <input
                type="number"
                className={inputCls}
                value={form.shiftHrs}
                onChange={(e) => num("shiftHrs", e.target.value)}
                min="0"
                step="0.5"
              />
            </Field>
            <Field label="Shifts per Day">
              <input
                type="number"
                className={inputCls}
                value={form.shiftsPerDay}
                onChange={(e) => num("shiftsPerDay", e.target.value)}
                min="1"
                step="1"
              />
            </Field>
            <Field label="Labour Cost / Day (₹)">
              <input
                type="number"
                className={inputCls}
                value={form.labourCostPerDay}
                onChange={(e) => num("labourCostPerDay", e.target.value)}
                min="0"
                step="100"
              />
            </Field>
          </div>
        </Card>

        <Card title="Electricity">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Machine Power (kW)" hint="Heaters + vacuum + chiller">
              <input
                type="number"
                className={inputCls}
                value={form.machinePowerKw}
                onChange={(e) => num("machinePowerKw", e.target.value)}
                min="0"
                step="1"
              />
            </Field>
            <Field label="Tariff (₹/kWh)">
              <input
                type="number"
                className={inputCls}
                value={form.electricityRate}
                onChange={(e) => num("electricityRate", e.target.value)}
                min="0"
                step="0.1"
              />
            </Field>
          </div>
        </Card>

        <Card title="Mold Amortisation">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mold Cost (₹)">
              <input
                type="number"
                className={inputCls}
                value={form.moldCost}
                onChange={(e) => num("moldCost", e.target.value)}
                min="0"
                step="1000"
              />
            </Field>
            <Field label="Mold Life (shots)" hint="× items-per-shot = total parts">
              <input
                type="number"
                className={inputCls}
                value={form.moldLifeShots}
                onChange={(e) => num("moldLifeShots", e.target.value)}
                min="1"
                step="10000"
              />
            </Field>
          </div>
        </Card>

        <Card title="Rejects">
          <Field label="Reject Rate (%)" hint="Uplifts forming costs to cover scrapped parts">
            <input
              type="number"
              className={inputCls}
              value={form.rejectPercent}
              onChange={(e) => num("rejectPercent", e.target.value)}
              min="0"
              max="50"
              step="0.5"
            />
          </Field>
        </Card>

        <Card title="Packing">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Inner Sleeve Cost (₹)">
              <input
                type="number"
                className={inputCls}
                value={form.innerSleeveCost}
                onChange={(e) => num("innerSleeveCost", e.target.value)}
                min="0"
                step="0.05"
              />
            </Field>
            <Field label="Inner Packing Labour (₹)">
              <input
                type="number"
                className={inputCls}
                value={form.innerPackingLabour}
                onChange={(e) => num("innerPackingLabour", e.target.value)}
                min="0"
                step="0.05"
              />
            </Field>
            <Field label="Units per Sleeve">
              <input
                type="number"
                className={inputCls}
                value={form.unitsPerSleeve}
                onChange={(e) => num("unitsPerSleeve", e.target.value)}
                min="1"
                step="1"
              />
            </Field>
            <Field label="Carton Cost (₹)">
              <input
                type="number"
                className={inputCls}
                value={form.cartonCost}
                onChange={(e) => num("cartonCost", e.target.value)}
                min="0"
                step="1"
              />
            </Field>
            <Field label="Case Pack (units/carton)">
              <input
                type="number"
                className={inputCls}
                value={form.casePack}
                onChange={(e) => num("casePack", e.target.value)}
                min="1"
                step="50"
              />
            </Field>
          </div>
        </Card>

        <Card title="Margin">
          <Field label="Profit %">
            <input
              type="number"
              className={inputCls}
              value={form.profitPercent}
              onChange={(e) => num("profitPercent", e.target.value)}
              min="0"
              step="0.5"
            />
          </Field>
          <button
            type="button"
            onClick={applySimpleModel}
            className="mt-3 w-full text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline"
          >
            Switch to simple model (zero out yield, electricity, mold, reject)
          </button>
        </Card>
      </div>

      {/* Right: results */}
      <div className="lg:col-span-3 space-y-4">
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-5 text-white shadow">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-blue-200 text-xs mb-0.5">Selling Price / item</p>
              <p className="text-2xl font-bold">₹{result.sellingPrice.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-blue-200 text-xs mb-0.5">SP / Case ({form.casePack || 0})</p>
              <p className="text-2xl font-bold">
                ₹{result.spPerCase.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </p>
              <p className="text-blue-200 text-xs mt-0.5">{result.profitPct}% margin over mfg</p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-blue-500">
            <p className="text-blue-200 text-xs mb-0.5">Daily Output — {result.unitsPerDay.toLocaleString("en-IN")} units</p>
            <p className="text-2xl font-bold">
              ₹{(result.sellingPrice * result.unitsPerDay).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-5 text-white shadow flex flex-wrap gap-6">
          <div>
            <p className="text-red-200 text-xs">Manufacturing Cost</p>
            <p className="text-3xl font-bold">₹{result.totalMfg.toFixed(4)}</p>
          </div>
          <div className="border-l border-red-400 pl-6">
            <p className="text-red-200 text-xs">Profit ({result.profitPct}%)</p>
            <p className="text-3xl font-bold">₹{result.profit.toFixed(4)}</p>
          </div>
        </div>

        <Card title="Throughput">
          <table className="w-full">
            <tbody>
              <Row label="Items / minute" value={result.itemsPerMin.toFixed(2)} />
              <Row label="Items / hour" value={result.itemsPerHr.toFixed(0)} />
              <Row label="Units / shift" value={result.unitsPerShift.toLocaleString("en-IN")} />
              <Row label="Units / day" value={result.unitsPerDay.toLocaleString("en-IN")} />
            </tbody>
          </table>
        </Card>

        <Card title="Cost breakdown (₹ / item)">
          <table className="w-full">
            <tbody>
              <SectionHeader label="Raw Material" />
              <Row
                label="Gross RM (item + runner share)"
                value={`₹${result.grossRmCost.toFixed(4)}`}
                sub={`${result.grossRmWeight} g × ₹${form.rmRate}/kg (item ${form.itemWeight}g + runner ${result.runnerSharePerItem}g)`}
              />
              {result.regrindCredit > 0 && (
                <Row
                  label={`− Regrind credit (${form.regrindCapturePercent}% of runner)`}
                  value={`−₹${result.regrindCredit.toFixed(4)}`}
                  sub={`${result.regrindWeight} g recovered`}
                />
              )}
              <Row label="Net RM" value={`₹${result.rmCost.toFixed(4)}`} />

              <SectionHeader label="Forming" />
              <Row
                label="Labour / item"
                value={`₹${result.labourCostPerItem.toFixed(4)}`}
                sub={`₹${form.labourCostPerDay.toLocaleString("en-IN")} / ${result.unitsPerDay.toLocaleString("en-IN")} units/day`}
              />
              {result.electricityCostPerItem > 0 && (
                <Row
                  label="Electricity"
                  value={`₹${result.electricityCostPerItem.toFixed(4)}`}
                  sub={`${form.machinePowerKw} kW × ₹${form.electricityRate}/kWh ÷ ${result.itemsPerHr.toFixed(0)} items/hr`}
                />
              )}
              {result.moldCostPerItem > 0 && (
                <Row
                  label="Mold amortisation"
                  value={`₹${result.moldCostPerItem.toFixed(4)}`}
                  sub={`₹${form.moldCost.toLocaleString("en-IN")} / (${form.moldLifeShots.toLocaleString("en-IN")} shots × ${form.itemsPerShot})`}
                />
              )}
              {result.rejectUplift > 0 && (
                <Row
                  label={`Reject uplift (${form.rejectPercent}%)`}
                  value={`₹${result.rejectUplift.toFixed(4)}`}
                  sub={`× ${result.rejectFactor.toFixed(4)} on RM + forming`}
                />
              )}
              <Row label="Per-part subtotal" value={`₹${result.formedCost.toFixed(4)}`} />

              <SectionHeader label="Packing" />
              <Row
                label="Inner packing"
                value={`₹${result.innerPackCostPerItem.toFixed(4)}`}
                sub={`(₹${form.innerSleeveCost} sleeve + ₹${form.innerPackingLabour} labour) / ${form.unitsPerSleeve} per sleeve`}
              />
              <Row
                label="Carton"
                value={`₹${result.cartonCostPerItem.toFixed(4)}`}
                sub={`₹${form.cartonCost} / ${form.casePack} per case`}
              />
              <Row label="Total packing" value={`₹${result.totalPackingCost.toFixed(4)}`} />

              <SectionHeader label="Totals" />
              <Row label="Manufacturing cost" value={`₹${result.totalMfg.toFixed(4)}`} />
              <Row label={`Profit (${result.profitPct}%)`} value={`₹${result.profit.toFixed(4)}`} />
              <Row label="Selling price" value={`₹${result.sellingPrice.toFixed(4)}`} highlight />
            </tbody>
          </table>
        </Card>

        <Card title="Export">
          <div className="flex gap-2">
            <button
              onClick={() => exportPpCSV({ form, result })}
              className="flex-1 bg-white border border-gray-200 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Download Excel (.csv)
            </button>
            <button
              onClick={() => exportPpPDF({ form, result })}
              className="flex-1 bg-white border border-gray-200 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Download PDF
            </button>
          </div>
        </Card>

        <Card title="Save Quote">
          <input
            className={`${inputCls} mb-3`}
            placeholder="Quote ref (e.g. PP01 — Zepto 600mL Cup)"
            value={form.quoteRef}
            onChange={(e) => set("quoteRef", e.target.value)}
          />
          {loadedQuoteId ? (
            <div className="flex gap-2">
              <button
                onClick={() => saveQuote({ asNew: false })}
                disabled={saving}
                className="flex-1 bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Update this quote"}
              </button>
              <button
                onClick={() => saveQuote({ asNew: true })}
                disabled={saving}
                className="flex-1 bg-white border border-blue-600 text-blue-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-50 disabled:opacity-60 dark:bg-transparent dark:text-blue-400 dark:hover:bg-blue-900/30"
              >
                Save as new
              </button>
            </div>
          ) : (
            <button
              onClick={() => saveQuote({ asNew: false })}
              disabled={saving}
              className="w-full bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          )}
          {saveStatus === "success" && <p className="text-xs text-green-600 mt-2">✓ Saved to PP Quotes.</p>}
          {saveStatus === "success_update" && <p className="text-xs text-green-600 mt-2">✓ Quote updated.</p>}
          {saveStatus === "success_new" && <p className="text-xs text-green-600 mt-2">✓ Saved as new quote.</p>}
          {saveStatus === "error" && <p className="text-xs text-red-500 mt-2">Save failed — please try again or contact support.</p>}
        </Card>
      </div>
    </div>
  );
}
