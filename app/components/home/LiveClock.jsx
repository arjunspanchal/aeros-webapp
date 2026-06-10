"use client";
// Slim live clock — mounts once on the home hero. IST clock + ISO date,
// reverse-out white-on-ink for the dark hero band. Updates every second
// client-side. Uses Intl APIs so no extra deps.
import { useEffect, useState } from "react";

function fmt(d) {
  const time = new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  }).format(d);
  const day = new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(d);
  return { time, day };
}

export default function LiveClock() {
  const [now, setNow] = useState(() => fmt(new Date()));
  useEffect(() => {
    const id = setInterval(() => setNow(fmt(new Date())), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="font-mono text-[11px] text-white/40 leading-relaxed text-right">
      <div className="text-[9px] uppercase tracking-[0.22em] text-white/35 mb-1">
        Boson Machines OPC · Bhiwandi, India
      </div>
      <div className="tabular-nums text-white/85 text-base">
        {now.time}<span className="text-white/40 text-[11px] ml-1">IST</span>
      </div>
      <div className="uppercase tracking-wider text-white/50 mt-0.5">{now.day}</div>
    </div>
  );
}
