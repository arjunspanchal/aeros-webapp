"use client";

// Shared display preferences for the public straw page: currency (INR/USD) and
// rate basis (FCL/EXW vs India DDP). A tiny context so the sticky masthead
// toggles and the rate table stay in sync. Defaults: INR (₹) — Aeros quotes in
// INR, USD is an indicative conversion — and FCL, the bare ex-works basis.

import { createContext, useContext, useState } from "react";

const DisplayCtx = createContext({
  currency: "INR",
  setCurrency: () => {},
  rateMode: "fcl",
  setRateMode: () => {},
});

export function useDisplay() {
  return useContext(DisplayCtx);
}

export function CurrencyProvider({
  children,
  initialCurrency = "INR",
  initialRateMode = "fcl",
}) {
  const [currency, setCurrency] = useState(initialCurrency);
  const [rateMode, setRateMode] = useState(initialRateMode);
  return (
    <DisplayCtx.Provider value={{ currency, setCurrency, rateMode, setRateMode }}>
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

export function RateModeToggle({ className = "" }) {
  const { rateMode, setRateMode } = useDisplay();
  return (
    <Segmented
      ariaLabel="Rate basis"
      value={rateMode}
      onChange={setRateMode}
      className={className}
      options={[
        { value: "fcl", label: "FCL" },
        { value: "ddp", label: "India DDP" },
      ]}
    />
  );
}
