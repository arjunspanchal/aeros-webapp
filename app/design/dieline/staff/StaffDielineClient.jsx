"use client";
// Staff KLD maker. Maths only: lib/dieline/staff.js builds, cleans, audits and checks the die; this screen only collects
// inputs and shows the answer. Downloads stay locked while any "block" check fails.
import { useEffect, useMemo, useRef, useState } from "react";
import { TEMPLATES, TEMPLATE_GROUPS, templateLimits } from "@/lib/dieline/templates";
import { runStaffTemplate, fileStem } from "@/lib/dieline/staff";
import { MATERIAL_LIBRARY, MATERIAL_FAMILIES, materialById } from "@/lib/dieline/material-library";
import { panelsFromDie } from "@/lib/dieline/solid/arrangement";
import { programFor } from "@/lib/dieline/solid/programs";
import { solidModel } from "@/lib/dieline/solid";

import { dieEdges } from "@/lib/dieline/solid/arrangement";
import { checkArtwork, BLEED, itemColours } from "@/lib/dieline/designer/model";
import { refreshSvg } from "@/lib/dieline/designer/io";
import { paintArtwork, rasteriseItem, parseSvgDom, packArtwork, unpackArtwork } from "@/lib/dieline/designer/io";
import { artworkToPdf, imageXObject } from "@/lib/dieline/designer/vector-pdf";
import { planDigital, digitalSamplePdf, DIGITAL } from "@/lib/dieline/designer/digital-pdf";
import { sheetLayoutPdf } from "@/lib/dieline/designer/layout-pdf";
import { layoutUps } from "@/lib/dieline/print-rules";
import { vendorSheetPdf, describeArtwork } from "@/lib/dieline/designer/vendor-pdf";
import { cupNestPdf, fanPlacement } from "@/lib/dieline/designer/cup-nest-pdf";
import { CUP_NEST_REFS } from "@/lib/dieline/cup-nest-refs";
import { toPolar } from "@/lib/dieline/cup";
import { cupGeometry, cupItemChecks, cupFormedChecks, cupFitChecks, cupMarkChecks } from "@/lib/dieline/cup";
import { cupMarkText } from "@/lib/dieline/designer/house";
import { petGeometry, petItemChecks } from "@/lib/dieline/pet";
import { wrapGeometry, tilePlan, expandWrap, wrapArtChecks } from "@/lib/dieline/wrap";
import { wrapSheetPdf } from "@/lib/dieline/designer/wrap-pdf";
import { petArtPdf } from "@/lib/dieline/designer/pet-pdf";
import { cupProofPdf } from "@/lib/dieline/designer/proof-pdf";
import { bagProofPdf } from "@/lib/dieline/designer/proof-bag-pdf";
import { SCENES, sceneOf } from "@/lib/dieline/designer/scenes";
import { watermark, watermarkLayer } from "@/lib/dieline/designer/watermark";
import { zipBlob } from "@/lib/dieline/designer/zip";
import { cmykOf } from "@/lib/dieline/designer/vector-pdf";
import { corners as itemCorners } from "@/lib/dieline/designer/model";
import { curveItem } from "@/lib/dieline/designer/cup-warp";
import ArtworkDesigner from "./ArtworkDesigner";
import SolidViewer from "./SolidViewer"; // three.js runs only inside effects, safe on the server (as Fold3DViewer)
import { toSvg, toPdf } from "@/lib/dieline/exports";
import { toDiePdf, toDieSvg } from "@/lib/dieline/die-export";

const IN = 25.4;
const firstValues = (t) => {
  const p = t.proven[t.proven.length > 1 ? 1 : 0];
  const v = {};
  for (const i of t.inputs) v[i.key] = i.type === "bool" ? !!p[i.key] : p[i.key] != null ? +(+p[i.key]).toFixed(1) : 0; // a proven size brings its own ticks (DCB-002 = 2-piece)
  return v;
};
const defaultBoard = (t) => (t.family === "wrap" ? "wrap-white-38" : t.family === "pet" ? "fbb-300" : t.family === "bag" ? "bag-kraft-80" : t.family === "cup" ? (t.cup === "dw8" ? "cupstock-230" : "cupstock-230-1pe") : "fbb-300");
const useOf = (t) => (t.family === "wrap" ? "wrap" : t.family === "bag" ? "bag" : t.family === "cup" ? "cup" : "box");

