"use client";
import { useMemo, useState } from "react";
import { Card, Field, Toggle, PillBtn, Row, SectionHeader, inputCls } from "@/app/calculator/_components/ui";
import {
  BOX_TYPES, FLUTE_PROFILES, PLY_OPTIONS, calculate, computeRateCurve, optimizationTips,
  getDefaultWastage, isPasted, isCorrugated, defaultCorrugatedLayers,
} from "@/lib/calc/box-calculator";
import { exportBoxQuoteCSV, exportBoxQuotePDF, exportAdminBoxQuotePDF } from "@/app/calculator/_components/box-export";

const QTY_OPTIONS = [5000, 10000, 25000, 50000, 100000];

export default function AdminBoxCalculator({ papers = [] }) {
  const [form, setForm] = useState({
    boxType: "cake",
    openLength: 250, openWidth: 180,
    paperId: "", paperName: "", gsm: 300, paperRate: 70,
    ply: 3, flute: "B", layers: defaultCorrugatedLayers(3),
    corrugationRate: 0, stitchingPerCarton: 0,
    printing: false, colours: 1, coverage: 30,
    punching: false, punchingDieCost: 0, punchingPerPiece: 0,
    innerPackRate: 0, innerPackQty: 0,
    outerCartonRate: 0, boxesPerCarton: 0,
    customWastage: "",
    profitPercent: 20,
    qty: 10000,
    quoteRef: "",
  });
  const [saveStatus, setSaveStatus] = useState(null);
  const corrugated = isCorrugated(form.boxType);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const num = (k, v) => set(k, parseFloat(v) || 0);

  function setPly(p) {
    setForm((f) => ({ ...f, ply: p, layers: defaultCorrugatedLayers(p) }));
  }
  function setLayer(idx, patch) {
    setForm((f) => ({ ...f, layers: f.layers.map((l, i) => (i === idx ? { ...l, ...patch } : l)) }));
  }
  function selectLayerPaper(idx, id) {
    const p = papers.find((x) => x.id === id);
    if (!p) return setLayer(idx, { paperId: "", paperName: "" });
    setLayer(idx, {
      paperId: p.id,
      paperName: p.materialName,
      gsm: p.gsm || form.layers[idx].gsm,
      paperRate: p.effectiveRate ?? p.baseRate ?? form.layers[idx].paperRate,
    });
  }

  function selectPaper(id) {
    const p = papers.find((x) => x.id === id);
    if (!p) return set("paperId", "");
    setForm((f) => ({
      ...f,
      paperId: p.id,
      paperName: p.materialName,
      gsm: p.gsm || f.gsm,
      paperRate: p.effectiveRate ?? p.baseRate ?? f.paperRate,
    }));
  }

  const result = useMemo(() => calculate(form), [form]);
  const curve = useMemo(() => computeRateCurve(form), [form]);
  const tips = useMemo(() => optimizationTips(form, result), [form, result]);
  const currentTier = curve.find((c) => c.qty === form.qty) || curve[0];

  async function saveQuote() {
    setSaveStatus(null);
    const res = await fetch("/api/calc/box-quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteRef: form.quoteRef || `BQ ${new Date().toISOString().split("T")[0]}`,
        boxType: form.boxType,
        openLength: form.openLength, openWidth: form.openWidth,
        paperName: corrugated
          ? `${form.ply}-ply ${form.flute}-flute (${form.layers.map((l) => l.gsm).join("/")})`
          : form.paperName,
        gsm: corrugated ? form.layers.reduce((s, l) => s + Number(l.gsm || 0), 0) : form.gsm,
        paperRate: corrugated ? 0 : form.paperRate,
        qty: form.qty,
        printing: form.printing, colours: form.colours, coverage: form.coverage,
        punching: form.punching,
        wastagePct: result.wastagePct,
        profitPct: form.profitPercent,
        mfgCost: result.totalMfg,
        sellingPrice: currentTier.ratePerBox,
        orderTotal: currentTier.orderTotal,
      }),
    });
    setSaveStatus(res.ok ? "success" : "error");
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Left: inputs */}
      <div className="lg:col-span-2 space-y-4">
        <Card title="Box Type">
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(BOX_TYPES).map(([val, cfg]) => (
              <PillBtn key={val} active={form.boxType === val} onClick={() => set("boxType", val)}>
                {cfg.label}
              </PillBtn>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {corrugated
              ? "Multi-ply board with flute take-up. Conversion ₹/kg + stitching/carton are user-supplied."
              : isPasted(form.boxType)
              ? "Pasting applied at ₹15/kg (clam-forming / 8-side)."
              : "Flat die-cut only — no pasting cost."}
          </p>
        </Card>

        <Card title="Open Size (mm)">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Length"><input type="number" className={inputCls} value={form.openLength} onChange={(e) => num("openLength", e.target.value)} min="1" /></Field>
            <Field label="Width"><input type="number" className={inputCls} value={form.openWidth} onChange={(e) => num("openWidth", e.target.value)} min="1" /></Field>
          </div>
        </Card>

        {!corrugated && (
          <Card title="Paper">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Material">
                {papers.length > 0 ? (
                  <select className={inputCls} value={form.paperId} onChange={(e) => selectPaper(e.target.value)}>
                    <option value="">— Select paper —</option>
                    {papers.map((p) => (
                      <option key={p.id} value={p.id}>{p.materialName}{p.gsm ? ` · ${p.gsm} GSM` : ""}</option>
                    ))}
                  </select>
                ) : (
                  <input type="text" className={inputCls} value={form.paperName} onChange={(e) => set("paperName", e.target.value)} placeholder="e.g. Virgin SBS Board" />
                )}
              </Field>
              <Field label="GSM">
                <input type="number" className={inputCls} value={form.gsm} onChange={(e) => num("gsm", e.target.value)} min="1" />
              </Field>
              <Field label="Rate (₹/kg)" hint={form.paperId ? "Auto-filled from RM; override if needed" : undefined}>
                <input type="number" className={inputCls} value={form.paperRate} onChange={(e) => num("paperRate", e.target.value)} min="0" step="0.5" />
              </Field>
              <Field label="Order Qty">
                <select className={inputCls} value={form.qty} onChange={(e) => set("qty", parseInt(e.target.value))}>
                  {QTY_OPTIONS.map((q) => <option key={q} value={q}>{q.toLocaleString()}</option>)}
                </select>
              </Field>
            </div>
          </Card>
        )}

        {corrugated && (
          <>
            <Card title="Board Construction">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Ply">
                  <div className="flex gap-2">
                    {PLY_OPTIONS.map((p) => (
                      <PillBtn key={p} active={form.ply === p} onClick={() => setPly(p)}>{p}-ply</PillBtn>
                    ))}
                  </div>
                </Field>
                <Field label="Flute profile">
                  <select className={inputCls} value={form.flute} onChange={(e) => set("flute", e.target.value)}>
                    {Object.entries(FLUTE_PROFILES).map(([k, v]) => (
                      <option key={k} value={k}>{v.label} · take-up {v.takeUp}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <p className="text-xs text-gray-400 mt-3">
                Flute layers use the take-up factor above when computing weight. Liners don't.
              </p>
            </Card>

            <Card title="Layer BOM">
              <div className="space-y-2">
                {form.layers.map((l, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-3 text-xs text-gray-500 dark:text-gray-400 pb-2">
                      {l.position}
                      <span className={`block text-[10px] uppercase tracking-wide ${l.kind === "flute" ? "text-amber-600" : "text-gray-400"}`}>
                        {l.kind}
                      </span>
                    </div>
                    <div className="col-span-5">
                      {papers.length > 0 ? (
                        <select className={inputCls} value={l.paperId} onChange={(e) => selectLayerPaper(i, e.target.value)}>
                          <option value="">— Select paper —</option>
                          {papers.map((p) => (
                            <option key={p.id} value={p.id}>{p.materialName}{p.gsm ? ` · ${p.gsm} GSM` : ""}</option>
                          ))}
                        </select>
                      ) : (
                        <input type="text" className={inputCls} value={l.paperName} onChange={(e) => setLayer(i, { paperName: e.target.value })} placeholder="Kraft / Fluting" />
                      )}
                    </div>
                    <div className="col-span-2">
                      <input type="number" className={inputCls} value={l.gsm} onChange={(e) => setLayer(i, { gsm: parseFloat(e.target.value) || 0 })} placeholder="GSM" min="1" />
                    </div>
                    <div className="col-span-2">
                      <input type="number" className={inputCls} value={l.paperRate} onChange={(e) => setLayer(i, { paperRate: parseFloat(e.target.value) || 0 })} placeholder="₹/kg" min="0" step="0.5" />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Conversion">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Corrugation (₹/kg)" hint="Board-making rate">
                  <input type="number" className={inputCls} value={form.corrugationRate} onChange={(e) => num("corrugationRate", e.target.value)} min="0" step="0.5" />
                </Field>
                <Field label="Stitching/glue (₹/carton)" hint="Finishing per piece">
                  <input type="number" className={inputCls} value={form.stitchingPerCarton} onChange={(e) => num("stitchingPerCarton", e.target.value)} min="0" step="0.1" />
                </Field>
                <Field label="Order Qty">
                  <select className={inputCls} value={form.qty} onChange={(e) => set("qty", parseInt(e.target.value))}>
                    {QTY_OPTIONS.map((q) => <option key={q} value={q}>{q.toLocaleString()}</option>)}
                  </select>
                </Field>
              </div>
            </Card>
          </>
        )}

        <Card title="Printing">
          <Toggle value={form.printing} onChange={() => set("printing", !form.printing)} label="Printing Required" />
          {form.printing && (
            <div className="mt-3 space-y-3 border-t border-gray-100 pt-3 dark:border-gray-800">
              <Field label="No. of Colours">
                <input type="number" className={inputCls} value={form.colours} onChange={(e) => num("colours", e.target.value)} min="1" max="8" />
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

        <Card title="Punching">
          <Toggle value={form.punching} onChange={() => set("punching", !form.punching)} label="Punching Required" />
          {form.punching && (
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-gray-100 pt-3 dark:border-gray-800">
              <Field label="Die Cost (₹)">
                <input type="number" className={inputCls} value={form.punchingDieCost} onChange={(e) => num("punchingDieCost", e.target.value)} min="0" />
              </Field>
              <Field label="Per-Piece (₹)">
                <input type="number" className={inputCls} value={form.punchingPerPiece} onChange={(e) => num("punchingPerPiece", e.target.value)} min="0" step="0.01" />
              </Field>
            </div>
          )}
        </Card>

        <Card title="Inner Packing">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rate (₹/pack)"><input type="number" className={inputCls} value={form.innerPackRate} onChange={(e) => num("innerPackRate", e.target.value)} min="0" step="0.01" /></Field>
            <Field label="Boxes/Pack"><input type="number" className={inputCls} value={form.innerPackQty} onChange={(e) => num("innerPackQty", e.target.value)} min="0" /></Field>
          </div>
        </Card>

        <Card title="Outer Carton">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rate (₹/carton)"><input type="number" className={inputCls} value={form.outerCartonRate} onChange={(e) => num("outerCartonRate", e.target.value)} min="0" step="0.01" /></Field>
            <Field label="Boxes/Carton"><input type="number" className={inputCls} value={form.boxesPerCarton} onChange={(e) => num("boxesPerCarton", e.target.value)} min="0" /></Field>
          </div>
        </Card>

        <Card title="Advanced">
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Wastage % (default ${getDefaultWastage(form.boxType)}%)`}>
              <input
                type="number"
                className={inputCls}
                value={form.customWastage}
                onChange={(e) => set("customWastage", e.target.value)}
                placeholder={`${getDefaultWastage(form.boxType)}`}
                min="0"
                step="0.5"
              />
            </Field>
            <Field label="Profit %">
              <input type="number" className={inputCls} value={form.profitPercent} onChange={(e) => num("profitPercent", e.target.value)} min="0" step="0.5" />
            </Field>
          </div>
        </Card>
      </div>

      {/* Right: live results */}
      <div className="lg:col-span-3 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-xl p-5 text-white shadow">
            <p className="text-emerald-100 text-xs mb-1">Selling Price @ {form.qty.toLocaleString()}</p>
            <p className="text-3xl font-bold">₹{currentTier.ratePerBox.toFixed(2)}</p>
            <p className="text-xs text-emerald-100 mt-2">{form.profitPercent}% margin over mfg</p>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 dark:bg-gray-900 dark:border-gray-800">
            <p className="text-xs text-gray-400 mb-1">Manufacturing Cost</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">₹{result.totalMfg.toFixed(2)}</p>
            <p className="text-xs text-gray-500 mt-2 dark:text-gray-400">Profit / box: ₹{(currentTier.ratePerBox - currentTier.mfgPerBox).toFixed(2)}</p>
          </div>
        </div>

        <Card title="Rate curve by quantity">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase border-b border-gray-100 dark:border-gray-800">
                <th className="text-left pb-2 font-medium">Qty</th>
                <th className="text-right pb-2 font-medium">Mfg/Box</th>
                <th className="text-right pb-2 font-medium">Rate/Box</th>
                <th className="text-right pb-2 font-medium">Order Total</th>
              </tr>
            </thead>
            <tbody>
              {curve.map((c) => (
                <tr key={c.qty} className={c.qty === form.qty ? "bg-emerald-50 dark:bg-emerald-900/20" : "border-b border-gray-50 dark:border-gray-800"}>
                  <td className="py-2 font-medium">{c.qty.toLocaleString()}</td>
                  <td className="py-2 text-right">₹{c.mfgPerBox.toFixed(2)}</td>
                  <td className="py-2 text-right font-semibold">₹{c.ratePerBox.toFixed(2)}</td>
                  <td className="py-2 text-right">₹{c.orderTotal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Cost breakdown">
          <table className="w-full">
            <tbody>
              <SectionHeader label="Geometry" />
              <Row label="Weight / box" value={`${result.wkg.toFixed(5)} kg`} />

              <SectionHeader label="Per-box costs" />
              <Row label="Paper" value={`₹${result.paperCost.toFixed(4)}`} sub={corrugated ? `${form.ply}-ply, ${form.flute}-flute` : undefined} />
              {!corrugated && <Row label="Die-cutting" value={`₹${result.dieCutCost.toFixed(4)}`} sub="₹350 / 1000" />}
              {result.corrugationCost > 0 && <Row label={`Corrugation (₹${form.corrugationRate}/kg)`} value={`₹${result.corrugationCost.toFixed(4)}`} />}
              {result.stitchingCost > 0 && <Row label="Stitching / glue" value={`₹${result.stitchingCost.toFixed(4)}`} />}
              {result.pastingCost > 0 && <Row label="Pasting (₹15/kg)" value={`₹${result.pastingCost.toFixed(4)}`} />}
              {result.printCost > 0 && <Row label={`Printing (${form.coverage}% coverage)`} value={`₹${result.printCost.toFixed(4)}`} />}
              {result.plateCostTotal > 0 && (
                <Row
                  label="Plate cost (amortised)"
                  value={`₹${result.plateCostPerBox.toFixed(4)}`}
                  sub={`₹${result.plateCostTotal.toLocaleString("en-IN")} / ${form.qty.toLocaleString()}`}
                />
              )}
              {result.punchingCost > 0 && <Row label="Punching" value={`₹${result.punchingCost.toFixed(4)}`} />}
              {result.innerPackCost > 0 && <Row label="Inner packing" value={`₹${result.innerPackCost.toFixed(4)}`} />}
              {result.outerCartonCost > 0 && <Row label="Outer carton" value={`₹${result.outerCartonCost.toFixed(4)}`} />}
              <Row label={`Wastage (${result.wastagePct}%)`} value={`₹${result.wastageCost.toFixed(4)}`} />

              <SectionHeader label="Totals" />
              <Row label="Manufacturing" value={`₹${result.totalMfg.toFixed(4)}`} />
              <Row label={`Profit (${result.profitPct}%)`} value={`₹${result.profit.toFixed(4)}`} />
              <Row label="Selling Price" value={`₹${result.sellingPrice.toFixed(4)}`} highlight />
            </tbody>
          </table>
        </Card>

        {tips.length > 0 && (
          <Card title="Optimisation tips">
            <ul className="text-sm text-gray-600 space-y-1.5 dark:text-gray-300">
              {tips.map((t, i) => <li key={i}>• {t}</li>)}
            </ul>
          </Card>
        )}

        {/* PR-B: export parity with Bag/Cup/PP admin calcs. CSV for finance,
            Customer PDF for sending out, Admin PDF for internal review (carries
            mfg breakdown + margin). Forwards the same {form, result, curve}
            triple to box-export.js — no calculation duplicated. */}
        <Card title="Export">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => exportBoxQuoteCSV({ form, result, curve })}
              className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              title="Download CSV with cost breakdown + rate curve"
            >
              ⇩ CSV
            </button>
            <button
              type="button"
              onClick={() => exportBoxQuotePDF({ form, result, curve })}
              className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              title="Customer-facing PDF (clean — no margin / mfg breakdown)"
            >
              📄 Customer PDF
            </button>
            <button
              type="button"
              onClick={() => exportAdminBoxQuotePDF({ form, result, curve })}
              className="px-3 py-2 text-sm font-medium rounded-lg border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200 dark:hover:bg-amber-900/40"
              title="Internal admin PDF with full cost breakdown + margin"
            >
              🔒 Admin PDF
            </button>
          </div>
          <p className="text-[11px] text-gray-500 mt-2 dark:text-gray-400">
            Customer PDF is safe to send out — it shows only the rate curve and specs. Admin PDF includes mfg cost and margin (do not share).
          </p>
        </Card>

        {/* Save button colour normalised from emerald → blue to match Bag / Cup /
            PP admin calcs (audit consistency fix). "Save" stays the primary
            action; Export sits above it because exports answer "share with
            customer now" which is more often the next step than "save for
            later". */}
        <Card title="Save this quote">
          <div className="flex gap-2">
            <input
              className={inputCls}
              placeholder="Quote reference (e.g. Customer A — Cake 8x8)"
              value={form.quoteRef}
              onChange={(e) => set("quoteRef", e.target.value)}
            />
            <button
              onClick={saveQuote}
              className="shrink-0 bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700"
            >Save</button>
          </div>
          {saveStatus === "success" && <p className="text-xs text-green-600 mt-2">✓ Saved.</p>}
          {saveStatus === "error" && <p className="text-xs text-red-500 mt-2">Save failed. Try again.</p>}
        </Card>
      </div>
    </div>
  );
}
