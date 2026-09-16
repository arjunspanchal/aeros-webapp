"use client";
import { useEffect, useMemo, useState } from "react";
import { inputCls, labelCls } from "@/app/factoryos/_components/ui";
import {
  PROCESSES, PRINT_SIDES, PROOF_TYPES, VARNISH_TYPES, VARNISH_COVERAGE,
  LAMINATIONS, PLATE_STATUSES, PLATE_OWNERS, SUBSTRATE_FORMS, GRAINS,
  PUNCHING, QTY_UOMS, WIND_DIRECTIONS, COLOUR_TYPES, COLOUR_SIDES, qtyBand,
  processFromPrintingType,
} from "@/lib/factoryos/jobOrderConstants";

const CMYK = [
  { name: "Process Cyan", swatchHex: "#00a0e4" },
  { name: "Process Magenta", swatchHex: "#e4007c" },
  { name: "Process Yellow", swatchHex: "#ffed00" },
  { name: "Process Black", swatchHex: "#1d1d1b" },
];

const blankColour = () => ({
  colourType: "spot", name: "", swatchHex: "", side: "outer",
  deckNo: "", coveragePct: "", anilox: "", notes: "",
});

const colourToForm = (c) => ({ ...blankColour(), ...toForm(c) });

// Form state is all strings so inputs stay controlled; the server coerces.
function toForm(spec) {
  const out = {};
  for (const [k, v] of Object.entries(spec || {})) {
    out[k] = typeof v === "boolean" ? v : v == null ? "" : String(v);
  }
  return out;
}

function Section({ title, hint, children, cols = 3 }) {
  const grid = cols === 2 ? "sm:grid-cols-2" : cols === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3";
  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5 dark:bg-gray-900 dark:border-gray-800">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h2>
        {hint && <p className="text-xs text-gray-500 mt-0.5 dark:text-gray-400">{hint}</p>}
      </div>
      <div className={`grid grid-cols-1 ${grid} gap-4`}>{children}</div>
    </section>
  );
}

function F({ label, children, span = 1, hint }) {
  const cls = span === 3 ? "sm:col-span-3" : span === 2 ? "sm:col-span-2" : span === 4 ? "sm:col-span-4" : "";
  return (
    <div className={cls}>
      <label className={labelCls}>{label}</label>
      {children}
      {hint && <p className="text-[11px] text-gray-400 mt-1 dark:text-gray-500">{hint}</p>}
    </div>
  );
}

