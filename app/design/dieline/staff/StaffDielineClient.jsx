"use client";
// Staff KLD maker. Maths only: lib/dieline/staff.js builds, cleans, audits and checks the die; this screen only collects
// inputs and shows the answer. Downloads stay locked while any "block" check fails.
import { useEffect, useMemo, useRef, useState } from "react";
import { TEMPLATES, templateLimits } from "@/lib/dieline/templates";
import { runStaffTemplate, fileStem } from "@/lib/dieline/staff";
import { MATERIAL_LIBRARY, MATERIAL_FAMILIES, materialById } from "@/lib/dieline/material-library";
import { panelsFromDie } from "@/lib/dieline/solid/arrangement";
import { programFor } from "@/lib/dieline/solid/programs";
import { solidModel } from "@/lib/dieline/solid";

import { dieEdges } from "@/lib/dieline/solid/arrangement";
import { checkArtwork, BLEED } from "@/lib/dieline/designer/model";
import { paintArtwork, rasteriseItem, parseSvgDom, packArtwork, unpackArtwork } from "@/lib/dieline/designer/io";
import { artworkToPdf, imageXObject } from "@/lib/dieline/designer/vector-pdf";
import { planDigital, digitalSamplePdf, DIGITAL } from "@/lib/dieline/designer/digital-pdf";
import { sheetLayoutPdf } from "@/lib/dieline/designer/layout-pdf";
import { layoutUps } from "@/lib/dieline/print-rules";
import { vendorSheetPdf, describeArtwork } from "@/lib/dieline/designer/vendor-pdf";
import { cupNestPdf, fanPlacement } from "@/lib/dieline/designer/cup-nest-pdf";
import { CUP_NEST_REFS } from "@/lib/dieline/cup-nest-refs";
import { toPolar } from "@/lib/dieline/cup";
import { cupGeometry, cupItemChecks, cupFormedChecks, cupFitChecks } from "@/lib/dieline/cup";
import { curveItem } from "@/lib/dieline/designer/cup-warp";
import ArtworkDesigner from "./ArtworkDesigner";
import SolidViewer from "./SolidViewer"; // three.js runs only inside effects, safe on the server (as Fold3DViewer)
import { toSvg, toPdf } from "@/lib/dieline/exports";
import { toDiePdf, toDieSvg } from "@/lib/dieline/die-export";

const IN = 25.4;
const firstValues = (t) => {
  const p = t.proven[t.proven.length > 1 ? 1 : 0];
  const v = {};
  for (const i of t.inputs) v[i.key] = i.type === "bool" ? false : p[i.key] != null ? +(+p[i.key]).toFixed(1) : 0;
  return v;
};
const defaultBoard = (t) => (t.family === "bag" ? "bag-kraft-80" : t.family === "cup" ? (t.cup === "dw8" ? "cupstock-230" : "cupstock-230-1pe") : "fbb-300");
const useOf = (t) => (t.family === "bag" ? "bag" : t.family === "cup" ? "cup" : "box");

