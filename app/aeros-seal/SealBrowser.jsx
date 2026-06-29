"use client";

// Rate cards for the AeroSeal sealer range. Cards (not a dense table) because
// there are only a handful of machines and each carries a descriptive build
// spec. A type filter mirrors the other public sheets. Price switches with the
// shared currency toggle; unpriced machines render "On request".

import { useState } from "react";
import { useCurrency } from "./Currency";

export default function SealBrowser({ sections, total, priced, usdPerInr }) {
  const [active, setActive] = useState("all");
  const [openVideo, setOpenVideo] = useState(null); // section key whose demo is open
  const { currency } = useCurrency();

  const shown = active === "all" ? sections : sections.filter((s) => s.key === active);

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-xl font-bold text-ink-900">Machines &amp; Rates</h2>
        <p className="text-xs text-ink-400">
          {priced} of {total} listed with live rates
        </p>
      </div>

      {/* Type filter */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Chip label="All" active={active === "all"} onClick={() => setActive("all")} />
        {sections.map((s) => (
          <Chip
            key={s.key}
            label={s.code}
            active={active === s.key}
            onClick={() => setActive(s.key)}
          />
        ))}
      </div>

      {shown.map((section) => (
        <div key={section.key} className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-ink-900">{section.label}</h3>
            {section.video && (
              <button
                type="button"
                onClick={() => setOpenVideo(openVideo === section.key ? null : section.key)}
                aria-expanded={openVideo === section.key}
                className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1 text-xs font-medium text-ink-700 transition-colors hover:border-ink-400"
              >
                <span aria-hidden>{openVideo === section.key ? "▾" : "▶"}</span>
                {openVideo === section.key ? "Hide demo" : "Watch demo"}
              </button>
            )}
          </div>
          {section.blurb && <p className="mt-1 max-w-2xl text-sm text-ink-600">{section.blurb}</p>}

          {section.video && openVideo === section.key && (
            <div className="mt-4 overflow-hidden rounded-md border border-ink-200 bg-black">
              {/* preload="none" + render-on-open: the ~60–95 MB file only loads
                  when the user opens this panel, never on first paint. */}
              <video
                src={section.video}
                controls
                preload="none"
                playsInline
                className="aspect-video w-full"
              />
            </div>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {section.rows.map((row) => (
              <MachineCard key={row.sku} row={row} currency={currency} usdPerInr={usdPerInr} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function MachineCard({ row, currency, usdPerInr }) {
  return (
    <article className="flex flex-col rounded-md border border-ink-200 bg-white p-5">
      {row.image && (
        <div className="mb-4 overflow-hidden rounded-md border border-ink-100 bg-white">
          {/* Plain <img> (not next/image) so no domain allow-list config is
              needed; small files (~15–46 KB), lazy-loaded. */}
          <img
            src={row.image}
            alt={row.name}
            loading="lazy"
            className="mx-auto aspect-[4/3] w-full object-contain"
          />
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-bold text-ink-900">{row.name}</h4>
          <p className="mt-0.5 font-mono text-xs text-ink-400">{row.sku}</p>
        </div>
        {row.variant && (
          <span className="shrink-0 rounded-full border border-ink-200 px-2.5 py-0.5 text-xs font-medium text-ink-600">
            {row.variant}
          </span>
        )}
      </div>

      <dl className="mt-4 space-y-1.5 text-sm">
        {row.range && <Spec label="Seal range" value={row.range} />}
        {row.frame && <Spec label="Frame" value={row.frame} />}
        {row.control && <Spec label="Control" value={row.control} />}
      </dl>

      <div className="mt-4 flex items-end justify-between border-t border-ink-100 pt-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-400">Rate / unit</p>
          <p className="mt-0.5 text-lg font-bold text-ink-900">
            {row.sellInr != null ? formatPrice(row.sellInr, currency, usdPerInr) : "On request"}
          </p>
        </div>
        {row.sellInr != null && (
          <p className="text-xs text-ink-400">+{row.gstPct}% GST · delivered India</p>
        )}
      </div>
    </article>
  );
}

function Spec({ label, value }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-ink-400">{label}</dt>
      <dd className="text-ink-800">{value}</dd>
    </div>
  );
}

function Chip({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
        (active
          ? "border-ink-900 bg-ink-900 text-white"
          : "border-ink-200 bg-white text-ink-600 hover:border-ink-400")
      }
    >
      {label}
    </button>
  );
}

function formatPrice(inr, currency, usdPerInr) {
  if (currency === "USD") {
    const usd = inr / usdPerInr;
    return `$${usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  return `₹${inr.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}
