"use client";

// Server-backed Google Places picker for the From/To fields. Typing hits our
// /api/warehouse/geo/autocomplete route (debounced); picking a suggestion
// resolves it to a label + coordinates via onSelect. Always degrades to a
// plain text box — if the geo key isn't configured, or the user just types
// and tabs away, the typed text is kept and place_id/coords are cleared.

import { useEffect, useRef, useState } from "react";

export default function PlaceInput({
  value,
  hasResolved,        // true when a place_id/coords are currently stored
  onTextChange,       // (text) => void  — free typing, clears the resolved place
  onSelect,           // ({ label, place_id, lat, lng }) => void
  placeholder,
  inputClassName,
}) {
  const [open, setOpen] = useState(false);
  const [preds, setPreds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const sessionRef = useRef(null);
  const boxRef = useRef(null);
  const debounceRef = useRef(null);

  // One session token per picking session — Google bills autocomplete +
  // details as a single session when they share a token.
  function sessionToken() {
    if (!sessionRef.current) {
      sessionRef.current =
        (typeof crypto !== "undefined" && crypto.randomUUID)
          ? crypto.randomUUID()
          : String(Math.random()).slice(2);
    }
    return sessionRef.current;
  }

  // Close the dropdown on outside click.
  useEffect(() => {
    function onDoc(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function queryPredictions(q) {
    clearTimeout(debounceRef.current);
    if (!q || q.trim().length < 3) {
      setPreds([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/warehouse/geo/autocomplete?q=${encodeURIComponent(q)}&session=${sessionToken()}`
        );
        const data = await res.json();
        const list = data.predictions || [];
        setPreds(list);
        setActive(-1);
        setOpen(list.length > 0);
      } catch {
        setPreds([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 250);
  }

  function onChange(e) {
    const text = e.target.value;
    onTextChange(text);           // keep the typed text, drop any resolved place
    queryPredictions(text);
  }

  async function choose(pred) {
    setOpen(false);
    setPreds([]);
    // Optimistically show the label; resolve coords in the background.
    onTextChange(pred.main || pred.label);
    try {
      const res = await fetch(
        `/api/warehouse/geo/autocomplete?place_id=${encodeURIComponent(pred.place_id)}&session=${sessionToken()}`
      );
      const data = await res.json();
      const place = data.place;
      if (place) {
        onSelect({
          label: pred.main || place.label || pred.label,
          place_id: place.place_id,
          lat: place.lat,
          lng: place.lng,
        });
      } else {
        onSelect({ label: pred.main || pred.label, place_id: pred.place_id, lat: null, lng: null });
      }
    } catch {
      onSelect({ label: pred.main || pred.label, place_id: pred.place_id, lat: null, lng: null });
    }
    // Fresh token for the next independent pick.
    sessionRef.current = null;
  }

  function onKeyDown(e) {
    if (!open || preds.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, preds.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && active >= 0) { e.preventDefault(); choose(preds[active]); }
    else if (e.key === "Escape") { setOpen(false); }
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        value={value || ""}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onFocus={() => { if (preds.length) setOpen(true); }}
        placeholder={placeholder}
        autoComplete="off"
        className={inputClassName}
      />
      {hasResolved && (
        <span
          title="Location pinned on the map"
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-emerald-600 dark:text-emerald-400"
        >
          📍
        </span>
      )}
      {open && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 text-sm shadow-lg dark:border-gray-700 dark:bg-gray-900">
          {loading && preds.length === 0 ? (
            <li className="px-3 py-2 text-gray-400">Searching…</li>
          ) : (
            preds.map((p, i) => (
              <li key={p.place_id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(p)}
                  className={`block w-full px-3 py-2 text-left ${
                    i === active
                      ? "bg-gray-100 dark:bg-gray-800"
                      : "hover:bg-gray-50 dark:hover:bg-gray-800/60"
                  }`}
                >
                  <span className="font-medium text-gray-900 dark:text-gray-100">{p.main}</span>
                  {p.secondary && (
                    <span className="ml-1 text-gray-500 dark:text-gray-400">{p.secondary}</span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
