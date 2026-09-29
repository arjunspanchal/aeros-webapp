"use client";

import { useMemo, useState } from "react";
import { Card, Field, inputCls } from "./ui";
import { BOARD_TYPES, SAMPLE_SHAPES, TOLERANCE_PCT, computeGsm, sampleAreaM2 } from "@/lib/calc/gsm";

const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—");

// scope "admin" shows board rates and sheet cost; "client" hides them (purchase rates are internal)
export default function GsmCalculator({ scope = "client" }) {
  const isAdmin = scope === "admin";
  const [boardId, setBoardId] = useState("kraft");
  const [shape, setShape] = useState("sq10");
  const [diameterMm, setDiameterMm] = useState("");
  const [lengthMm, setLengthMm] = useState("");
  const [widthMm, setWidthMm] = useState("");
  const [pieces, setPieces] = useState("1");
  const [weightG, setWeightG] = useState("");
  const [resolutionG, setResolutionG] = useState("0.01");
  const [rateOverride, setRateOverride] = useState("");

  const board = BOARD_TYPES.find((b) => b.id === boardId) || BOARD_TYPES[0];
  const ratePerKg = rateOverride !== "" ? +rateOverride : board.ratePerKg;
  const areaM2 = sampleAreaM2(shape, { diameterMm, lengthMm, widthMm });
  const shapeMeta = SAMPLE_SHAPES.find((s) => s.id === shape);

  const r = useMemo(
    () => computeGsm({ weightG, areaM2, pieces, resolutionG, grades: board.grades, ratePerKg: isAdmin ? ratePerKg : 0 }),
    [weightG, areaM2, pieces, resolutionG, board, ratePerKg, isAdmin],
  );

  const poorPrecision = r && r.uncertaintyPct > 2;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card title="Sample">
        <div className="space-y-4">
          <Field label="Board type">
            <select className={inputCls} value={boardId} onChange={(e) => { setBoardId(e.target.value); setRateOverride(""); }}>
              {BOARD_TYPES.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
          </Field>

          <Field label="Sample size" hint={shapeMeta?.hint}>
            <div className="grid grid-cols-2 gap-2">
              {SAMPLE_SHAPES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setShape(s.id)}
                  className={`rounded-lg border px-3 py-2 text-sm text-left transition-colors ${
                    shape === s.id
                      ? "border-blue-600 bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-500"
                      : "border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </Field>

          {shape === "circle" && (
            <Field label="Disc diameter (mm)" hint="Measure the actual disc — 40 vs 42 mm moves the answer ~10%.">
              <input className={inputCls} type="number" inputMode="decimal" min="0" step="0.1" value={diameterMm} onChange={(e) => setDiameterMm(e.target.value)} placeholder="e.g. 40" />
            </Field>
          )}
          {shape === "rect" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Length (mm)">
                <input className={inputCls} type="number" inputMode="decimal" min="0" step="0.1" value={lengthMm} onChange={(e) => setLengthMm(e.target.value)} />
              </Field>
              <Field label="Width (mm)">
                <input className={inputCls} type="number" inputMode="decimal" min="0" step="0.1" value={widthMm} onChange={(e) => setWidthMm(e.target.value)} />
              </Field>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Weight on the scale (g)">
              <input className={inputCls} type="number" inputMode="decimal" min="0" step="0.01" value={weightG} onChange={(e) => setWeightG(e.target.value)} placeholder="e.g. 2.80" autoFocus />
            </Field>
            <Field label="Pieces weighed together" hint="Stack several for a better reading">
              <input className={inputCls} type="number" inputMode="numeric" min="1" step="1" value={pieces} onChange={(e) => setPieces(e.target.value)} />
            </Field>
          </div>

          <Field label="Scale resolution">
            <select className={inputCls} value={resolutionG} onChange={(e) => setResolutionG(e.target.value)}>
              <option value="0.001">0.001 g (lab / jewellery scale)</option>
              <option value="0.01">0.01 g (pocket scale)</option>
              <option value="0.1">0.1 g (kitchen scale)</option>
              <option value="1">1 g</option>
            </select>
          </Field>

          {isAdmin && board.ratePerKg > 0 && (
            <Field label="Board rate (₹/kg)" hint={`Default ₹${board.ratePerKg}/kg — ${board.rateSource}`}>
              <input className={inputCls} type="number" inputMode="decimal" min="0" step="0.5" value={rateOverride} onChange={(e) => setRateOverride(e.target.value)} placeholder={String(board.ratePerKg)} />
            </Field>
          )}
        </div>
      </Card>

      <Card title="Result">
        {!r ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Enter the sample size and its weight. A 10 × 10 cm square is easiest: GSM is simply the weight in grams × 100.
          </p>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide dark:text-gray-400">Measured GSM</p>
              <p className="text-5xl font-bold text-gray-900 tabular-nums dark:text-white">{fmt(r.gsm, 0)}</p>
              <p className={`text-sm mt-1 ${poorPrecision ? "text-amber-700 dark:text-amber-400" : "text-gray-500 dark:text-gray-400"}`}>
                ± {fmt(r.plusMinus, 1)} gsm ({fmt(r.uncertaintyPct, 1)}%) from the scale resolution
              </p>
              {poorPrecision && (
                <p className="text-xs text-amber-700 mt-1 dark:text-amber-400">
                  Reading is coarse for this sample. Weigh a 10 × 10 cm square or stack more pieces.
                </p>
              )}
            </div>

            {r.nearest && (
              <div className="rounded-lg border border-gray-100 p-3 dark:border-gray-800">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Nearest standard {board.label.toLowerCase()} grade: <span className="font-semibold">{r.nearest.grade} gsm</span>{" "}
                  <span className="text-gray-500 dark:text-gray-400">({r.nearest.devPct >= 0 ? "+" : ""}{fmt(r.nearest.devPct, 1)}%)</span>
                </p>
                <p className={`text-xs mt-1 ${r.nearest.withinTolerance ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>
                  {r.nearest.withinTolerance
                    ? `Within the usual ±${TOLERANCE_PCT}% mill tolerance.`
                    : `Outside ±${TOLERANCE_PCT}% of any standard grade. Check the board type, re-measure the sample, or treat it as a non-standard board.`}
                </p>
              </div>
            )}

            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-2 text-gray-500 dark:text-gray-400">Area weighed</td>
                  <td className="py-2 text-right text-gray-800 tabular-nums dark:text-gray-200">
                    {fmt(r.totalAreaM2 * 10000, 1)} cm² {r.pieces > 1 ? `(${r.pieces} pcs)` : ""}
                  </td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-2 text-gray-500 dark:text-gray-400">25 × 36 in sheet weighs</td>
                  <td className="py-2 text-right text-gray-800 tabular-nums dark:text-gray-200">{fmt(r.sheet.weightG, 1)} g</td>
                </tr>
                {isAdmin && r.sheet.costInr != null && (
                  <>
                    <tr className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-2 text-gray-500 dark:text-gray-400">Board cost per 25 × 36 sheet</td>
                      <td className="py-2 text-right text-gray-800 tabular-nums dark:text-gray-200">₹{fmt(r.sheet.costInr, 2)}</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-gray-500 dark:text-gray-400">Board cost per m²</td>
                      <td className="py-2 text-right text-gray-800 tabular-nums dark:text-gray-200">₹{fmt(r.sheet.costPerM2Inr, 2)}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
