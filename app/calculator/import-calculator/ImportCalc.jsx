"use client";
import { useEffect, useMemo, useState } from "react";
import { Card, Field, inputCls, PillBtn, Row, SectionHeader } from "@/app/calculator/_components/ui";
import { calcImport, CURRENCIES, DEFAULTS, SHIPMENT_TYPES, getShipmentType } from "@/lib/factoryos/import-calc";

const inr = (n, d = 2) =>
  Number.isFinite(n)
    ? "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d })
    : "—";

const num = (n, d = 2) =>
  Number.isFinite(n) ? n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";

const blankItem = () => ({
  name: "",
  qty: "",
  fobUnit: "",
  marginPctOverride: "",
  cartonL: "",
  cartonW: "",
  cartonH: "",
  unitsPerCarton: "",
});

// CBM = (L × W × H in cm × number of cartons) / 1,000,000
// Number of cartons = qty / unitsPerCarton (allows fractional — supplier consolidates).
function itemCBM(it) {
  const qty = Number(it.qty);
  const cL = Number(it.cartonL);
  const cW = Number(it.cartonW);
  const cH = Number(it.cartonH);
  const upc = Number(it.unitsPerCarton);
  if (!(qty > 0 && cL > 0 && cW > 0 && cH > 0 && upc > 0)) return 0;
  return (qty / upc) * (cL * cW * cH) / 1_000_000;
}

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

  // Sum CBM across all items that have carton dimensions filled in. Used to
  // auto-populate the LCL Total CBM field below.
  const totalCBMFromItems = useMemo(
    () => items.reduce((sum, it) => sum + itemCBM(it), 0),
    [items],
  );

  // Auto-populate the LCL Total CBM field as soon as items have carton
  // dimensions. The user can still type to override; the next dimension
  // change will re-overwrite, which is the same trade-off as the LCL rate ×
  // CBM helper below. Suppress the auto-fill when the items contribute zero
  // CBM (so a partially-filled form doesn't keep blanking a manual entry).
  useEffect(() => {
    if (shipmentType !== "lcl") return;
    if (totalCBMFromItems <= 0) return;
    const next = totalCBMFromItems.toFixed(2);
    setLclCbm((prev) => (prev === next ? prev : next));
  }, [shipmentType, totalCBMFromItems]);

  // LCL helper: when user enters rate × CBM, mirror the product into the freight
  // total amount. We only auto-fill when both are present so we don't clobber
  // a manually-entered freight figure.
  useEffect(() => {
    if (shipmentType !== "lcl") return;
    const rate = Number(lclRate);
    const cbm = Number(lclCbm);
    if (rate > 0 && cbm > 0) {
      const total = (rate * cbm).toFixed(2);
      setFreight((f) => (f.mode === "total" && f.amount === total ? f : { mode: "total", amount: total }));
    }
  }, [shipmentType, lclRate, lclCbm]);

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
    setFreight({ amount: q.freightAmount != null ? String(q.freightAmount) : "", mode: q.freightMode || "total" });
    setInland({ amount: q.inlandAmount != null ? String(q.inlandAmount) : "", mode: q.inlandMode || "total" });
    setUnofficial({ amount: q.unofficialAmount != null ? String(q.unofficialAmount) : "", mode: q.unofficialMode || "total" });
    setHandling({ amount: q.handlingAmount != null ? String(q.handlingAmount) : "", mode: q.handlingMode || "total" });
    setLclRate(q.lclRate != null ? String(q.lclRate) : "");
    setLclCbm(q.lclCbm != null ? String(q.lclCbm) : "");
    if (Array.isArray(q.items) && q.items.length > 0) {
      setItems(
        q.items.map((it) => ({
          name: it.name || "",
          qty: it.qty != null ? String(it.qty) : "",
          fobUnit: it.fobUnit != null ? String(it.fobUnit) : "",
          marginPctOverride: it.marginPctOverride != null ? String(it.marginPctOverride) : "",
          cartonL: it.cartonL != null ? String(it.cartonL) : "",
          cartonW: it.cartonW != null ? String(it.cartonW) : "",
          cartonH: it.cartonH != null ? String(it.cartonH) : "",
          unitsPerCarton: it.unitsPerCarton != null ? String(it.unitsPerCarton) : "",
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
        freightCurrency,
        freight,
        inland,
        unofficial,
        handling,
        items,
      }),
    [fxRate, currency, dutyPct, marginPct, outputGstPct, freightCurrency, freight, inland, unofficial, handling, items],
  );

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
      freightAmount: Number(freight.amount) || 0,
      freightMode: freight.mode,
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
        cartonL: Number(it.cartonL) || 0,
        cartonW: Number(it.cartonW) || 0,
        cartonH: Number(it.cartonH) || 0,
        unitsPerCarton: Number(it.unitsPerCarton) || 0,
      })),
      itemsCount: items.filter((i) => Number(i.qty) > 0).length,
      totalLandedINR: result.totals.landed || 0,
      totalFinalSellingINR: result.totals.finalSelling || 0,
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

        <Card title="Items in shipment">
          <div className="space-y-3">
            {items.map((it, i) => {
              const cbm = itemCBM(it);
              return (
                <div
                  key={i}
                  className="rounded-lg border border-gray-100 dark:border-gray-800 p-3 space-y-2"
                >
                  <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-4">
                      <label className="block text-xs font-medium text-gray-500 mb-1 dark:text-gray-400">Item</label>
                      <input
                        className={inputCls}
                        value={it.name}
                        onChange={(e) => setItem(i, { name: e.target.value })}
                        placeholder="e.g. Cups"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-500 mb-1 dark:text-gray-400">Qty</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        className={inputCls}
                        value={it.qty}
                        onChange={(e) => setItem(i, { qty: e.target.value })}
                        placeholder="0"
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-xs font-medium text-gray-500 mb-1 dark:text-gray-400">
                        FOB / unit ({symbol || currency})
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        className={inputCls}
                        value={it.fobUnit}
                        onChange={(e) => setItem(i, { fobUnit: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-500 mb-1 dark:text-gray-400">Margin %</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        className={inputCls}
                        value={it.marginPctOverride}
                        onChange={(e) => setItem(i, { marginPctOverride: e.target.value })}
                        placeholder={String(marginPct)}
                      />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeItem(i)}
                        disabled={items.length <= 1}
                        className="text-gray-400 hover:text-red-600 disabled:opacity-30 px-2 py-2 text-sm"
                        title="Remove line"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  {/* Carton dimensions — feed the LCL Total CBM auto-fill. Optional;
                      leave blank if you don't have carton specs. */}
                  <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-3">
                      <label className="block text-xs font-medium text-gray-500 mb-1 dark:text-gray-400">Carton L (cm)</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        className={inputCls}
                        value={it.cartonL}
                        onChange={(e) => setItem(i, { cartonL: e.target.value })}
                        placeholder="0"
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-xs font-medium text-gray-500 mb-1 dark:text-gray-400">Carton W (cm)</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        className={inputCls}
                        value={it.cartonW}
                        onChange={(e) => setItem(i, { cartonW: e.target.value })}
                        placeholder="0"
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-xs font-medium text-gray-500 mb-1 dark:text-gray-400">Carton H (cm)</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        className={inputCls}
                        value={it.cartonH}
                        onChange={(e) => setItem(i, { cartonH: e.target.value })}
                        placeholder="0"
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-xs font-medium text-gray-500 mb-1 dark:text-gray-400">Units / carton</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        className={inputCls}
                        value={it.unitsPerCarton}
                        onChange={(e) => setItem(i, { unitsPerCarton: e.target.value })}
                        placeholder="0"
                      />
                    </div>
                  </div>
                  {cbm > 0 && (
                    <p className="text-[11px] text-gray-400 dark:text-gray-500">
                      ≈ {cbm.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CBM for this line
                    </p>
                  )}
                </div>
              );
            })}
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
                      Total CBM
                      {totalCBMFromItems > 0 && (
                        <span className="ml-1 text-[10px] font-normal text-blue-600 dark:text-blue-400">(auto)</span>
                      )}
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      className={inputCls}
                      value={lclCbm}
                      onChange={(e) => setLclCbm(e.target.value)}
                      placeholder="e.g. 12.5"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-gray-500 mt-1.5 dark:text-gray-400">
                  {totalCBMFromItems > 0
                    ? "Total CBM is summed from per-item carton dimensions; you can still type to override."
                    : "Auto-fills the Ocean Freight total below as rate × CBM."}
                </p>
              </div>
            )}
            <ShipmentCostRow
              label="Ocean Freight (China → Port)"
              hint={
                shipmentType === "lcl"
                  ? "Total LCL freight. Use the helper above or enter manually. Allocated by FOB share."
                  : `Flat ${getShipmentType(shipmentType).label} container freight. Allocated by FOB share.`
              }
              value={freight}
              onChange={setFreight}
              currency={freightCurrency}
              setCurrency={setFreightCurrency}
              currencyToggle
            />
            <ShipmentCostRow
              label="Inland Transport (port → destination)"
              hint="Trucking from the port of clearance to your warehouse / factory."
              value={inland}
              onChange={setInland}
            />
            <ShipmentCostRow
              label="Unofficial Clearance Cost"
              hint="Off-book port clearance / facilitation."
              value={unofficial}
              onChange={setUnofficial}
            />
            <ShipmentCostRow
              label="Handling + Storage + Cargo"
              hint="Port handling, demurrage, CFS, last-mile cargo handling."
              value={handling}
              onChange={setHandling}
            />
          </div>
        </Card>
      </div>

      {/* ---------------- RESULTS ---------------- */}
      <div className="space-y-4">
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
              </div>
              <table className="w-full">
                <tbody>
                  <Row label="FOB" value={inr(l.fobUnit)} sub={`${inr(l.fobTotal, 0)} for ${num(l.qty, 0)} ${l.qty === 1 ? "unit" : "units"}`} />
                  <Row label="Ocean Freight" value={inr(l.freightUnit)} sub={inr(l.freightTotal, 0)} />
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
              {shipmentType === "lcl" && Number(lclCbm) > 0 ? ` · ${lclCbm} CBM` : ""}
            </p>
            <table className="w-full">
              <tbody>
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

function ShipmentCostRow({ label, hint, value, onChange, currency, setCurrency, currencyToggle }) {
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
      <div className="flex gap-2">
        {/* min-w-0 lets the input shrink past its intrinsic content size in
            a flex row, otherwise the number-spinner forces it down to ~24px
            wide when the sibling select is present. */}
        <input
          type="number"
          inputMode="decimal"
          className={`${inputCls} flex-1 min-w-0`}
          value={value.amount}
          onChange={(e) => onChange({ ...value, amount: e.target.value })}
          placeholder={value.mode === "total" ? "Total for shipment" : "Per unit (across all items)"}
        />
        {currencyToggle && (
          <select
            className={`${inputCls} !w-24 shrink-0`}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {CURRENCIES.map((c) => (
              <option key={c.id} value={c.id}>{c.id}</option>
            ))}
          </select>
        )}
      </div>
      {hint && <p className="text-[11px] text-gray-400 mt-1 dark:text-gray-500">{hint}</p>}
    </div>
  );
}
