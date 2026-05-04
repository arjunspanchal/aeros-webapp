"use client";
import { useEffect, useState } from "react";
import { Card, Field, Toggle, PillBtn, inputCls } from "@/app/calculator/_components/ui";
import { CURRENCIES, CURRENCY_CODES, formatCurrency } from "@/lib/calc/calculator";
import { exportQuoteCSV, exportQuotePDF } from "@/app/calculator/_components/export";

const GSM_OPTIONS = [50, 60, 70, 80, 90, 100, 110, 120, 130, 140];
const BF_OPTIONS = [16, 18, 20, 22, 24, 26, 28];
const COLOUR_OPTIONS = [1, 2, 3, 4];

// Unit conversion. Internal form state is always mm (the calculator engine is in mm);
// we convert only for display and when reading user input.
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

export default function ClientCalculator() {
  const [form, setForm] = useState({
    bagType: "sos",
    width: 230, gusset: 125, height: 335,
    paperType: "Brown Kraft", gsm: 120, bf: 28,
    casePack: 100,
    printing: false, colours: 1, coverage: 30,
    orderQty: 15000,
    brand: "",
    quoteRef: "",
  });
  const [currency, setCurrency] = useState("INR");
  const [unit, setUnit] = useState("mm");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null);
  const [err, setErr] = useState("");
  const [pastQuotes, setPastQuotes] = useState([]);
  const [loadedQuoteId, setLoadedQuoteId] = useState("");

  async function refreshQuotes(autoLoadId) {
    try {
      const res = await fetch("/api/calc/quotes");
      if (res.ok) {
        const list = await res.json();
        setPastQuotes(list);
        if (autoLoadId && list.some((x) => x.id === autoLoadId)) {
          // Delay a tick so the select's options render first.
          setTimeout(() => loadQuoteFromList(autoLoadId, list), 0);
        }
      }
    } catch {}
  }

  function loadQuoteFromList(quoteId, list) {
    const q = list.find((x) => x.id === quoteId);
    if (!q) return;
    setLoadedQuoteId(quoteId);
    setForm({
      bagType: bagTypeFromLabel(q.bagType),
      width: q.width || 0, gusset: q.gusset || 0, height: q.height || 0,
      paperType: q.paperType || "Brown Kraft",
      gsm: q.gsm || 120,
      bf: q.bf || 28,
      casePack: q.casePack || 100,
      printing: q.plainPrinted === "Printed",
      colours: q.colours || 1,
      coverage: q.coveragePct || 30,
      orderQty: q.orderQty || 15000,
      brand: q.brand || "",
      quoteRef: q.quoteRef || "",
    });
    setResult(null);
    setSaveStatus(null);
  }

  useEffect(() => {
    fetch("/api/calc/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.preferredCurrency) setCurrency(data.preferredCurrency);
        if (data?.preferredUnit) setUnit(data.preferredUnit);
      })
      .catch(() => {});
    const urlQuoteId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("quote") : null;
    refreshQuotes(urlQuoteId);
  }, []);

  const bagTypeFromLabel = (label) => ({
    "SOS": "sos", "Rope Handle": "rope_handle", "Flat Handle": "flat_handle",
    "V-Bottom": "v_bottom_gusset", "Handle": "rope_handle",
  })[label] || "sos";

  function loadQuote(quoteId) {
    setLoadedQuoteId(quoteId);
    if (!quoteId) return;
    const q = pastQuotes.find((x) => x.id === quoteId);
    if (!q) return;
    setForm({
      bagType: bagTypeFromLabel(q.bagType),
      width: q.width || 0, gusset: q.gusset || 0, height: q.height || 0,
      paperType: q.paperType || "Brown Kraft",
      gsm: q.gsm || 120,
      bf: q.bf || 28,
      casePack: q.casePack || 100,
      printing: q.plainPrinted === "Printed",
      colours: q.colours || 1,
      coverage: q.coveragePct || 30,
      orderQty: q.orderQty || 15000,
      brand: q.brand || "",
      quoteRef: q.quoteRef || "",
    });
    setResult(null);
    setSaveStatus(null);
  }

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const num = (k, v) => set(k, parseFloat(v) || 0);

  const setDim = (k, v) => set(k, fromDisplay(v, unit));
  const showDim = (mm) => toDisplay(mm, unit);

  async function updatePrefs(updates) {
    if (updates.preferredCurrency) setCurrency(updates.preferredCurrency);
    if (updates.preferredUnit) setUnit(updates.preferredUnit);
    try {
      await fetch("/api/calc/client/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
    } catch {}
  }

  async function calculate() {
    setErr(""); setSaveStatus(null); setLoading(true);
    try {
      const res = await fetch("/api/calc/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErr(data.error || "Failed to calculate"); setResult(null);
      } else {
        setResult(await res.json());
      }
    } finally { setLoading(false); }
  }

  async function saveQuote({ asNew }) {
    if (!result) return;
    setSaveStatus(null);
    const tier = result.curve.find((c) => c.qty === form.orderQty) || result.curve[0];
    const payload = {
      quoteRef: form.quoteRef || `Q ${new Date().toISOString().split("T")[0]}`,
      bagType: form.bagType,
      brand: form.brand || undefined,
      width: form.width, gusset: form.gusset, height: form.height,
      paperType: form.paperType, gsm: form.gsm, bf: form.bf,
      casePack: form.casePack, orderQty: form.orderQty,
      printing: form.printing, colours: form.colours, coverage: form.coverage,
      sellingPrice: tier.ratePerBag,
      costPerCase: tier.costPerCase,
      orderTotal: tier.orderTotal,
    };
    const method = loadedQuoteId && !asNew ? "PATCH" : "POST";
    if (method === "PATCH") payload.id = loadedQuoteId;
    const res = await fetch("/api/calc/quotes", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setSaveStatus(asNew ? "success_new" : loadedQuoteId ? "success_update" : "success");
      const saved = await res.json().catch(() => null);
      if (method === "POST" && saved?.id) setLoadedQuoteId(saved.id);
      refreshQuotes();
    } else {
      setSaveStatus("error");
    }
  }

  const tier = result?.curve?.find((c) => c.qty === form.orderQty) || result?.curve?.[0];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <div className="lg:col-span-2 space-y-4">
        {pastQuotes.length > 0 && (
          <Card title="Load a past quote" right={loadedQuoteId && (
            <button onClick={() => loadQuote("")} className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">Clear</button>
          )}>
            <select className={inputCls} value={loadedQuoteId} onChange={(e) => loadQuote(e.target.value)}>
              <option value="">— New quote —</option>
              {pastQuotes.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.quoteRef}{q.brand ? ` — ${q.brand}` : ""}{q.date ? ` · ${q.date}` : ""}
                </option>
              ))}
            </select>
            {loadedQuoteId && (
              <p className="text-xs text-gray-500 mt-2 dark:text-gray-400">
                Editing <strong>{pastQuotes.find((q) => q.id === loadedQuoteId)?.quoteRef}</strong>. After calculating you can update it or save as a new quote.
              </p>
            )}
          </Card>
        )}

        <Card title="Preferences">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Currency">
              <select className={inputCls} value={currency} onChange={(e) => updatePrefs({ preferredCurrency: e.target.value })}>
                {CURRENCY_CODES.map((c) => (
                  <option key={c} value={c}>{c} ({CURRENCIES[c].symbol})</option>
                ))}
              </select>
            </Field>
            <Field label="Dimension Units">
              <div className="flex gap-2">
                <PillBtn active={unit === "mm"} onClick={() => updatePrefs({ preferredUnit: "mm" })}>mm</PillBtn>
                <PillBtn active={unit === "cm"} onClick={() => updatePrefs({ preferredUnit: "cm" })}>cm</PillBtn>
                <PillBtn active={unit === "in"} onClick={() => updatePrefs({ preferredUnit: "in" })}>inches</PillBtn>
              </div>
            </Field>
          </div>
          <p className="text-xs text-gray-400 mt-2 dark:text-gray-500">Saved to your profile. Rates shown in {currency}; bag sizes in {unit === "in" ? "inches" : unit === "cm" ? "centimetres" : "millimetres"}.</p>
        </Card>

        <Card title="Bag Type">
          <div className="grid grid-cols-2 gap-2">
            {[["sos", "SOS"], ["rope_handle", "Rope Handle"], ["flat_handle", "Flat Handle"], ["v_bottom_gusset", "V-Bottom"]].map(([val, lbl]) => (
              <PillBtn key={val} active={form.bagType === val} onClick={() => set("bagType", val)}>{lbl}</PillBtn>
            ))}
          </div>
        </Card>

        <Card title={`Dimensions (${unitLabel[unit]})`}>
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

        <Card title="Paper">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select className={inputCls} value={form.paperType} onChange={(e) => set("paperType", e.target.value)}>
                <option value="Brown Kraft">Brown Kraft (MF)</option>
                <option value="MG">MG</option>
                <option value="Bleach Kraft White">Bleach Kraft White</option>
                <option value="OGR">OGR</option>
              </select>
            </Field>
            <Field label="GSM">
              <select className={inputCls} value={form.gsm} onChange={(e) => set("gsm", parseInt(e.target.value))}>
                {GSM_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </Field>
            <Field label="BF (Burst Factor)">
              <select className={inputCls} value={form.bf} onChange={(e) => set("bf", parseInt(e.target.value))}>
                {BF_OPTIONS.map((b) => <option key={b} value={b}>{b} BF</option>)}
              </select>
            </Field>
          </div>
        </Card>

        <Card title="Packaging & Order">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Case Pack (bags/box)">
              <input type="number" className={inputCls} value={form.casePack} onChange={(e) => num("casePack", e.target.value)} min="1" />
            </Field>
            <Field label="Order Quantity">
              <select className={inputCls} value={form.orderQty} onChange={(e) => set("orderQty", parseInt(e.target.value))}>
                <option value={15000}>15,000</option>
                <option value={30000}>30,000</option>
                <option value={50000}>50,000</option>
                <option value={100000}>100,000</option>
                <option value={250000}>250,000</option>
              </select>
            </Field>
          </div>
        </Card>

        <Card title="Printing">
          <Toggle value={form.printing} onChange={() => set("printing", !form.printing)} label="Printing Required" />
          {form.printing && (
            <div className="mt-3 space-y-3 border-t border-gray-100 pt-3 dark:border-gray-800">
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

        <button
          onClick={calculate}
          disabled={loading}
          className="w-full bg-blue-600 text-white font-medium py-3 rounded-lg hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? "Calculating…" : "Calculate Rate"}
        </button>
        {err && <p className="text-sm text-red-500">{err}</p>}
      </div>

      <div className="lg:col-span-3 space-y-4">
        {!result && (
          <Card>
            <p className="text-sm text-gray-500 text-center py-10 dark:text-gray-400">
              Enter your bag specs on the left and click <strong>Calculate Rate</strong>.
            </p>
          </Card>
        )}
        {result && (
          <>
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-5 text-white shadow">
              <p className="text-blue-200 text-xs mb-1">Rate per bag @ {form.orderQty.toLocaleString()} ({currency})</p>
              <p className="text-4xl font-bold">{formatCurrency(tier.ratePerBag, currency)}</p>
            </div>

            {result.result?.totalWeight > 0 && (
              <Card title="Bag weight">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide dark:text-gray-500">Paper</p>
                    <p className="text-xl font-semibold text-gray-900 mt-1 dark:text-white">{(result.result.wkg * 1000).toFixed(2)} g</p>
                  </div>
                  {result.result.handleWeight > 0 && (
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide dark:text-gray-500">Handle</p>
                      <p className="text-xl font-semibold text-gray-900 mt-1 dark:text-white">{(result.result.handleWeight * 1000).toFixed(0)} g</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide dark:text-gray-500">Total / bag</p>
                    <p className="text-xl font-semibold text-blue-700 mt-1 dark:text-blue-300">{(result.result.totalWeight * 1000).toFixed(2)} g</p>
                  </div>
                </div>
              </Card>
            )}

            {result.result?.box && (
              <Card title="Approx box dimensions">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide dark:text-gray-500">Length</p>
                    <p className="text-xl font-semibold text-gray-900 mt-1 dark:text-white">{toDisplay(result.result.box.L, unit)} {unitLabel[unit]}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide dark:text-gray-500">Width</p>
                    <p className="text-xl font-semibold text-gray-900 mt-1 dark:text-white">{toDisplay(result.result.box.W, unit)} {unitLabel[unit]}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide dark:text-gray-500">Depth</p>
                    <p className="text-xl font-semibold text-gray-900 mt-1 dark:text-white">{toDisplay(result.result.box.D, unit)} {unitLabel[unit]}</p>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-3 text-center dark:text-gray-500">
                  {form.casePack} bags per case · {Math.ceil(form.orderQty / form.casePack).toLocaleString()} cases for your order
                </p>
              </Card>
            )}

            <Card title="Rate curve by quantity">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase border-b border-gray-100 dark:text-gray-500 dark:border-gray-800">
                    <th className="text-left pb-2 font-medium">Order Qty</th>
                    <th className="text-right pb-2 font-medium">Rate / Bag</th>
                    <th className="text-right pb-2 font-medium">Cost / Case</th>
                    <th className="text-right pb-2 font-medium">Order Total</th>
                  </tr>
                </thead>
                <tbody>
                  {result.curve.map((c) => (
                    <tr key={c.qty} className={c.qty === form.orderQty ? "bg-blue-50 dark:bg-blue-900/30" : "border-b border-gray-50 dark:border-gray-800"}>
                      <td className="py-2 font-medium dark:text-gray-200">{c.qty.toLocaleString()}</td>
                      <td className="py-2 text-right dark:text-gray-200">{formatCurrency(c.ratePerBag, currency)}</td>
                      <td className="py-2 text-right dark:text-gray-200">{formatCurrency(c.costPerCase, currency)}</td>
                      <td className="py-2 text-right font-medium dark:text-gray-200">{formatCurrency(c.orderTotal, currency, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-gray-400 mt-3 dark:text-gray-500">Printed-bag rates drop at higher qty because plate cost is amortised over more units.</p>
            </Card>

            <Card title="Export">
              <div className="flex gap-2">
                <button
                  onClick={() => exportQuoteCSV({ form, result, currency, unit })}
                  className="flex-1 bg-white border border-gray-200 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700">
                  Download Excel (.csv)
                </button>
                <button
                  onClick={() => exportQuotePDF({ form, result, currency, unit })}
                  className="flex-1 bg-white border border-gray-200 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700">
                  Download PDF
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2 dark:text-gray-500">Excel opens in any spreadsheet app; PDF uses your browser&apos;s print dialog (choose &quot;Save as PDF&quot;).</p>
            </Card>

            <Card title="Save this quote">
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Field label="Brand">
                  <input className={inputCls} placeholder="e.g. Zepto, Swiggy, Zomato"
                    value={form.brand} onChange={(e) => set("brand", e.target.value)} />
                </Field>
                <Field label="Quote reference">
                  <input className={inputCls} placeholder="e.g. PO #123"
                    value={form.quoteRef} onChange={(e) => set("quoteRef", e.target.value)} />
                </Field>
              </div>
              {loadedQuoteId ? (
                <div className="flex gap-2">
                  <button onClick={() => saveQuote({ asNew: false })}
                    className="flex-1 bg-blue-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-blue-700">
                    Update this quote
                  </button>
                  <button onClick={() => saveQuote({ asNew: true })}
                    className="flex-1 bg-white border border-blue-600 text-blue-700 text-sm font-medium py-2 rounded-lg hover:bg-blue-50 dark:bg-transparent dark:text-blue-400 dark:hover:bg-blue-900/30">
                    Save as new
                  </button>
                </div>
              ) : (
                <button onClick={() => saveQuote({ asNew: false })}
                  className="w-full bg-blue-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-blue-700">
                  Save quote
                </button>
              )}
              {saveStatus === "success" && <p className="text-xs text-green-600 mt-2">✓ Saved to your quote history.</p>}
              {saveStatus === "success_update" && <p className="text-xs text-green-600 mt-2">✓ Quote updated.</p>}
              {saveStatus === "success_new" && <p className="text-xs text-green-600 mt-2">✓ Saved as new quote.</p>}
              {saveStatus === "error" && <p className="text-xs text-red-500 mt-2">Save failed. Try again.</p>}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