const SEV = {
  block: { pass: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300", fail: "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300" },
  warn: { pass: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300", fail: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" },
  info: { pass: "bg-gray-50 text-gray-700 dark:bg-gray-900 dark:text-gray-300", fail: "bg-gray-50 text-gray-700 dark:bg-gray-900 dark:text-gray-300" },
};

function save(name, text, type) {
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
  const [values, setValues] = useState(() => firstValues(TEMPLATES[0]));
  const [unit, setUnit] = useState("mm");
  const [boardSel, setBoardSel] = useState(() => defaultBoard(TEMPLATES[0]));
  const [process, setProcess] = useState("pantone");
  const [colours, setColours] = useState(2);
  const [job, setJob] = useState("");

  function pickTemplate(id) {
    const nt = TEMPLATES.find((x) => x.id === id);
    setTid(id);
    setValues(firstValues(nt));
    setBoardSel(defaultBoard(nt));
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
      const body = { name: saved.name || fileStem({ template: res.template, values, board }), customer: saved.customer, job_ref: job, recipe: res.recipe, artwork: packArtwork(art), checks_ok: !!ok && !artBlocked };
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
      setProcess(rc.print?.process || "pantone"); setColours(rc.print?.colours || 1);
      setJob(d.job_ref || ""); setArt(unpackArtwork(d.artwork)); hist.current = { past: [], future: [] };
      setSaved((sv) => ({ ...sv, id: d.id, name: d.name, customer: d.customer || "", list: null, msg: `Opened "${d.name}".` }));
    } catch (e) { setSaved((sv) => ({ ...sv, msg: e.message })); }
  }
  const viewerRef = useRef(null);
  const print = { process, colours: process === "plain" ? 0 : +colours };

  const lim = templateLimits(t);
  const res = useMemo(() => runStaffTemplate(tid, values, board, print), [tid, JSON.stringify(values), board.gsm, board.mm, process, colours]); // eslint-disable-line react-hooks/exhaustive-deps
  const ok = res && !res.error && !res.blocked;
  const preview = useMemo(() => (res && res.doc ? toSvg(res.doc, { units: "mm", showDims: true, title: "" }) : ""), [res]);
  const stem = res && res.template ? fileStem({ template: res.template, values, board }) + (job.trim() ? `-${job.trim().replace(/[^A-Za-z0-9-]+/g, "-")}` : "") : "kld";

  const show = (mm) => (unit === "mm" ? +(+mm).toFixed(1) : +(mm / IN).toFixed(3));
  const setVal = (key, raw, isBool) =>
    setValues((v) => ({ ...v, [key]: isBool ? raw : raw === "" ? "" : unit === "mm" ? +raw : +(+raw * IN).toFixed(2) }));

  const cupG = useMemo(() => (t.cup ? cupGeometry(t.cup) : null), [tid]); // eslint-disable-line react-hooks/exhaustive-deps
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
    if (cupG) { const xs = cupG.limit.poly.map((q) => q[0]), ys = cupG.limit.poly.map((q) => q[1]);
      return { edges: dieEdges(res.doc), blankBox: [0, 0, res.blankMm[0], res.blankMm[1]], family: "cup", topCutY: null, noInk: [], print, clipPoly: cupG.bleed.poly,
        areas: [{ name: "Cup wall", box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }], customGeometry: (it) => cupItemChecks(cupG, it) }; }
    return { edges: dieEdges(res.doc), blankBox: [0, 0, res.blankMm[0], res.blankMm[1]], family: t.family, topCutY: prog?.topCutY ?? null, noInk: prog?.noInk || [], areas, print };
  }, [res, panelsAny, prog, process, colours]); // eslint-disable-line react-hooks/exhaustive-deps
  const artChecks = useMemo(() => (artCtx ? checkArtwork(art, artCtx) : []), [art, artCtx]);
  // what is drawn and printed: curved items bent onto the cup
  const artOut = useMemo(() => (cupG ? art.map((it) => { if (!it.curve || it.kind !== "svg") return it; try { return curveItem(it, cupG, parseSvgDom); } catch { return it; } }) : art), [art, cupG]);
  const artBlocked = artChecks.some((c) => !c.ok && c.severity === "block");
  useEffect(() => { // artwork on the 3D model
    let live = true;
    if (!art.length || !blankMm || !artCtx) { setTex(null); return; }
    const px = Math.min(5, 4096 / Math.max(blankMm.w, blankMm.h));
    paintArtwork(artOut, { box: [0, 0, blankMm.w, blankMm.h], pxPerMm: cupG ? Math.min(12, px * 2) : px, noInk: artCtx.noInk, background: mat.colour3d.top, clipPoly: artCtx.clipPoly || null }).then((cv) => { if (live) setTex(cv); }).catch(() => {});
    return () => { live = false; };
  }, [artOut, artCtx, mat.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // vector artwork (true paths + one plate per Pantone) for the print files
  const vectorArt = () => artworkToPdf(artOut, { box: [-BLEED, -BLEED, blankMm.w + BLEED, blankMm.h + BLEED], noInk: artCtx.noInk, spot: process === "pantone", rasterise: rasteriseItem, parse: parseSvgDom, clipPoly: artCtx.clipPoly || null });
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
      if (kind === "vendor") {
        const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
        pdf = vendorSheetPdf({ doc: res.doc, vector: vec,
          head: { title: t.name, sub: [saved.name && `Design: ${saved.name}`, saved.customer && `Customer: ${saved.customer}`, job && `Job: ${job}`, today, "Sizes in mm, inches in brackets"].filter(Boolean).join("  |  ") },
          job: [["Item", t.name], ...(sizeText ? [["Size", sizeText]] : []), ...(res.piecesPerBag === 2 ? [["Made as", "2 pieces: two identical halves per bag"]] : []), ["Blank", `${blankMm.w} x ${blankMm.h} mm`],
            ["Material", `${board.label}, ${board.mm} mm thick${board.caliperStatus === "assumed" ? " (assumed)" : ""}`]],
          print: [["Process", process === "pantone" ? `${vec.inks.length} Pantone colour${vec.inks.length === 1 ? "" : "s"}` : process === "cmyk" ? "CMYK" : "Plain"], ["Bleed", `${BLEED} mm past the cut`],
            ...(layFit ? [["Sheet", `${layFit.sheet} (${Math.round(layFit.sw)} x ${Math.round(layFit.sh)} mm), ${layFit.ups}-up, gripper ${layFit.margins.gripper} mm on the ${layFit.gripperOn} edge, ${layFit.press}`]] : [])],
          art: describeArtwork(art, { areas: cupG ? [] : artCtx.areas, blank: blankMm, cup: cupG, toPolar }),
          notes: [...(artCtx.noInk.length || cupG ? ["Glue areas are left unprinted."] : []), "Plates are made from the artwork file without outlines, not from this sheet.", ...vec.notes] });
      } else {
        pdf = toPdf(res.doc, { units: "mm", showDims: false, showDie: kind === "layout", vector: vec, footerLines: vec.notes,
          title: `${kldTitle} | ${kind === "layout" ? "ARTWORK + OUTLINES" : "ARTWORK, NO OUTLINES"}` });
      }
      save(`${stem}-${kind === "layout" ? "LAYOUT" : kind === "artpunch" ? "ARTWORK-PUNCH" : "VENDOR"}.pdf`, pdf, "application/pdf");
    } catch (e) { alert(`Could not make the file: ${e.message}`); }
    setMaking("");
  }
  // DIGITAL SAMPLE: the 13 x 19 in sheet for the digital press (skill aeros-digital-samples): art as a 450 dpi image,
  // solid pink CutContour + green Crease lines, an info box with paper / side / assembly on every sheet.
  const digPlan = useMemo(() => (res && res.doc && blankMm ? planDigital({ doc: res.doc, blank: blankMm, bleed: BLEED, cup: cupG }) : null), [res, blankMm?.w, blankMm?.h, cupG]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // cups: the printer's set on their own nested sheet (LAYOUT / ARTWORK-PUNCH / PUNCH), as made for Blueline and Lucky
  const cupNest = t.nest ? CUP_NEST_REFS[t.nest] : null;
  const [printerPick, setPrinter] = useState("BLUELINE");
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
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6">
          {TEMPLATES.map((x) => (
            <button
              key={x.id}
              onClick={() => pickTemplate(x.id)}
              className={`rounded-lg border px-3 py-2 text-left transition ${x.id === tid ? "border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900" : "border-gray-200 bg-white hover:border-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-600"}`}
            >
              <p className="text-[13px] font-semibold leading-snug">{x.name}</p>
              <p className={`text-xs ${x.id === tid ? "opacity-80" : "text-gray-500 dark:text-gray-400"}`}>
                {x.proven.length} proven size{x.proven.length > 1 ? "s" : ""} · {x.family === "bag" ? "hand-made, offset sheet" : x.family === "cup" ? "fixed KLD die" : "offset sheet, die-cut"}
              </p>
            </button>
          ))}
        </div>
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
                      onClick={() => setValues((v) => { const n = { ...v }; for (const i of t.inputs) if (i.type !== "bool" && p[i.key] != null) n[i.key] = +(+p[i.key]).toFixed(1); return n; })}
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
              </label>
            )}
            <label className="mt-3 block">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Job / customer tag for the file name (optional)</span>
              <input value={job} onChange={(e) => setJob(e.target.value)} placeholder="e.g. J-1042" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-base dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
            </label>
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
                ["Recipe", () => save(`${stem}-recipe.json`, JSON.stringify(res.recipe, null, 2), "application/json")],
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
              <ArtworkDesigner doc={res.doc} geom={panelsAny} family={t.family} areas={artCtx.areas} noInk={artCtx.noInk} items={art} setItems={setArt} boardColour={mat.colour3d.top} cup={cupG} clipPoly={artCtx.clipPoly || null} snap={snapArt} undo={undoArt} redo={redoArt} canUndo={histN >= 0 && hist.current.past.length > 0} canRedo={hist.current.future.length > 0} />
              {art.length > 0 && (
                <>
                  <ul className="mt-3 space-y-1.5">
                    {artChecks.map((c, k) => (
                      <li key={c.id + k} className={`rounded-md px-3 py-2 text-xs ${SEV[c.severity][c.ok ? "pass" : "fail"]}`}>
                        <span className="font-semibold">{c.ok ? (c.severity === "info" ? "ℹ" : "✓") : c.severity === "block" ? "✕" : "!"} {c.title}</span> <span className="opacity-60">[{c.id}]</span>
                        <div className="mt-0.5">{c.detail}</div>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {[["layout", "Artwork + outlines (PDF)"], ["artpunch", "Artwork, no outlines (PDF)"], ...(cupG ? [] : [["vendor", "Vendor sheet: sizes + colours (PDF)"]])].map(([k, label]) => (
                      <button key={k} disabled={!ok || artBlocked || !!making} onClick={() => printFile(k)}
                        className="rounded-md border border-gray-900 bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-200 disabled:text-gray-500 dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900 dark:disabled:border-gray-700 dark:disabled:bg-gray-800">
                        {making === k ? "Making…" : label}
                      </button>
                    ))}
                    {(solid || cupG) && <button className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-gray-900 dark:border-gray-700 dark:text-gray-200" onClick={() => { const a = document.createElement("a"); a.href = viewerRef.current.snapshot(); a.download = `${stem}-3D-PROOF.png`; a.click(); }}>3D proof (PNG)</button>}
                    {digPlan && !digPlan.error && <button disabled={!ok || artBlocked || !!making} onClick={digitalFile} title={`${digPlan.note} on ${digPlan.sheets.length} sheet${digPlan.sheets.length === 1 ? "" : "s"}`}
                      className="rounded-md border border-fuchsia-700 bg-fuchsia-700 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-200 disabled:text-gray-500 dark:disabled:border-gray-700 dark:disabled:bg-gray-800">
                      {making === "digital" ? "Making…" : `Digital sample, 13 × 19 in (${digPlan.split ? `${digPlan.pieces.length} pieces` : `${digPlan.ups}-up`})`}
                    </button>}
                    {digPlan?.error && <span className="text-[11px] text-amber-700 dark:text-amber-300">Digital sample: {digPlan.error}</span>}
                    {(!ok || artBlocked) && <span className="text-[11px] text-red-700 dark:text-red-300">Print files are locked until every check passes.</span>}
                    {cupG && <p className="w-full text-[11px] text-gray-600 dark:text-gray-400">{cupNest ? "These are one-cup files for checking and approval. The printer's set is below." : "These are one-cup files for checking and approval. No offset nest is on file for this cup, so the printer's set is not made here."}</p>}
                  </div>
                </>
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
          <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{cupG ? "3D cup (the real fan wrapped to its cone)" : `3D model (the real die folded at ${board.mm} mm caliper${board.caliperStatus === "assumed" ? ", assumed" : ""})`}</h2>
              {(solid || cupG) && (
                <div className="flex gap-2">
                  <button onClick={() => save(`${stem}-3D.stl`, viewerRef.current.exportStl(), "model/stl")} className="rounded-md border border-gray-300 px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:border-gray-900 dark:border-gray-700 dark:text-gray-200">STL (mm)</button>
                  <button onClick={() => save(`${stem}-3D.obj`, viewerRef.current.exportObj(), "model/obj")} className="rounded-md border border-gray-300 px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:border-gray-900 dark:border-gray-700 dark:text-gray-200">OBJ (mm)</button>
                </div>
              )}
            </div>
            {cupG && blankMm ? (
              <>
                {innerG && (
                  <div className="mb-2 flex w-fit overflow-hidden rounded-md border border-gray-300 text-xs dark:border-gray-700">
                    {[["full", "Full cup (wrap on the inner cup)"], ["wrap", "Outer fan only"]].map(([k, l]) => (
                      <button key={k} onClick={() => setCupView(k)} className={`px-3 py-1.5 ${cupView === k ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900" : "text-gray-600 dark:text-gray-300"}`}>{l}</button>
                    ))}
                  </div>
                )}
                <SolidViewer ref={viewerRef} cone={cupG} coneInner={innerG && cupView === "full" ? innerG : null} caliper={board.mm} colours={mat.colour3d} texture={tex} blank={blankMm} />
                <ul className="mt-3 space-y-1.5">
                  {[...cupFormedChecks(cupG), ...(innerG && cupView === "full" ? cupFitChecks(cupG, innerG, board.mm) : [])].map((c, k) => (
                    <li key={k} className={`rounded-md px-3 py-2 text-xs ${SEV[c.severity][c.ok ? "pass" : "fail"]}`}>
                      <span className="font-semibold">{c.ok ? (c.severity === "info" ? "ℹ" : "✓") : "!"} {c.title}</span> <span className="opacity-60">[{c.id}]</span>
                      <div className="mt-0.5">{c.detail}</div>
                    </li>
                  ))}
                </ul>
              </>
            ) : solid ? (
              <>
                <SolidViewer ref={viewerRef} model={solid} lieFlat={t.family === "box"} colours={mat.colour3d} texture={tex} blank={blankMm} />
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
                {solidFinal && (
                  <ul className="mt-3 space-y-1.5">
                    {solidFinal.checks.map((c, k) => (
                      <li key={k} className={`rounded-md px-3 py-2 text-xs ${SEV[c.severity][c.ok ? "pass" : "fail"]}`}>
                        <span className="font-semibold">{c.ok ? "✓" : "!"} {c.title}</span> <span className="opacity-60">[{c.id}]</span>
                        <div className="mt-0.5">{c.detail}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="text-xs text-gray-500">The fold program for this template is being built (bags first; boxes next).</p>
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
              <ul className="space-y-1.5">
                {res.checks.map((c, k) => (
                  <li key={c.id + k} className={`rounded-md px-3 py-2 text-xs ${SEV[c.severity][c.ok ? "pass" : "fail"]}`}>
                    <span className="font-semibold">{c.ok ? (c.severity === "info" ? "ℹ" : "✓") : c.severity === "block" ? "✕" : "!"} {c.title}</span>
                    <span className="ml-1 opacity-60">[{c.id}]</span>
                    <div className="mt-0.5">{c.detail}</div>
                  </li>
                ))}
              </ul>
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
