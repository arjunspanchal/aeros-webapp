"use client";

// Server-backed Google Places picker for the From/To fields. Typing hits our
// /api/warehouse/geo/autocomplete route (debounced); picking a suggestion
// resolves it to a label + coordinates via onSelect. Focusing an empty field
// surfaces recently-used locations (from past dispatches) for one-tap reuse.
// Always degrades to a plain text box — if the geo key isn't configured, or
// the user just types and tabs away, the typed text is kept and
// place_id/coords are cleared.

import { useEffect, useRef, useState } from "react";

export default function PlaceInput({
  value,
  hasResolved,        // true when a place_id/coords are currently stored
  recents = [],       // [{ place_id, label, lat, lng }] — recently-used locations
  onTextChange,       // (text) => void  — free typing, clears the resolved place
  onSelect,           // ({ label, place_id, lat, lng }) => void
  placeholder,
  inputClassName,
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("recents"); // "recents" | "preds"
  const [preds, setPreds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const sessionRef = useRef(null);
  const boxRef = useRef(null);
  const debounceRef = useRef(null);

  // The list currently shown in the dropdown — recents (pre-typing) or live
  // predictions (3+ chars typed).
  const items = mode === "recents" ? recents : preds;

  function sessionToken() {
    if (!sessionRef.current) {
      sessionRef.current =
        (typeof crypto !== "undefined" && crypto.randomUUID)
          ? crypto.randomUUID()
          : String(Math.random()).slice(2);
    }
    return sessionRef.current;
  }

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
      // Below the autocomplete threshold — fall back to the recents list.
      setPreds([]);
      setMode("recents");
      setActive(-1);
      setOpen(recents.length > 0);
      return;
    }
    setMode("preds");
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

  function onFocus() {
    // Show recents immediately when the field is empty/short.
    if ((!value || value.trim().length < 3) && recents.length > 0) {
      setMode("recents");
      setActive(-1);
      setOpen(true);
    } else if (preds.length) {
      setOpen(true);
    }
  }

  // A recent already carries place_id + coords, so select it directly — no
  // Places-details round-trip needed.
  function chooseRecent(r) {
    setOpen(false);
    onSelect({ label: r.label, place_id: r.place_id, lat: r.lat, lng: r.lng });
    sessionRef.current = null;
  }

  async function choosePrediction(pred) {
    setOpen(false);
    setPreds([]);
    onTextChange(pred.main || pred.label);   // optimistic label
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
    sessionRef.current = null;
  }

  function chooseAt(i) {
    const item = items[i];
    if (!item) return;
    if (mode === "recents") chooseRecent(item);
    else choosePrediction(item);
  }

  function onKeyDown(e) {
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && active >= 0) { e.preventDefault(); chooseAt(active); }
    else if (e.key === "Escape") { setOpen(false); }
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        value={value || ""}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
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
          {mode === "recents" && items.length > 0 && (
            <li className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Recent locations
            </li>
          )}
          {mode === "preds" && loading && items.length === 0 ? (
            <li className="px-3 py-2 text-gray-400">Searching…</li>
          ) : (
            items.map((p, i) => (
              <li key={`${mode}-${p.place_id}`}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => chooseAt(i)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left ${
                    i === active
                      ? "bg-gray-100 dark:bg-gray-800"
                      : "hover:bg-gray-50 dark:hover:bg-gray-800/60"
                  }`}
                >
                  {mode === "recents" && <span className="text-gray-400">🕘</span>}
                  <span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {mode === "recents" ? p.label : p.main}
                    </span>
                    {mode === "preds" && p.secondary && (
                      <span className="ml-1 text-gray-500 dark:text-gray-400">{p.secondary}</span>
                    )}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
