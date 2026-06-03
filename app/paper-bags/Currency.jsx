"use client";

// Shared display preferences for the public paper-bag page: currency (INR/USD)
// and size unit (mm/in). A tiny context so the sticky masthead toggles and the
// rate table stay in sync. Defaults: INR (₹) — Aeros quotes in INR, USD is an
// indicative conversion — and mm, the manufacturing unit.

import { createContext, useContext, useState } from "react";

const DisplayCtx = createContext({
  currency: "INR",
  setCurrency: () => {},
  unit: "mm",
  setUnit: () => {},
});

export function useDisplay() {
  return useContext(DisplayCtx);
}

// Back-compat alias — existing callers used `useCurrency()`.
export function useCurrency() {
  return useContext(DisplayCtx);
}

export function CurrencyProvider({ children, initialCurrency = "INR", initialUnit = "mm" }) {
  const [currency, setCurrency] = useState(initialCurrency);
  const [unit, setUnit] = useState(initialUnit);
  return (
    <DisplayCtx.Provider value={{ currency, setCurrency, unit, setUnit }}>
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
