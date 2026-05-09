"use client";

// Aeros brand repository — internal reference. Sections:
//   1. Logos       — wordmark variants (downloadable as SVG)
//   2. Colors      — palette swatches with click-to-copy hex
//   3. Typography  — the three Aeros fonts with samples
//   4. Voice       — taglines + about copy
//   5. Assets      — uploaded files (Supabase bucket: brand-assets)
//
// Anchor links across the top let the team jump-share specific sections
// (e.g. /brand#colors). Each color/font has a copy button.

import { useRef, useState } from "react";

// ---- Brand constants ------------------------------------------------------
// Source of truth for the editorial-utilitarian rebrand. Pulled from
// app/LandingClient.jsx C/FONT_* constants.
const COLORS = [
  { key: "ink50",     hex: "#F5F5F5", role: "Surface tint, off-white backgrounds" },
  { key: "ink100",    hex: "#E5E5E5", role: "Soft borders, dividers" },
  { key: "ink200",    hex: "#C2C2C2", role: "Disabled state, faint borders" },
  { key: "ink400",    hex: "#737373", role: "Secondary text, eyebrow labels" },
  { key: "ink600",    hex: "#404040", role: "Body text on light surfaces" },
  { key: "ink800",    hex: "#1A1A1A", role: "Primary nav text, headings" },
  { key: "ink900",    hex: "#0A0A0A", role: "Brand black, hero gradient" },
  { key: "slate900",  hex: "#0A0F2E", role: "Hero gradient companion" },
  { key: "white",     hex: "#FFFFFF", role: "Pure white for dark surfaces" },
  { key: "gold",      hex: "#C9A84C", role: "Accent highlight, deprecated for monochrome" },
  { key: "goldDim",   hex: "rgba(201,168,76,0.20)", role: "Faded gold tint" },
  { key: "success",   hex: "#16A34A", role: "Status / CTA confirmation green" },
];

const FONTS = [
  {
    family: "Plus Jakarta Sans",
    role: "Sans-serif body + display. Headings, navigation, paragraphs.",
    weight: 800,
    sample: "Cups, bags, boxes. Costed, quoted, shipped.",
    cssStack: '"Plus Jakarta Sans", system-ui, sans-serif',
  },
  {
    family: "IBM Plex Mono",
    role: "Monospace. Eyebrows, stats, technical labels.",
    weight: 500,
    sample: "/ NRA SHOW 2026  ·  Booth 12937  ·  In the US 13–24 May",
    cssStack: '"IBM Plex Mono", ui-monospace, monospace',
  },
  {
    family: "Nunito Sans",
    role: "Logo wordmark only. Letterspaced 0.08em, weight 600.",
    weight: 600,
    sample: "Aeros",
    cssStack: '"Nunito Sans", system-ui, sans-serif',
  },
];

const TAGLINES = [
  { context: "Hero — long",  copy: "Cups, bags, boxes. Costed, quoted, shipped." },
  { context: "Hero — short", copy: "Packaging, engineered for operators." },
  { context: "Sustainability hook", copy: "Most paper cups aren't compostable. Most people don't know." },
  { context: "B2B nav CTA",  copy: "Get a quote in <60s." },
  { context: "Technical credential", copy: "BRCGS-certified. Made in Mumbai. Shipped worldwide." },
];

const VOICE_NOTES = [
  "Operator-first. Lead with capability, end with proof. Don't hedge.",
  "Numbers > adjectives. \"50,000 cups\" beats \"large quantity\".",
  "Sustainability claims must be specific (PE vs PLA vs aqueous). Vague \"eco-friendly\" is banned.",
  "City: Mumbai (in copy). Bhiwandi only inside ops UI for the team.",
  "Currency: INR primary, USD secondary for export quotes.",
  "Voice samples below come from the public landing — keep them in sync if either side changes.",
];

const ABOUT_BOILERPLATE = `Aeros is a Mumbai-based paper packaging manufacturer. We make food-grade
paper cups, tubs, bowls, lids, kraft bags, and SBS + corrugated boxes —
costed live, quoted in INR, shipped worldwide. BRCGS-certified plant.
Operator-led: Arjun Panchal (front of house) and Parth Panchal (factory floor).`;

// ---- Logo SVGs ------------------------------------------------------------
// The wordmark is set in Nunito Sans 600, letterspacing 0.08em. The
// embedded SVGs below render text so they remain editable; downloading
// gives the receiver an SVG with the same text-as-shape spec.