function Select({ value, onChange, options, placeholder = "—" }) {
  return (
    <select className={inputCls} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export default function JobOrderEditor({ job, clientName, vendor, initialSpec, initialColours, masterPapers = [] }) {
  // Build the form-shaped state once and snapshot THAT, so a fresh load
  // compares like with like and doesn't read as unsaved.
  const [initial] = useState(() => ({
    f: toForm(initialSpec),
    c: (initialColours || []).map(colourToForm),
  }));
  const [spec, setSpec] = useState(initialSpec);
  const [form, setForm] = useState(initial.f);
  const [colours, setColours] = useState(initial.c);
  const [saved, setSaved] = useState(() => JSON.stringify(initial));
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);
  const [paperQuery, setPaperQuery] = useState("");

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const bind = (k) => ({ value: form[k] ?? "", onChange: (e) => set(k)(e.target.value) });

  const isFlexo = form.process === "flexo";
  const isIssued = spec?.status === "issued";
  const dirty = JSON.stringify({ f: form, c: colours }) !== saved;

  useEffect(() => {
    const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const jobProcess = processFromPrintingType(job.printingType);
  const processMismatch = !!jobProcess && jobProcess !== form.process;

  const filteredPapers = useMemo(() => {
    const q = paperQuery.trim().toLowerCase();
    const list = q
      ? masterPapers.filter((p) => `${p.materialName} ${p.supplier} ${p.gsm} ${p.type}`.toLowerCase().includes(q))
      : masterPapers;
    return list.slice(0, 150);
  }, [masterPapers, paperQuery]);

  function pickPaper(id) {
    const p = masterPapers.find((x) => x.id === id);
    if (!p) { set("masterPaperId")(""); return; }
    setForm((f) => ({
      ...f,
      masterPaperId: id,
      substrateName: p.materialName || f.substrateName,
      substrateMill: p.supplier || f.substrateMill,
      substrateGsm: p.gsm != null ? String(p.gsm) : f.substrateGsm,
      substrateBf: p.bf != null ? String(p.bf) : f.substrateBf,
      substrateCoating: p.millCoating || f.substrateCoating,
      substrateForm: /reel/i.test(p.form) ? "reel" : /sheet/i.test(p.form) ? "sheet" : f.substrateForm,
    }));
  }

  const setColour = (i, k, v) =>
    setColours((cs) => cs.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  const moveColour = (i, d) =>
    setColours((cs) => {
      const j = i + d;
      if (j < 0 || j >= cs.length) return cs;
      const next = [...cs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  function addCmyk() {
    setColours((cs) => {
      const have = new Set(cs.map((c) => c.name.toLowerCase()));
      const add = CMYK.filter((c) => !have.has(c.name.toLowerCase()))
        .map((c) => ({ ...blankColour(), colourType: "process", ...c }));
      return [...cs, ...add];
    });
  }

  const band = qtyBand({
    orderQty: form.orderQty, oversAllowancePct: form.oversAllowancePct, undersAllowancePct: form.undersAllowancePct,
  });

  // Colour count on the order should agree with the colour list; flag it
  // rather than silently overwrite, since a varnish unit is sometimes counted.
  const namedColours = colours.filter((c) => c.name.trim()).length;
  const colourCountMismatch = form.totalColours !== "" && Number(form.totalColours) !== namedColours;

  async function call(method, body) {
    const res = await fetch(`/api/factoryos/jobs/${job.id}/print-spec`, {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function absorb(data) {
    setSpec(data.spec);
    const f = toForm(data.spec);
    const c = (data.colours || []).map(colourToForm);
    setForm(f);
    setColours(c);
    setSaved(JSON.stringify({ f, c }));
  }

  async function save() {
    setBusy("save"); setMsg(null);
    try {
      const data = await call("PUT", { ...form, colours });
      absorb(data);
      setMsg({ ok: true, text: data.spec?.status === "issued"
        ? `Saved as rev ${data.spec.rev}. The vendor already sees it — re-issue to notify them.`
        : "Draft saved." });
      return data;
    } catch (e) {
      setMsg({ ok: false, text: e.message });
      return null;
    } finally { setBusy(""); }
  }

  async function issue() {
    if (!job.printingVendor) {
      setMsg({ ok: false, text: "Assign a printing vendor on the job before issuing." });
      return;
    }
    if (dirty && !(await save())) return;
    setBusy("issue"); setMsg(null);
    try {
      absorb(await call("POST", { action: "issue" }));
      setMsg({ ok: true, text: `Issued to ${job.printingVendor}. It is now visible in their portal.` });
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(""); }
  }

  async function unissue() {
    if (!confirm("Pull this job order back to draft? The vendor will no longer see it.")) return;
    setBusy("unissue"); setMsg(null);
    try {
      absorb(await call("POST", { action: "unissue" }));
      setMsg({ ok: true, text: "Moved back to draft." });
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(""); }
  }

  async function printPdf() {
    if (dirty && !(await save())) return;
    window.open(`/print/job-order/${job.id}`, "_blank", "noopener");
  }

  const btn = "rounded-lg px-3.5 py-2 text-sm font-medium disabled:opacity-50";

  return (
    <div className="mt-4 space-y-5 pb-24">
      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 dark:bg-gray-900 dark:border-gray-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Vendor job order</p>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white mt-0.5">
              {job.item}{job.itemSize ? <span className="font-normal text-gray-500"> · {job.itemSize}</span> : null}
            </h1>
            <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
              J# {job.jNumber}{clientName && <> · {clientName}</>}{job.brand && <> · {job.brand}</>}
              {job.masterSku && <> · <span className="font-mono">{job.masterSku}</span></>}
            </p>
            <p className="text-sm mt-1 text-gray-700 dark:text-gray-300">
              Vendor: <span className="font-medium">{job.printingVendor || <span className="text-amber-600">not assigned</span>}</span>
              {vendor?.contactPerson && <span className="text-gray-500"> · {vendor.contactPerson}</span>}
              {vendor?.phone && <span className="text-gray-500"> · {vendor.phone}</span>}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
              isIssued
                ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
                : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"}`}>
              {isIssued ? `Issued · rev ${spec.rev}` : `Draft · rev ${spec?.rev ?? 1}`}
            </span>
            {spec?.vendorAckAt && !spec.ackStale && (
              <span className="text-xs text-green-700 dark:text-green-400">
                ✓ Accepted by vendor · rev {spec.vendorAckRev}
              </span>
            )}
            {spec?.ackStale && (
              <span className="text-xs text-amber-700 dark:text-amber-400">
                Vendor accepted rev {spec.vendorAckRev} — current is rev {spec.rev}
              </span>
            )}
            {isIssued && !spec?.vendorAckAt && (
              <span className="text-xs text-gray-500 dark:text-gray-400">Awaiting vendor acceptance</span>
            )}
          </div>
        </div>
        {job.sourcing === "traded" && (
          <p className="mt-3 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 dark:bg-amber-900/30 dark:text-amber-300">
            This job is marked as traded (bought-in). A print job order is usually only needed for in-house printed jobs.
          </p>
        )}
      </div>

      {/* Process */}
      <Section title="Printing process" hint="Only the fields for the chosen process are shown and printed." cols={3}>
        <F label="Process">
          <div className="flex gap-2">
            {PROCESSES.map((p) => (
              <button key={p.value} type="button" onClick={() => set("process")(p.value)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                  form.process === p.value
                    ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
                    : "border-gray-200 text-gray-700 dark:border-gray-700 dark:text-gray-300"}`}>
                {p.label}
              </button>
            ))}
          </div>
        </F>
        <F label="Print side"><Select value={form.printSide} onChange={set("printSide")} options={PRINT_SIDES} /></F>
        <F label="Total colours" hint={colourCountMismatch ? `Colour list has ${namedColours}` : undefined}>
          <input type="number" min="0" className={inputCls} {...bind("totalColours")} />
        </F>
        {processMismatch && (
          <p className="sm:col-span-3 text-xs text-amber-700 dark:text-amber-400">
            The job says {jobProcess === "flexo" ? "Flexo" : "Offset"}, this order says {form.process === "flexo" ? "Flexo" : "Offset"}. Update one of them so they agree.
          </p>
        )}
      </Section>

      {/* Substrate */}
      <Section title="Substrate / paper" hint="Pick from the paper master to fill mill, GSM and coating, then adjust if needed.">
        <F label="Search paper master" span={1}>
          <input className={inputCls} placeholder="e.g. 280 PE, Stora, kraft" value={paperQuery} onChange={(e) => setPaperQuery(e.target.value)} />
        </F>
        <F label="Paper master" span={2}>
          <select className={inputCls} value={form.masterPaperId || ""} onChange={(e) => pickPaper(e.target.value)}>
            <option value="">— Off-master / type below —</option>
            {form.masterPaperId && !filteredPapers.some((p) => p.id === form.masterPaperId) && (
              <option value={form.masterPaperId}>{form.substrateName || "Selected paper"}</option>
            )}
            {filteredPapers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.materialName}{p.gsm ? ` · ${p.gsm} gsm` : ""}{p.supplier ? ` · ${p.supplier}` : ""}
              </option>
            ))}
          </select>
        </F>
        <F label="Paper / board"><input className={inputCls} {...bind("substrateName")} /></F>
        <F label="Mill / supplier"><input className={inputCls} {...bind("substrateMill")} /></F>
        <F label="Coating"><input className={inputCls} placeholder="e.g. single-side PE, C1S" {...bind("substrateCoating")} /></F>
        <F label="GSM"><input type="number" className={inputCls} {...bind("substrateGsm")} /></F>
        <F label="BF"><input type="number" className={inputCls} {...bind("substrateBf")} /></F>
        <F label="Form"><Select value={form.substrateForm} onChange={set("substrateForm")} options={SUBSTRATE_FORMS} /></F>
        <F label="Substrate notes" span={3}>
          <input className={inputCls} placeholder="e.g. print on uncoated side; PE side is food contact" {...bind("substrateNotes")} />
        </F>
      </Section>

      {/* Colours */}
      <section className="bg-white border border-gray-200 rounded-xl p-5 dark:bg-gray-900 dark:border-gray-800">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Colours & Pantones</h2>
            <p className="text-xs text-gray-500 mt-0.5 dark:text-gray-400">
              In press order. The swatch is only a guide on screen — the vendor matches to the physical Pantone book.
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={addCmyk} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 dark:border-gray-700 dark:text-gray-300">+ CMYK</button>
            <button type="button" onClick={() => setColours((cs) => [...cs, blankColour()])} className="rounded-lg border border-gray-900 bg-gray-900 px-3 py-1.5 text-xs font-medium text-white dark:border-white dark:bg-white dark:text-gray-900">+ Colour</button>
          </div>
        </div>

        {colours.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center border border-dashed border-gray-200 rounded-lg dark:border-gray-700">
            No colours yet. Add each Pantone, and CMYK if the design uses process colours.
          </p>
        ) : (
          <div className="space-y-2">
            {colours.map((c, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end rounded-lg border border-gray-100 p-2.5 dark:border-gray-800">
                <div className="col-span-12 sm:col-span-1 flex sm:flex-col items-center gap-1 text-xs text-gray-400">
                  <span className="font-mono">#{i + 1}</span>
                  <div className="flex sm:flex-col">
                    <button type="button" aria-label="Move up" onClick={() => moveColour(i, -1)} className="px-1 hover:text-gray-900 dark:hover:text-white">▲</button>
                    <button type="button" aria-label="Move down" onClick={() => moveColour(i, 1)} className="px-1 hover:text-gray-900 dark:hover:text-white">▼</button>
                  </div>
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <label className={labelCls}>Type</label>
                  <Select value={c.colourType} onChange={(v) => setColour(i, "colourType", v)} options={COLOUR_TYPES} placeholder="Type" />
                </div>
                <div className="col-span-8 sm:col-span-3">
                  <label className={labelCls}>Pantone / ink name</label>
                  <input className={inputCls} placeholder="PANTONE 485 C" value={c.name} onChange={(e) => setColour(i, "name", e.target.value)} />
                </div>
                <div className="col-span-4 sm:col-span-1">
                  <label className={labelCls}>Swatch</label>
                  <input type="color" className="h-[38px] w-full rounded-lg border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-800"
                    value={/^#[0-9a-f]{6}$/i.test(c.swatchHex) ? c.swatchHex : "#ffffff"}
                    onChange={(e) => setColour(i, "swatchHex", e.target.value)} />
                </div>
                <div className="col-span-4 sm:col-span-1">
                  <label className={labelCls}>Side</label>
                  <Select value={c.side} onChange={(v) => setColour(i, "side", v)} options={COLOUR_SIDES} />
                </div>
                <div className="col-span-4 sm:col-span-1">
                  <label className={labelCls}>Cover %</label>
                  <input type="number" min="0" max="100" className={inputCls} value={c.coveragePct} onChange={(e) => setColour(i, "coveragePct", e.target.value)} />
                </div>
                {isFlexo ? (
                  <>
                    <div className="col-span-4 sm:col-span-1">
                      <label className={labelCls}>Deck</label>
                      <input type="number" min="1" className={inputCls} value={c.deckNo} onChange={(e) => setColour(i, "deckNo", e.target.value)} />
                    </div>
                    <div className="col-span-6 sm:col-span-1">
                      <label className={labelCls}>Anilox</label>
                      <input className={inputCls} placeholder="LPI/BCM" value={c.anilox} onChange={(e) => setColour(i, "anilox", e.target.value)} />
                    </div>
                  </>
                ) : (
                  <div className="col-span-10 sm:col-span-2">
                    <label className={labelCls}>Notes</label>
                    <input className={inputCls} value={c.notes} onChange={(e) => setColour(i, "notes", e.target.value)} />
                  </div>
                )}
                <div className="col-span-2 sm:col-span-1 flex justify-end">
                  <button type="button" onClick={() => setColours((cs) => cs.filter((_, j) => j !== i))}
                    className="text-xs text-red-600 hover:underline dark:text-red-400 pb-2.5">Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Varnish & finishing */}
      <Section title="Varnish & finishing">
        <F label="Varnish required">
          <div className="flex gap-2">
            {[{ v: true, l: "Yes" }, { v: false, l: "No" }].map((o) => (
              <button key={o.l} type="button" onClick={() => set("varnishRequired")(o.v)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                  form.varnishRequired === o.v
                    ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
                    : "border-gray-200 text-gray-700 dark:border-gray-700 dark:text-gray-300"}`}>{o.l}</button>
            ))}
          </div>
        </F>
        {form.varnishRequired && (
          <>
            <F label="Varnish type"><Select value={form.varnishType} onChange={set("varnishType")} options={VARNISH_TYPES} /></F>
            <F label="Coverage"><Select value={form.varnishCoverage} onChange={set("varnishCoverage")} options={VARNISH_COVERAGE} /></F>
            <F label="Varnish notes" span={3}>
              <input className={inputCls} placeholder="e.g. keep glue flap and bottom-curl area free of varnish" {...bind("varnishNotes")} />
            </F>
          </>
        )}
        <F label="Lamination"><Select value={form.lamination} onChange={set("lamination")} options={LAMINATIONS} /></F>
        <F label="Foiling"><input className={inputCls} placeholder="e.g. gold foil on logo" {...bind("foiling")} /></F>
        <F label="Embossing / debossing"><input className={inputCls} {...bind("embossing")} /></F>
        <F label="Food-contact packaging" span={3}>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={form.foodContact === true} onChange={(e) => set("foodContact")(e.target.checked)} />
            Low-migration inks and varnish; nothing printed on the food-contact side
          </label>
        </F>
      </Section>

      {/* Artwork & proof */}
      <Section title="Artwork & proof">
        <F label="Artwork file / ref"><input className={inputCls} placeholder="e.g. BB-12oz-DW-outer.ai" {...bind("artworkRef")} /></F>
        <F label="Artwork version"><input className={inputCls} placeholder="e.g. v3" {...bind("artworkRev")} /></F>
        <F label="Artwork approved on"><input type="date" className={inputCls} {...bind("artworkApprovedDate")} /></F>
        <F label="Dieline / KLD ref"><input className={inputCls} {...bind("dielineRef")} /></F>
        <F label="Proof required"><Select value={form.proofType} onChange={set("proofType")} options={PROOF_TYPES} /></F>
        <F label="Proof due"><input type="date" className={inputCls} {...bind("proofDueDate")} /></F>
        <F label="Colour tolerance"><input className={inputCls} placeholder="e.g. ΔE ≤ 2 vs approved proof" {...bind("colourTolerance")} /></F>
        <F label="Registration tolerance (mm)"><input type="number" step="0.05" className={inputCls} {...bind("registrationToleranceMm")} /></F>
      </Section>

      {/* Plates */}
      <Section title={isFlexo ? "Plates / cylinders" : "Plates"}>
        <F label="Plates"><Select value={form.platesStatus} onChange={set("platesStatus")} options={PLATE_STATUSES} /></F>
        <F label="Plate ref / set no."><input className={inputCls} {...bind("platesRef")} /></F>
        <F label="Plates owned by"><Select value={form.plateOwner} onChange={set("plateOwner")} options={PLATE_OWNERS} /></F>
        <F label="Plate charge (₹)" hint="Leave blank if not charged on this job">
          <input type="number" className={inputCls} {...bind("plateChargeInr")} />
        </F>
      </Section>

      {/* Process block */}
      {isFlexo ? (
        <Section title="Flexo details" hint="Reel press settings." cols={4}>
          <F label="Reel width (mm)"><input type="number" className={inputCls} {...bind("flexoReelDeckleMm")} /></F>
          <F label="Repeat length (mm)"><input type="number" className={inputCls} {...bind("flexoRepeatMm")} /></F>
          <F label="No. of decks"><input type="number" className={inputCls} {...bind("flexoNoOfDecks")} /></F>
          <F label="Plate thickness (mm)"><input type="number" step="0.01" className={inputCls} {...bind("flexoPlateThicknessMm")} /></F>
          <F label="Colour order on press" span={2}>
            <input className={inputCls} placeholder="e.g. White → 485 C → Black → Varnish" {...bind("flexoColourOrder")} />
          </F>
          <F label="Anilox (general)" span={2}>
            <input className={inputCls} placeholder="per-colour anilox goes in the colour list" {...bind("flexoAnilox")} />
          </F>
          <F label="Wind direction" span={2}>
            <Select value={form.flexoWindDirection} onChange={set("flexoWindDirection")} options={WIND_DIRECTIONS} />
          </F>
          <F label="Core dia (mm)"><input type="number" className={inputCls} {...bind("flexoCoreDiaMm")} /></F>
          <F label="Max reel OD (mm)"><input type="number" className={inputCls} {...bind("flexoReelOdMm")} /></F>
          <F label="Max splices per reel"><input type="number" className={inputCls} {...bind("flexoSplicesAllowed")} /></F>
          <F label="Corona treatment" span={3}><input className={inputCls} placeholder="e.g. treat print side to ≥ 38 dyn" {...bind("flexoCoronaTreatment")} /></F>
        </Section>
      ) : (
        <Section title="Offset details" hint="Sheet press settings." cols={4}>
          <F label="Sheet length (mm)"><input type="number" className={inputCls} {...bind("offsetSheetLengthMm")} /></F>
          <F label="Sheet width (mm)"><input type="number" className={inputCls} {...bind("offsetSheetWidthMm")} /></F>
          <F label="Grain"><Select value={form.offsetGrain} onChange={set("offsetGrain")} options={GRAINS} /></F>
          <F label="Ups per sheet"><input type="number" className={inputCls} {...bind("offsetUpsPerSheet")} /></F>
          <F label="No. of plates"><input type="number" className={inputCls} {...bind("offsetNoOfPlates")} /></F>
          <F label="Sheets required"><input type="number" className={inputCls} {...bind("offsetSheetsRequired")} /></F>
          <F label="Machine" span={2}><input className={inputCls} placeholder="e.g. Heidelberg 4-colour" {...bind("offsetMachine")} /></F>
          <F label="Punching / die cut" span={2}><Select value={form.offsetPunching} onChange={set("offsetPunching")} options={PUNCHING} /></F>
          <F label="Die ref" span={2}><input className={inputCls} {...bind("offsetDieRef")} /></F>
        </Section>
      )}

      {/* Qty */}
      <Section title="Quantity & allowances" cols={4}>
        <F label="Order quantity"><input type="number" className={inputCls} {...bind("orderQty")} /></F>
        <F label="Unit"><Select value={form.qtyUom} onChange={set("qtyUom")} options={QTY_UOMS} placeholder="pcs" /></F>
        <F label="Overs allowed (%)"><input type="number" step="0.5" className={inputCls} {...bind("oversAllowancePct")} /></F>
        <F label="Unders allowed (%)"><input type="number" step="0.5" className={inputCls} {...bind("undersAllowancePct")} /></F>
        <F label="Wastage allowance (%)"><input type="number" step="0.5" className={inputCls} {...bind("wastageAllowancePct")} /></F>
        {band && (
          <p className="sm:col-span-3 self-end pb-2 text-sm text-gray-700 dark:text-gray-300">
            Accepted quantity: <span className="font-semibold">{band.min.toLocaleString("en-IN")} – {band.max.toLocaleString("en-IN")}</span> {form.qtyUom || "pcs"}
          </p>
        )}
      </Section>

      {/* Delivery */}
      <Section title="Delivery & packing">
        <F label="Deliver to"><input className={inputCls} placeholder="e.g. Aeros factory" {...bind("deliveryTo")} /></F>
        <F label="Delivery due"><input type="date" className={inputCls} {...bind("deliveryDueDate")} /></F>
        <div className="hidden sm:block" />
        <F label="Delivery address" span={3}><textarea rows={2} className={inputCls} {...bind("deliveryAddress")} /></F>
        <F label="Packing instructions" span={3}>
          <textarea rows={2} className={inputCls} placeholder="e.g. stack flat, 500 sheets per bundle, shrink wrap, label with J# and qty" {...bind("packingInstructions")} />
        </F>
        <F label="Special instructions" span={3}><textarea rows={3} className={inputCls} {...bind("specialInstructions")} /></F>
      </Section>

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-950/95">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center gap-2">
          <div className="mr-auto min-w-0 text-sm">
            {msg ? (
              <span className={msg.ok ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}>{msg.text}</span>
            ) : dirty ? (
              <span className="text-amber-700 dark:text-amber-400">
                Unsaved changes{isIssued ? ` — saving will make this rev ${(spec?.rev ?? 1) + 1}` : ""}
              </span>
            ) : (
              <span className="text-gray-500 dark:text-gray-400">All changes saved</span>
            )}
          </div>
          {isIssued && (
            <button type="button" onClick={unissue} disabled={!!busy} className={`${btn} text-gray-600 hover:underline dark:text-gray-400`}>
              Back to draft
            </button>
          )}
          <button type="button" onClick={printPdf} disabled={!!busy}
            className={`${btn} border border-gray-200 text-gray-800 dark:border-gray-700 dark:text-gray-200`}>
            Print / PDF
          </button>
          <button type="button" onClick={save} disabled={!!busy || !dirty}
            className={`${btn} border border-gray-900 text-gray-900 dark:border-white dark:text-white`}>
            {busy === "save" ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={issue} disabled={!!busy}
            className={`${btn} bg-gray-900 text-white dark:bg-white dark:text-gray-900`}>
            {busy === "issue" ? "Issuing…" : isIssued ? "Re-issue to vendor" : "Issue to vendor"}
          </button>
        </div>
      </div>
    </div>
  );
}
