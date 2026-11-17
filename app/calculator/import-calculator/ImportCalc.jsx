"use client";
import { useEffect, useMemo, useState } from "react";
import { Card, Field, inputCls, PillBtn, Row, SectionHeader } from "@/app/calculator/_components/ui";
import {
  ALLOC_BASES,
  calcImport,
  cartonMetrics,
  CURRENCIES,
  DEFAULTS,
  getAllocBasis,
  getShipmentType,
  SHIPMENT_TYPES,
} from "@/lib/factoryos/import-calc";

const inr = (n, d = 2) =>
  Number.isFinite(n)
    ? "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d })
    : "—";

const num = (n, d = 2) =>
  Number.isFinite(n) ? n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";

const cbm = (n, d = 4) => (Number.isFinite(n) && n > 0 ? n.toFixed(d) : "—");
const kg = (n) =>
  Number.isFinite(n) && n > 0 ? n.toLocaleString("en-IN", { maximumFractionDigits: 0 }) + " kg" : "—";

// Carton spec travels with every line: ocean freight is bought by volume, so a
// line without its carton dims can't carry its own share of it.
const blankItem = () => ({
  name: "",
  qty: "",
  fobUnit: "",
  marginPctOverride: "",
  cartonL: "",
  cartonW: "",
  cartonH: "",
  pcsPerCtn: "",
  kgPerCtn: "",
  cbmPerCtnStated: "",
});

const CARTON_KEYS = ["cartonL", "cartonW", "cartonH", "pcsPerCtn", "kgPerCtn", "cbmPerCtnStated"];

