"use client";

// Shared display preferences for the public PP cup & IM lid page: currency
// (INR/USD), size unit (mm/in) and offering (plain/customised). A tiny context
// so the sticky masthead toggles and the rate table stay in sync. Defaults:
// INR (₹) — Aeros quotes in INR, USD is an indicative conversion — and mm, the
// manufacturing unit.

import { createContext, useContext, useState } from "react";

const DisplayCtx = createContext({
  currency: "INR",
  setCurrency: () => {},
  unit: "mm",
  setUnit: () => {},
  offering: "plain",
  setOffering: () => {},
});

export function useDisplay() {
  return useContext(DisplayCtx);
}

export function CurrencyProvider({
  children,
  initialCurrency = "INR",
  initialUnit = "mm",
  initialOffering = "plain",
}) {
  const [currency, setCurrency] = useState(initialCurrency);
  const [unit, setUnit] = useState(initialUnit);
  const [offering, setOffering] = useState(initialOffering);
  return (
    <DisplayCtx.Provider
      value={{ currency, setCurrency, unit, setUnit, offering, setOffering }}
    >
      {children}
    </DisplayCtx.Provider>
  );
}

function Segmented({ ariaLabel, value, onChange, options, className = "" }) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`inline-flex items-center rounded-full border border-ink-200 bg-white p-0.5 ${className}`}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={
            "rounded-full px-3 py-1 text-xs font-medium transition-colors " +
            (value === o.value ? "bg-ink-900 text-white" : "text-ink-600 hover:text-ink-900")
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function CurrencyToggle({ className = "" }) {
  const { currency, setCurrency } = useDisplay();
  return (
    <Segmented
      ariaLabel="Display currency"
      value={currency}
      onChange={setCurrency}
      className={className}
      options={[
        { value: "INR", label: "₹ INR" },
        { value: "USD", label: "$ USD" },
      ]}
    />
  );
}

export function OfferingToggle({ className = "" }) {
  const { offering, setOffering } = useDisplay();
  return (
    <Segmented
      ariaLabel="Offering"
      value={offering}
      onChange={setOffering}
      className={className}
      options={[
        { value: "plain", label: "Plain" },
        { value: "printed", label: "Customised" },
      ]}
    />
  );
}

export function UnitToggle({ className = "" }) {
  const { unit, setUnit } = useDisplay();
  return (
    <Segmented
      ariaLabel="Size unit"
      value={unit}
      onChange={setUnit}
      className={className}
      options={[
        { value: "mm", label: "mm" },
        { value: "in", label: "in" },
      ]}
    />
  );
}
