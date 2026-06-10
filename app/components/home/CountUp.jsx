"use client";
// Animates a number from 0 → target over `duration` ms on first paint.
// Uses requestAnimationFrame with an ease-out curve; respects
// prefers-reduced-motion (snaps to value). Falls back to a setTimeout if
// rAF is throttled/unavailable (headless browsers, hidden tabs).
import { useEffect, useRef, useState } from "react";

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

export default function CountUp({ value = 0, duration = 900, format = (n) => n.toLocaleString("en-IN") }) {
  const [n, setN] = useState(0);
  const startRef = useRef(0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setN(value);
      return;
    }
    const target = Math.max(0, Math.floor(value || 0));
    const from = fromRef.current;
    if (target === from) { setN(target); return; }
    let raf = 0;
    startRef.current = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - startRef.current) / duration);
      const v = Math.round(from + (target - from) * easeOut(t));
      setN(v);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    // Fallback if rAF is throttled / unavailable. Snaps to target shortly
    // after the planned animation end.
    const safety = setTimeout(() => {
      setN(target);
      fromRef.current = target;
    }, duration + 200);
    return () => { cancelAnimationFrame(raf); clearTimeout(safety); };
  }, [value, duration]);

  return <span className="tabular-nums">{format(n)}</span>;
}
