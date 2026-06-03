"use client";

// Shared currency state for the public paper-bag page. A tiny context so the
// sticky masthead toggle and the rate table stay in sync. Default INR (₹) —
// Aeros prices are quoted in INR; USD is an indicative conversion.

import { createContext, useContext, useState } from "react";

const CurrencyCtx = createContext({ currency: "INR", setCurrency: () => {} });

export function useCurrency() {
  return useContext(CurrencyCtx);
}

export function CurrencyProvider({ children, initial = "INR" }) {
  const [currency, setCurrency] = useState(initial);
  return (
    <CurrencyCtx.Provider value={{ currency, setCurrency }}>{children}</CurrencyCtx.Provider>
  );
}

export function CurrencyToggle({ className = "" }) {
  const { currency, setCurrency } = useCurrency();
  const options = [
    { value: "INR", label: "₹ INR" },
    { value: "USD", label: "$ USD" },
  ];
  return (
    <div
      role="group"
      aria-label="Display currency"
      className={`inline-flex items-center rounded-full border border-ink-200 bg-white p-0.5 ${className}`}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => setCurrency(o.value)}
          aria-pressed={currency === o.value}
          className={
            "rounded-full px-3 py-1 text-xs font-medium transition-colors " +
            (currency === o.value
              ? "bg-ink-900 text-white"
              : "text-ink-600 hover:text-ink-900")
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
