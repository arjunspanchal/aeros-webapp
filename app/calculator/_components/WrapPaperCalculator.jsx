"use client";
import { useEffect, useMemo, useState } from "react";
import { Card, Field, PillBtn, inputCls } from "@/app/calculator/_components/ui";
import {
  WRAP_MILLS, WRAP_PAPER_TYPES, WRAP_GSM_OPTS, CASE_PACK_OPTS,
  COVERAGE_OPTS, PRINT_OPTS,
} from "@/lib/calc/wrap-paper-calculator";

const inr = (v, d = 3) =>
  v === null || v === undefined ? "—" : `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const inr0 = (v) =>
  v === null || v === undefined ? "—" : `₹${Math.round(Number(v)).toLocaleString("en-IN")}`;

// Wrap-paper calculator shared by the admin + client routes. `scope` controls
// whether internal fields (margin, paper-rate override, cost breakdown) show.
export default function WrapPaperCalculator({ scope = "admin" }) {
  const isAdmin = scope === "admin";

  const [form, setForm] = useState({
    mill: WRAP_MILLS[0],
    paperType: WRAP_PAPER_TYPES[0],
    width: 300,
    length: 300,
    gsm: 40,
    printing: "Flexo",
    colours: 1,
    coverage: 30,
    casePack: 1000,
    orderQty: 100000,
    margin: 15,
    paperRate: "", // admin-only optional override
  });

  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => {
    const v = e?.target ? e.target.value : e;
    setForm((f) => ({ ...f, [k]: v }));
  };

  const key = useMemo(() => JSON.stringify(form), [form]);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const body = {
          mill: form.mill,
          paperType: form.paperType,
          width: Number(form.width),
          length: Number(form.length),
          gsm: Number(form.gsm),
          printing: form.printing,
          colours: Number(form.colours),
          coverage: Number(form.coverage),
          casePack: Number(form.casePack),
          orderQty: Number(form.orderQty),
        };
        if (isAdmin) {
          body.margin = Number(form.margin);
          if (form.paperRate !== "" && Number(form.paperRate) > 0) body.paperRate = Number(form.paperRate);
        }
        const res = await fetch("/api/calc/wrap-rate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || "Calculation failed");
          setResult(null);
        } else {
          setResult(data);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message || "Network error");
          setResult(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [key, isAdmin]);

  const printed = form.printing === "Flexo" || form.printing === "Offset";
  const headline = result?.curve?.find((c) => c.qty === Number(form.orderQty)) || result?.curve?.[2];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* ---------------- Inputs ---------------- */}
      <div className="space-y-5">
        <Card title="Paper (from Master)">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mill">
              <select className={inputCls} value={form.mill} onChange={set("mill")}>
                {WRAP_MILLS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Stock">
              <select className={inputCls} value={form.paperType} onChange={set("paperType")}>
                {WRAP_PAPER_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-3">
            <Field label="Width (mm)">
              <input type="number" className={inputCls} value={form.width} onChange={set("width")} />
            </Field>
            <Field label="Length (mm)">
              <input type="number" className={inputCls} value={form.length} onChange={set("length")} />
            </Field>
            <Field label="GSM">
              <select className={inputCls} value={form.gsm} onChange={set("gsm")}>
                {WRAP_GSM_OPTS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </Field>
          </div>
          {isAdmin && (
            <Field label="Paper rate override (₹/kg)" hint="Leave blank to use the Master rate (+₹5 transport).">
              <input
                type="number" className={`${inputCls} mt-3`} placeholder="From Master"
                value={form.paperRate} onChange={set("paperRate")}
              />
            </Field>
          )}
        </Card>

        <Card title="Printing">
          <div className="flex gap-2">
            {PRINT_OPTS.map((p) => (
              <PillBtn key={p} active={form.printing === p} onClick={() => set("printing")(p)}>{p}</PillBtn>
            ))}
          </div>
          {printed && (
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Field label="Colours">
                <input type="number" min={1} max={8} className={inputCls} value={form.colours} onChange={set("colours")} />
              </Field>
              {form.printing === "Flexo" && (
                <Field label="Ink coverage %">
                  <select className={inputCls} value={form.coverage} onChange={set("coverage")}>
                    {COVERAGE_OPTS.map((c) => <option key={c} value={c}>{c}%</option>)}
                  </select>
                </Field>
              )}
            </div>
          )}
          {printed && (
            <p className="text-xs text-gray-400 mt-2 dark:text-gray-500">
              {form.printing === "Flexo"
                ? "Flexo: low per-sheet ink, ₹9,000/colour plates — best at high volume."
                : "Offset: ₹700/colour dies, higher per-sheet — best for short runs."}
            </p>
          )}
        </Card>

        <Card title="Order">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Case pack">
              <div className="flex gap-2">
                {CASE_PACK_OPTS.map((c) => (
                  <PillBtn key={c} active={Number(form.casePack) === c} onClick={() => set("casePack")(c)}>
                    {c.toLocaleString("en-IN")}
                  </PillBtn>
                ))}
              </div>
            </Field>
            <Field label="Order qty (sheets)">
              <input type="number" className={inputCls} value={form.orderQty} onChange={set("orderQty")} />
            </Field>
          </div>
          {isAdmin && (
            <Field label="Margin %">
              <input type="number" className={`${inputCls} mt-3`} value={form.margin} onChange={set("margin")} />
            </Field>
          )}
        </Card>
      </div>

      {/* ---------------- Output ---------------- */}
      <div className="space-y-5">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 dark:bg-red-900/30 dark:border-red-800 dark:text-red-300">
            {error}
          </div>
        )}

        <Card title="Quote" right={loading && <span className="text-xs text-gray-400">Calculating…</span>}>
          {result ? (
            <>
              <div className="text-sm text-gray-600 dark:text-gray-300 space-y-0.5 mb-3">
                <div>{result.width} × {result.length} mm · {result.gsm} GSM · {Number(result.weightG).toFixed(3)} g/sheet</div>
                <div>{result.mill} {result.paperType} · {inr(result.paperRate, 2)}/kg <span className="text-gray-400">({result.rateSource})</span></div>
                <div>
                  {result.printing}
                  {result.printing !== "Plain" && `, ${result.colours} colour${result.colours > 1 ? "s" : ""}`}
                  {result.printing === "Flexo" && ` @ ${result.coverage}% coverage`}
                  {" · "}Case pack {Number(result.casePack).toLocaleString("en-IN")}
                </div>
              </div>

              {headline && (
                <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 dark:bg-blue-900/30 dark:border-blue-800">
                  <div className="text-xs text-blue-700/70 dark:text-blue-300/70">Rate @ {headline.qty.toLocaleString("en-IN")} sheets</div>
                  <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">{inr(headline.ratePerSheet)}<span className="text-sm font-normal"> /sheet</span></div>
                  <div className="text-sm text-blue-700/80 dark:text-blue-300/80">{inr(headline.ratePerCase, 2)} /case · {inr0(headline.orderTotal)} order total</div>
                </div>
              )}

              {result.plateDieTotal > 0 && (
                <p className="text-xs text-gray-500 mt-3 dark:text-gray-400">
                  One-time plate/die: <strong>{inr0(result.plateDieTotal)}</strong> (billed separately)
                </p>
              )}

              {isAdmin && result.mfgPerSheet !== undefined && (
                <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">
                  Mfg cost/sheet: <strong>{inr(result.mfgPerSheet, 4)}</strong> · Margin {result.marginPct}%
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400">{loading ? "Calculating…" : "Enter specs to see the rate."}</p>
          )}
        </Card>

        {result?.curve && (
          <Card title="Cost ladder by quantity">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase tracking-wide dark:text-gray-500">
                  <th className="text-left py-1.5 px-2 font-medium">Qty</th>
                  <th className="text-right py-1.5 px-2 font-medium">Rate/sheet</th>
                  <th className="text-right py-1.5 px-2 font-medium">Rate/case</th>
                  <th className="text-right py-1.5 px-2 font-medium">Order total</th>
                </tr>
              </thead>
              <tbody>
                {result.curve.map((c) => {
                  const hi = c.qty === Number(form.orderQty);
                  return (
                    <tr key={c.qty} className={hi ? "bg-blue-50 font-semibold dark:bg-blue-900/30" : "border-b border-gray-100 dark:border-gray-800"}>
                      <td className="py-2 px-2 text-gray-700 dark:text-gray-300">{c.qty.toLocaleString("en-IN")}</td>
                      <td className="py-2 px-2 text-right text-gray-800 dark:text-gray-200">{inr(c.ratePerSheet)}</td>
                      <td className="py-2 px-2 text-right text-gray-800 dark:text-gray-200">{inr(c.ratePerCase, 2)}</td>
                      <td className="py-2 px-2 text-right text-gray-800 dark:text-gray-200">{inr0(c.orderTotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-xs text-gray-400 mt-3 dark:text-gray-500">
              Rate drops with volume as plate/die and run setup amortise across the order.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