function makeWordmarkSvg({ size = 80, color = "#0A0A0A", bg = "transparent" }) {
  // Approximate width based on font metrics. Aeros = 5 chars, ~0.55em each.
  const charW = size * 0.6;
  const width = Math.round(charW * 5 + size);
  const height = Math.round(size * 1.4);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${bg}"/>
  <text
    x="50%" y="50%"
    text-anchor="middle"
    dominant-baseline="central"
    font-family="Nunito Sans, system-ui, sans-serif"
    font-weight="600"
    letter-spacing="${(size * 0.08).toFixed(2)}"
    font-size="${size}"
    fill="${color}"
  >Aeros</text>
</svg>`;
}

const LOGO_VARIANTS = [
  { id: "wordmark-light",      label: "Wordmark · light",       size: 80, color: "#0A0A0A", bg: "#FFFFFF",          dark: false },
  { id: "wordmark-dark",       label: "Wordmark · dark",        size: 80, color: "#FFFFFF", bg: "#0A0A0A",          dark: true  },
  { id: "wordmark-monochrome", label: "Wordmark · monochrome",  size: 80, color: "#0A0A0A", bg: "transparent",      dark: false },
  { id: "wordmark-large",      label: "Wordmark · hero scale",  size: 160, color: "#0A0A0A", bg: "#F5F5F5",          dark: false },
];

// ---- Component ------------------------------------------------------------

export default function BrandKitClient({ initialFiles, loadError }) {
  const [files, setFiles] = useState(initialFiles || []);
  const [copied, setCopied] = useState(null);
  const [uploadErr, setUploadErr] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(null);

  function copy(value, key) {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  function downloadSvg(variant) {
    const svg = makeWordmarkSvg(variant);
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `aeros-${variant.id}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function uploadFiles(fileList) {
    if (!fileList?.length) return;
    setUploadErr("");
    setUploadBusy(true);
    try {
      for (const f of fileList) {
        const base64 = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload  = () => { const s = String(r.result || ""); res(s.slice(s.indexOf(",") + 1)); };
          r.onerror = rej;
          r.readAsDataURL(f);
        });
        const resp = await fetch("/api/brand/files", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            filename:    f.name,
            contentType: f.type || "application/octet-stream",
            fileBase64:  base64,
          }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || `Upload of ${f.name} failed (${resp.status})`);
        setFiles((prev) => [data.file, ...prev]);
      }
    } catch (e) {
      setUploadErr(e.message);
    } finally {
      setUploadBusy(false);
    }
  }

  async function deleteFile(name) {
    if (!confirm(`Delete "${name}"?`)) return;
    setDeleteBusy(name);
    try {
      const resp = await fetch(`/api/brand/files/${encodeURIComponent(name)}`, { method: "DELETE" });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Delete failed");
      setFiles((prev) => prev.filter((f) => f.name !== name));
    } catch (e) {
      alert(e.message);
    } finally {
      setDeleteBusy(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Header + nav */}
      <header className="mb-10">
        <p className="text-[11px] font-mono uppercase tracking-wider text-gray-500">/ Internal · Aeros team only</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">Brand repository</h1>
        <p className="mt-2 text-sm text-gray-600 max-w-2xl">
          Logos, palette, typography, voice samples, and uploaded assets. URL is private — no nav links from the website.
          Share with the team by copying the link, with vendors by downloading the asset.
        </p>
        <nav className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm text-gray-600">
          <a href="#logos"  className="hover:text-gray-900 hover:underline">Logos</a>
          <a href="#colors" className="hover:text-gray-900 hover:underline">Colors</a>
          <a href="#fonts"  className="hover:text-gray-900 hover:underline">Typography</a>
          <a href="#voice"  className="hover:text-gray-900 hover:underline">Voice & content</a>
          <a href="#assets" className="hover:text-gray-900 hover:underline">Assets ({files.length})</a>
        </nav>
      </header>

      {/* ---- Logos ---- */}
      <section id="logos" className="scroll-mt-16 border-t border-gray-200 pt-8">
        <SectionHeader eyebrow="01" title="Logos" subtitle="Click any variant to download as SVG. Wordmark only — no separate logomark today." />
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {LOGO_VARIANTS.map((v) => (
            <button
              key={v.id}
              onClick={() => downloadSvg(v)}
              className={`group flex h-40 flex-col items-center justify-center rounded-lg border transition-all ${
                v.dark ? "border-gray-800" : "border-gray-200 hover:border-gray-300"
              } hover:shadow-md`}
              style={{ background: v.bg === "transparent" ? "repeating-conic-gradient(#f3f4f6 0% 25%, white 0% 50%) 50% / 16px 16px" : v.bg }}
            >
              <span
                style={{
                  fontFamily:    '"Nunito Sans", system-ui, sans-serif',
                  fontWeight:    600,
                  letterSpacing: "0.08em",
                  color:         v.color,
                  fontSize:      v.size > 100 ? "44px" : "28px",
                  lineHeight:    1,
                }}
              >Aeros</span>
              <span className={`mt-3 text-[11px] uppercase tracking-wide ${v.dark ? "text-gray-400" : "text-gray-500"}`}>
                {v.label} · download SVG
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* ---- Colors ---- */}
      <section id="colors" className="scroll-mt-16 mt-12 border-t border-gray-200 pt-8">
        <SectionHeader eyebrow="02" title="Color palette" subtitle="Click a hex value to copy. Roles describe how the color is used in product UI today." />
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {COLORS.map((c) => {
            const isLight = ["white", "ink50", "ink100", "goldDim"].includes(c.key);
            return (
              <button
                key={c.key}
                onClick={() => copy(c.hex, `color:${c.key}`)}
                className="group flex flex-col items-stretch overflow-hidden rounded-lg border border-gray-200 text-left hover:border-gray-300 hover:shadow-sm"
              >
                <div className="h-16 w-full" style={{ background: c.hex, borderBottom: isLight ? "1px solid #E5E5E5" : "none" }} />
                <div className="px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-gray-700">{c.key}</span>
                    <span className="font-mono text-[10px] text-gray-400 group-hover:text-gray-700">
                      {copied === `color:${c.key}` ? "✓ copied" : "click to copy"}
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-gray-500">{c.hex}</div>
                  <div className="mt-1 text-xs leading-snug text-gray-500">{c.role}</div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ---- Fonts ---- */}
      <section id="fonts" className="scroll-mt-16 mt-12 border-t border-gray-200 pt-8">
        <SectionHeader eyebrow="03" title="Typography" subtitle="Three families. Click the CSS stack to copy." />
        <div className="mt-5 space-y-4">
          {FONTS.map((f) => (
            <div key={f.family} className="rounded-lg border border-gray-200 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-lg font-semibold text-gray-900">{f.family}</h3>
                <button
                  onClick={() => copy(f.cssStack, `font:${f.family}`)}
                  className="font-mono text-[11px] text-gray-500 hover:text-gray-900"
                >
                  {copied === `font:${f.family}` ? "✓ copied" : "copy CSS stack →"}
                </button>
              </div>
              <p className="mt-1 text-sm text-gray-500">{f.role}</p>
              <p
                className="mt-4 text-2xl text-gray-900"
                style={{ fontFamily: f.cssStack, fontWeight: f.weight, letterSpacing: f.family === "Nunito Sans" ? "0.08em" : "0" }}
              >
                {f.sample}
              </p>
              <p className="mt-2 font-mono text-[10px] text-gray-400">{f.cssStack}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---- Voice & content ---- */}
      <section id="voice" className="scroll-mt-16 mt-12 border-t border-gray-200 pt-8">
        <SectionHeader eyebrow="04" title="Voice & content" subtitle="Reference taglines + voice notes. Click any tagline to copy." />
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Tagline variants</h3>
            <ul className="mt-3 divide-y divide-gray-200 rounded-lg border border-gray-200">
              {TAGLINES.map((t, i) => (
                <li key={i} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-[11px] font-mono uppercase tracking-wider text-gray-400">{t.context}</p>
                    <p className="mt-1 text-sm font-medium text-gray-900">{t.copy}</p>
                  </div>
                  <button
                    onClick={() => copy(t.copy, `tagline:${i}`)}
                    className="shrink-0 text-[11px] font-mono text-gray-500 hover:text-gray-900"
                  >
                    {copied === `tagline:${i}` ? "✓" : "copy"}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Voice notes</h3>
            <ul className="mt-3 list-disc space-y-2 rounded-lg border border-gray-200 p-4 pl-8 text-sm text-gray-700">
              {VOICE_NOTES.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
            <h3 className="mt-6 text-sm font-semibold text-gray-900 uppercase tracking-wide">About boilerplate</h3>
            <div className="mt-3 rounded-lg border border-gray-200 p-4">
              <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700">{ABOUT_BOILERPLATE}</p>
              <button
                onClick={() => copy(ABOUT_BOILERPLATE, "about")}
                className="mt-3 text-[11px] font-mono text-gray-500 hover:text-gray-900"
              >
                {copied === "about" ? "✓ copied" : "copy →"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Assets (uploads) ---- */}
      <section id="assets" className="scroll-mt-16 mt-12 border-t border-gray-200 pt-8">
        <SectionHeader
          eyebrow="05"
          title={`Assets (${files.length})`}
          subtitle="Logos in PNG/PDF, photos, deck templates, anything else. Public URLs are shareable with vendors / printers; the listing here stays auth-gated."
        />
        {loadError && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {loadError}
          </div>
        )}
        <UploadZone
          busy={uploadBusy}
          error={uploadErr}
          onFiles={uploadFiles}
        />
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {files.map((f) => (
            <FileCard
              key={f.name}
              file={f}
              busy={deleteBusy === f.name}
              onDelete={() => deleteFile(f.name)}
              onCopyUrl={() => copy(f.url, `file:${f.name}`)}
              copied={copied === `file:${f.name}`}
            />
          ))}
          {files.length === 0 && !loadError && (
            <p className="col-span-full rounded-md border border-dashed border-gray-300 py-12 text-center text-sm text-gray-500">
              No assets uploaded yet. Drop files above to add the first.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function SectionHeader({ eyebrow, title, subtitle }) {
  return (
    <div>
      <p className="text-[11px] font-mono uppercase tracking-wider text-gray-400">/ {eyebrow}</p>
      <h2 className="mt-1 text-xl font-semibold text-gray-900">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-gray-500 max-w-2xl">{subtitle}</p>}
    </div>
  );
}

function UploadZone({ busy, error, onFiles }) {
  const ref = useRef(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); onFiles(Array.from(e.dataTransfer.files || [])); }}
      className={`mt-5 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors ${
        dragging ? "border-blue-500 bg-blue-50/40" : "border-gray-300 hover:border-gray-400"
      }`}
    >
      <p className="text-sm text-gray-700">
        Drop files here or{" "}
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={busy}
          className="font-medium text-blue-700 underline hover:text-blue-800 disabled:opacity-50"
        >
          {busy ? "Uploading…" : "click to browse"}
        </button>
      </p>
      <p className="mt-1 text-[11px] text-gray-500">image / PDF / ZIP / EPS · max 25 MB per file</p>
      <input
        ref={ref}
        type="file"
        accept="image/*,application/pdf,application/zip,application/postscript"
        multiple
        onChange={(e) => onFiles(Array.from(e.target.files || []))}
        className="hidden"
      />
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}

function isImage(contentType) {
  return contentType && contentType.startsWith("image/") && contentType !== "image/svg+xml" || contentType === "image/svg+xml";
}

function FileCard({ file, busy, onDelete, onCopyUrl, copied }) {
  const img = file.contentType && file.contentType.startsWith("image/");
  // Strip the "1234567-" timestamp prefix that uploadBrandFile adds.
  const display = file.name.replace(/^\d{10,16}-/, "");
  return (
    <div className="group relative overflow-hidden rounded-lg border border-gray-200 bg-white">
      <a
        href={file.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block aspect-square overflow-hidden bg-gray-50"
        title={`Open ${display}`}
      >
        {img ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={file.url} alt={display} className="h-full w-full object-contain" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl text-gray-400">
            {(file.contentType || "").includes("pdf") ? "📄" : "📎"}
          </div>
        )}
      </a>
      <div className="p-2">
        <p className="truncate text-xs font-medium text-gray-900" title={display}>{display}</p>
        <p className="mt-0.5 font-mono text-[10px] text-gray-500">
          {(file.contentType || "").split("/").pop()} · {file.size != null ? formatBytes(file.size) : "—"}
        </p>
        <div className="mt-2 flex justify-between gap-2 text-[11px]">
          <button onClick={onCopyUrl} className="text-gray-600 hover:text-gray-900">
            {copied ? "✓ link" : "copy link"}
          </button>
          <button
            onClick={onDelete}
            disabled={busy}
            className="text-red-600 hover:text-red-800 disabled:opacity-50"
          >
            {busy ? "…" : "delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatBytes(b) {
  if (b == null) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}
