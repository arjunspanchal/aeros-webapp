"use client";

// Shared display preferences for the public PP Thin-Wall Containers sheet:
// currency (INR/USD), size unit (mm/in) and base colour (all/clear/black). A
// tiny context so the masthead toggles and the rate table stay in sync.

import { createContext, useContext, useState } from "react";

const DisplayCtx = createContext({
  currency: "INR",
  setCurrency: () => {},
  unit: "mm",
  setUnit: () => {},
  colour: "all",
  setColour: () => {},
});

export function useDisplay() {
  return useContext(DisplayCtx);
}

export function CurrencyProvider({
  children,
  initialCurrency = "INR",
  initialUnit = "mm",
  initialColour = "all",
}) {
  const [currency, setCurrency] = useState(initialCurrency);
  const [unit, setUnit] = useState(initialUnit);
  const [colour, setColour] = useState(initialColour);
  return (
    <DisplayCtx.Provider value={{ currency, setCurrency, unit, setUnit, colour, setColour }}>
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

export function ColourToggle({ className = "" }) {
  const { colour, setColour } = useDisplay();
  return (
    <Segmented
      ariaLabel="Base colour"
      value={colour}
      onChange={setColour}
      className={className}
      options={[
        { value: "all", label: "All" },
        { value: "Clear", label: "Clear" },
        { value: "Black", label: "Black" },
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
