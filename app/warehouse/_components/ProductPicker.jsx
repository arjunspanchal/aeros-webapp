"use client";

// Free-text input with a styled typeahead dropdown sourced from
// master_products. Replaces the native <datalist> control, which the
// browser renders with low-contrast text we can't reach via CSS.
//
// onChange fires with { description, master_product_id }. master_product_id
// is set when the user explicitly picks a row, cleared when they free-type.

import { useEffect, useMemo, useRef, useState } from "react";

function productLabel(p) {
  return [p.sku, p.product_name].filter(Boolean).join(" — ");
}

export default function ProductPicker({
  products,
  value,
  onChange,
  placeholder = "Type or pick from catalogue",
  className = "",
  inputClassName = "",
}) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapRef = useRef(null);

  const filtered = useMemo(() => {
    const q = (value || "").trim().toLowerCase();
    if (!q) return products.slice(0, 50);
    return products
      .filter((p) => productLabel(p).toLowerCase().includes(q))
      .slice(0, 50);
  }, [products, value]);

  useEffect(() => {
    function onDocClick(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function pick(p) {
    onChange({ description: productLabel(p), master_product_id: p.id });
    setOpen(false);
    setActiveIdx(-1);
  }

  function handleKey(e) {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && activeIdx >= 0 && filtered[activeIdx]) {
      e.preventDefault();
      pick(filtered[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIdx(-1);
    }
  }

  const baseInputCls =
    "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-gray-400 focus:outline-none dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100";

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          setOpen(true);
          setActiveIdx(-1);
          onChange({ description: e.target.value, master_product_id: null });
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        className={inputClassName || baseInputCls}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
        >
          {filtered.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={i === activeIdx}
              onMouseDown={(e) => { e.preventDefault(); pick(p); }}
              onMouseEnter={() => setActiveIdx(i)}
              className={`cursor-pointer px-3 py-2 text-sm text-gray-800 dark:text-gray-100 ${
                i === activeIdx ? "bg-gray-100 dark:bg-gray-800" : ""
              }`}
            >
              {p.sku && (
                <span className="font-mono text-xs text-gray-500 dark:text-gray-400 mr-2">{p.sku}</span>
              )}
              <span>{p.product_name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