export default function ImportCalc() {
  const [vendors, setVendors] = useState([]);
  const [vendorsState, setVendorsState] = useState("loading"); // "loading" | "ready" | "error"
  const [vendorId, setVendorId] = useState("");

  useEffect(() => {
    let cancelled = false;
    setVendorsState("loading");
    fetch("/api/factoryos/vendors?type=" + encodeURIComponent("Overseas Supplier") + "&activeOnly=1")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
      .then((j) => {
        if (cancelled) return;
        setVendors(Array.isArray(j.vendors) ? j.vendors : []);
        setVendorsState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setVendorsState("error");
      });
    return () => { cancelled = true; };
  }, []);

  const vendor = vendors.find((v) => v.id === vendorId) || null;

  // Saved quotes — same UX as PP / Box / Cup calculators.
  const [pastQuotes, setPastQuotes] = useState([]);
  const [loadedQuoteId, setLoadedQuoteId] = useState("");
  const [quoteRef, setQuoteRef] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // null | "success" | "success_new" | "success_update" | "error"

  const [shipmentType, setShipmentType] = useState("40ft_hc");
  const [currency, setCurrency] = useState("USD");
  const [fxRate, setFxRate] = useState(String(DEFAULTS.fxRate));
  const [dutyPct, setDutyPct] = useState(String(DEFAULTS.dutyPct));
  const [marginPct, setMarginPct] = useState(String(DEFAULTS.marginPct));
  const [outputGstPct, setOutputGstPct] = useState(String(DEFAULTS.outputGstPct));
  const [allocBasis, setAllocBasis] = useState(DEFAULTS.allocBasis);

  const [freightCurrency, setFreightCurrency] = useState("INR");
  const [freight, setFreight] = useState({ amount: "", mode: "total" });
  // LCL helper: rate (per CBM, in freightCurrency) × total CBM → fills freight amount.
  const [lclRate, setLclRate] = useState("");
  const [lclCbm, setLclCbm] = useState("");
  const [inland, setInland] = useState({ amount: "", mode: "total" });
  const [unofficial, setUnofficial] = useState({ amount: "", mode: "total" });
  const [handling, setHandling] = useState({ amount: "", mode: "total" });

  const [items, setItems] = useState([
    { ...blankItem(), name: "Cups" },
    { ...blankItem(), name: "Lids" },
  ]);

  // ----- Saved-quote load / save helpers -----
  async function refreshQuotes() {
    try {
      const res = await fetch("/api/calc/import-quotes");
      if (!res.ok) return;
      const list = await res.json();
      setPastQuotes(Array.isArray(list) ? list : []);
    } catch {}
  }

  function loadQuoteFromList(id, list) {
    const q = list.find((x) => x.id === id);
    if (!q) return;
    setLoadedQuoteId(id);
    setQuoteRef(q.quoteRef || "");
    if (q.vendorId) setVendorId(q.vendorId);
    if (q.shipmentType) setShipmentType(q.shipmentType);
    if (q.fobCurrency) setCurrency(q.fobCurrency);
    if (q.fxRate != null) setFxRate(String(q.fxRate));
    if (q.freightCurrency) setFreightCurrency(q.freightCurrency);
    if (q.dutyPct != null) setDutyPct(String(q.dutyPct));
    if (q.marginPct != null) setMarginPct(String(q.marginPct));
    if (q.outputGstPct != null) setOutputGstPct(String(q.outputGstPct));
    if (q.allocBasis) setAllocBasis(q.allocBasis);
    setFreight({
      amount: q.freightAmount != null ? String(q.freightAmount) : "",
      mode: q.freightMode || "total",
      basis: q.freightBasis || "",
    });
    setInland({ amount: q.inlandAmount != null ? String(q.inlandAmount) : "", mode: q.inlandMode || "total" });
    setUnofficial({ amount: q.unofficialAmount != null ? String(q.unofficialAmount) : "", mode: q.unofficialMode || "total" });
    setHandling({ amount: q.handlingAmount != null ? String(q.handlingAmount) : "", mode: q.handlingMode || "total" });
    setLclRate(q.lclRate != null ? String(q.lclRate) : "");
    setLclCbm(q.lclCbm != null ? String(q.lclCbm) : "");
    if (Array.isArray(q.items) && q.items.length > 0) {
      setItems(
        q.items.map((it) => ({
          ...blankItem(),
          name: it.name || "",
          qty: it.qty != null ? String(it.qty) : "",
          fobUnit: it.fobUnit != null ? String(it.fobUnit) : "",
          marginPctOverride: it.marginPctOverride != null ? String(it.marginPctOverride) : "",
          // Quotes saved before the carton model existed simply have no carton
          // keys — they stay blank and the calc falls back to a FOB-value split.
          ...Object.fromEntries(
            CARTON_KEYS.map((k) => {
              // `unitsPerCarton` is an alias in a few early saved payloads.
              const v = k === "pcsPerCtn" ? (it.pcsPerCtn ?? it.unitsPerCarton) : it[k];
              return [k, v != null && v !== "" ? String(v) : ""];
            }),
          ),
        })),
      );
    }
    setSaveStatus(null);
  }

  function loadQuote(id) {
    setLoadedQuoteId(id);
    setSaveStatus(null);
    if (!id) {
      // Cleared — leave existing state alone (don't wipe what the user is mid-typing).
      return;
    }
    loadQuoteFromList(id, pastQuotes);
  }

  useEffect(() => {
    refreshQuotes();
  }, []);

  const result = useMemo(
    () =>
      calcImport({
        fxRate,
        currency,
        dutyPct,
        marginPct,
        outputGstPct,
        allocBasis,
        shipmentType,
        freightCurrency,
        freight,
        inland,
        unofficial,
        handling,
        items,
      }),
    [fxRate, currency, dutyPct, marginPct, outputGstPct, allocBasis, shipmentType, freightCurrency, freight, inland, unofficial, handling, items],
  );

  // LCL is billed on chargeable W/M — the greater of total CBM and total metric
  // tons. Once the lines carry carton specs we know that figure, so the helper
  // derives it and the manual box is only an override.
  const autoWM = result.shipment.chargeableUnits;
  const effectiveWM = Number(lclCbm) > 0 ? Number(lclCbm) : autoWM;

  // Mirror rate × W/M into the freight total. Only fires when both are known so
  // it never clobbers a manually-entered freight figure.
  useEffect(() => {
    if (shipmentType !== "lcl") return;
    const rate = Number(lclRate);
    if (rate > 0 && effectiveWM > 0) {
      const total = (rate * effectiveWM).toFixed(2);
      setFreight((f) => (f.mode === "total" && f.amount === total ? f : { ...f, mode: "total", amount: total }));
    }
  }, [shipmentType, lclRate, effectiveWM]);

  async function saveQuote({ asNew }) {
    setSaving(true);
    setSaveStatus(null);
    const today = new Date().toISOString().split("T")[0];
    const fallbackRef = `IMP ${today}${vendor?.name ? ` — ${vendor.name}` : ""}`;
    const payload = {
      quoteRef: quoteRef || fallbackRef,
      vendorId: vendorId || "",
      vendorName: vendor?.name || "",
      shipmentType,
      fobCurrency: currency,
      fxRate: Number(fxRate) || 0,
      freightCurrency,
      dutyPct: Number(dutyPct) || 0,
      marginPct: Number(marginPct) || 0,
      outputGstPct: Number(outputGstPct) || 0,
      allocBasis,
      freightAmount: Number(freight.amount) || 0,
      freightMode: freight.mode,
      freightBasis: freight.basis || "",
      inlandAmount: Number(inland.amount) || 0,
      inlandMode: inland.mode,
      unofficialAmount: Number(unofficial.amount) || 0,
      unofficialMode: unofficial.mode,
      handlingAmount: Number(handling.amount) || 0,
      handlingMode: handling.mode,
      lclRate: Number(lclRate) || 0,
      lclCbm: Number(lclCbm) || 0,
      items: items.map((it) => ({
        name: it.name || "",
        qty: Number(it.qty) || 0,
        fobUnit: Number(it.fobUnit) || 0,
        marginPctOverride: it.marginPctOverride === "" || it.marginPctOverride == null ? null : Number(it.marginPctOverride),
        // Blank carton fields persist as null, not 0, so a reloaded quote can
        // tell "not measured" apart from "measured as zero".
        ...Object.fromEntries(
          CARTON_KEYS.map((k) => [k, it[k] === "" || it[k] == null ? null : Number(it[k])]),
        ),
      })),
      itemsCount: items.filter((i) => Number(i.qty) > 0).length,
      totalLandedINR: result.totals.landed || 0,
      totalFinalSellingINR: result.totals.finalSelling || 0,
      totalCbm: result.shipment.cbm || 0,
      totalWeightKg: result.shipment.weightKg || 0,
      totalCartons: result.shipment.cartons || 0,
    };
    const method = loadedQuoteId && !asNew ? "PATCH" : "POST";
    if (method === "PATCH") payload.id = loadedQuoteId;

    try {
      const res = await fetch("/api/calc/import-quotes", {
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

  const symbol = CURRENCIES.find((c) => c.id === currency)?.symbol || "";
  const hasInput = items.some((it) => Number(it.qty) > 0 && Number(it.fobUnit) > 0);

  const setItem = (i, patch) =>
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const addItem = () => setItems((arr) => [...arr, blankItem()]);
  const removeItem = (i) => setItems((arr) => (arr.length > 1 ? arr.filter((_, idx) => idx !== i) : arr));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* ---------------- INPUTS ---------------- */}
      <div className="space-y-4">
        <Card
          title="Load a past quote"
          right={loadedQuoteId && (
            <button
              onClick={() => loadQuote("")}
              className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Clear
            </button>
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
                {q.vendorName && !((q.quoteRef || "").includes(q.vendorName)) ? ` — ${q.vendorName}` : ""}
                {q.date ? ` · ${q.date}` : ""}
              </option>
            ))}
          </select>
          {pastQuotes.length === 0 && (
            <p className="text-xs text-gray-400 mt-2 dark:text-gray-500">
              No saved quotes yet — save one below to start your history.
            </p>
          )}
          {loadedQuoteId && (
            <p className="text-xs text-gray-500 mt-2 dark:text-gray-400">
              Editing <strong>{pastQuotes.find((q) => q.id === loadedQuoteId)?.quoteRef}</strong>.
              After recalculating you can update it or save as new.
            </p>
          )}
          <div className="mt-3">
            <Field label="Quote ref (optional)" hint="Auto-generated if you leave it blank.">
              <input
                type="text"
                className={inputCls}
                value={quoteRef}
                onChange={(e) => setQuoteRef(e.target.value)}
                placeholder="e.g. IMP 2026-05-02 — CCD"
              />
            </Field>
          </div>
        </Card>

        <Card
          title="Vendor"
          right={
            <a
              href="/factoryos/admin/vendors"
              target="_blank"
              rel="noopener"
              className="text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              Manage vendors →
            </a>
          }
        >
          {vendorsState === "loading" ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">Loading vendors…</p>
          ) : vendorsState === "error" ? (
            <p className="text-sm text-red-600 dark:text-red-400">
              Couldn&apos;t load vendors. Make sure you&apos;re signed into FactoryOS.
            </p>
          ) : (
            <Field
              label="Overseas supplier"
              hint={
                vendors.length === 0
                  ? "No vendors with type 'Overseas Supplier' yet. Add one in the FactoryOS Vendors admin and reload."
                  : "Pulled from the FactoryOS Vendors directory, filtered to Overseas Supplier."
              }
            >
              <select
                className={inputCls}
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                disabled={vendors.length === 0}
              >
                <option value="">— Select supplier —</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
              {vendor && (vendor.contactPerson || vendor.phone || vendor.email) && (
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {[vendor.contactPerson, vendor.phone, vendor.email].filter(Boolean).join(" · ")}
                </p>
              )}
            </Field>
          )}
        </Card>

        <Card title="Shipment">
          <Field label="Shipment type" hint={getShipmentType(shipmentType).capLabel}>
            <div className="flex flex-wrap gap-2">
              {SHIPMENT_TYPES.map((s) => (
                <PillBtn key={s.id} active={shipmentType === s.id} onClick={() => setShipmentType(s.id)}>
                  {s.label}
                </PillBtn>
              ))}
            </div>
          </Field>
        </Card>

        <Card title="Currency & rates">
          <div className="grid grid-cols-2 gap-3">
            <Field label="FOB currency" hint="The currency the supplier quotes you in.">
              <div className="flex gap-2">
                {CURRENCIES.map((c) => (
                  <PillBtn key={c.id} active={currency === c.id} onClick={() => setCurrency(c.id)}>
                    {c.id}
                  </PillBtn>
                ))}
              </div>
            </Field>
            <Field label="Exchange rate (₹ per 1 USD)" hint="Used for any non-INR amount.">
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
          <div className="grid grid-cols-3 gap-3 mt-3">
            <Field label="Import Duty + GST (% of CIF)" hint="Combined BCD + SWS + IGST. Default 38%.">
              <input
                type="number"
                inputMode="decimal"
                className={inputCls}
                value={dutyPct}
                onChange={(e) => setDutyPct(e.target.value)}
                placeholder="38"
              />
            </Field>
            <Field label="Margin %" hint="Default for all lines. Override per-line below.">
              <input
                type="number"
                inputMode="decimal"
                className={inputCls}
                value={marginPct}
                onChange={(e) => setMarginPct(e.target.value)}
                placeholder="5"
              />
            </Field>
            <Field label="Output GST %" hint="GST charged to the customer on selling price.">
              <input
                type="number"
                inputMode="decimal"
                className={inputCls}
                value={outputGstPct}
                onChange={(e) => setOutputGstPct(e.target.value)}
                placeholder="18"
              />
            </Field>
          </div>
        </Card>

        <Card title="Cost allocation">
          <Field
            label="Split shipment-wide costs by"
            hint={getAllocBasis(allocBasis).hint}
          >
            <div className="flex flex-wrap gap-2">
              {ALLOC_BASES.map((b) => (
                <PillBtn key={b.id} active={allocBasis === b.id} onClick={() => setAllocBasis(b.id)}>
                  {b.label}
                </PillBtn>
              ))}
            </div>
          </Field>
          <p className="text-[11px] text-gray-500 mt-2 dark:text-gray-400">
            Freight is bought by volume, not value. Splitting it by FOB share makes cheap bulky
            lines (lids, containers) look cheaper than they can be sold for, and the expensive
            line carries their freight. Volume bases need carton dims + pcs/carton on every line
            — without them the calc falls back to FOB value and says so.
          </p>
          {allocBasis !== "fob" && result.shipment.cartons > 0 && (
            <p className="text-[11px] text-gray-500 mt-2 dark:text-gray-400">
              Chargeable W/M for this shipment:{" "}
              <strong>
                {cbm(result.shipment.chargeableUnits, 3)}{" "}
                {result.shipment.chargeableWinner === "weight" ? "t (weight rules)" : "CBM (volume rules)"}
              </strong>
            </p>
          )}
        </Card>

        <Card title="Items in shipment">
          <div className="space-y-3">
            {items.map((it, i) => (
              <ItemRow
                key={i}
                item={it}
                index={i}
                symbol={symbol}
                currency={currency}
                marginPct={marginPct}
                canRemove={items.length > 1}
                onChange={(patch) => setItem(i, patch)}
                onRemove={() => removeItem(i)}
              />
            ))}
            <button
              type="button"
              onClick={addItem}
              className="px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-md hover:border-gray-300 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-300"
            >
              + Add item
            </button>
          </div>
        </Card>

        <Card title="Shipment costs">
          <div className="space-y-3">
            {shipmentType === "lcl" && (
              <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3 dark:bg-blue-900/20 dark:border-blue-900/40">
                <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-2">LCL freight helper</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-1 dark:text-gray-400">
                      Rate ({CURRENCIES.find((c) => c.id === freightCurrency)?.symbol}/CBM)
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      className={inputCls}
                      value={lclRate}
                      onChange={(e) => setLclRate(e.target.value)}
                      placeholder="e.g. 80"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-1 dark:text-gray-400">
                      Chargeable W/M {autoWM > 0 && <span className="font-normal text-gray-400">(auto)</span>}
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      className={inputCls}
                      value={lclCbm}
                      onChange={(e) => setLclCbm(e.target.value)}
                      placeholder={autoWM > 0 ? cbm(autoWM, 3) : "e.g. 12.5"}
                    />
                  </div>
                </div>
                <p className="text-[11px] text-gray-500 mt-1.5 dark:text-gray-400">
                  {autoWM > 0 ? (
                    <>
                      Computed from your carton specs:{" "}
                      <strong>{cbm(result.shipment.cbm, 3)} CBM</strong> vs{" "}
                      <strong>{(result.shipment.tonnes || 0).toFixed(3)} t</strong> →{" "}
                      billed on {result.shipment.chargeableWinner === "weight" ? "weight" : "volume"} at{" "}
                      <strong>{cbm(autoWM, 3)}</strong> W/M. Leave the box blank to use it, or
                      type a figure to override with the forwarder&apos;s.
                    </>
                  ) : (
                    "Enter carton specs on the lines above and this fills itself. Auto-fills Ocean Freight as rate × W/M."
                  )}
                </p>
              </div>
            )}
            <ShipmentCostRow
              label="Ocean Freight (China → Port)"
              hint={
                shipmentType === "lcl"
                  ? `Total LCL freight. Use the helper above or enter manually. Split by ${getAllocBasis(freight.basis || allocBasis).label}.`
                  : `Flat ${getShipmentType(shipmentType).label} container freight. Split by ${getAllocBasis(freight.basis || allocBasis).label}.`
              }
              value={freight}
              onChange={setFreight}
              currency={freightCurrency}
              setCurrency={setFreightCurrency}
              currencyToggle
              defaultBasis={allocBasis}
            />
            <ShipmentCostRow
              label="Inland Transport (port → destination)"
              hint="Trucking from the port of clearance to your warehouse / factory."
              value={inland}
              onChange={setInland}
              defaultBasis={allocBasis}
            />
            <ShipmentCostRow
              label="Unofficial Clearance Cost"
              hint="Off-book port clearance / facilitation."
              value={unofficial}
              onChange={setUnofficial}
              defaultBasis={allocBasis}
            />
            <ShipmentCostRow
              label="Handling + Storage + Cargo"
              hint="Port handling, demurrage, CFS, last-mile cargo handling."
              value={handling}
              onChange={setHandling}
              defaultBasis={allocBasis}
            />
          </div>
        </Card>
      </div>

      {/* ---------------- RESULTS ---------------- */}
      <div className="space-y-4">
        {hasInput && result.shipment.warnings.length > 0 && (
          <Card title="Check before you quote">
            <ul className="space-y-2">
              {result.shipment.warnings.map((w, i) => (
                <li key={i} className="text-xs text-gray-600 dark:text-gray-300">
                  {w.kind === "cbm_mismatch" && (
                    <>
                      <span className="text-amber-600 dark:text-amber-400">⚠ CBM mismatch</span> —{" "}
                      <strong>{w.line}</strong>: vendor states {cbm(w.statedCbm)} but{" "}
                      {cbm(w.geomCbm)} is what the dims compute to (
                      {Math.abs(w.variancePct).toFixed(1)}%{" "}
                      {w.variancePct < 0 ? "understated" : "overstated"}). Freight is charged on
                      the measured carton, so the quote uses the geometry. Push back on the spec
                      sheet, or confirm the dims.
                    </>
                  )}
                  {w.kind === "over_cbm" && (
                    <>
                      <span className="text-red-600 dark:text-red-400">✕ Over capacity</span> —{" "}
                      {cbm(w.cbm, 2)} CBM won&apos;t fit a {w.label} ({w.cap} usable CBM). Split
                      the order or move up a container size.
                    </>
                  )}
                  {w.kind === "over_weight" && (
                    <>
                      <span className="text-red-600 dark:text-red-400">✕ Over payload</span> —{" "}
                      {kg(w.kg)} exceeds the {(w.cap / 1000).toFixed(0)} t payload for a {w.label}.
                    </>
                  )}
                  {w.kind === "basis_fallback" && (
                    <>
                      <span className="text-amber-600 dark:text-amber-400">⚠ Fell back to FOB split</span> —{" "}
                      <strong>{w.row}</strong> was set to split by{" "}
                      {getAllocBasis(w.requested).label}, but {w.reason}
                      {w.missingNames.length > 0 && <> on: {w.missingNames.join(", ")}</>}. It is
                      being split by value instead, which under-charges bulky lines.
                    </>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {!hasInput ? (
          <Card title="Per-item landed cost">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Enter quantity and FOB unit price for at least one line to see the breakdown.
            </p>
          </Card>
        ) : (
          result.lines.map((l, i) => (
            <Card key={i} title={l.name || `Item ${i + 1}`} className="overflow-hidden">
              <div className="text-xs text-gray-500 mb-2 dark:text-gray-400">
                {num(l.qty, 0)} units · FOB {symbol}{num(l.fobUnitFx, 2)} / unit
                {l.cartons > 0 && (
                  <>
                    {" · "}
                    {l.cartons.toLocaleString("en-IN")} ctns · {cbm(l.cbmTotal, 3)} CBM
                    {l.weightTotalKg > 0 ? ` · ${kg(l.weightTotalKg)}` : ""}
                  </>
                )}
              </div>
              {l.cartons > 0 && (
                <div className="text-[11px] text-gray-400 mb-2 dark:text-gray-500">
                  Share of shipment — volume {num(l.cbmShare * 100, 1)}%
                  {l.weightShare > 0 ? ` · weight ${num(l.weightShare * 100, 1)}%` : ""} · value{" "}
                  {num(l.fobShare * 100, 1)}%
                </div>
              )}
              <table className="w-full">
                <tbody>
                  <Row label="FOB" value={inr(l.fobUnit)} sub={`${inr(l.fobTotal, 0)} for ${num(l.qty, 0)} ${l.qty === 1 ? "unit" : "units"}`} />
                  <Row
                    label={`Ocean Freight (split by ${getAllocBasis(result.shipment.freightBasis.basis).label})`}
                    value={inr(l.freightUnit)}
                    sub={inr(l.freightTotal, 0)}
                  />
                  <SectionHeader label="CIF (assessable value)" />
                  <Row label="CIF / unit" value={inr(l.cifUnit)} sub={inr(l.cifTotal, 0)} />
                  <Row label={`Import Duty + GST (${num(l.dutyPct, 0)}% of CIF)`} value={inr(l.dutyUnit)} sub={inr(l.dutyTotal, 0)} />
                  <Row label="Inland Transport" value={inr(l.inlandUnit)} sub={inr(l.inlandTotal, 0)} />
                  <Row label="Unofficial Clearance" value={inr(l.unofficialUnit)} sub={inr(l.unofficialTotal, 0)} />
                  <Row label="Handling + Storage + Cargo" value={inr(l.handlingUnit)} sub={inr(l.handlingTotal, 0)} />
                  <Row label="Total Landed Cost (Ex-GST)" value={inr(l.landedUnit)} sub={inr(l.landedTotal, 0)} highlight />
                  <SectionHeader label={`Margin @ ${num(l.marginPct, 1)}%`} />
                  <Row label="Margin Added" value={inr(l.marginUnit)} sub={inr(l.marginTotal, 0)} />
                  <Row label="Selling Price (Ex-GST)" value={inr(l.sellingExGstUnit)} sub={inr(l.sellingExGstTotal, 0)} />
                  <Row label={`GST @ ${num(l.outputGstPct, 0)}%`} value={inr(l.outputGstUnit)} sub={inr(l.outputGstTotal, 0)} />
                  <Row label="Final Selling Price (Incl. GST)" value={inr(l.finalSellingUnit)} sub={inr(l.finalSellingTotal, 0)} highlight />
                </tbody>
              </table>
            </Card>
          ))
        )}

        {hasInput && (
          <Card title="Shipment totals">
            <p className="text-xs text-gray-500 mb-2 dark:text-gray-400">
              {vendor ? `${vendor.name} · ` : ""}
              {getShipmentType(shipmentType).label}
              {result.shipment.cbm > 0 ? ` · ${cbm(result.shipment.cbm, 3)} CBM` : ""}
              {result.shipment.cartons > 0 ? ` · ${result.shipment.cartons.toLocaleString("en-IN")} ctns` : ""}
            </p>
            <table className="w-full">
              <tbody>
                {result.shipment.cartons > 0 && (
                  <>
                    <SectionHeader label="Volume & weight" />
                    <Row
                      label="Total Cartons"
                      value={result.shipment.cartons.toLocaleString("en-IN")}
                    />
                    <Row
                      label="Total Volume"
                      value={`${cbm(result.shipment.cbm, 3)} CBM`}
                      sub={
                        result.shipment.capCBM
                          ? `${num(result.shipment.cbmUtilPct, 0)}% of ${result.shipment.capCBM} usable CBM`
                          : undefined
                      }
                    />
                    <Row
                      label="Total Gross Weight"
                      value={kg(result.shipment.weightKg)}
                      sub={
                        result.shipment.capKg
                          ? `${num(result.shipment.weightUtilPct, 0)}% of ${(result.shipment.capKg / 1000).toFixed(0)} t payload`
                          : undefined
                      }
                    />
                    <Row
                      label="Chargeable W/M"
                      value={cbm(result.shipment.chargeableUnits, 3)}
                      sub={result.shipment.chargeableWinner === "weight" ? "weight rules" : "volume rules"}
                    />
                    <SectionHeader label="Cost" />
                  </>
                )}
                <Row label="Total FOB" value={inr(result.totals.fob, 0)} />
                <Row label="Total Ocean Freight" value={inr(result.totals.freight, 0)} />
                <Row label="Total CIF" value={inr(result.totals.cif, 0)} />
                <Row label="Total Import Duty + GST" value={inr(result.totals.duty, 0)} />
                <Row label="Total Inland Transport" value={inr(result.totals.inland, 0)} />
                <Row label="Total Unofficial Clearance" value={inr(result.totals.unofficial, 0)} />
                <Row label="Total Handling + Storage" value={inr(result.totals.handling, 0)} />
                <Row label="Total Landed Cost (Ex-GST)" value={inr(result.totals.landed, 0)} highlight />
                <Row label="Total Margin Added" value={inr(result.totals.margin, 0)} />
                <Row label="Total Selling Price (Ex-GST)" value={inr(result.totals.sellingExGst, 0)} />
                <Row label="Total Output GST" value={inr(result.totals.outputGst, 0)} />
                <Row label="Total Final Selling Price (Incl. GST)" value={inr(result.totals.finalSelling, 0)} highlight />
              </tbody>
            </table>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {loadedQuoteId ? (
                <>
                  <button
                    type="button"
                    onClick={() => saveQuote({ asNew: false })}
                    disabled={saving}
                    className="px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Update quote"}
                  </button>
                  <button
                    type="button"
                    onClick={() => saveQuote({ asNew: true })}
                    disabled={saving}
                    className="px-3 py-2 text-sm font-medium bg-white text-gray-700 border border-gray-200 rounded-lg hover:border-gray-300 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-700 disabled:opacity-50"
                  >
                    Save as new
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => saveQuote({ asNew: false })}
                  disabled={saving}
                  className="px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save quote"}
                </button>
              )}
              {saveStatus === "success" && <span className="text-xs text-green-600 dark:text-green-400">Saved.</span>}
              {saveStatus === "success_new" && <span className="text-xs text-green-600 dark:text-green-400">Saved as new.</span>}
              {saveStatus === "success_update" && <span className="text-xs text-green-600 dark:text-green-400">Updated.</span>}
              {saveStatus === "error" && <span className="text-xs text-red-600 dark:text-red-400">Save failed — try again.</span>}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

// One shipment line: commercial terms on top, outer-carton spec underneath.
// Carton dims are in CM because that is the unit every Chinese spec sheet uses.
function ItemRow({ item, index, symbol, currency, marginPct, canRemove, onChange, onRemove }) {
  const m = cartonMetrics(item);
  const lbl = "block text-[11px] font-medium text-gray-500 mb-1 dark:text-gray-400";

  return (
    <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
      <div className="grid grid-cols-12 gap-2 items-end">
        <div className="col-span-4">
          <label className={lbl}>Item</label>
          <input
            className={inputCls}
            value={item.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="e.g. Cups"
          />
        </div>
        <div className="col-span-2">
          <label className={lbl}>Qty</label>
          <input
            type="number"
            inputMode="numeric"
            className={inputCls}
            value={item.qty}
            onChange={(e) => onChange({ qty: e.target.value })}
            placeholder="0"
          />
        </div>
        <div className="col-span-3">
          <label className={lbl}>FOB / unit ({symbol || currency})</label>
          <input
            type="number"
            inputMode="decimal"
            className={inputCls}
            value={item.fobUnit}
            onChange={(e) => onChange({ fobUnit: e.target.value })}
            placeholder="0.00"
          />
        </div>
        <div className="col-span-2">
          <label className={lbl}>Margin %</label>
          <input
            type="number"
            inputMode="decimal"
            className={inputCls}
            value={item.marginPctOverride}
            onChange={(e) => onChange({ marginPctOverride: e.target.value })}
            placeholder={String(marginPct)}
          />
        </div>
        <div className="col-span-1 flex justify-end">
          <button
            type="button"
            onClick={onRemove}
            disabled={!canRemove}
            className="text-gray-400 hover:text-red-600 disabled:opacity-30 px-2 py-2 text-sm"
            title="Remove line"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-dashed border-gray-200 dark:border-gray-700">
        <p className="text-[11px] font-medium text-gray-500 mb-2 dark:text-gray-400">
          Outer carton <span className="font-normal text-gray-400 dark:text-gray-500">— drives the freight split</span>
        </p>
        {/* Six fields never fit a phone: 3 across on mobile, all 6 from sm up. */}
        <div className="grid grid-cols-3 gap-2 items-end sm:grid-cols-6">
          <div>
            <label className={lbl}>L (cm)</label>
            <input
              type="number"
              inputMode="decimal"
              className={inputCls}
              value={item.cartonL}
              onChange={(e) => onChange({ cartonL: e.target.value })}
              placeholder="48"
            />
          </div>
          <div>
            <label className={lbl}>W (cm)</label>
            <input
              type="number"
              inputMode="decimal"
              className={inputCls}
              value={item.cartonW}
              onChange={(e) => onChange({ cartonW: e.target.value })}
              placeholder="38.5"
            />
          </div>
          <div>
            <label className={lbl}>H (cm)</label>
            <input
              type="number"
              inputMode="decimal"
              className={inputCls}
              value={item.cartonH}
              onChange={(e) => onChange({ cartonH: e.target.value })}
              placeholder="40.5"
            />
          </div>
          <div>
            <label className={lbl}>pcs / ctn</label>
            <input
              type="number"
              inputMode="numeric"
              className={inputCls}
              value={item.pcsPerCtn}
              onChange={(e) => onChange({ pcsPerCtn: e.target.value })}
              placeholder="1000"
            />
          </div>
          <div>
            <label className={lbl}>kg / ctn</label>
            <input
              type="number"
              inputMode="decimal"
              className={inputCls}
              value={item.kgPerCtn}
              onChange={(e) => onChange({ kgPerCtn: e.target.value })}
              placeholder="11.0"
            />
          </div>
          <div>
            <label className={lbl}>CBM stated</label>
            <input
              type="number"
              inputMode="decimal"
              className={inputCls}
              value={item.cbmPerCtnStated}
              onChange={(e) => onChange({ cbmPerCtnStated: e.target.value })}
              placeholder="optional"
            />
          </div>
        </div>

        {/* Live readout — what the allocator will actually use for this line. */}
        <div className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
          {m.cbmPerCtn > 0 ? (
            <span>
              <strong className="text-gray-700 dark:text-gray-200">{cbm(m.cbmPerCtn)} CBM/ctn</strong>
              {m.cbmBasis === "geometry" ? " from geometry" : " from vendor figure (no dims entered)"}
              {m.cartons > 0 && (
                <>
                  {" · "}
                  {m.cartons.toLocaleString("en-IN")} ctn{m.cartons === 1 ? "" : "s"}
                  {m.partialCarton && (
                    <span className="text-gray-400 dark:text-gray-500">
                      {" "}(rounded up from {m.cartonsExact.toFixed(2)})
                    </span>
                  )}
                  {" · "}
                  {cbm(m.cbmTotal, 3)} CBM
                  {m.weightTotalKg > 0 ? ` · ${kg(m.weightTotalKg)}` : ""}
                </>
              )}
            </span>
          ) : (
            <span className="text-gray-400 dark:text-gray-500">
              Enter L × W × H and pcs/ctn so this line can carry its own freight.
            </span>
          )}
        </div>

        {m.cbmMismatch && (
          <p className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-400">
            ⚠ Vendor states {cbm(m.cbmPerCtnStated)} CBM — that is{" "}
            {Math.abs(m.cbmVariancePct).toFixed(1)}%{" "}
            {m.cbmVariancePct < 0 ? "under" : "over"} the {cbm(m.cbmPerCtnGeom)} the dims compute to.
            Using the geometry: the forwarder measures cartons, not spec sheets.
          </p>
        )}
      </div>
    </div>
  );
}

function ShipmentCostRow({
  label,
  hint,
  value,
  onChange,
  currency,
  setCurrency,
  currencyToggle,
  defaultBasis,
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</label>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onChange({ ...value, mode: "total" })}
            className={`px-2 py-0.5 text-[10px] rounded ${
              value.mode === "total" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
            }`}
          >
            Total
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...value, mode: "perUnit" })}
            className={`px-2 py-0.5 text-[10px] rounded ${
              value.mode === "perUnit" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
            }`}
          >
            Per unit
          </button>
        </div>
      </div>
      {/* Wraps rather than squeezing: with a currency toggle AND a split
          override this row carries three controls, and the amount must stay
          wide enough to read a seven-figure freight bill. */}
      <div className="flex flex-wrap gap-2">
        <div className="flex-1 min-w-[10rem]">
          <input
            type="number"
            inputMode="decimal"
            className={inputCls}
            value={value.amount}
            onChange={(e) => onChange({ ...value, amount: e.target.value })}
            placeholder={value.mode === "total" ? "Total for shipment" : "Per unit (across all items)"}
          />
        </div>
        {/* Widths live on the wrappers: inputCls already carries w-full, and a
            w-20 alongside it is a coin-flip on Tailwind's class order. */}
        {currencyToggle && (
          <div className="w-20 shrink-0">
            <select className={inputCls} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c.id} value={c.id}>{c.id}</option>
              ))}
            </select>
          </div>
        )}
        {/* Per-row basis override. Blank inherits the shipment-wide choice —
            most rows should, but e.g. an agent fee charged on value can differ. */}
        {value.mode === "total" && (
          <div className="w-44 shrink-0">
            <select
              className={inputCls}
              value={value.basis || ""}
              onChange={(e) => onChange({ ...value, basis: e.target.value })}
              title="How this cost is split across lines"
            >
              <option value="">
                Split: default{defaultBasis ? ` (${getAllocBasis(defaultBasis).label})` : ""}
              </option>
              {ALLOC_BASES.map((b) => (
                <option key={b.id} value={b.id}>Split: {b.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      {hint && <p className="text-[11px] text-gray-400 mt-1 dark:text-gray-500">{hint}</p>}
    </div>
  );
}
