"use client";
import { useState } from "react";
import { Card, Field, Toggle, PillBtn, inputCls } from "@/app/calculator/_components/ui";
import { BOX_TYPES, FLUTE_PROFILES, PLY_OPTIONS, isCorrugated } from "@/lib/calc/box-calculator";

const QTY_OPTIONS = [5000, 10000, 25000, 50000, 100000];

export default function ClientBoxCalculator({ papers = [] }) {
  const [form, setForm] = useState({
    boxType: "cake",
    openLength: 250, openWidth: 180,
    paperId: "", paperName: "", gsm: 300,
    ply: 3, flute: "B",
    printing: false, colours: 1, coverage: 30,
    punching: false, punchingDieCost: 0, punchingPerPiece: 0,
    innerPackRate: 0, innerPackQty: 0,
    outerCartonRate: 0, boxesPerCarton: 0,
    qty: 10000,
    quoteRef: "",
  });
  const corrugated = isCorrugated(form.boxType);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null);
  const [err, setErr] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const num = (k, v) => set(k, parseFloat(v) || 0);

  function selectPaper(id) {
    const p = papers.find((x) => x.id === id);
    if (!p) return set("paperId", "");
    setForm((f) => ({ ...f, paperId: p.id, paperName: p.materialName, gsm: p.gsm || f.gsm }));
  }

  async function calculate() {
    setErr(""); setSaveStatus(null); setLoading(true);
    try {
      const res = await fetch("/api/calc/box-rate", {
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

  async function saveQuote() {
    if (!result) return;
    setSaveStatus(null);
    const tier = result.curve.find((c) => c.qty === form.qty) || result.curve[0];
    const res = await fetch("/api/calc/box-quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteRef: form.quoteRef || `BQ ${new Date().toISOString().split("T")[0]}`,
        boxType: form.boxType,
        openLength: form.openLength, openWidth: form.openWidth,
        paperName: form.paperName, gsm: form.gsm,
        qty: form.qty,
        printing: form.printing, colours: form.colours, coverage: form.coverage,
        sellingPrice: tier.ratePerBox,
        orderTotal: tier.orderTotal,
      }),
    });
    setSaveStatus(res.ok ? "success" : "error");
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <Card title="Box Type">
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(BOX_TYPES).map(([val, cfg]) => (
              <PillBtn key={val} active={form.boxType === val} onClick={() => set("boxType", val)}>
                {cfg.label}
              </PillBtn>
            ))}
          </div>
        </Card>

        <Card title="Open Size (mm)">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Length"><input type="number" className={inputCls} value={form.openLength} onChange={(e) => num("openLength", e.target.value)} min="1" /></Field>
            <Field label="Width"><input type="number" className={inputCls} value={form.openWidth} onChange={(e) => num("openWidth", e.target.value)} min="1" /></Field>
          </div>
        </Card>

        {!corrugated && (
          <Card title="Paper">
            <div className="grid grid-cols-1 gap-3">
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
            </div>
          </Card>
        )}

        {corrugated && (
          <Card title="Board Construction">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ply">
                <div className="flex gap-2">
                  {PLY_OPTIONS.map((p) => (
                    <PillBtn key={p} active={form.ply === p} onClick={() => set("ply", p)}>{p}-ply</PillBtn>
                  ))}
                </div>
              </Field>
              <Field label="Flute profile">
                <select className={inputCls} value={form.flute} onChange={(e) => set("flute", e.target.value)}>
                  {Object.entries(FLUTE_PROFILES).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </Field>
            </div>
          </Card>
        )}

        <Card title="Order Quantity">
          <select className={inputCls} value={form.qty} onChange={(e) => set("qty", parseInt(e.target.value))}>
            {QTY_OPTIONS.map((q) => <option key={q} value={q}>{q.toLocaleString()}</option>)}
          </select>
        </Card>

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

        <button
          onClick={calculate}
          disabled={loading}
          className="w-full bg-emerald-600 text-white font-medium py-3 rounded-lg hover:bg-emerald-700 disabled:opacity-60"
        >
          {loading ? "Calculating…" : "Calculate Rate"}
        </button>
        {err && <p className="text-sm text-red-500">{err}</p>}
      </div>

      <div className="lg:col-span-3 space-y-4">
        {!result && (
          <Card>
            <p className="text-sm text-gray-500 text-center py-10 dark:text-gray-400">
              Enter your box specs on the left and click <strong>Calculate Rate</strong>.
            </p>
          </Card>
        )}
        {result && (
          <>
            <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-xl p-5 text-white shadow">
              <p className="text-emerald-100 text-xs mb-1">Rate per box @ {form.qty.toLocaleString()}</p>
              <p className="text-4xl font-bold">
                ₹{(result.curve.find((c) => c.qty === form.qty) || result.curve[0]).ratePerBox.toFixed(2)}
              </p>
            </div>

            <Card title="Rate curve by quantity">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase border-b border-gray-100 dark:border-gray-800">
                    <th className="text-left pb-2 font-medium">Order Qty</th>
                    <th className="text-right pb-2 font-medium">Rate / Box</th>
                    <th className="text-right pb-2 font-medium">Order Total</th>
                  </tr>
                </thead>
                <tbody>
                  {result.curve.map((c) => (
                    <tr key={c.qty} className={c.qty === form.qty ? "bg-emerald-50 dark:bg-emerald-900/20" : "border-b border-gray-50 dark:border-gray-800"}>
                      <td className="py-2 font-medium">{c.qty.toLocaleString()}</td>
                      <td className="py-2 text-right">₹{c.ratePerBox.toFixed(2)}</td>
                      <td className="py-2 text-right font-medium">₹{c.orderTotal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-gray-400 mt-3">
                Printed/punched boxes drop at higher qty because plate and die costs amortise over more units.
              </p>
            </Card>

            {/* PR-C: save-button colour normalised emerald → blue to match
                Bag and Cup client (audit consistency). Success message gains
                a "View in My Quotes" deep-link so the client can see where
                their quote landed instead of guessing if save worked. */}
            <Card title="Save this quote">
              <div className="flex gap-2">
                <input
                  className={inputCls}
                  placeholder="Quote reference (e.g. My PO #123)"
                  value={form.quoteRef}
                  onChange={(e) => set("quoteRef", e.target.value)}
                />
                <button
                  onClick={saveQuote}
                  className="shrink-0 bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700"
                >Save</button>
              </div>
              {saveStatus === "success" && (
                <p className="text-xs text-green-600 mt-2 dark:text-green-400">
                  ✓ Saved. View it in{" "}
                  <a href="/calculator/client/quotes" className="underline">My Quotes</a>.
                </p>
              )}
              {saveStatus === "error" && <p className="text-xs text-red-500 mt-2">Save failed. Try again.</p>}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