const SEV = {
  block: { pass: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300", fail: "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300" },
  warn: { pass: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300", fail: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" },
  info: { pass: "bg-gray-50 text-gray-700 dark:bg-gray-900 dark:text-gray-300", fail: "bg-gray-50 text-gray-700 dark:bg-gray-900 dark:text-gray-300" },
};

// ONE CHECK LIST for the whole screen: what stops the job comes first, then what to confirm; everything that passes is
// folded into one line (a screen of green ticks was hiding the one red line that mattered).
function CheckList({ checks, className = "" }) {
  const row = (c, k) => (
    <li key={c.id + k} className={`rounded-md px-3 py-2 text-xs ${SEV[c.severity]?.[c.ok ? "pass" : "fail"] || SEV.info.pass}`}>
      <span className="font-semibold">{c.ok ? (c.severity === "info" ? "ℹ" : "✓") : c.severity === "block" ? "✕" : "!"} {c.title}</span> <span className="opacity-60">[{c.id}]</span>
      <div className="mt-0.5">{c.detail}</div>
    </li>
  );
  const stop = checks.filter((c) => !c.ok && c.severity === "block"), warn = checks.filter((c) => !c.ok && c.severity !== "block"), rest = checks.filter((c) => c.ok);
  return (
    <div className={className}>
      {(stop.length > 0 || warn.length > 0) && <ul className="space-y-1.5">{[...stop, ...warn].map(row)}</ul>}
      {rest.length > 0 && (
        <details className={stop.length || warn.length ? "mt-1.5" : ""}>
          <summary className="cursor-pointer rounded-md bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            ✓ {rest.length} check{rest.length === 1 ? "" : "s"} passed{stop.length ? "" : warn.length ? "" : " - nothing to fix"} <span className="font-normal opacity-70">(show)</span>
          </summary>
          <ul className="mt-1.5 space-y-1.5">{rest.map(row)}</ul>
        </details>
      )}
    </div>
  );
}

const WHITE_INK_MARK = "#03fbc5"; // stands for white ink in the 3D texture of a clear cup (SolidViewer turns it white)
let CAPTURE = null; // while a pack is being made, files are collected here instead of being downloaded
function save(name, text, type) {
  if (CAPTURE) { CAPTURE.push({ name, data: text, type }); return; }
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function StaffDielineClient() {
  const [tid, setTid] = useState(TEMPLATES[0].id);
  const t = TEMPLATES.find((x) => x.id === tid);
  const [cat, setCat] = useState(TEMPLATES[0].family); // the group of templates on show
  useEffect(() => { setCat(t.family); }, [tid]); // eslint-disable-line react-hooks/exhaustive-deps -- a loaded design brings its own group forward
  const [values, setValues] = useState(() => firstValues(TEMPLATES[0]));
  const [unit, setUnit] = useState("mm");
  const [boardSel, setBoardSel] = useState(() => defaultBoard(TEMPLATES[0]));
  const [process, setProcess] = useState("pantone");
  const [colours, setColours] = useState(2);
  const [job, setJob] = useState("");
  const [channel, setChannel] = useState(""); // "" | "direct" | "dealer" - who the job is sold to (never defaulted)

  function pickTemplate(id) {
    const nt = TEMPLATES.find((x) => x.id === id);
    setTid(id);
    setValues(firstValues(nt));
    setBoardSel(defaultBoard(nt));
    if (nt.family === "pet") { setProcess("pantone"); setColours(1); } // a PET cup prints one solid colour
    if (nt.wrap) { setProcess("pantone"); setColours(1); setWrapPitch(wrapGeometry(nt.wrap).pitch0); } // a wrap: one or two spot colours, pitch about a fifth of the width
    setArt([]);
    hist.current = { past: [], future: [] };
  }

  const families = MATERIAL_FAMILIES.filter((f) => f.use.includes(useOf(t)));
  const mat = materialById(boardSel) || MATERIAL_LIBRARY.find((m) => m.use.includes(useOf(t)));
  const famMats = MATERIAL_LIBRARY.filter((m) => m.family === mat.family);
  const board = { label: mat.name, gsm: mat.gsm, mm: mat.caliperMm, family: mat.family, id: mat.id, caliperStatus: mat.caliperStatus };
  const [foldT, setFoldT] = useState(1);
  const [art, setArt] = useState([]);
  const artRef = useRef(art); artRef.current = art;
  const hist = useRef({ past: [], future: [] });
  const [histN, setHistN] = useState(0); // re-render the Undo / Redo buttons
  const snapArt = () => { const h = hist.current; if (h.past[h.past.length - 1] === artRef.current) return; h.past.push(artRef.current); if (h.past.length > 80) h.past.shift(); h.future = []; setHistN((n) => n + 1); };
  const undoArt = () => { const h = hist.current; if (!h.past.length) return; h.future.push(artRef.current); setArt(h.past.pop()); setHistN((n) => n + 1); };
  const redoArt = () => { const h = hist.current; if (!h.future.length) return; h.past.push(artRef.current); setArt(h.future.pop()); setHistN((n) => n + 1); };
  const [tex, setTex] = useState(null);
  const [making, setMaking] = useState("");
  // saved designs
  const [saved, setSaved] = useState({ id: null, name: "", customer: "", list: null, msg: "" });
  const loadList = async () => { try { const r = await fetch("/api/design/dieline-designs"); const j = await r.json(); setSaved((sv) => ({ ...sv, list: j.designs || [], msg: j.error || "" })); } catch { setSaved((sv) => ({ ...sv, list: [], msg: "Could not load saved designs." })); } };
  async function saveDesign(asNew) {
    setSaved((sv) => ({ ...sv, msg: "Saving…" }));
    try {
      const body = { name: saved.name || fileStem({ template: res.template, values, board }), customer: saved.customer, job_ref: job, recipe: { ...res.recipe, channel, ...(wrapG ? { wrapPitch: +wrapPitch } : {}) }, artwork: packArtwork(art), checks_ok: !!ok && !artBlocked };
      const upd = saved.id && !asNew;
      const r = await fetch(upd ? `/api/design/dieline-designs/${saved.id}` : "/api/design/dieline-designs", { method: upd ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "Save failed");
      const dropped = body.artwork.filter((i) => i.missing).length;
      setSaved((sv) => ({ ...sv, id: j.design.id, name: j.design.name, list: null, msg: `Saved ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.${dropped ? ` ${dropped} large image${dropped > 1 ? "s were" : " was"} not stored: add the file again after opening.` : ""}` }));
    } catch (e) { setSaved((sv) => ({ ...sv, msg: e.message })); }
  }
  async function openDesign(id) {
    try {
      const r = await fetch(`/api/design/dieline-designs/${id}`), j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "Could not open");
      const d = j.design, rc = d.recipe, nt = TEMPLATES.find((x) => x.id === rc.template);
      if (!nt) throw new Error("This design uses a template that no longer exists.");
      setTid(nt.id); setValues(rc.values || firstValues(nt));
      setBoardSel(rc.board?.id || defaultBoard(nt));
      setProcess(rc.print?.process || "pantone"); setColours(rc.print?.colours || 1); setChannel(rc.channel || ""); if (rc.wrapPitch) setWrapPitch(rc.wrapPitch);
      setJob(d.job_ref || ""); setArt(unpackArtwork(d.artwork)); hist.current = { past: [], future: [] };
      setSaved((sv) => ({ ...sv, id: d.id, name: d.name, customer: d.customer || "", list: null, msg: `Opened "${d.name}".` }));
    } catch (e) { setSaved((sv) => ({ ...sv, msg: e.message })); }
  }
  // FACTORYOS JOB (Arjun 21-Nov-2026): the design is tied to its job, and the printer's set goes onto the job's own
  // "Messages & files" thread, where the printer assigned to the job sees it - no download, rename and mail.
  const [jobs, setJobs] = useState(null), [linked, setLinked] = useState(null), [jobFind, setJobFind] = useState(false), [sending, setSending] = useState("");
  const loadJobs = async () => { if (jobs) return jobs; try { const j = await (await fetch("/api/design/jobs")).json(); const l = j.jobs || []; setJobs(l); return l; } catch { setJobs([]); return []; } };
  const linkJob = (j) => { setLinked(j); setJob(j.jNumber); setJobFind(false); if (j.brand) setSaved((sv) => (sv.customer ? sv : { ...sv, customer: j.brand })); };
  useEffect(() => { // opened from a job (…/staff?job=<id>): link it straight away
    const id = new URLSearchParams(window.location.search).get("job");
    if (id) loadJobs().then((l) => { const j = l.find((q) => q.id === id || q.jNumber === id); if (j) linkJob(j); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (linked && job !== linked.jNumber) setLinked(null); }, [job]); // eslint-disable-line react-hooks/exhaustive-deps -- the number was edited: no longer that job
  const jobHits = jobFind && jobs ? jobs.filter((j) => { const q = job.trim().toLowerCase(); return !q || `${j.jNumber} ${j.brand} ${j.item} ${j.printer}`.toLowerCase().includes(q); }).slice(0, 8) : [];
  const viewerRef = useRef(null);
  const print = { process, colours: process === "plain" ? 0 : +colours };

  const lim = templateLimits(t);
  const res = useMemo(() => runStaffTemplate(tid, values, board, print), [tid, JSON.stringify(values), board.gsm, board.mm, process, colours]); // eslint-disable-line react-hooks/exhaustive-deps
  const ok = res && !res.error && !res.blocked;
  const preview = useMemo(() => (res && res.doc ? toSvg(res.doc, { units: "mm", showDims: true, title: "" }) : ""), [res]);
  const stem = res && res.template ? fileStem({ template: res.template, values, board: res.template.family === "pet" ? null : board }) + (job.trim() ? `-${job.trim().replace(/[^A-Za-z0-9-]+/g, "-")}` : "") : "kld";

  const show = (mm) => (unit === "mm" ? +(+mm).toFixed(1) : +(mm / IN).toFixed(3));
  const setVal = (key, raw, isBool) =>
    setValues((v) => ({ ...v, [key]: isBool ? raw : raw === "" ? "" : unit === "mm" ? +raw : +(+raw * IN).toFixed(2) }));

  const cupG = useMemo(() => (t.cup ? cupGeometry(t.cup) : null), [tid]); // eslint-disable-line react-hooks/exhaustive-deps

  const [wrapPitch, setWrapPitch] = useState(61); // wrap sheets: the target pitch of the repeat, mm
  const wrapG = useMemo(() => (t.wrap ? wrapGeometry(t.wrap) : null), [tid]); // eslint-disable-line react-hooks/exhaustive-deps -- wrap sheets: flat, all-over repeat
  const wrapPlan = useMemo(() => (wrapG ? tilePlan(wrapG.W, wrapG.H, wrapPitch) : null), [wrapG, wrapPitch]);
  const petG = useMemo(() => (t.pet ? petGeometry(t.pet) : null), [tid]); // eslint-disable-line react-hooks/exhaustive-deps -- PET cups: direct print, the die is the print rectangle
  const innerG = useMemo(() => (t.innerCup ? cupGeometry(t.innerCup) : null), [tid]); // eslint-disable-line react-hooks/exhaustive-deps
  const [cupView, setCupView] = useState("full"); // double wall: "full" = wrap on its inner cup, "wrap" = the outer fan alone
  const prog = useMemo(() => (res && res.doc ? programFor(tid, values, res.doc) : null), [res]); // eslint-disable-line react-hooks/exhaustive-deps
  const panelsAny = useMemo(() => (res && res.doc ? panelsFromDie(res.doc, { rootPoint: prog?.rootPoint }) : null), [res, prog]);
  const geom = prog ? panelsAny : null;
  // artwork: where logos may sit, where ink may never go, and the checks
  const blankMm = res && res.doc ? { w: res.blankMm[0], h: res.blankMm[1] } : null;
  const artCtx = useMemo(() => {
    if (!res || !res.doc || !panelsAny) return null;
    const total = panelsAny.panels.reduce((s2, p) => s2 + p.area, 0);
    const areas = prog?.areas || panelsAny.panels.filter((p) => p.area > total * 0.06).sort((p, q) => q.area - p.area).slice(0, 6)
      .map((p, k) => { const xs = p.outline.map((v) => v[0]), ys = p.outline.map((v) => v[1]); return { name: `Panel ${k + 1}`, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }; });
    if (wrapG) return { edges: dieEdges(res.doc), blankBox: [0, 0, wrapG.W, wrapG.H], family: "box", topCutY: null, noInk: [], print, areas: [], customGeometry: () => [] }; // a repeat has no placement rules: the tile does the placing
    if (petG) return { edges: dieEdges(res.doc), blankBox: [0, 0, petG.w, petG.bandH], family: "box", topCutY: null, noInk: [], print, clipPoly: [[0, 0], [petG.w, 0], [petG.w, petG.bandH], [0, petG.bandH]],
      areas: [{ name: "Print band", box: [0, 0, petG.w, petG.bandH] }], customGeometry: (it) => petItemChecks(petG, it, itemCorners) };
    if (cupG) { const xs = cupG.limit.poly.map((q) => q[0]), ys = cupG.limit.poly.map((q) => q[1]);
      return { edges: dieEdges(res.doc), blankBox: [0, 0, res.blankMm[0], res.blankMm[1]], family: "cup", topCutY: null, noInk: [], print, clipPoly: cupG.bleed.poly, houseGeometry: (it) => cupMarkChecks(cupG, it),
        areas: [{ name: "Cup wall", box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }], customGeometry: (it) => cupItemChecks(cupG, it) }; }
    return { edges: dieEdges(res.doc), blankBox: [0, 0, res.blankMm[0], res.blankMm[1]], family: t.family, topCutY: prog?.topCutY ?? null, noInk: prog?.noInk || [], areas, print };
  }, [res, panelsAny, prog, process, colours]); // eslint-disable-line react-hooks/exhaustive-deps
  // WHO THE JOB IS SOLD TO decides if the Aeros mark goes on (cortex 2c): a choice per job, never a default
  const houseKind = cupG ? "cup" : t.id === "sos-handmade" ? "bag" : null; // packs whose house mark this tool can add
  const artChecks = useMemo(() => {
    if (!artCtx) return [];
    const base = checkArtwork(art, artCtx);
    if (wrapG) return art.length ? [...base, ...wrapArtChecks(wrapG, wrapPlan, art)] : base; // no Aeros mark on a wrap, so who it is sold to does not change the file
    if (art.length && petG) { // moulded cups: solid spot colours only (PET one, PP up to two); no Aeros mark, whoever it is sold to
      const ground = art.some((i) => i.kind === "flood"), M = petG.mat, cap = petG.maxInks;
      const inks = new Set(art.flatMap((i) => (i.kind === "flood" ? [i.colour] : i.kind === "svg" ? (i.colours || []).map((c2) => c2.to) : ["picture"])).map((c2) => String(c2).toLowerCase()).filter((c2) => c2 !== "#ffffff"));
      const n = inks.size - (inks.has("picture") ? 1 : 0);
      return [...base, ...(ground ? [{ id: "PET-NO-GROUND", ok: false, severity: "block", title: `${M} cup: no full background patch`, detail: `Remove the colour ground. A ${M} cup carries logos, text and line work only.` }] : []), { id: "PET-ONE-COLOUR", ok: n <= cap && !inks.has("picture"), severity: "block", title: cap === 1 ? "PET cup: the whole artwork is ONE solid colour" : `${M} cup: solid colours only, ${cap} at most`,
        detail: inks.has("picture") ? `A picture cannot be printed on a ${M} cup. Use the vector logo in a solid colour (or trace it).` : n <= cap ? `${n} ink${n === 1 ? "" : "s"}.` : `${n} colours on the artwork. A ${M} cup prints ${cap === 1 ? "one solid colour only" : `${cap} solid colours at most`}: give objects the same ink (click the job-colour swatch beside its colour).` }];
    }
    if (!art.length) return base;
    const marks = art.filter((i) => i.house === "mark"), C = (id, ok, sev, title, detail) => ({ id, ok, severity: sev, title, detail });
    const out = [C("CHANNEL", !!channel, "block", "Who the job is sold to is chosen", channel === "direct" ? "Sold direct to the end customer: the Aeros mark goes on the pack." : channel === "dealer" ? "Sold through a dealer: no Aeros branding anywhere on the pack." : "Choose it in step 4 (Print). It decides whether the Aeros mark goes on: direct = yes, dealer = none at all.")];
    if (channel === "dealer") out.push(C("CHANNEL-MARK", !marks.length, "block", "Dealer sale: no Aeros mark on the pack", marks.length ? "Remove the Aeros mark - a pack sold through a dealer carries no Aeros branding." : "None on the artwork."));
    if (channel === "direct" && houseKind) out.push(C("CHANNEL-MARK", marks.length === 1, "block", "Direct sale: the Aeros mark is on the pack", marks.length === 1 ? (houseKind === "cup" ? "One line, hidden in the fold." : "The footer block of this SKU, on the bottom flap.") : marks.length ? "Only one Aeros mark per pack." : 'Press "Add Aeros mark" in the artwork tools.'));
    if (channel === "direct" && !houseKind) out.push(C("CHANNEL-MARK", true, "info", "Aeros mark for this pack", "No house mark for this item is in the tool yet (food boxes use the house base block). Add it with the house tool, or send Arjun the file."));
    return [...base, ...out];
  }, [art, artCtx, channel, houseKind, wrapPlan]);
  // what is drawn and printed: curved items bent onto the cup
  const artOut = useMemo(() => (wrapG ? expandWrap(art, wrapPlan, [-BLEED, -BLEED, wrapG.W + BLEED, wrapG.H + BLEED])
    : cupG ? art.map((it) => { if (!it.curve || it.kind !== "svg") return it; try { return curveItem(it, cupG, parseSvgDom); } catch { return it; } }) : art), [art, cupG, wrapG, wrapPlan]);
  const artBlocked = artChecks.some((c) => !c.ok && c.severity === "block");
  const spotN = useMemo(() => new Set(art.flatMap(itemColours).filter((c) => !c.process).map((c) => c.hex.toLowerCase())).size, [art]); // colours the artwork really prints
  useEffect(() => { // artwork on the 3D model
    let live = true;
    if (!art.length || !blankMm || !artCtx) { setTex(null); return; }
    const px = petG ? 12 : Math.min(5, 4096 / Math.max(blankMm.w, blankMm.h));
    // on a clear cup an ink NAMED white ("Opaque White") is white ink: it is painted in a marker colour that the 3D view turns into opaque white
    const cupArt = petG ? artOut.map((i) => (i.kind === "svg" && (i.colours || []).some((c2) => /\bwhite\b/i.test(c2.name || "")) ? refreshSvg({ ...i, colours: i.colours.map((c2) => (/\bwhite\b/i.test(c2.name || "") ? { ...c2, to: WHITE_INK_MARK } : c2)) }) : i)) : artOut;
    paintArtwork(cupArt, { box: [0, 0, blankMm.w, blankMm.h], pxPerMm: cupG ? Math.min(12, px * 2) : px, noInk: artCtx.noInk, background: petG ? null : mat.colour3d.top, clipPoly: artCtx.clipPoly || null }).then((cv) => { if (live) setTex(cv); }).catch(() => {});
    return () => { live = false; };
  }, [artOut, artCtx, mat.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // vector artwork (true paths + one plate per Pantone) for the print files
  const vectorArt = () => artworkToPdf(artOut, { box: petG ? [0, 0, petG.w, petG.bandH] : [-BLEED, -BLEED, blankMm.w + BLEED, blankMm.h + BLEED], noInk: artCtx.noInk, spot: process === "pantone", rasterise: rasteriseItem, parse: parseSvgDom, clipPoly: artCtx.clipPoly || null });
  const sizeText = t.inputs.filter((i) => i.type !== "bool" && +values[i.key] > 0).map((i) => `${i.label} ${values[i.key]} mm`).join(", ");
  const jobLines = (vec) => [
    `${t.name}${sizeText ? ` | ${sizeText}` : ""}${res.piecesPerBag === 2 ? " | 2-PIECE: 2 halves per bag" : ""}`,
    `Material: ${board.label} (${board.mm} mm${board.caliperStatus === "assumed" ? ", assumed" : ""}) | Print: ${process === "pantone" ? `${colours} Pantone` : process.toUpperCase()} | Blank ${blankMm.w} x ${blankMm.h} mm | Bleed ${BLEED} mm`,
    `${process === "pantone" ? "Plates" : "Colours (CMYK)"}: ${vec.inks.map((k) => `${k.label}`).join("; ") || "-"}${vec.images.length ? " + CMYK image(s)" : ""}`,
    ...art.filter((i) => i.kind !== "flood").map((i) => `${i.name}: ${i.w} x ${i.h} mm, centre ${i.x} mm from left / ${i.y} mm from top${i.rot ? `, turned ${i.rot} deg` : ""}`),
    ...vec.notes,
  ];
  // File names follow the Blueline / Lucky sets (checked 21-Nov-2026 against the real files): LAYOUT = artwork WITH the
  // outlines, ARTWORK-PUNCH = artwork alone, PUNCH = outlines alone. kind: "layout" | "artpunch" | "vendor".
  async function printFile(kind) {
    setMaking(kind);
    try {
      const vec = await vectorArt();
      let pdf;
      if (kind === "wrapart" || kind === "wrap4" || kind === "wrapgrid") { // wrap sheets: the house print files, written by lib/dieline/designer/wrap-pdf.js
        const brand = (saved.customer || saved.name || "aeros").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "aeros", stage = kind === "wrap4" ? "OFFSET-LAYOUT-4up" : kind === "wrapgrid" ? "GRIDCHECK" : "ARTONLY";
        const out = await wrapSheetPdf({ g: wrapG, plan: wrapPlan, items: art, up: kind === "wrap4" ? 4 : 1, grid: kind === "wrapgrid",
          vec: (list, box) => artworkToPdf(list, { box, noInk: [], spot: process === "pantone", rasterise: rasteriseItem, parse: parseSvgDom }),
          caption: `GRIDCHECK - ${saved.customer || "Aeros"} wrap sheet ${wrapG.W} x ${wrapG.H} mm - 10 mm grid from the cut (blue), centre lines, repeat tiles ${wrapPlan.Px.toFixed(2)} x ${wrapPlan.Py.toFixed(2)} mm (magenta) - NOT FOR PRINT` });
        save(`${brand}_${t.wrapFile.size}_wrap-sheet_sheet_${stage}-v1.pdf`, out.pdf, "application/pdf");
        setMaking(""); return;
      }
      if (kind === "petart") { // the plate file: one page = the print rectangle, artwork only
        const brand = (saved.customer || saved.name || "aeros").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "aeros";
        save(`${brand}_${t.petFile.size}_${t.petFile.item}_print_ART-v1-VENDOR.pdf`, petArtPdf(vec, petG.w, petG.bandH), "application/pdf");
        setMaking(""); return;
      }
      if (kind === "vendor") {
        const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
        pdf = vendorSheetPdf({ doc: res.doc, vector: vec,
          head: { title: t.name, sub: [saved.name && `Design: ${saved.name}`, saved.customer && `Customer: ${saved.customer}`, job && `Job: ${job}`, today, "Sizes in mm, inches in brackets"].filter(Boolean).join("  |  ") },
          job: [["Item", t.name], ...(sizeText ? [["Size", sizeText]] : []), ...(res.piecesPerBag === 2 ? [["Made as", "2 pieces: two identical halves per bag"]] : []), ["Blank", `${blankMm.w} x ${blankMm.h} mm`],
            petG ? ["Cup", `${petG.label}: top ${petG.td} x base ${petG.bd} x height ${petG.h} mm, clear ${petG.mat}. Print band ${petG.band[0]} to ${petG.band[1]} mm below the brim (${petG.bandH} mm tall).`]
              : ["Material", `${board.label}, ${board.mm} mm thick${board.caliperStatus === "assumed" ? " (assumed)" : ""}`]],
          print: petG ? [["Process", `Dry offset, direct on the cup: ${vec.inks.length} solid spot colour${vec.inks.length === 1 ? "" : "s"}`], ["Print rectangle", `${petG.w} x ${petG.bandH} mm - width to match your plate blank. Wraps 360 deg, no bleed.`]] : [["Process", process === "pantone" ? `${vec.inks.length} Pantone colour${vec.inks.length === 1 ? "" : "s"}` : process === "cmyk" ? "CMYK" : "Plain"], ["Bleed", `${BLEED} mm past the cut`],
            ...(layFit ? [["Sheet", `${layFit.sheet} (${Math.round(layFit.sw)} x ${Math.round(layFit.sh)} mm), ${layFit.ups}-up, gripper ${layFit.margins.gripper} mm on the ${layFit.gripperOn} edge, ${layFit.press}`]] : [])],
          art: describeArtwork(art, { areas: cupG ? [] : artCtx.areas, blank: blankMm, cup: cupG, toPolar }),
          notes: [...(artCtx.noInk.length || cupG ? ["Glue areas are left unprinted."] : []), "Plates are made from the artwork file without outlines, not from this sheet.", ...vec.notes] });
      } else {
        pdf = toPdf(res.doc, { units: "mm", showDims: false, showDie: kind === "layout", vector: vec, footerLines: vec.notes,
          title: `${kldTitle} | ${kind === "layout" ? "ARTWORK + OUTLINES" : "ARTWORK, NO OUTLINES"}` });
      }
      const petBrand = (saved.customer || saved.name || "aeros").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "aeros";
      save(petG && kind === "vendor" ? `${petBrand}_${t.petFile.size}_${t.petFile.item}_print_ART-DIM-v1-VENDOR.pdf` : `${stem}-${kind === "layout" ? "LAYOUT" : kind === "artpunch" ? "ARTWORK-PUNCH" : "VENDOR"}.pdf`, pdf, "application/pdf");
    } catch (e) { alert(`Could not make the file: ${e.message}`); }
    setMaking("");
  }
  // DIGITAL SAMPLE: the 13 x 19 in sheet for the digital press (skill aeros-digital-samples): art as a 450 dpi image,
  // solid pink CutContour + green Crease lines, an info box with paper / side / assembly on every sheet.
  const digPlan = useMemo(() => (res && res.doc && blankMm && !petG ? planDigital({ doc: res.doc, blank: blankMm, bleed: BLEED, cup: cupG }) : null), [res, blankMm?.w, blankMm?.h, cupG]); // eslint-disable-line react-hooks/exhaustive-deps
  async function digitalFile() {
    setMaking("digital");
    try {
      const images = [];
      for (const pc of digPlan.pieces) {
        if (!art.length) { images.push(null); continue; }
        const cv = await paintArtwork(artOut, { box: pc.box, pxPerMm: DIGITAL.dpi / 25.4, noInk: artCtx.noInk, background: "#ffffff", clipPoly: artCtx.clipPoly || null });
        images.push(await imageXObject(cv));
      }
      const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
      const fam = t.family, dg = t.digital || {};
      const paper = fam === "cup" ? `${board.label} - cup stock, ONE side poly` : fam === "bag" ? `${board.label}` : `${board.label} - NO poly`;
      const inks = process === "pantone" ? [...new Set(art.flatMap((i) => (i.kind === "flood" ? [i.pantone] : (i.colours || []).map((c2) => c2.name))).filter(Boolean))] : [];
      const pdf = digitalSamplePdf({ doc: res.doc, plan: digPlan, images, cutOnly: !!cupG,
        head: { title: `AEROS - ${saved.customer || "customer not named"} - ${t.name}${sizeText ? ` (${sizeText})` : ""} - DIGITAL SAMPLE - ${DIGITAL.name} - ${today}`,
          lines: [
            ["ITEM", `${t.name}. ${digPlan.note}. Cut size ${blankMm.w} x ${blankMm.h} mm${cupG ? "" : `, ${BLEED} mm bleed all round`}.${res.piecesPerBag === 2 ? " 2-PIECE bag: this flat is ONE half; two are needed per bag." : ""}`],
            ["PAPER", `${paper}${board.caliperStatus === "assumed" ? "" : ""}`],
            ["PRINT", art.length ? `full colour digital - the art is one ${DIGITAL.dpi} dpi image (never vector).${inks.length ? ` Production is ${inks.length} PANTONE (${inks.join(", ")}): match as close as the digital press allows.` : ""}` : "nothing to print - blank keyline sample"],
            ["CUT", cupG ? "on the solid pink line only. Nothing else on the sheet is a cut or a fold." : "on the solid pink line all round."],
            ...(cupG ? [] : [["CREASE", "every solid green line, then fold away from the printed side."]]),
          ],
          assembly: [...(dg.assembly || []), ...(digPlan.split ? ["This flat is in lettered pieces: tape them together on the back, edge to edge, in letter order, before folding."] : [])] } });
      save(`${stem}-DIGITAL-SAMPLE-${digPlan.split ? `${digPlan.pieces.length}pc` : `${digPlan.ups}up`}-330x483mm.pdf`, pdf, "application/pdf");
    } catch (e) { alert(`Could not make the file: ${e.message}`); }
    setMaking("");
  }
  // CUSTOMER PROOF (paper cups): the house proof layout (designer/proof-pdf.js). Needs 3 or 4 shots taken from the 3D
  // view (Arjun 21-Nov-2026: "Until those are clicked it cannot be exported"), the mesh view on page 2, and the cup's
  // sizes from the product list - never from the die.
  const artSig = useMemo(() => tid + "|" + JSON.stringify(art.map((i) => [i.id, i.x, i.y, i.w, i.h, i.rot, i.kind === "flood" ? i.colour : (i.colours || []).map((c2) => c2.to)])), [art, tid]);
  const [shots, setShots] = useState([]), [prodRows, setProdRows] = useState(null), [proofPick, setProofPick] = useState(""), [proofNo, setProofNo] = useState(1);
  useEffect(() => { // the cups in the product list, with their sizes
    setProofPick(""); setProdRows(null); setShots([]);
    if (!cupG) return;
    let live = true;
    fetch(`/api/design/product-dims?prefix=${cupG.wall === "double" ? "PC-DW" : "PC-SW"}`).then((r) => r.json()).then((j) => { if (live) setProdRows((j.products || []).filter((r) => r.td && r.bd && r.h && Math.abs(r.td - cupG.spec.TD) <= 1 && Math.abs(r.bd - cupG.spec.BD) <= 1 && Math.abs(r.h - cupG.spec.H) <= 6)); }).catch(() => { if (live) setProdRows([]); });
    return () => { live = false; };
  }, [tid]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadImage = (src) => new Promise((ok2, bad) => { const im = new Image(); im.onload = () => ok2(im); im.onerror = () => bad(new Error("Could not read a picture for the proof.")); im.src = src; });
  // TURNTABLE VIDEO: one full turn of the model as it stands in the 3D view (background, scene and height as set), recorded
  // off the view frame by frame with the Aeros watermark on every frame. MP4 where the browser can write it, else WebM.
  const [spin, setSpin] = useState(0); // 0 = idle, else seconds left
  async function turntable(seconds = 8) { const clip = await recordTurn(seconds); if (clip) save(`${stem}-3D-TURNTABLE.${clip.ext}`, clip.blob, clip.blob.type); }
  async function recordTurn(seconds = 8) { // one full turn of the view as it stands -> { blob, ext } (null if it could not be recorded)
    let clip = null;
    const v = viewerRef.current, fps = 30;
    const type = ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
    if (!type) { alert("This browser cannot record video. Use Chrome or Edge."); return null; }
    v.spinStart(1920); // about 1920 px wide for the recording
    const src = v.canvas(), W2 = src.width & ~1, H2 = src.height & ~1;
    const out = document.createElement("canvas"); out.width = W2; out.height = H2;
    const g2 = out.getContext("2d"), wm = watermarkLayer(W2, H2), chunks = [];
    const rec = new MediaRecorder(out.captureStream(fps), { mimeType: type, videoBitsPerSecond: 10_000_000 });
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise((ok2) => { rec.onstop = ok2; });
    try {
      const frames = seconds * fps, t0 = performance.now();
      const draw = (k) => { v.spinTo(k / frames); g2.drawImage(src, 0, 0, W2, H2); g2.drawImage(wm, 0, 0); };
      draw(0); rec.start();
      for (let k = 1; k <= frames; k++) { // paced by the clock, so the turn takes exactly `seconds`
        await new Promise((r) => setTimeout(r, Math.max(0, t0 + (k * 1000) / fps - performance.now())));
        draw(k); if (k % fps === 0) setSpin(seconds - k / fps);
      }
      await new Promise((r) => setTimeout(r, 120));
      rec.stop(); await done;
      clip = { blob: new Blob(chunks, { type: type.split(";")[0] }), ext: type.includes("mp4") ? "mp4" : "webm" };
    } catch (e) { alert(`Could not record the video: ${e.message}`); }
    v.spinEnd(); setSpin(0);
    return clip;
  }
  // MOCKUP PACK (Arjun 21-Nov-2026): everything sales sends a prospect, in one zip - the three standard views, the product
  // in each scene, and the turntable. All from the measured model, all watermarked; nothing is generated.
  const [pack, setPack] = useState("");
  const [dress, setDress] = useState({ drink: "", lid: "", straw: "" }); // a drink, lid and straw on the 3D cup - for pictures only
  async function mockupPack() {
    const v = viewerRef.current, scene0 = scene3d, wait = (ms) => new Promise((r) => setTimeout(r, ms)), files = [];
    const shot = async (name) => { await wait(120); const cv = watermark(await loadImage(v.snapshot(2))); const b64 = atob((/\.jpg$/.test(name) ? cv.toDataURL("image/jpeg", 0.92) : cv.toDataURL("image/png")).split(",")[1]), data = new Uint8Array(b64.length); for (let i = 0; i < b64.length; i++) data[i] = b64.charCodeAt(i); files.push({ name, data }); }; // (toBlob can hang in a background tab)
    try {
      setPack("Views…");
      if (sceneOf(scene0).src) { setScene3d("plain"); await wait(900); }
      for (const [k, label] of [["iso", "1-three-quarter"], ["front", "2-front"], ["back", "3-back"]]) { v.view(k); await shot(`${stem}-MOCKUP-${label}.png`); }
      v.view("iso");
      const plates = SCENES.filter((q) => q.src);
      await Promise.all(plates.map((q) => new Promise((r) => { const im = new Image(); im.onload = im.onerror = r; im.src = q.src; setTimeout(r, 4000); }))); // the plates are in hand before the scene is switched
      let n = 4;
      for (const q of plates) { setPack(`Scene: ${q.label.split(" (")[0]}…`); setScene3d(q.key); await wait(1500); v.view("iso"); await shot(`${stem}-MOCKUP-${n++}-${q.key}.jpg`); } // a scene is a photograph: JPEG keeps it small enough to send
      setScene3d(scene0); await wait(900);
      setPack("Turntable…"); setSpin(8);
      const clip = await recordTurn(8);
      if (clip) files.push({ name: `${stem}-MOCKUP-${n}-turntable.${clip.ext}`, data: new Uint8Array(await clip.blob.arrayBuffer()) });
      save(`${stem}-MOCKUP-PACK.zip`, zipBlob(files), "application/zip");
    } catch (e) { alert(`Could not make the mockup pack: ${e.message}`); setScene3d(scene0); }
    setPack("");
  }
  // the product in each lifestyle scene, three-quarter view, watermarked - for the "how it looks" pages of a proof
  async function sceneShots() {
    const v = viewerRef.current, scene0 = scene3d, wait = (ms) => new Promise((r) => setTimeout(r, ms)), out = [], plates = SCENES.filter((q) => q.src);
    await Promise.all(plates.map((q) => new Promise((r) => { const im = new Image(); im.onload = im.onerror = r; im.src = q.src; setTimeout(r, 4000); })));
    try {
      for (const q of plates) { setScene3d(q.key); await wait(1500); v.view("iso"); await wait(150); const cv = watermark(await loadImage(v.snapshot(2))); out.push({ ...(await imageXObject(cv)), w: cv.width, h: cv.height, caption: q.label.split(" (")[0] }); }
    } finally { setScene3d(scene0); await wait(700); }
    return out;
  }
  // EVERY SNAPSHOT of the 3D view carries the Aeros house watermark (Arjun 21-Nov-2026) - downloads and proof shots alike
  async function saveShot(name) {
    try { const cv = watermark(await loadImage(viewerRef.current.snapshot(2))), a2 = document.createElement("a"); a2.href = cv.toDataURL("image/png"); a2.download = name; a2.click(); }
    catch (e) { alert(`Could not save the picture: ${e.message}`); }
  }
  async function takeShot() {
    const cv = watermark(await loadImage(viewerRef.current.snapshot(2))), url = cv.toDataURL("image/png"); // watermarked the moment it is taken
    setShots((l) => [...l, { url, w: cv.width, h: cv.height, sig: artSig, caption: `View ${l.length + 1}` }].slice(0, 4));
  }
  const proofRow = (prodRows || []).find((r) => r.sku === proofPick) || null;
  const freshShots = shots.filter((s2) => s2.sig === artSig);
  const bagProof = t.family === "bag"; // bags: the house bag proof (flat + grid + 3D), ported in proof-bag-pdf.js
  const proofWhy = !cupG && !bagProof ? [] : [
    !(ok && !artBlocked) && "every check on this screen must pass",
    !art.length && "place the artwork",
    !saved.customer.trim() && "type the customer / brand name (it heads every page)",
    cupG && !proofRow && "choose the product from the product list (its sizes are the ones printed on the proof)",
    freshShots.length < 3 && `take ${3 - freshShots.length} more shot${3 - freshShots.length === 1 ? "" : "s"} of the 3D view (3 or 4 are needed)${shots.length > freshShots.length ? " - the artwork changed since the old ones were taken" : ""}`,
  ].filter(Boolean);
  async function proofFile() {
    setMaking("proof");
    try {
      const vec = await vectorArt(), views = [];
      for (const s2 of freshShots) { const im2 = await loadImage(s2.url), cv = document.createElement("canvas"); cv.width = im2.naturalWidth; cv.height = im2.naturalHeight; cv.getContext("2d").drawImage(im2, 0, 0); views.push({ ...(await imageXObject(cv)), w: cv.width, h: cv.height, caption: s2.caption }); }
      if (bagProof) { // PAPER BAG: the house bag proof. Every size on it is the size of this die, as entered in step 2.
        const Wb = +values.W, Gb = +values.G, Hb = +values.H, inch = (mm) => (mm / 25.4).toFixed(1), dcut = t.id === "dcut-bag", brown = /brown/i.test(mat.top || "");
        const body = [...artCtx.areas].sort((a, b) => a.box[0] - b.box[0]), lab = (n2) => (/front/i.test(n2) && /back/i.test(n2) ? "FRONT / BACK" : /front/i.test(n2) ? "FRONT" : /back/i.test(n2) ? "BACK" : "SIDE");
        const panels = [...(body[0].box[0] > 1 ? [{ label: "GLUE", a: 0, b: body[0].box[0] }] : []), ...body.map((a) => ({ label: lab(a.name), a: a.box[0], b: a.box[2] })), ...(blankMm.w - body[body.length - 1].box[2] > 1 ? [{ label: "GLUE", a: body[body.length - 1].box[2], b: blankMm.w }] : [])];
        const named = (k) => !/^Spot \d/.test(k.label), n = vec.inks.length, noun = dcut ? "D-Cut Handle Paper Bag" : "SOS Paper Bag", paperTxt = `${brown ? "brown" : "white"} kraft paper, ${mat.gsm} GSM`;
        const content = art.filter((i) => i.kind !== "flood" && !i.house), hasMark = art.some((i) => i.house === "mark"), ground = art.some((i) => i.kind === "flood");
        const where = (i) => { const pn = panels.find((q) => i.x >= q.a && i.x <= q.b) || panels[0], l = i.x - i.w / 2 - pn.a, r = pn.b - (i.x + i.w / 2), top = i.y - i.h / 2 - body[0].box[1]; return `${i.name} - ${i.w.toFixed(1)} x ${i.h.toFixed(1)} mm (${inch(i.w)} x ${inch(i.h)} in), on the ${pn.label}: ${l.toFixed(1)} mm from its left fold, ${r.toFixed(1)} mm from its right fold, top ${top.toFixed(1)} mm (${inch(top)} in) below the top edge.`; };
        const flat = await artworkToPdf(artOut, { box: [-BLEED, -BLEED, blankMm.w + BLEED, blankMm.h + BLEED], noInk: [], spot: process === "pantone", rasterise: rasteriseItem, parse: parseSvgDom }); // the glue areas are shown as bare paper by the proof itself
        const pdf = bagProofPdf({ doc: res.doc, blank: blankMm, vector: flat, noInk: artCtx.noInk, panels, body: { top: body[0].box[1], fold: body[0].box[3] }, size: { W: Wb, G: Gb, H: Hb }, dcut, notch: 0,
          paper: brown ? [1, 3, 5].map((k) => (parseInt(mat.colour3d.top.slice(k, k + 2), 16) / 255).toFixed(3)).join(" ") : null,
          brand: saved.customer.trim().toUpperCase(), brandPlain: saved.customer.trim(), product: `${noun}  ·  ${Wb} x ${Gb} x ${Hb} mm  (${inch(Wb)} W x ${inch(Gb)} D x ${inch(Hb)} H in)`, stage: `Customer Proof v${proofNo}`, date: new Date().toISOString().slice(0, 10),
          readNote: "The flat bag as it is printed - your artwork on our bag outline. Shown smaller than actual size.",
          key: [`Left to right: ${panels.map((q) => (q.label === "GLUE" ? "glue strip" : q.label)).join(" · ")}. The flaps under the body fold under to make the base.`, dcut ? "The handle is a D-shaped cut-out near the top of the front and the back; the top edge is turned in." : "Straight top edge, open top, no handles.", `The glue strip is left unprinted.${res.piecesPerBag === 2 ? " The bag is made from two printed pieces joined at the corners; this drawing shows one of them." : ""}`],
          facts: [["SIZE", `${Wb} mm wide x ${Gb} mm deep x ${Hb} mm tall (${inch(Wb)} x ${inch(Gb)} x ${inch(Hb)} in)`], ["PAPER", paperTxt], ["PRINT", process === "pantone" ? `${n} spot colour${n === 1 ? "" : "s"}${vec.inks.every(named) ? `: ${vec.inks.map((k) => k.label).join(", ")}` : ""}` : "full colour (CMYK)"], ["ARTWORK", "your artwork, placed as shown on this page"]],
          colourNote: `${process === "pantone" ? `Printed in ${n} Pantone spot colour${n === 1 ? "" : "s"}` : "Printed in four-colour process (CMYK)"} on ${brown ? "brown kraft. There is no white under the inks: every colour lays over the brown paper and prints darker than on white" : "white paper"}. Please approve the references below, not the colour on your screen.`,
          colours: vec.inks.map((k, i) => ({ name: named(k) ? k.label : `Colour ${i + 1}`, cmyk: cmykOf(k.hex) })),
          checkList: ["Spelling and wording - every word on the artwork.", "The logo: the right version, complete, nothing cut off.", "The size and position of each element (page 2 gives the measurements).", "The colours: the references under COLOURS are the ones that will be printed.", `Size ${Wb} x ${Gb} x ${Hb} mm (${inch(Wb)} x ${inch(Gb)} x ${inch(Hb)} in), ${paperTxt}.`, ...(hasMark ? ["The small block on the bottom flap (recycling line, product code, QR code) is ours. It sits under the bag."] : [])],
          gridNote: "The same flat bag with a guide every 50 mm (about 2 in) measured from every fold. Check the position of each element on the front and the back.",
          elements: [...content.map(where), ...(ground ? ["Colour ground - over every panel to the cut edge; the glue strip stays unprinted."] : [])],
          threeDNote: "The bag built to its true size from the print file, so you can see where the artwork sits on the finished bag. Colours on these views are approximate.",
          threeDNote2: "These views are taken from the measured model of this bag: every panel is the size it will be made. They show placement and size, not colour.",
          shots: views, renders: await sceneShots(),
          renderNote: "How the bag looks in use - the true-size 3D model of your bag, with your artwork, set in a scene. The scenes are computer-generated; light and colours are approximate. Judge size and position from pages 1 and 2." });
        const brandSlug = saved.customer.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        save(`${brandSlug}_${Math.round(Wb)}x${Math.round(Gb)}x${Math.round(Hb)}mm_${dcut ? "d-cut-bag" : "sos-bag"}_CUSTOMER-PROOF-v${proofNo}.pdf`, pdf, "application/pdf");
        setMaking(""); return;
      }
      const gi = await loadImage("/house/proof-colour-page.jpg"), gc = document.createElement("canvas"); gc.width = gi.naturalWidth; gc.height = gi.naturalHeight; gc.getContext("2d").drawImage(gi, 0, 0);
      const m = cupG.spec.label.match(/^(\d+) oz \((\d+ mL)\)/), sizeTxt = m ? `${m[2]} (${m[1]} oz)` : cupG.spec.label, dw = cupG.wall === "double";
      const named = (k) => !/^Spot \d/.test(k.label), n = vec.inks.length;
      const content = art.filter((i) => i.kind !== "flood" && !i.house && i.role === "content");
      const pdf = cupProofPdf({ g: cupG, doc: res.doc, vector: vec, noun: "cup",
        brand: saved.customer.trim().toUpperCase(), brandPlain: saved.customer.trim(), product: `${sizeTxt} ${dw ? "Double" : "Single"} Wall Paper Cup`, stage: `Proof ${proofNo}`,
        date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
        dims: { td: proofRow.td, bd: proofRow.bd, h: proofRow.h },
        facts: [["Product", `${sizeTxt} ${dw ? "double" : "single"} wall paper cup`], ["Size", `top ${proofRow.td} mm  ·  base ${proofRow.bd} mm  ·  height ${proofRow.h} mm`],
          ...(dw ? [["Outer wrap", "printed as drawn below; it wraps round the cup"], ["Inner cup", "plain white (no print) - its foot shows below the wrap; the rim you drink from stays white"]] : [["Cup wall", "printed as drawn below; the rim you drink from stays white"]]),
          ["Printing", process === "pantone" ? `${n} colour${n === 1 ? "" : "s"}${vec.inks.every(named) ? `: ${vec.inks.map((k) => k.label).join(", ")}` : ""}` : "four-colour process (CMYK)"]],
        colourNote: process === "pantone" ? `Printed in ${n} Pantone spot colour${n === 1 ? "" : "s"} on white board. Each colour is an ink mixed to its Pantone reference: please approve the references below, not the colour on your screen.` : "Printed in four-colour process (CMYK) on white board. The values below are the builds in the artwork; a screen or an office printer cannot show them truly.",
        colours: vec.inks.map((k, i) => ({ name: named(k) ? k.label : `Colour ${i + 1}`, code: process === "pantone" && named(k) ? k.label : "", cmyk: cmykOf(k.hex) })),
        checkList: ["Spelling and wording - every word on the artwork.", "The logo: the right version, complete, nothing cut off.", "The size and position of each element (page 2 gives the measurements).", "The colours: the references under COLOURS are the ones that will be printed.", `The item at the top of this page is the one you are ordering: ${sizeTxt}, ${dw ? "double" : "single"} wall.`],
        meshFacts: content.map((i) => { const q = toPolar(cupG, [i.x, i.y]); return [i.name, `${i.w.toFixed(0)} mm wide x ${i.h.toFixed(0)} mm tall. Its top is ${(cupG.rTop - q.r - i.h / 2).toFixed(0)} mm below the top cut, its foot ${(q.r - i.h / 2 - cupG.rFold).toFixed(0)} mm above the bottom fold line; its centre is ${((q.a - cupG.aLeft) * q.r).toFixed(0)} mm in from the left edge.`]; }),
        shots: views, colourPage: { ...(await imageXObject(gc)), w: gc.width, h: gc.height } });
      const brand = saved.customer.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const nf = t.nestFile || { size: { sw8: "250ml-8oz", sw16: "450ml-16oz" }[t.cup] || "cup", item: "paper-cup-SW_cup" };
      save(`${brand}_${nf.size}_${nf.item}_CUSTOMER-PROOF-v${proofNo}.pdf`, pdf, "application/pdf");
    } catch (e) { alert(`Could not make the proof: ${e.message}`); }
    setMaking("");
  }
  // cups: the printer's set on their own nested sheet (LAYOUT / ARTWORK-PUNCH / PUNCH), as made for Blueline and Lucky
  const cupNest = t.nest ? CUP_NEST_REFS[t.nest] : null;
  const [printerPick, setPrinter] = useState("BLUELINE");
  const [bg3d, setBg3d] = useState("#f3f4f6"), [scene3d, setScene3d] = useState("plain"), [sceneScale, setSceneScale] = useState(1), sec3d = useRef(null); // 3D viewer background (also used in snapshots and proof shots)
  const houseInfo = { channel, kind: houseKind, cupText: cupG ? cupMarkText(cupG.spec.label, cupG.wall, cupG.item) : "",
    // the footer SKU follows the job: paper colour (B / W) and print (-P50 = 2-colour, -P100 = 4-colour, none = plain)
    bag: houseKind === "bag" && blankMm ? { W: +values.W, G: +values.G, H: +values.H, flapMid: (+values.G / 2 + 29.6) / 2,
      paper: mat.id === "ogr" ? "" : /white/i.test(mat.top || "") ? "W" : "B", ogr: mat.id === "ogr", print: process === "plain" ? "" : process === "pantone" && +colours <= 2 ? "P50" : "P100" } : null };
  const printer = (t.printers || ["BLUELINE"]).includes(printerPick) ? printerPick : (t.printers || ["BLUELINE"])[0]; // only printers whose file for this cup is on hand
  async function nestFile(mode) {
    setMaking(`nest-${mode}`);
    try {
      const vec = art.length && mode !== "punch" ? await vectorArt() : null;
      const pdf = cupNestPdf({ nest: cupNest, g: cupG, vector: vec, mode });
      const brand = (saved.customer || saved.name || "aeros").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "aeros";
      const kind = mode === "layout" ? "OFFSET-LAYOUT" : mode === "artpunch" ? "OFFSET-ARTWORK-PUNCH" : "OFFSET-PUNCH";
      save(`${brand}_${t.nestFile.size}_${t.nestFile.item}_${kind}-${t.nestFile.tag}-v1-VENDOR-${printer}.pdf`, pdf, "application/pdf");
    } catch (e) { alert(`Could not make the file: ${e.message}`); }
    setMaking("");
  }
  // sheet layout: every up on the chosen press sheet
  const pressFits = useMemo(() => {
    if (!res || !res.sheetFits) return [];
    const on = (f2, mx) => Math.min(...f2.sheetMm) <= mx[0] + 0.01 && Math.max(...f2.sheetMm) <= mx[1] + 0.01;
    return res.sheetFits.filter((f2) => f2.ups > 0 && on(f2, [698.5, 965])).map((f2) => ({ ...f2, press: on(f2, [622.3, 901.7]) ? "Blueline / Lucky" : "Lucky" }));
  }, [res]);
  const [sheetPick, setSheetPick] = useState("");
  const layDie = useMemo(() => {
    if (!res || !res.doc) return { cut: "", crease: "" };
    const k = 25.4 / 72, P = (pt) => `${(pt[0] * k).toFixed(2)} ${(pt[1] * k).toFixed(2)}`;
    const path = (layer) => res.doc.segments.filter((sg) => sg.layer === layer).map((sg) => (sg.kind === "l" ? `M${P(sg.pts[0])}L${P(sg.pts[1])}` : `M${P(sg.pts[0])}C${P(sg.pts[1])} ${P(sg.pts[2])} ${P(sg.pts[3])}`)).join("");
    return { cut: path("cut"), crease: path("crease") };
  }, [res]);
  const texUrl = useMemo(() => (tex ? tex.toDataURL("image/jpeg", 0.8) : ""), [tex]);
  const layFit = pressFits.find((f2) => f2.sheet === sheetPick) || pressFits.find((f2) => res.bestSheet && f2.sheet === res.bestSheet.sheet) || pressFits[0] || null;
  const layUps = useMemo(() => (layFit && blankMm ? layoutUps(layFit, blankMm.w, blankMm.h, BLEED) : []), [layFit, blankMm?.w, blankMm?.h]); // eslint-disable-line react-hooks/exhaustive-deps
  async function layoutFile(mode) {
    setMaking(`lay-${mode}`);
    try {
      const vec = art.length && mode !== "die" ? await vectorArt() : null;
      const tag = `${layFit.ups}up-${layFit.sheet.replace(/ x /, "x").replace(/ in$/, "in").replace(/\s+/g, "")}`;
      const pdf = sheetLayoutPdf({ doc: res.doc, fit: layFit, ups: layUps, vector: vec, mode,
        title: `${kldTitle} | SHEET ${layFit.sheet} (${Math.round(layFit.sw)} x ${Math.round(layFit.sh)} mm), ${layFit.ups}-up${res.piecesPerBag === 2 ? " (halves)" : ""}, ${layFit.press}`,
        lines: [`Gripper ${layFit.margins.gripper} mm on the ${layFit.gripperOn} edge (top of this page) | sides ${layFit.margins.side} mm | gap ${layFit.margins.gap} mm${layFit.pairY || layFit.pairX ? ", bag tops butted" : ""} | ${Math.round(layFit.yield * 100)}% of the sheet used`, ...(vec ? jobLines(vec) : [])] });
      save(`${stem}-${mode === "punch" ? "OFFSET-LAYOUT" : mode === "print" ? "OFFSET-ARTWORK-PUNCH" : "OFFSET-PUNCH"}-${tag}.pdf`, pdf, "application/pdf");
    } catch (e) { alert(`Could not make the file: ${e.message}`); }
    setMaking("");
  }
  // SEND TO THE JOB: the printer's set for this item - exactly the files the buttons make - goes onto the linked job's
  // thread as artwork. Nothing is sent unless every file of the set was made, and the user sees the list first.
  const jobSet = wrapG ? [["print", "wrap4"], ["print", "wrapart"]] : petG ? [["print", "petart"], ["print", "vendor"]] : cupG ? (cupNest ? [["nest", "layout"], ["nest", "artpunch"], ["nest", "punch"]] : [["print", "layout"], ["print", "artpunch"]])
    : layFit ? [["lay", "punch"], ["lay", "print"], ["lay", "die"], ["print", "vendor"]] : [["print", "layout"], ["print", "artpunch"], ["print", "vendor"]];
  async function sendToJob() {
    if (!linked) return;
    setSending("Making the files…"); CAPTURE = [];
    let files = [];
    try { for (const [fn, k] of jobSet) await (fn === "nest" ? nestFile(k) : fn === "lay" ? layoutFile(k) : printFile(k)); } finally { files = CAPTURE || []; CAPTURE = null; }
    if (files.length !== jobSet.length) { setSending(""); alert("Not every file of the set could be made, so nothing was sent."); return; }
    const who = linked.printer ? `The printer on this job (${linked.printer}) will see them in the vendor portal.` : "No printer is on this job yet: whoever is assigned will see them.";
    if (!window.confirm(`Send these ${files.length} files to job ${linked.jNumber}${linked.brand ? ` (${linked.brand})` : ""}?\n\n${files.map((f) => `- ${f.name}`).join("\n")}\n\n${who}`)) { setSending(""); return; }
    try {
      for (let i = 0; i < files.length; i++) {
        setSending(`Sending ${i + 1} of ${files.length}…`);
        const f = files[i], bytes = new Uint8Array(await new Blob([f.data]).arrayBuffer());
        let bin = ""; for (let k = 0; k < bytes.length; k += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(k, k + 0x8000));
        const r = await fetch(`/api/factoryos/jobs/${linked.id}/thread`, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: i === 0 ? `Printer's set from the Design tool: ${t.name}${sizeText ? `, ${sizeText}` : ""} (${files.length} files).` : "", filename: f.name, contentType: f.type || "application/pdf", fileBase64: btoa(bin), kind: "artwork" }) });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `the job did not take file ${i + 1}`);
      }
      setSending(`Sent ${files.length} files to ${linked.jNumber} at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`);
    } catch (e) { setSending(""); alert(`Stopped: ${e.message}. Look at the job's Messages & files before sending again.`); }
  }
  const solid = useMemo(() => {
    if (!geom) return null;
    const m = solidModel(tid, values, res.doc, { thickness: board.mm, t: foldT, geom });
    return m.error ? null : { ...m, key: `${tid}-${JSON.stringify(values)}` };
  }, [geom, board.mm, foldT]); // eslint-disable-line react-hooks/exhaustive-deps
  const solidFinal = useMemo(() => (geom ? solidModel(tid, values, res.doc, { thickness: board.mm, t: 1, geom }) : null), [geom, board.mm]); // eslint-disable-line react-hooks/exhaustive-deps
  const kldTitle = [t.name, board.label, res && res.kldNote].filter(Boolean).join(" · ");
  const fails = res && res.checks ? res.checks.filter((c) => !c.ok && c.severity === "block") : [];
  const warns = res && res.checks ? res.checks.filter((c) => !c.ok && c.severity === "warn") : [];

  return (
    <div className="space-y-6">
      {/* 1. template */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">1. Template</h2>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {TEMPLATE_GROUPS.map((g) => {
            const n = TEMPLATES.filter((x) => x.family === g.family).length, on = g.family === cat, has = g.family === t.family;
            return (
              <button key={g.family} onClick={() => setCat(g.family)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${on ? "border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900" : "border-gray-300 text-gray-700 hover:border-gray-900 dark:border-gray-700 dark:text-gray-200"}`}>
                {g.label} <span className="opacity-60">{n}</span>{has && !on ? " •" : ""}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          {TEMPLATES.filter((x) => x.family === cat).map((x) => (
            <button
              key={x.id}
              title={x.name}
              onClick={() => pickTemplate(x.id)}
              className={`rounded-lg border px-3 py-1.5 text-left text-[13px] font-semibold transition ${x.id === tid ? "border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900" : "border-gray-200 bg-white hover:border-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-600"}`}
            >
              {x.short || x.name}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {t.name} · {t.proven.length} proven size{t.proven.length > 1 ? "s" : ""} · {t.family === "bag" ? "hand-made, offset sheet" : t.family === "cup" ? "fixed KLD die" : t.family === "wrap" ? "flat sheet, all-over repeat" : t.family === "pet" ? "direct print on the moulded cup" : "offset sheet, die-cut"}
        </p>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)_minmax(400px,30%)]">
        {/* 2-4. inputs: stay in view while the work area scrolls */}
        <div className="space-y-4 lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
          <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">2. Size</h2>
              <div className="flex overflow-hidden rounded-md border border-gray-300 text-xs dark:border-gray-700">
                {["mm", "in"].map((u) => (
                  <button key={u} onClick={() => setUnit(u)} className={`px-2.5 py-1 ${unit === u ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900" : "text-gray-600 dark:text-gray-300"}`}>{u}</button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              {t.inputs.map((i) =>
                i.type === "bool" ? (
                  <label key={i.key} className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                    <input type="checkbox" checked={!!values[i.key]} onChange={(e) => setVal(i.key, e.target.checked, true)} />
                    {i.label}
                  </label>
                ) : (
                  <label key={i.key} className="block">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{i.label}</span>
                    <input
                      type="number"
                      step={unit === "mm" ? 1 : 0.125}
                      inputMode="decimal"
                      value={values[i.key] === "" ? "" : show(values[i.key])}
                      onChange={(e) => setVal(i.key, e.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-base dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                    />
                    <span className="text-[11px] text-gray-500 dark:text-gray-500">
                      proven {show(lim[i.key][0])}–{show(lim[i.key][1])} {unit}
                    </span>
                  </label>
                ),
              )}
              {t.inputs.length === 0 && <p className="text-xs text-gray-600 dark:text-gray-400">Fixed die: {t.proven[0].ref}. A cup die is never resized here.</p>}
              {t.fixed && (
                <p className="text-[11px] text-gray-500">
                  Fixed by the die: {Object.entries(t.fixed).map(([k, v]) => `${k} ${show(v)} ${unit}`).join(", ")}
                </p>
              )}
            </div>
            <details className="mt-3 text-xs text-gray-600 dark:text-gray-400">
              <summary className="cursor-pointer">Proven sizes ({t.proven.length})</summary>
              <ul className="mt-2 space-y-1">
                {t.proven.map((p) => (
                  <li key={p.ref}>
                    <button
                      className="text-left underline decoration-dotted hover:text-gray-900 dark:hover:text-gray-100"
                      onClick={() => setValues((v) => { const n = { ...v }; for (const i of t.inputs) { if (i.type === "bool") { if (p[i.key] != null) n[i.key] = !!p[i.key]; } else if (p[i.key] != null) n[i.key] = +(+p[i.key]).toFixed(1); } return n; })}
                    >
                      {p.ref}: {t.inputs.filter((i) => i.type !== "bool" && p[i.key] != null).map((i) => show(p[i.key])).join(" × ")} {unit}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">3. Board / paper</h2>
            <select
              value={mat.family}
              onChange={(e) => { const first = MATERIAL_LIBRARY.find((m) => m.family === e.target.value); if (first) setBoardSel(first.id); }}
              className="mb-2 w-full rounded-md border border-gray-300 px-3 py-2 text-base dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
            >
              {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <select
              value={mat.id}
              onChange={(e) => setBoardSel(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-base dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
            >
              {famMats.map((m) => <option key={m.id} value={m.id}>{m.gsm} gsm{m.pe ? ` + ${m.pe}PE` : ""} ({m.caliperMm} mm)</option>)}
            </select>
            <details className="mt-2 text-[11px] text-gray-600 dark:text-gray-400">
              <summary className="cursor-pointer">Material data {mat.caliperStatus === "assumed" ? "(ASSUMED values)" : ""}</summary>
              <table className="mt-1 w-full">
                <tbody>
                  {[
                    ["Caliper", `${mat.caliperMm} mm`, mat.caliperStatus],
                    ["Density", `${mat.densityKgM3} kg/m³`, mat.caliperStatus],
                    ["Top / back", `${mat.top} / ${mat.back}`],
                    ["Finish", mat.finish],
                    ["Pantone guide", mat.pantoneGuide],
                    ["Print", mat.processes.join(", ")],
                    ["Grain", mat.grain, mat.grainStatus],
                    ["Stiffness", mat.stiffness || "—", mat.stiffnessStatus],
                    ...(mat.bf ? [["BF", mat.bf]] : []),
                    ["Food contact", mat.foodContact],
                    ["Source", mat.source],
                  ].map(([k, v, s2]) => (
                    <tr key={k} className="border-t border-gray-100 align-top dark:border-gray-800">
                      <td className="py-0.5 pr-2 font-medium">{k}</td>
                      <td className="py-0.5">{v}{s2 && s2 !== "measured" ? <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-semibold uppercase text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">{s2}</span> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
            {t.usesBoard && <p className="mt-2 text-[11px] text-gray-500">This die's fold allowances follow the board thickness.</p>}
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">4. Print</h2>
            <div className="mb-2 flex overflow-hidden rounded-md border border-gray-300 text-sm dark:border-gray-700">
              {[["pantone", "Pantone"], ["cmyk", "CMYK"], ["plain", "Plain"]].map(([k, l]) => (
                <button key={k} onClick={() => { setProcess(k); if (k === "cmyk") setColours(4); }} className={`flex-1 px-2 py-1.5 ${process === k ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900" : "text-gray-600 dark:text-gray-300"}`}>{l}</button>
              ))}
            </div>
            {process === "pantone" && (
              <label className="block">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Number of Pantone colours</span>
                <input type="number" min={1} max={8} value={colours} onChange={(e) => setColours(e.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-base dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
                {spotN > 0 && spotN !== +colours && (
                  <span className="mt-1 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">The artwork prints {spotN} colour{spotN === 1 ? "" : "s"}.
                    <button type="button" onClick={() => setColours(spotN)} className="rounded border border-amber-600 px-1.5 py-0.5 font-semibold">Set to {spotN}</button></span>
                )}
              </label>
            )}
            <label className="mt-3 block">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Sold to (decides the Aeros mark)</span>
              <select value={channel} onChange={(e) => setChannel(e.target.value)} className={`mt-1 w-full rounded-md border px-3 py-2 text-base dark:bg-gray-950 dark:text-gray-100 ${channel ? "border-gray-300 dark:border-gray-700" : "border-amber-500"}`}>
                <option value="">Choose…</option>
                <option value="direct">Direct to the end customer - Aeros mark ON</option>
                <option value="dealer">Through a dealer - NO Aeros mark</option>
              </select>
            </label>
            <label className="mt-3 block">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">FactoryOS job (optional; also goes in the file name)</span>
              <input value={job} onChange={(e) => { setJob(e.target.value); setJobFind(true); loadJobs(); }} onFocus={() => { setJobFind(true); loadJobs(); }} placeholder="job number or brand" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-base dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
            </label>
            {linked ? (
              <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">Linked: {linked.jNumber}{linked.brand ? ` · ${linked.brand}` : ""}{linked.item ? ` · ${linked.item}` : ""}{linked.printer ? ` · printer: ${linked.printer}` : " · no printer on the job yet"}{" "}
                <button type="button" onClick={() => setLinked(null)} className="underline decoration-dotted">unlink</button></p>
            ) : jobFind && (
              <div className="mt-1 rounded-md border border-gray-200 text-xs dark:border-gray-800">
                {jobs === null ? <p className="px-2 py-1.5 text-gray-500">Loading jobs…</p> : jobHits.length === 0 ? <p className="px-2 py-1.5 text-gray-500">No job matches. The text is still used in the file name.</p>
                  : jobHits.map((j) => <button type="button" key={j.id} onClick={() => linkJob(j)} className="block w-full border-b border-gray-100 px-2 py-1.5 text-left last:border-b-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800"><span className="font-semibold">{j.jNumber}</span> · {j.brand || "-"} · {j.item}{j.itemSize ? ` ${j.itemSize}` : ""}<span className="text-gray-500">{j.printer ? ` · ${j.printer}` : ""}</span></button>)}
                <button type="button" onClick={() => setJobFind(false)} className="block w-full px-2 py-1 text-left text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800">close</button>
              </div>
            )}
          </section>
        </div>

        {/* work area: status, save, artwork, printer files */}
        <div className="min-w-0 space-y-5">
          <section className={`rounded-lg border p-4 ${ok ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30" : "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30"}`}>
            {res && res.error ? (
              <p className="text-sm font-semibold text-red-800 dark:text-red-300">Cannot build: {res.error}</p>
            ) : ok ? (
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                Ready. Blank {res.blankMm[0]} × {res.blankMm[1]} mm
                {res.piecesPerBag === 2 ? " · 2-PIECE (2 halves per bag)" : ""}
                {res.bestSheet ? ` · ${res.bestSheet.press} ${res.bestSheet.sheet}, ${res.bestSheet.ups}-up${res.piecesPerBag === 2 ? (res.bagsPerSheet < 1 ? " = 2 sheets per bag" : ` = ${Math.floor(res.bagsPerSheet)} bag${res.bagsPerSheet >= 2 ? "s" : ""}/sheet`) : ""}` : ""}
                {warns.length ? ` · ${warns.length} note${warns.length > 1 ? "s" : ""} to read` : ""}
              </p>
            ) : (
              <p className="text-sm font-semibold text-red-800 dark:text-red-300">
                Not makeable as entered: {fails.map((c) => c.title).join("; ")}. Downloads are locked.
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                ["KLD PDF", () => save(`${stem}-KLD.pdf`, toPdf(res.doc, { units: "both", showDims: true, title: kldTitle }), "application/pdf")],
                ["KLD SVG", () => save(`${stem}-KLD.svg`, toSvg(res.doc, { units: "both", showDims: true, title: kldTitle }), "image/svg+xml")],
                ["Die file PDF", () => save(`${stem}-DIE-CUT.pdf`, toDiePdf(res.doc), "application/pdf")],
                ["Die file SVG", () => save(`${stem}-DIE-CUT.svg`, toDieSvg(res.doc), "image/svg+xml")],
              ].map(([label, fn]) => (
                <button
                  key={label}
                  disabled={!ok}
                  onClick={fn}
                  className="rounded-md border border-gray-900 bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-200 disabled:text-gray-500 dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900 dark:disabled:border-gray-700 dark:disabled:bg-gray-800"
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-[160px] flex-1 text-xs text-gray-600 dark:text-gray-400">Design name
                <input value={saved.name} onChange={(e) => setSaved((sv) => ({ ...sv, name: e.target.value }))} placeholder={stem} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-base dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
              </label>
              <label className="min-w-[140px] flex-1 text-xs text-gray-600 dark:text-gray-400">Customer / brand
                <input value={saved.customer} onChange={(e) => setSaved((sv) => ({ ...sv, customer: e.target.value }))} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-base dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
              </label>
              <button disabled={!res || !!res.error} onClick={() => saveDesign(false)} className="rounded-md border border-gray-900 bg-gray-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40 dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900">{saved.id ? "Save changes" : "Save design"}</button>
              {saved.id && <button onClick={() => saveDesign(true)} className="rounded-md border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-200">Save as new</button>}
              <button onClick={() => (saved.list ? setSaved((sv) => ({ ...sv, list: null })) : loadList())} className="rounded-md border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-200">{saved.list ? "Close list" : "Open saved…"}</button>
            </div>
            {saved.msg && <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">{saved.msg}</p>}
            {saved.list && (
              <ul className="mt-2 max-h-56 space-y-1 overflow-auto">
                {saved.list.length === 0 && <li className="text-xs text-gray-500">No saved designs yet.</li>}
                {saved.list.map((d) => (
                  <li key={d.id}>
                    <button onClick={() => openDesign(d.id)} className="flex w-full flex-wrap items-center gap-x-3 rounded-md border border-gray-200 px-3 py-2 text-left text-xs hover:border-gray-900 dark:border-gray-800">
                      <span className="font-semibold text-gray-900 dark:text-gray-100">{d.name}</span>
                      <span className="text-gray-600 dark:text-gray-400">{[d.customer, d.job_ref, d.template].filter(Boolean).join(" · ")}</span>
                      <span className="ml-auto text-gray-500">{d.checks_ok ? "checks passed" : "has open checks"} · {new Date(d.updated_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} · {d.updated_by || ""}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {res && res.doc && artCtx && (
            <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
              <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Artwork</h2>
              <ArtworkDesigner doc={res.doc} geom={panelsAny} family={t.family} areas={artCtx.areas} noInk={artCtx.noInk} items={art} setItems={setArt} boardColour={mat.colour3d.top} cup={cupG} clipPoly={artCtx.clipPoly || null} house={houseInfo} pantone={process === "pantone"} customer={saved.customer} repeat={wrapG ? { g: wrapG, plan: wrapPlan, pitch: wrapPitch, setPitch: setWrapPitch, placed: artOut } : null} snap={snapArt} undo={undoArt} redo={redoArt} canUndo={histN >= 0 && hist.current.past.length > 0} canRedo={hist.current.future.length > 0} />
              {art.length > 0 && (
                <>
                  <CheckList checks={artChecks} className="mt-3" />
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {(wrapG ? [["wrap4", "OFFSET-LAYOUT 4-up: the press sheet (PDF)"], ["wrapart", "ARTONLY: one sheet, for print (PDF)"], ["wrapgrid", "GRIDCHECK: grid + repeat tiles, not for print (PDF)"], ["layout", "Artwork + outline, for checking (PDF)"]]
                      : petG ? [["petart", "ART: the print rectangle, exact size (PDF)"], ["vendor", "ART-DIM: sizes + colours for the printer (PDF)"], ["layout", "Artwork + outline, for checking (PDF)"]]
                      : [["layout", "Artwork + outlines (PDF)"], ["artpunch", "Artwork, no outlines (PDF)"], ...(cupG ? [] : [["vendor", "Vendor sheet: sizes + colours (PDF)"]])]).map(([k, label]) => (
                      <button key={k} disabled={!ok || artBlocked || !!making} onClick={() => printFile(k)}
                        className="rounded-md border border-gray-900 bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-200 disabled:text-gray-500 dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900 dark:disabled:border-gray-700 dark:disabled:bg-gray-800">
                        {making === k ? "Making…" : label}
                      </button>
                    ))}
                    {(solid || cupG || petG) && <button className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-gray-900 dark:border-gray-700 dark:text-gray-200" onClick={() => saveShot(`${stem}-3D-PROOF.png`)}>3D proof (PNG)</button>}
                    {digPlan && !digPlan.error && <button disabled={!ok || artBlocked || !!making} onClick={digitalFile} title={`${digPlan.note} on ${digPlan.sheets.length} sheet${digPlan.sheets.length === 1 ? "" : "s"}`}
                      className="rounded-md border border-fuchsia-700 bg-fuchsia-700 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-200 disabled:text-gray-500 dark:disabled:border-gray-700 dark:disabled:bg-gray-800">
                      {making === "digital" ? "Making…" : `Digital sample, 13 × 19 in (${digPlan.split ? `${digPlan.pieces.length} pieces` : `${digPlan.ups}-up`})`}
                    </button>}
                    {digPlan?.error && <span className="text-[11px] text-amber-700 dark:text-amber-300">Digital sample: {digPlan.error}</span>}
                    {linked && <button disabled={!ok || artBlocked || !!making || (!!sending && /…$/.test(sending))} onClick={sendToJob} title={`Makes the printer's set (${jobSet.length} files) and puts it on the job's Messages & files, where the printer sees it`}
                      className="rounded-md border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-200 disabled:text-gray-500 dark:disabled:border-gray-700 dark:disabled:bg-gray-800">
                      {sending && /…$/.test(sending) ? sending : `Send printer's set to ${linked.jNumber}`}
                    </button>}
                    {linked && sending && !/…$/.test(sending) && <span className="text-[11px] text-emerald-700 dark:text-emerald-300">{sending} <a className="underline" href={`/factoryos/manager/${linked.id}`} target="_blank" rel="noreferrer">Open the job</a></span>}
                    {!linked && art.length > 0 && <span className="text-[11px] text-gray-500">Link a FactoryOS job (step 4) to send the printer's set straight to it.</span>}
                    {(!ok || artBlocked) && <span className="text-[11px] text-red-700 dark:text-red-300">Locked - to fix: {[...fails, ...artChecks.filter((c) => !c.ok && c.severity === "block")].map((c) => c.title).join("; ") || "see the checks"}.</span>}
                    {cupG && <p className="w-full text-[11px] text-gray-600 dark:text-gray-400">{cupNest ? "These are one-cup files for checking and approval. The printer's set is below." : "These are one-cup files for checking and approval. No offset nest is on file for this cup, so the printer's set is not made here."}</p>}
                  </div>
                </>
              )}
            </section>
          )}

          {res && res.doc && (
            <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Customer proof</h2>
              {!cupG && !bagProof ? <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">This tool makes customer proofs for paper cups, tubs and paper bags so far. Boxes, PET / PP cups and wrap sheets still go through the house proof tools.</p> : (
                <div className="mt-2 space-y-3 text-xs text-gray-700 dark:text-gray-300">
                  <p>{bagProof ? "The house bag proof: the flat bag with the artwork, the bag's W x G x H drawing and the sign-off box (page 1), the same flat on a 50 mm grid with where each element sits (page 2), your 3D shots (page 3) and the bag in the three scenes (page 4, taken by the tool). Every size printed on it is the size of this die." : "The house proof: the artwork flat at full size, the same drawing on the mesh (page 2), your 3D shots (page 3) and the colours and timeline page. Every size printed on it comes from the product list."}</p>
                  <div className="flex flex-wrap items-end gap-3">
                    {cupG && <label className="min-w-[260px] flex-1">Product (from the product list)
                      <select value={proofPick} onChange={(e) => setProofPick(e.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-base dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100">
                        <option value="">{prodRows == null ? "Loading…" : prodRows.length ? "Choose…" : "No cup of this size in the product list"}</option>
                        {(prodRows || []).map((r) => <option key={r.sku} value={r.sku}>{r.sku} - {r.name} - {r.td} / {r.bd} / {r.h} mm</option>)}
                      </select>
                    </label>}
                    <label className="w-24">Proof no.<input type="number" min={1} value={proofNo} onChange={(e) => setProofNo(Math.max(1, +e.target.value || 1))} className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-base dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
                  </div>
                  {cupG && proofRow && proofRow.h !== cupG.spec.H && <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">The product list says height {proofRow.h} mm; the keyline says {cupG.spec.H} mm. The proof prints the product list's figure. If the keyline is the right one, the product list must be corrected first.</p>}
                  <div>
                    <p className="font-semibold">3D shots for page 3: {freshShots.length} of 3 to 4</p>
                    <p className="text-gray-500">{bagProof ? "Turn the 3D bag the way you want it, then press Proof shot above the 3D view. Take 3 or 4 different views (three-quarter, front, side, from below)." : "Turn the 3D cup the way you want it, then press the button under it. Take 3 or 4 different views (front, back, the seam side, from below)."}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {shots.map((s2, k) => (
                        <div key={k} className={`w-36 rounded-md border p-1 ${s2.sig === artSig ? "border-gray-300 dark:border-gray-700" : "border-red-400 opacity-60"}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={s2.url} alt="" className="h-20 w-full rounded object-cover" />
                          <input value={s2.caption} onChange={(e) => setShots((l) => l.map((q, n2) => (n2 === k ? { ...q, caption: e.target.value } : q)))} className="mt-1 w-full rounded border border-gray-300 px-1 py-0.5 text-[11px] dark:border-gray-700 dark:bg-gray-950" />
                          <button onClick={() => setShots((l) => l.filter((_, n2) => n2 !== k))} className="mt-1 text-[11px] text-red-700 underline">{s2.sig === artSig ? "Remove" : "Artwork changed - remove and retake"}</button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button disabled={proofWhy.length > 0 || !!making} onClick={proofFile} className="rounded-md border border-gray-900 bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-200 disabled:text-gray-500 dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900 dark:disabled:border-gray-700 dark:disabled:bg-gray-800">{making === "proof" ? "Making…" : "Customer proof (PDF)"}</button>
                    {proofWhy.length > 0 && <span className="text-red-700 dark:text-red-300">Locked: {proofWhy.join("; ")}.</span>}
                  </div>
                  <p className="text-[11px] text-gray-500">After it downloads, file it in the customer's folder in Aeros Artworks before it is sent. This digital proof is for placement and the right item - never a colour approval.</p>
                </div>
              )}
            </section>
          )}
          {cupNest && cupG && res && res.doc && (
            <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Printer's set: {cupNest.fans.length}-up on {cupNest.page[0].toFixed(1)} × {cupNest.page[1].toFixed(1)} mm</h2>
                <select value={printer} onChange={(e) => setPrinter(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5 text-base dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100">
                  {(t.printers || ["BLUELINE"]).map((pr) => <option key={pr} value={pr}>{pr === "BLUELINE" ? "Blueline" : "Lucky Offset"}</option>)}
                </select>
              </div>
              <svg viewBox={`-4 -4 ${cupNest.page[0] + 8} ${cupNest.page[1] + 8}`} className="h-auto max-h-[460px] w-full rounded-md bg-[#e9ebee]">
                <rect x={0} y={0} width={cupNest.page[0]} height={cupNest.page[1]} fill="#ffffff" stroke="#8a8a8a" strokeWidth={0.6} />
                <defs><clipPath id="nest-bleed"><polygon points={cupG.bleed.poly.map((q) => q.join(",")).join(" ")} /></clipPath></defs>
                {cupNest.fans.map((fan, k) => { const m = fanPlacement(cupG, fan); return (
                  <g key={k}>
                    {tex && <g transform={`matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`} clipPath="url(#nest-bleed)"><image href={texUrl} x={0} y={0} width={blankMm.w} height={blankMm.h} preserveAspectRatio="none" /></g>}
                    <path d={fan.segs.map((sg) => (sg[0] === "l" ? `M${sg[1].join(" ")}L${sg[2].join(" ")}` : `M${sg[1].join(" ")}C${sg[2].join(" ")} ${sg[3].join(" ")} ${sg[4].join(" ")}`)).join("")} fill="none" stroke="#1d1d1b" strokeWidth={0.5} />
                  </g>
                ); })}
                <path d={cupNest.marks.map((sg) => `M${sg[1].join(" ")}L${sg[2].join(" ")}`).join("")} fill="none" stroke="#1d1d1b" strokeWidth={0.4} />
              </svg>
              <p className="mt-1 text-[11px] text-gray-500">The printer's own punch layout, taken line for line from their file: middle column turned 180°, register marks and size labels kept. Artwork is stamped once per cup (each cup placed on the printer's own outline by best fit: within {cupNest.fit ? Math.max(0.02, cupNest.fit.max).toFixed(2) : "0.10"} mm), clipped to the KLD's bleed line and held 1.2 mm clear of every neighbouring knife.{cupNest.style?.spot ? " This printer's file carries its outlines in a 'Dieline' spot colour; the set keeps that." : ""}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {[["layout", "LAYOUT: artwork + outlines", ok && art.length > 0 && !artBlocked], ["artpunch", "ARTWORK-PUNCH: artwork only", ok && art.length > 0 && !artBlocked], ["punch", "PUNCH: outlines only", ok]].map(([k, label, can]) => (
                  <button key={k} disabled={!can || !!making} onClick={() => nestFile(k)}
                    className="rounded-md border border-gray-900 bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-200 disabled:text-gray-500 dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900 dark:disabled:border-gray-700 dark:disabled:bg-gray-800">
                    {making === `nest-${k}` ? "Making…" : label}
                  </button>
                ))}
              </div>
            </section>
          )}

          {res && res.doc && layFit && (
            <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Sheet layout: {layFit.ups}-up{res.piecesPerBag === 2 ? " (halves)" : ""} on {layFit.sheet}</h2>
                <select value={layFit.sheet} onChange={(e) => setSheetPick(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5 text-base dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100">
                  {pressFits.map((f2) => <option key={f2.sheet} value={f2.sheet}>{f2.sheet} · {f2.ups}-up · {Math.round(f2.yield * 100)}% · {f2.press}</option>)}
                </select>
              </div>
              <svg viewBox={`-6 -6 ${layFit.sw + 12} ${layFit.sh + 12}`} className="h-auto max-h-[520px] w-full rounded-md bg-[#e9ebee]">
                <rect x={0} y={0} width={layFit.sw} height={layFit.sh} fill="#ffffff" stroke="#8a8a8a" strokeWidth={0.8} />
                <rect x={0} y={0} width={layFit.sw} height={layFit.margins.gripper} fill="#d9d9d9" />
                <text x={4} y={layFit.margins.gripper - 3} fontSize={8} fill="#555" fontFamily="Helvetica, Arial, sans-serif">GRIPPER {layFit.margins.gripper} mm</text>
                {layUps.map((u) => (
                  <g key={`${u.i}-${u.j}`} transform={`translate(${u.cx} ${u.cy}) rotate(${u.rot}) translate(${-blankMm.w / 2} ${-blankMm.h / 2})`}>
                    {tex && <image href={texUrl} x={0} y={0} width={blankMm.w} height={blankMm.h} preserveAspectRatio="none" />}
                    <path d={layDie.crease} fill="none" stroke="#0aa10a" strokeWidth={0.6} />
                    <path d={layDie.cut} fill="none" stroke="#e11d1d" strokeWidth={0.6} />
                  </g>
                ))}
              </svg>
              <p className="mt-1 text-[11px] text-gray-500">
                Gripper {layFit.margins.gripper} mm on the {layFit.gripperOn} edge, sides {layFit.margins.side} mm, gap {layFit.margins.gap} mm{layFit.pairY || layFit.pairX ? ", bag tops butted" : ""}. Straight grid, no interlock: a proven interlocked nest can only add ups.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {[["die", "Sheet die, all ups (PDF)", ok], ["punch", "Sheet: artwork + outlines (PDF)", ok && art.length > 0 && !artBlocked], ["print", "Sheet: artwork only, for plates (PDF)", ok && art.length > 0 && !artBlocked]].map(([k, label, can]) => (
                  <button key={k} disabled={!can || !!making} onClick={() => layoutFile(k)}
                    className="rounded-md border border-gray-900 bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-200 disabled:text-gray-500 dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900 dark:disabled:border-gray-700 dark:disabled:bg-gray-800">
                    {making === `lay-${k}` ? "Making…" : label}
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* beside it on wide screens (under it otherwise): 3D, the dimensioned KLD, checks, sheet fit */}
        <div className="min-w-0 space-y-5 lg:col-start-2 2xl:col-start-3">
          <section ref={sec3d} className="[&:fullscreen]:overflow-auto [&:fullscreen]:p-6 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <h2 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">{petG ? "3D cup (the moulded cup, print band wrapped 360°)" : cupG ? "3D cup (the real fan wrapped to its cone)" : `3D model (the real die folded at ${board.mm} mm caliper${board.caliperStatus === "assumed" ? ", assumed" : ""})`}</h2>
            {(solid || cupG || petG) && (() => {
              const inScene = !!sceneOf(scene3d).src, lab = "w-12 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400";
              const plainBtn = "rounded-md border border-gray-300 px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:border-gray-900 dark:border-gray-700 dark:text-gray-200", darkBtn = "rounded-md border border-gray-900 bg-gray-900 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-60 dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900";
              return (
                <div className="mb-2 space-y-1.5 rounded-md border border-gray-200 px-2.5 py-2 dark:border-gray-800">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={lab}>View</span>
                    <span className="inline-flex overflow-hidden rounded-md border border-gray-300 dark:border-gray-700" title="Standard views">
                      {[["front", "Front"], ["back", "Back"], ["left", "Left"], ["right", "Right"], ["top", "Top"], ["bottom", "Bottom"], ["iso", "3/4"], ["under", "From below"]].filter(([k]) => !inScene || !["top", "bottom", "under"].includes(k)).map(([k, label]) => <button key={k} onClick={() => viewerRef.current?.view(k)} className="border-r border-gray-300 px-2 py-1 text-[11px] font-semibold text-gray-700 last:border-r-0 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">{label}</button>)}
                    </span>
                    <button onClick={() => { if (document.fullscreenElement) document.exitFullscreen(); else sec3d.current?.requestFullscreen?.(); }} title="The 3D panel fills the whole screen (Esc to leave)" className={plainBtn}>Full screen</button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={lab}>Scene</span>
                    <select value={scene3d} onChange={(e) => setScene3d(e.target.value)} title="What the product stands on" className="rounded-md border border-gray-300 px-1.5 py-1 text-[11px] text-gray-700 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200">
                      {SCENES.map((sc2) => <option key={sc2.key} value={sc2.key}>{sc2.label}</option>)}
                    </select>
                    {inScene ? <label className="flex items-center gap-1 text-[11px] text-gray-600 dark:text-gray-300" title="How big the product reads in the scene (the product itself is always true to size)">Size<input type="range" min="0.6" max="1.8" step="0.05" value={sceneScale} onChange={(e) => setSceneScale(+e.target.value)} className="w-24" /></label>
                      : (
                        <span className="flex items-center gap-1 text-[11px] text-gray-600 dark:text-gray-300" title="Background of the 3D view (snapshots and proof shots use it too)">
                          Background
                          {["#ffffff", "#f3f4f6", "#d9dde3", "#3a3f47", "#111111"].map((c2) => <button key={c2} onClick={() => setBg3d(c2)} className={`h-4 w-4 rounded-sm border ${bg3d === c2 ? "border-blue-600 ring-1 ring-blue-600" : "border-gray-400"}`} style={{ background: c2 }} aria-label={`Background ${c2}`} />)}
                          <input type="color" value={bg3d} onChange={(e) => setBg3d(e.target.value)} className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0" aria-label="Any background colour" />
                        </span>
                      )}
                  </div>
                  {(petG || cupG) && (
                    <div className="flex flex-wrap items-center gap-2" title="For pictures only: the cup is the measured part; the lid and straw are plain shapes sized from its brim">
                      <span className={lab}>Dress</span>
                      {petG && <select value={dress.drink} onChange={(e) => setDress((d) => ({ ...d, drink: e.target.value }))} className="rounded-md border border-gray-300 px-1.5 py-1 text-[11px] text-gray-700 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200">
                        <option value="">Empty cup</option>{[["#c9a27a", "Iced latte"], ["#3a2014", "Cold brew"], ["#8fb04a", "Matcha"], ["#e58aa0", "Strawberry"], ["#f0c64a", "Mango"], ["#f3ead2", "Lassi"], ["#5a1d12", "Cola"]].map(([c2, n2]) => <option key={c2} value={c2}>{n2}</option>)}
                      </select>}
                      <select value={petG ? dress.lid : ["white", "black"].includes(dress.lid) ? dress.lid : ""} onChange={(e) => setDress((d) => ({ ...d, lid: e.target.value }))} className="rounded-md border border-gray-300 px-1.5 py-1 text-[11px] text-gray-700 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200">
                        <option value="">No lid</option>{(petG ? [["flat", "Flat lid"], ["dome", "Dome lid"]] : [["white", "White sip lid"], ["black", "Black sip lid"]]).map(([k, n2]) => <option key={k} value={k}>{n2}</option>)}
                      </select>
                      {petG && <select value={dress.straw} onChange={(e) => setDress((d) => ({ ...d, straw: e.target.value }))} className="rounded-md border border-gray-300 px-1.5 py-1 text-[11px] text-gray-700 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200">
                        <option value="">No straw</option>{[["#1b1b1b", "Black straw"], ["#f5f5f2", "White straw"], ["#b98b5a", "Kraft paper straw"]].map(([c2, n2]) => <option key={c2} value={c2}>{n2}</option>)}
                      </select>}
                      <span className="text-[10px] text-gray-500">for pictures only</span>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={lab}>Save</span>
                    <button onClick={() => saveShot(`${stem}-3D-VIEW-${new Date().toISOString().slice(11, 19).replace(/:/g, "")}.png`)} title="Saves the 3D view exactly as it is turned now, with the Aeros watermark" className={darkBtn}>Snapshot (PNG)</button>
                    {(cupG || bagProof) && <button onClick={takeShot} disabled={shots.length >= 4} title="Adds this view to the customer proof (3 or 4 are needed)" className="rounded-md border border-emerald-700 bg-emerald-700 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40">Proof shot ({shots.length}/4)</button>}
                    <button onClick={mockupPack} disabled={!!pack || spin > 0} title="One zip for sales: 3/4, front and back views, the product in each scene, and the turntable video - all with the Aeros watermark" className={darkBtn}>{pack ? `Mockup pack: ${pack}` : "Mockup pack (zip)"}</button>
                    <button onClick={() => { setSpin(8); turntable(8); }} disabled={spin > 0 || !!pack} title="One full turn of the model as it stands now, 8 seconds, with the Aeros watermark" className={plainBtn}>{spin > 0 ? `Recording… ${Math.ceil(spin)} s` : "Turntable video"}</button>
                    <select value="" onChange={(e) => { const k = e.target.value; if (k === "stl") save(`${stem}-3D.stl`, viewerRef.current.exportStl(), "model/stl"); if (k === "obj") save(`${stem}-3D.obj`, viewerRef.current.exportObj(), "model/obj"); }} title="The 3D model as a CAD file, in mm" className="rounded-md border border-gray-300 px-1.5 py-1 text-[11px] text-gray-700 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200">
                      <option value="">3D file…</option><option value="stl">STL (mm)</option><option value="obj">OBJ (mm)</option>
                    </select>
                  </div>
                </div>
              );
            })()}
            {petG && blankMm ? (
              <SolidViewer ref={viewerRef} scene={scene3d} sceneScale={sceneScale} dress={dress} background={bg3d} pet={petG} colours={mat.colour3d} texture={tex} blank={blankMm} />
            ) : cupG && blankMm ? (
              <>
                {innerG && (
                  <div className="mb-2 flex w-fit overflow-hidden rounded-md border border-gray-300 text-xs dark:border-gray-700">
                    {[["full", "Full cup (wrap on the inner cup)"], ["wrap", "Outer fan only"]].map(([k, l]) => (
                      <button key={k} onClick={() => setCupView(k)} className={`px-3 py-1.5 ${cupView === k ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900" : "text-gray-600 dark:text-gray-300"}`}>{l}</button>
                    ))}
                  </div>
                )}
                <SolidViewer ref={viewerRef} scene={scene3d} sceneScale={sceneScale} dress={["white", "black"].includes(dress.lid) ? dress : null} background={bg3d} cone={cupG} coneInner={innerG && cupView === "full" ? innerG : null} caliper={board.mm} colours={mat.colour3d} texture={tex} blank={blankMm} />
                <CheckList checks={[...cupFormedChecks(cupG), ...(innerG && cupView === "full" ? cupFitChecks(cupG, innerG, board.mm) : [])]} className="mt-3" />
              </>
            ) : solid ? (
              <>
                <SolidViewer ref={viewerRef} scene={scene3d} sceneScale={sceneScale} background={bg3d} model={solid} lieFlat={t.family === "box"} colours={mat.colour3d} texture={tex} blank={blankMm} />
                <label className="mt-2 flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
                  Flat
                  <input type="range" min={0} max={1} step={0.01} value={foldT} onChange={(e) => setFoldT(+e.target.value)} className="flex-1" />
                  Folded
                </label>
                {solidFinal && solidFinal.rows && (
                  <table className="mt-3 w-full text-left text-xs">
                    <thead className="text-gray-500"><tr><th className="py-1 pr-3">Folded size</th><th className="py-1 pr-3">Ordered</th><th className="py-1 pr-3">Inside</th><th className="py-1">Outside</th></tr></thead>
                    <tbody className="text-gray-800 dark:text-gray-200">
                      {solidFinal.rows.map((r) => (
                        <tr key={r.label} className="border-t border-gray-100 dark:border-gray-800">
                          <td className="py-1 pr-3">{r.label}</td><td className="py-1 pr-3">{r.ordered} mm</td>
                          <td className="py-1 pr-3">{r.inside.toFixed(1)} mm</td><td className="py-1">{r.outside.toFixed(1)} mm</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {solidFinal && <CheckList checks={solidFinal.checks} className="mt-3" />}
              </>
            ) : (
              <p className="text-xs text-gray-500">{wrapG ? "A wrap sheet is flat, so there is nothing to fold here. Its sheet pictures for the customer proof are made with the house wrap tools." : "The fold program for this template is being built (bags first; boxes next)."}</p>
            )}
          </section>

          {preview && (
            <section className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-white">
              <div className="w-full overflow-hidden [&>svg]:h-auto [&>svg]:max-h-[560px] [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: preview.replace(/^<\?xml[^>]*>/, "") }} />
              <p className="mt-1 text-[11px] text-gray-500">Red = cut, green = crease. Sizes in mm.</p>
            </section>
          )}

          {res && res.checks && (
            <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
              <h2 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Checks</h2>
              <CheckList checks={res.checks} />
            </section>
          )}

          {res && res.sheetFits && (
            <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
              <h2 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Sheet fit (standard sheets, rectangle grid, no interlock)</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-gray-500">
                    <tr><th className="py-1 pr-3">Sheet</th><th className="py-1 pr-3">{res.piecesPerBag === 2 ? "Halves (bags)" : "Ups"}</th><th className="py-1 pr-3">Used</th><th className="py-1">Press</th></tr>
                  </thead>
                  <tbody className="text-gray-800 dark:text-gray-200">
                    {res.sheetFits.map((f) => {
                      const [a, b] = [Math.min(...f.sheetMm), Math.max(...f.sheetMm)];
                      const press = a <= 622.31 && b <= 901.71 ? "Blueline / Lucky" : a <= 698.51 && b <= 965.01 ? "Lucky" : "—";
                      const best = res.bestSheet && res.bestSheet.sheet === f.sheet;
                      return (
                        <tr key={f.sheet} className={`border-t border-gray-100 dark:border-gray-800 ${best ? "font-semibold" : ""}`}>
                          <td className="py-1 pr-3">{f.sheet}</td>
                          <td className="py-1 pr-3">{f.ups ? (res.piecesPerBag === 2 ? `${f.ups} (${Math.floor(f.ups / 2)})` : f.ups) : "—"}</td>
                          <td className="py-1 pr-3">{f.ups ? `${Math.round(f.yield * 100)}%` : "—"}</td>
                          <td className="py-1">{f.ups ? press : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
