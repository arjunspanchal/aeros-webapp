"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  Field,
  inputCls,
  PillBtn,
  Row,
  SectionHeader,
} from "@/app/calculator/_components/ui";
import {
  calcExpressShip,
  DEFAULTS,
  ORIGINS,
  defaultHtsusForCategory,
} from "@/lib/factoryos/express-ship-calc";
import { exportExpressShipPDF } from "./export";

// --- formatters -------------------------------------------------------------

const usd = (n, d = 2) =>
  Number.isFinite(n)
    ? "$" + n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })
    : "—";
const inr = (n, d = 0) =>
  Number.isFinite(n)
    ? "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d })
    : "—";
const num = (n, d = 2) =>
  Number.isFinite(n) ? n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";

// Strip the parsed numeric back to "" when the user clears the input, so we
// don't surprise them with a leftover zero in the form.
const toNumOrEmpty = (s) => (s === "" || s == null ? "" : s);

export default function ExpressShipCalc() {
  // ----- Saved quotes -------------------------------------------------------
  const [pastQuotes, setPastQuotes] = useState([]);
  const [loadedQuoteId, setLoadedQuoteId] = useState("");
  const [quoteRef, setQuoteRef] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // null | "success" | "success_new" | "success_update" | "error"

  // ----- Shipment context ---------------------------------------------------
  const [origin, setOrigin] = useState("IN");
  const [originPostcode, setOriginPostcode] = useState("");
  const [destinationZip, setDestinationZip] = useState("");
  const [dispatchDate, setDispatchDate] = useState(new Date().toISOString().slice(0, 10));
  const [fxRate, setFxRate] = useState(String(DEFAULTS.fxRate));

  // ----- DHL rate -----------------------------------------------------------
  const [dhlRate, setDhlRate] = useState("");
  const [dhlRateCurrency, setDhlRateCurrency] = useState(DEFAULTS.dhlRateCurrency);
  const [dhlRateUnit, setDhlRateUnit] = useState(DEFAULTS.dhlRateUnit);
  const [fuelPct, setFuelPct] = useState("0");

  // ----- Product picker -----------------------------------------------------
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [product, setProduct] = useState(null); // selected master record
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef(null);

  // ----- Quantity -----------------------------------------------------------
  const [qtyMode, setQtyMode] = useState("pcs");
  const [qtyPcs, setQtyPcs] = useState("");
  const [palletsRequested, setPalletsRequested] = useState("1");

  // ----- Pricing ------------------------------------------------------------
  const [exFactoryInrPerUnit, setExFactoryInrPerUnit] = useState("");
  const [marginPct, setMarginPct] = useState(String(DEFAULTS.marginPct));

  // ----- Duty ---------------------------------------------------------------
  const [htsus, setHtsus] = useState("");
  const [mfnPctOverride, setMfnPctOverride] = useState("");
  const [section301PctOverride, setSection301PctOverride] = useState("");
  const [section122Mode, setSection122Mode] = useState("auto");

  // Pre-populate the origin postcode when the user flips origin country.
  useEffect(() => {
    const o = ORIGINS.find((x) => x.id === origin);
    if (o && !originPostcode) setOriginPostcode(o.defaultPostcode);
  }, [origin, originPostcode]);

  // ----- Product search -----------------------------------------------------
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const url = "/api/calc/master-products?q=" + encodeURIComponent(search.trim());
        const res = await fetch(url);
        if (!res.ok) {
          setResults([]);
        } else {
          const list = await res.json();
          setResults(Array.isArray(list) ? list : []);
        }
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => searchTimer.current && clearTimeout(searchTimer.current);
  }, [search]);

  // When a product is picked, seed HTSUS + price + ex-factory if available.
  function pickProduct(p) {
    setProduct(p);
    setSearch(`${p.sku} — ${p.productName}`);
    setResults([]);
    if (p.htsCodeUs) {
      setHtsus(p.htsCodeUs);
    } else if (p.category) {
      setHtsus(defaultHtsusForCategory(p.category) || "");
    }
    if (p.pricePerUnit && !exFactoryInrPerUnit) {
      setExFactoryInrPerUnit(String(p.pricePerUnit));
    }
    if (p.countryOfOrigin === "China") setOrigin("CN");
    else if (p.countryOfOrigin === "India") setOrigin("IN");
  }

  // ----- Saved-quote helpers ------------------------------------------------
  async function refreshQuotes() {
    try {
      const res = await fetch("/api/calc/express-ship-quotes");
      if (!res.ok) return;
      const list = await res.json();
      setPastQuotes(Array.isArray(list) ? list : []);
    } catch {}
  }
  useEffect(() => { refreshQuotes(); }, []);

  function loadQuote(id) {
    setLoadedQuoteId(id);
    setSaveStatus(null);
    if (!id) return;
    const q = pastQuotes.find((x) => x.id === id);
    if (!q) return;
    setQuoteRef(q.quoteRef || "");
    if (q.origin) setOrigin(q.origin);
    if (q.originPostcode) setOriginPostcode(q.originPostcode);
    if (q.destinationZip) setDestinationZip(q.destinationZip);
    if (q.dispatchDate) setDispatchDate(q.dispatchDate);
    if (q.fxRate != null) setFxRate(String(q.fxRate));
    if (q.dhlRate != null) setDhlRate(String(q.dhlRate));
    if (q.dhlRateCurrency) setDhlRateCurrency(q.dhlRateCurrency);
    if (q.dhlRateUnit) setDhlRateUnit(q.dhlRateUnit);
    if (q.fuelPct != null) setFuelPct(String(q.fuelPct));
    if (q.qtyMode) setQtyMode(q.qtyMode);
    if (q.qtyPcs != null) setQtyPcs(String(q.qtyPcs));
    if (q.palletsRequested != null) setPalletsRequested(String(q.palletsRequested));
    if (q.exFactoryInrPerUnit != null) setExFactoryInrPerUnit(String(q.exFactoryInrPerUnit));
    if (q.marginPct != null) setMarginPct(String(q.marginPct));
    if (q.htsus) setHtsus(q.htsus);
    setMfnPctOverride(q.mfnPctOverride != null ? String(q.mfnPctOverride) : "");
    setSection301PctOverride(q.section301PctOverride != null ? String(q.section301PctOverride) : "");
    if (q.section122Mode) setSection122Mode(q.section122Mode);
    if (q.productSnapshot) {
      setProduct(q.productSnapshot);
      setSearch(`${q.productSnapshot.sku || ""} — ${q.productSnapshot.productName || ""}`);
    } else {
      setProduct(null);
      setSearch("");
    }
  }

  // ----- Compute ------------------------------------------------------------
  const result = useMemo(() => {
    if (!product) return null;
    return calcExpressShip({
      origin,
      originPostcode,
      destinationZip,
      dispatchDate,
      fxRate: Number(fxRate) || DEFAULTS.fxRate,
      dhlRate: Number(dhlRate) || 0,
      dhlRateCurrency,
      dhlRateUnit,
      fuelPct: Number(fuelPct) || 0,
      master: product,
      qtyMode,
      qtyPcs: Number(qtyPcs) || 0,
      palletsRequested: Number(palletsRequested) || 0,
      exFactoryInrPerUnit: Number(exFactoryInrPerUnit) || 0,
      marginPct: Number(marginPct) || 0,
      htsus,
      mfnPctOverride: mfnPctOverride === "" ? undefined : Number(mfnPctOverride),
      section301PctOverride: section301PctOverride === "" ? undefined : Number(section301PctOverride),
      section122Mode,
    });
  }, [
    product, origin, originPostcode, destinationZip, dispatchDate, fxRate,
    dhlRate, dhlRateCurrency, dhlRateUnit, fuelPct,
    qtyMode, qtyPcs, palletsRequested,
    exFactoryInrPerUnit, marginPct,
    htsus, mfnPctOverride, section301PctOverride, section122Mode,
  ]);

  // ----- Save ---------------------------------------------------------------
  async function saveQuote({ asNew }) {
    if (!product || !result || result.error) return;
    setSaving(true);
    setSaveStatus(null);
    const today = new Date().toISOString().split("T")[0];
    const fallbackRef = `EXP ${today} — ${product.sku}`;
    const payload = {
      quoteRef: quoteRef || fallbackRef,
      origin, originPostcode, destinationZip, dispatchDate,
      fxRate: Number(fxRate) || 0,
      dhlRate: Number(dhlRate) || 0,
      dhlRateCurrency, dhlRateUnit,
      fuelPct: Number(fuelPct) || 0,
      productId: product.id || null,
      productSnapshot: product,
      qtyMode,
      qtyPcs: result.shipmentSpecs?.qtyPcs ?? Number(qtyPcs) ?? 0,
      palletsRequested: Number(palletsRequested) || 0,
      exFactoryInrPerUnit: Number(exFactoryInrPerUnit) || 0,
      marginPct: Number(marginPct) || 0,
      htsus,
      mfnPctOverride: mfnPctOverride === "" ? null : Number(mfnPctOverride),
      section301PctOverride: section301PctOverride === "" ? null : Number(section301PctOverride),
      section122Mode,
      resultSnapshot: result,
      totalLandedInr: result.pricing?.totalLandedInr ?? 0,
      totalSellingInr: result.pricing?.totalSellingInr ?? 0,
    };
    const method = loadedQuoteId && !asNew ? "PATCH" : "POST";
    if (method === "PATCH") payload.id = loadedQuoteId;
    try {
      const res = await fetch("/api/calc/express-ship-quotes", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSaving(false);
      if (!res.ok) { setSaveStatus("error"); return; }
      const saved = await res.json().catch(() => null);
      setSaveStatus(asNew ? "success_new" : loadedQuoteId ? "success_update" : "success");
      if (method === "POST" && saved?.id) {
        setLoadedQuoteId(saved.id);
        if (saved.quoteRef) setQuoteRef(saved.quoteRef);
      }
      refreshQuotes();
    } catch {
      setSaving(false);
      setSaveStatus("error");
    }
  }

  const canSave = product && result && !result.error;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      {/* ---------------- INPUTS ---------------- */}
      <div className="space-y-4">
        {/* Saved quotes */}
        <Card
          title="Load a past quote"
          right={loadedQuoteId && (
            <button
              onClick={() => loadQuote("")}
              className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >Clear</button>
          )}
        >
          <select
            className={inputCls}
            value={loadedQuoteId}
            onChange={(e) => loadQuote(e.target.value)}
            disabled={pastQuotes.length === 0}
          >
            <option value="">— New quote —</option>
            {pastQuotes.map((q) => (
              <option key={q.id} value={q.id}>
                {q.quoteRef || "(no ref)"}
                {q.date ? ` · ${q.date}` : ""}
              </option>
            ))}
          </select>
          {pastQuotes.length === 0 && (
            <p className="text-xs text-gray-400 mt-2 dark:text-gray-500">
              No saved quotes yet — save one below to start your history.
            </p>
          )}
          <div className="mt-3">
            <Field label="Quote ref (optional)" hint="Auto-generated if you leave it blank.">
              <input
                type="text"
                className={inputCls}
                value={quoteRef}
                onChange={(e) => setQuoteRef(e.target.value)}
                placeholder="e.g. EXP 2026-05-13 — PC-SW-009"
              />
            </Field>
          </div>
        </Card>

        {/* Origin + destination */}
        <Card title="Route">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Origin country" hint="Goods leave from here.">
              <div className="flex gap-2">
                {ORIGINS.map((o) => (
                  <PillBtn key={o.id} active={origin === o.id} onClick={() => setOrigin(o.id)}>
                    {o.label}
                  </PillBtn>
                ))}
              </div>
            </Field>
            <Field label="Origin postcode" hint={`${ORIGINS.find((o) => o.id === origin)?.city || ""} default`}>
              <input
                type="text"
                className={inputCls}
                value={originPostcode}
                onChange={(e) => setOriginPostcode(e.target.value)}
                placeholder={ORIGINS.find((o) => o.id === origin)?.defaultPostcode || ""}
              />
            </Field>
            <Field label="Destination ZIP (US)" hint="5-digit; drives transit estimate.">
              <input
                type="text"
                inputMode="numeric"
                className={inputCls}
                value={destinationZip}
                onChange={(e) => setDestinationZip(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))}
                placeholder="10001"
              />
            </Field>
            <Field label="Dispatch date" hint="When goods leave the origin.">
              <input
                type="date"
                className={inputCls}
                value={dispatchDate}
                onChange={(e) => setDispatchDate(e.target.value)}
              />
            </Field>
          </div>
          {result?.transit?.days != null && (
            <p className="mt-3 text-xs text-gray-600 dark:text-gray-300">
              Estimated delivery: <strong>{result.transit.deliveryDate}</strong>
              {result.transit.coast ? ` · ${result.transit.coast.toUpperCase()} coast` : ""}
              {` · ${result.transit.days} business day${result.transit.days === 1 ? "" : "s"}`}
              <span className="text-gray-400 ml-1">(estimate — confirm with DHL)</span>
            </p>
          )}
        </Card>

        {/* DHL rate */}
        <Card title="DHL Express rate">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rate" hint="Live rate from your DHL contact.">
              <input
                type="number"
                inputMode="decimal"
                className={inputCls}
                value={dhlRate}
                onChange={(e) => setDhlRate(e.target.value)}
                placeholder="e.g. 450"
              />
            </Field>
            <Field label="Currency">
              <div className="flex gap-2">
                <PillBtn active={dhlRateCurrency === "INR"} onClick={() => setDhlRateCurrency("INR")}>INR</PillBtn>
                <PillBtn active={dhlRateCurrency === "USD"} onClick={() => setDhlRateCurrency("USD")}>USD</PillBtn>
              </div>
            </Field>
            <Field label="Billed">
              <div className="flex gap-2">
                <PillBtn active={dhlRateUnit === "perKg"} onClick={() => setDhlRateUnit("perKg")}>per kg</PillBtn>
                <PillBtn active={dhlRateUnit === "perShipment"} onClick={() => setDhlRateUnit("perShipment")}>flat</PillBtn>
              </div>
            </Field>
            <Field label="Fuel surcharge %" hint="Set 0 if your rate is all-in.">
              <input
                type="number"
                inputMode="decimal"
                className={inputCls}
                value={fuelPct}
                onChange={(e) => setFuelPct(e.target.value)}
                placeholder="0"
              />
            </Field>
            <Field label="FX rate (₹ / 1 USD)">
              <input
                type="number"
                inputMode="decimal"
                className={inputCls}
                value={fxRate}
                onChange={(e) => setFxRate(e.target.value)}
                placeholder={String(DEFAULTS.fxRate)}
              />
            </Field>
          </div>
        </Card>

        {/* Product picker */}
        <Card title="Product">
          <Field label="Search master_products" hint="Type 2+ chars; pick from the list.">
            <input
              type="text"
              className={inputCls}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setProduct(null); }}
              placeholder="SKU, name, category…"
            />
          </Field>
          {search.length >= 2 && !product && (
            <div className="mt-2 max-h-56 overflow-y-auto border border-gray-100 dark:border-gray-800 rounded-lg">
              {searching ? (
                <p className="px-3 py-2 text-xs text-gray-400">Searching…</p>
              ) : results.length === 0 ? (
                <p className="px-3 py-2 text-xs text-gray-400">No matches.</p>
              ) : (
                results.slice(0, 20).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => pickProduct(p)}
                    className="block w-full text-left px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/30 border-b border-gray-50 dark:border-gray-800 last:border-b-0"
                  >
                    <div className="font-medium text-gray-800 dark:text-gray-100">{p.sku}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{p.productName}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">
                      {p.category}
                      {p.cartonDimensions ? ` · ${p.cartonDimensions} mm` : " · ⚠ no carton dims"}
                      {p.unitsPerCase ? ` · ${p.unitsPerCase}/case` : ""}
                    </div>
                  </button>
                ))
              )}
            </div>
          )}

          {product && (
            <div className="mt-3 rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">{product.sku}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{product.productName}</div>
                </div>
                <button
                  onClick={() => { setProduct(null); setSearch(""); }}
                  className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400"
                >Change</button>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs text-gray-600 dark:text-gray-300">
                <div>Category: <strong>{product.category || "—"}</strong></div>
                <div>COO: <strong>{product.countryOfOrigin || "—"}</strong></div>
                <div>Carton: <strong>{product.cartonDimensions || "⚠ missing"}</strong></div>
                <div>Units/case: <strong>{product.unitsPerCase ?? "—"}</strong></div>
                <div>Gross/case: <strong>{product.grossWeightKg ? `${product.grossWeightKg} kg` : "⚠ fallback used"}</strong></div>
                <div>Item wt: <strong>{product.itemWeightG ? `${product.itemWeightG} g` : "—"}</strong></div>
              </div>
            </div>
          )}
        </Card>

        {/* Quantity */}
        <Card title="Quantity">
          <Field label="Mode">
            <div className="flex gap-2">
              <PillBtn active={qtyMode === "pcs"} onClick={() => setQtyMode("pcs")}>By pieces</PillBtn>
              <PillBtn active={qtyMode === "palletised"} onClick={() => setQtyMode("palletised")}>By pallets</PillBtn>
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3 mt-3">
            {qtyMode === "pcs" ? (
              <Field label="Pieces" hint="Cartons rounded up to fit.">
                <input
                  type="number"
                  inputMode="numeric"
                  className={inputCls}
                  value={qtyPcs}
                  onChange={(e) => setQtyPcs(e.target.value)}
                  placeholder="e.g. 5000"
                />
              </Field>
            ) : (
              <Field label="Pallets" hint="Pieces derived from carton-per-pallet × units-per-case.">
                <input
                  type="number"
                  inputMode="numeric"
                  className={inputCls}
                  value={palletsRequested}
                  onChange={(e) => setPalletsRequested(e.target.value)}
                  placeholder="1"
                />
              </Field>
            )}
            {result?.shipmentSpecs && (
              <div className="text-xs text-gray-500 dark:text-gray-400 self-end">
                <div>{result.shipmentSpecs.cartons} cartons · {result.shipmentSpecs.pallets} pallet{result.shipmentSpecs.pallets === 1 ? "" : "s"}</div>
                <div>{num(result.shipmentSpecs.qtyPcs, 0)} pcs · {num(result.shipmentSpecs.cartonsPerPallet, 0)} per pallet</div>
              </div>
            )}
          </div>
        </Card>

        {/* Pricing */}
        <Card title="Product cost & margin">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ex-factory ₹ / piece" hint="TPC cost from production.">
              <input
                type="number"
                inputMode="decimal"
                className={inputCls}
                value={exFactoryInrPerUnit}
                onChange={(e) => setExFactoryInrPerUnit(e.target.value)}
                placeholder="2.50"
              />
            </Field>
            <Field label="Margin %" hint="Markup applied on landed cost.">
              <input
                type="number"
                inputMode="decimal"
                className={inputCls}
                value={marginPct}
                onChange={(e) => setMarginPct(e.target.value)}
                placeholder="30"
              />
            </Field>
          </div>
        </Card>

        {/* Duty */}
        <Card title="US duty">
          <div className="grid grid-cols-2 gap-3">
            <Field label="HTSUS" hint="Auto-filled from category; verify before quoting.">
              <input
                type="text"
                className={inputCls}
                value={htsus}
                onChange={(e) => setHtsus(e.target.value)}
                placeholder="4823.69.00.40"
              />
            </Field>
            <Field label="MFN % override" hint={result?.duty ? `Auto: ${(result.duty.mfnPct * 100).toFixed(2)}%` : "Leave blank to use HTSUS lookup."}>
              <input
                type="number"
                inputMode="decimal"
                className={inputCls}
                value={mfnPctOverride}
                onChange={(e) => setMfnPctOverride(e.target.value)}
                placeholder="auto"
              />
            </Field>
            {origin === "CN" && (
              <Field label="Section 301 % override" hint={result?.duty ? `Auto: ${(result.duty.section301Pct * 100).toFixed(2)}%` : "China-origin only."}>
                <input
                  type="number"
                  inputMode="decimal"
                  className={inputCls}
                  value={section301PctOverride}
                  onChange={(e) => setSection301PctOverride(e.target.value)}
                  placeholder="auto"
                />
              </Field>
            )}
            <Field label="Section 122 (10%)" hint={`Sunset on ${DEFAULTS.section122Sunset}.`}>
              <div className="flex gap-2">
                <PillBtn active={section122Mode === "auto"} onClick={() => setSection122Mode("auto")}>Auto</PillBtn>
                <PillBtn active={section122Mode === "on"}   onClick={() => setSection122Mode("on")}>On</PillBtn>
                <PillBtn active={section122Mode === "off"}  onClick={() => setSection122Mode("off")}>Off</PillBtn>
              </div>
            </Field>
          </div>
        </Card>

        {/* Save & export */}
        <Card title="Save & export">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => saveQuote({ asNew: false })}
              disabled={!canSave || saving}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >{loadedQuoteId ? "Update quote" : "Save quote"}</button>
            {loadedQuoteId && (
              <button
                onClick={() => saveQuote({ asNew: true })}
                disabled={!canSave || saving}
                className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
              >Save as new</button>
            )}
            <button
              onClick={() => exportExpressShipPDF({
                form: {
                  quoteRef: quoteRef || (product ? `EXP ${new Date().toISOString().slice(0, 10)} — ${product.sku}` : ""),
                  product,
                  exFactoryInrPerUnit: Number(exFactoryInrPerUnit) || 0,
                  originPostcode,
                },
                result,
              })}
              disabled={!canSave}
              className="px-4 py-2 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium hover:bg-black dark:hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
              title="Opens a print-ready view; pick 'Save as PDF' in the browser dialog."
            >Export PDF</button>
            {saveStatus === "success" && <span className="self-center text-xs text-green-600">Saved.</span>}
            {saveStatus === "success_update" && <span className="self-center text-xs text-green-600">Updated.</span>}
            {saveStatus === "success_new" && <span className="self-center text-xs text-green-600">Saved as new.</span>}
            {saveStatus === "error" && <span className="self-center text-xs text-red-600">Save failed — check console.</span>}
          </div>
        </Card>
      </div>

      {/* ---------------- RESULTS ---------------- */}
      <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        {!product && (
          <Card>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Pick a product to see the landed-price breakdown.
            </p>
          </Card>
        )}

        {result?.error && (
          <Card title="Calculation error">
            <p className="text-sm text-red-600 dark:text-red-400">{result.error}</p>
          </Card>
        )}

        {result && !result.error && (
          <>
            <Card title="Per-unit landed">
              <div className="text-3xl font-bold text-gray-900 dark:text-white">
                {usd(result.pricing.perUnitSellingUsd, 4)}
              </div>
              <div className="text-xs text-gray-500 mt-1 dark:text-gray-400">
                Selling · {inr(result.pricing.perUnitSellingInr, 2)} · {result.pricing.marginPct}% margin
              </div>
              <div className="text-sm text-gray-700 mt-2 dark:text-gray-300">
                Landed: {usd(result.pricing.perUnitLandedUsd, 4)} · {inr(result.pricing.perUnitLandedInr, 2)}
              </div>
            </Card>

            <Card title="Breakdown (total)">
              <table className="w-full">
                <tbody>
                  <SectionHeader label="Cost components (USD)" />
                  <Row label="Product (FOB)"      value={usd(result.pricing.productUsd)} />
                  <Row label="DHL freight"        value={usd(result.pricing.freightUsd)} sub={result.freight.billedOnKg ? `${num(result.freight.billedOnKg)} kg billed` : null} />
                  <Row label="Duty"               value={usd(result.pricing.dutyUsd)} sub={`MFN ${(result.duty.mfnPct*100).toFixed(2)}%${result.duty.section301Pct ? ` + 301 ${(result.duty.section301Pct*100).toFixed(2)}%` : ""}${result.duty.section122Applied ? ` + 122 ${(result.duty.section122Pct*100).toFixed(0)}%` : ""}`} />
                  <Row label="MPF"                value={usd(result.pricing.mpfUsd)} sub={result.duty.mpfFloored ? "min floor" : result.duty.mpfCapped ? "max cap" : null} />
                  <Row label="Landed total"       value={usd(result.pricing.totalLandedUsd)} highlight />
                  <Row label={`Margin (${result.pricing.marginPct}%)`} value={usd(result.pricing.marginUsd)} />
                  <Row label="Selling total"      value={usd(result.pricing.totalSellingUsd)} highlight />
                  <SectionHeader label="In INR" />
                  <Row label="Landed total ₹"     value={inr(result.pricing.totalLandedInr)} />
                  <Row label="Selling total ₹"    value={inr(result.pricing.totalSellingInr)} />
                </tbody>
              </table>
            </Card>

            <Card title="Shipment specs">
              <table className="w-full">
                <tbody>
                  <Row label="Cartons"            value={num(result.shipmentSpecs.cartons, 0)} />
                  <Row label="Pallets"            value={num(result.shipmentSpecs.pallets, 0)} sub={`${result.shipmentSpecs.cartonsPerPallet} per pallet · ${result.shipmentSpecs.perLayer} × ${result.shipmentSpecs.layersPerPallet}`} />
                  <Row label="Pieces"             value={num(result.shipmentSpecs.qtyPcs, 0)} sub={result.shipmentSpecs.derivedFromPallets ? "derived from pallets" : null} />
                  <Row label="Actual weight"      value={`${num(result.shipmentSpecs.actualWeightKg)} kg`} />
                  <Row label="Dim weight"         value={`${num(result.shipmentSpecs.dimWeightKg)} kg`} sub={`pallet ${result.shipmentSpecs.palletFootprintCm.L}×${result.shipmentSpecs.palletFootprintCm.W} cm × ${num(result.shipmentSpecs.palletTotalHeightCm, 0)} cm`} />
                  <Row label="Chargeable"         value={`${num(result.shipmentSpecs.chargeableKg)} kg`} highlight />
                  <Row label="Cargo CBM"          value={num(result.shipmentSpecs.cargoCBM, 3)} />
                </tbody>
              </table>
            </Card>

            {result.warnings?.length > 0 && (
              <Card title="Warnings">
                <ul className="space-y-1.5">
                  {result.warnings.map((w, i) => (
                    <li key={i} className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">· {w}</li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
