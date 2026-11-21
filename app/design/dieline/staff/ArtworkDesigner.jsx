"use client";
// ARTWORK DESIGNER — place customer artwork on the flat die, in millimetres. Open a PDF / AI / SVG / PNG / JPG, then move,
// size, rotate, crop and recolour it; snap it to a panel centre; add a flat colour ground. Everything is in the die's own
// frame, so what is placed here is what prints and what the 3D model shows. Rules live in lib/dieline/designer/model.js.
import { useEffect, useMemo, useRef, useState } from "react";
import { PT_PER_MM } from "@/lib/dieline/cakebox";
import { corners, bboxOf, effectiveDpi, newId, BLEED, SAFE, MIN_DPI } from "@/lib/dieline/designer/model";
import { parseSvgDom } from "@/lib/dieline/designer/io";
import { curveItem, curveBlocker } from "@/lib/dieline/designer/cup-warp";
import { toPolar, fromPolar, CUP_RULES } from "@/lib/dieline/cup";
import { importFile, refreshSvg, textItem, retext, FONTS, addCustomFont, svgParts, hideParts, replaceFile, SHAPES, shapeItem, penItem, reshape, traceItem, nodesOf, withNodes, vectorItem } from "@/lib/dieline/designer/io";
import { loadHouse, footersFor, footerSvg, symbolSvg, cupMarkSpot, MARK_CAP_MM } from "@/lib/dieline/designer/house";

const inputCls = "w-full rounded-md border border-gray-300 px-2 py-1.5 text-base dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100";
const btnCls = "rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:border-gray-900 disabled:opacity-40 dark:border-gray-700 dark:text-gray-200";
const r1 = (v) => Math.round(v * 10) / 10;

export default function ArtworkDesigner({ doc, geom, family, areas, noInk, items, setItems, boardColour, snap, undo, redo, canUndo, canRedo, cup = null, clipPoly = null, house = null, pantone = false, customer = "", repeat = null }) {
  const svgRef = useRef(null), drag = useRef(null);
  const [sel, setSel] = useState(null), [busy, setBusy] = useState(""), [err, setErr] = useState(""), [guides, setGuides] = useState([]);
  const [pen, setPen] = useState(null); // null = off; { pts: [[x, y]], at: [x, y] } while drawing with the pen
  // SNAP TO NODES (pen points and dragged shape points): what the cursor catches. Alt = no snapping, Shift = 45 deg steps.
  const [snapOpt, setSnapOpt] = useState({ nodes: true, die: true, guides: true, grid: 0 }), [mark, setMark] = useState(null);
  const [hs0, setHs0] = useState(null), [footSku, setFootSku] = useState(""); // house marks (loaded once), the footer picked
  useEffect(() => { let live = true; loadHouse().then((h) => { if (live) setHs0(h); }).catch(() => {}); return () => { live = false; }; }, []);
  const [alignTo, setAlignTo] = useState("safe"); // what Align lines things up with: "safe" | "panel" | "blank" | a layer id
  const [tr, setTr] = useState({ colours: 1, detail: 0.9, keepPaper: false }), [trInfo, setTrInfo] = useState(null);
  const W = doc.blank.widthPt / PT_PER_MM, H = doc.blank.heightPt / PT_PER_MM, M = 14;
  const S = SAFE[family] || SAFE.box;
  const cur = items.find((i) => i.id === sel) || null;
  // ZOOM + PAN of the artwork area: + / - / Fit, Ctrl or Cmd + mouse wheel zooms on the cursor, and when zoomed in a drag on
  // empty board moves the view. Everything stays in die millimetres, so nothing about placement changes with the zoom.
  const [zoom, setZoom] = useState(1), [centre, setCentre] = useState(null), pan = useRef(null);
  const VW = (W + 2 * M) / zoom, VH = (H + 2 * M) / zoom;
  const clampC = (c2, vw = VW, vh = VH) => [Math.max(-M + vw / 2, Math.min(W + M - vw / 2, c2[0])), Math.max(-M + vh / 2, Math.min(H + M - vh / 2, c2[1]))];
  const viewC = clampC(centre || [W / 2, H / 2]);
  const zoomBy = (k, at = null) => { const z = Math.max(1, Math.min(16, +(zoom * k).toFixed(3))), a = at || viewC; setZoom(z); setCentre(z === 1 ? null : clampC([a[0] + (viewC[0] - a[0]) * (zoom / z), a[1] + (viewC[1] - a[1]) * (zoom / z)], (W + 2 * M) / z, (H + 2 * M) / z)); };
  const zoomSel = () => { const it = items.find((i) => i.id === sel); if (!it || it.kind === "flood") return; const b = bboxOf(corners(view(it))), z = Math.max(1, Math.min(16, 0.6 * Math.min((W + 2 * M) / Math.max(1, b[2] - b[0]), (H + 2 * M) / Math.max(1, b[3] - b[1])))); setZoom(+z.toFixed(2)); setCentre(clampC([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], (W + 2 * M) / z, (H + 2 * M) / z)); };
  useEffect(() => { setZoom(1); setCentre(null); }, [W, H]); // a new die starts fitted
  useEffect(() => { // Ctrl / Cmd + wheel zooms on the cursor (a native listener: it must be able to stop the browser's own page zoom)
    const el = svgRef.current; if (!el) return undefined;
    const onWheel = (e) => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(el.getScreenCTM().inverse()); zoomBy(e.deltaY < 0 ? 1.25 : 0.8, [q.x, q.y]); };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  const die = useMemo(() => {
    const k = 1 / PT_PER_MM, P = (p) => `${(p[0] * k).toFixed(2)} ${(p[1] * k).toFixed(2)}`;
    const path = (layer) => doc.segments.filter((s) => s.layer === layer).map((s) => (s.kind === "l" ? `M${P(s.pts[0])}L${P(s.pts[1])}` : `M${P(s.pts[0])}C${P(s.pts[1])} ${P(s.pts[2])} ${P(s.pts[3])}`)).join("");
    return { cut: path("cut"), crease: path("crease"), safe: path("safe") };
  }, [doc]);
  const board = useMemo(() => (geom ? geom.panels.map((p) => [p.outline, ...p.holes].map((ring) => "M" + ring.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join("L") + "Z").join("")).join("") : `M0 0H${W}V${H}H0Z`), [geom, W, H]);

  const patch = (id, fn) => setItems((list) => list.map((i) => (i.id === id ? fn(i) : i)));
  const act = (fn) => (...a) => { snap(); return fn(...a); }; // every button press is one undo step
  const [fontTick, setFontTick] = useState(0);
  useEffect(() => { // Ctrl/Cmd+Z, Shift+Z; Delete removes the selected layer (not while typing in a field)
    const onKey = (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (pen) { // pen: Enter = finish as a line, Escape = cancel, Backspace = take the last point back
        if (e.key === "Enter") { e.preventDefault(); finishPen(false); }
        else if (e.key === "Escape") { e.preventDefault(); setPen(null); }
        else if (e.key === "Backspace") { e.preventDefault(); setPen((q) => (q ? { ...q, pts: q.pts.slice(0, -1) } : q)); }
        return;
      }
      if (sel && /^Arrow/.test(e.key)) { // nudge the selected layer: 0.5 mm, Shift = 5 mm, Alt = 0.1 mm
        e.preventDefault();
        const st = e.shiftKey ? 5 : e.altKey ? 0.1 : 0.5, dx = e.key === "ArrowLeft" ? -st : e.key === "ArrowRight" ? st : 0, dy = e.key === "ArrowUp" ? -st : e.key === "ArrowDown" ? st : 0;
        if (!e.repeat) snap();
        setItems((l) => l.map((i) => (i.id === sel && i.kind !== "flood" && i.house !== "mark" ? { ...i, x: Math.round((i.x + dx) * 10) / 10, y: Math.round((i.y + dy) * 10) / 10 } : i)));
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if ((e.key === "Delete" || e.key === "Backspace") && sel) { e.preventDefault(); snap(); setItems((l) => l.filter((i) => i.id !== sel)); setSel(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const dieNodes = useMemo(() => { // every end of a cut or fold line of the die
    const k = 1 / PT_PER_MM, seen = new Set(), out = [];
    for (const sg of doc.segments) if (sg.layer === "cut" || sg.layer === "crease") for (const q of [sg.pts[0], sg.pts[sg.pts.length - 1]]) { const v = [+(q[0] * k).toFixed(2), +(q[1] * k).toFixed(2)], key = v.join(); if (!seen.has(key)) { seen.add(key); out.push(v); } }
    return out;
  }, [doc]);
  const r2 = (v) => Math.round(v * 100) / 100;
  /** where a pen / node point lands: raw = cursor in die mm; from = the previous point (for Shift); own = the path being drawn */
  function snapPoint(raw, e, { from = null, own = [], skipId = null } = {}) {
    if (e.altKey) return { p: raw.map(r2), kind: null };
    const box = svgRef.current.getBoundingClientRect(), tol = 9 * (VW / (box.width || 1)); // 9 screen pixels, in mm
    let best = null;
    const tryPt = (q, kind) => { const d = Math.hypot(q[0] - raw[0], q[1] - raw[1]); if (d < tol && (!best || d < best.d)) best = { p: q, kind, d }; };
    own.forEach((q, k) => tryPt(q, k === 0 && own.length >= 3 ? "start: closes the shape" : "point"));
    if (snapOpt.nodes) for (const it of items) if (it.id !== skipId) for (const q of nodesOf(it)) tryPt(q, "point of " + it.name);
    if (snapOpt.die) for (const q of dieNodes) tryPt(q, "die corner");
    if (best) return { p: [r2(best.p[0]), r2(best.p[1])], kind: best.kind };
    let p = raw.slice(), kind = null;
    if (e.shiftKey && from) { const a = Math.round(Math.atan2(p[1] - from[1], p[0] - from[0]) / (Math.PI / 4)) * (Math.PI / 4), L = Math.hypot(p[0] - from[0], p[1] - from[1]); p = [from[0] + L * Math.cos(a), from[1] + L * Math.sin(a)]; kind = "45 deg step"; }
    else if (snapOpt.guides && !cup) for (const a of areas) if (p[0] > a.box[0] && p[0] < a.box[2] && p[1] > a.box[1] && p[1] < a.box[3]) {
      for (const [v, n] of [[(a.box[0] + a.box[2]) / 2, "centre line"], [a.box[0] + S.fold, "safe edge"], [a.box[2] - S.fold, "safe edge"]]) if (Math.abs(p[0] - v) < tol) { p[0] = v; kind = n; }
      for (const [v, n] of [[(a.box[1] + a.box[3]) / 2, "centre line"], [a.box[1] + S.topCut, "safe edge"], [a.box[3] - S.fold, "safe edge"]]) if (Math.abs(p[1] - v) < tol) { p[1] = v; kind = kind ? kind + " + " + n : n; }
    }
    if (!kind && snapOpt.grid) { p = p.map((v) => Math.round(v / snapOpt.grid) * snapOpt.grid); kind = `${snapOpt.grid} mm grid`; }
    return { p: p.map(r2), kind };
  }
  const toMm = (e) => { const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svgRef.current.getScreenCTM().inverse()); return [p.x, p.y]; };

  async function onFiles(e) {
    const files = [...e.target.files]; e.target.value = "";
    setErr(""); setBusy("Reading…");
    try {
      const a0 = areas[0]?.box || [0, 0, W, H], cx = (a0[0] + a0[2]) / 2, cy = (a0[1] + a0[3]) / 2, startW = Math.min(90, (a0[2] - a0[0]) * 0.55);
      const added = [];
      const spot = cup ? (() => { const a = cup.aLeft + cup.wrap / 2, r = (cup.floorR + cup.topR) / 2, [x, y] = fromPolar(cup, r, a); return { x: r1(x), y: r1(y), rot: r1((a * 180) / Math.PI) }; })() : { x: cx, y: cy };
      for (const f of files) for (const it of await importFile(f, { startW: cup ? Math.min(startW, 40) : startW })) added.push({ ...it, ...spot });
      snap();
      setItems((list) => [...list, ...added]);
      if (added.length) setSel(added[added.length - 1].id);
    } catch (ex) { setErr(ex.message || "Could not read that file."); }
    setBusy("");
  }
  async function addText() {
    setErr("");
    try {
      const a0 = areas[0]?.box || [0, 0, W, H];
      const it = await textItem({ content: "Your text" });
      snap();
      const spot = cup ? (() => { const a = cup.aLeft + cup.wrap / 2, r = (cup.floorR + cup.topR) / 2, [x, y] = fromPolar(cup, r, a); return { x: r1(x), y: r1(y), rot: r1((a * 180) / Math.PI), curve: true }; })() : { x: r1((a0[0] + a0[2]) / 2), y: r1((a0[1] + a0[3]) / 2) };
      setItems((l) => [...l, sameInk({ ...it, ...spot })]); setSel(it.id);
    } catch (ex) { setErr(ex.message); }
  }
  const setText = async (p2) => { try { const n = await retext(cur, p2); patch(cur.id, () => n); } catch (ex) { setErr(ex.message); } };
  async function onFont(e) {
    const f2 = e.target.files[0]; e.target.value = "";
    if (!f2) return;
    try { const id = await addCustomFont(f2); setFontTick((n) => n + 1); snap(); await setText({ fontId: id }); } catch { setErr("Could not read that font. Use a TTF or OTF file."); }
  }
  // shapes land where new artwork lands; the pen draws exactly where you click
  const landing = () => {
    if (cup) { const a = cup.aLeft + cup.wrap / 2, r = (cup.floorR + cup.topR) / 2, [x, y] = fromPolar(cup, r, a); return { x: r1(x), y: r1(y), rot: r1((a * 180) / Math.PI) }; }
    const a0 = areas[0]?.box || [0, 0, W, H]; return { x: r1((a0[0] + a0[2]) / 2), y: r1((a0[1] + a0[3]) / 2) };
  };
  const addShape = (type) => { snap(); const it = sameInk({ ...shapeItem(type), ...landing() }); setItems((l) => [...l, it]); setSel(it.id); };
  const penRef = useRef(null); penRef.current = pen; // the latest pen path, for the keyboard and the click that closes the shape
  function finishPen(closed) {
    const q = penRef.current;
    if (q && q.pts.length >= (closed ? 3 : 2)) { snap(); const it = sameInk(penItem(q.pts, closed)); setItems((l) => [...l, it]); setSel(it.id); }
    setPen(null);
  }
  const setShape = (p2) => patch(cur.id, (i) => reshape(i, { shape: p2 }));
  const addFlood = () => { snap(); const it = { id: newId(), kind: "flood", name: "Colour ground", role: "background", colour: "#1f1f1f", pantone: "" }; setItems((l) => [it, ...l]); setSel(it.id); };

  // ---- pointer: move, and scale from a corner handle
  function down(e, it, mode, k = -1) {
    if (it.kind === "flood") { setSel(it.id); return; }
    // THE AEROS MARK IS LOCKED IN ITS PLACE on every item (Arjun 21-Nov-2026: "User should not be able to drag it"): it can be
    // selected (to change its ink to another job colour, or to delete it on a dealer job) but never moved, sized or turned
    if (it.house === "mark") { e.stopPropagation(); setSel(it.id); return; }
    e.stopPropagation(); e.currentTarget.setPointerCapture?.(e.pointerId);
    snap();
    const [mx, my] = toMm(e);
    const upright = cup && Math.abs(((((it.rot || 0) - (toPolar(cup, [it.x, it.y]).a * 180) / Math.PI) + 540) % 360) - 180) <= 1;
    drag.current = { id: it.id, mode, mx, my, x: it.x, y: it.y, w: it.w, h: it.h, d0: Math.hypot(mx - it.x, my - it.y), upright, k, nodes: mode === "node" ? nodesOf(it) : null,
      side: mode === "edge" ? k : null, box: mode === "edge" ? bboxOf(corners(it)) : null,
      anchor: mode === "scale" && k >= 0 && it.shape && it.shape.type !== "path" && !((it.rot || 0) % 180) && !cup ? corners(it)[(k + 2) % 4] : null };
    setSel(it.id);
  }
  // lines an edge can catch: [value, guide from, guide to]. at = where the layer is; bb = its box (for guide lengths)
  const cur0 = (id) => items.find((i) => i.id === id) || null;
  function snapLines(skipId, at, bb) {
    const box = svgRef.current.getBoundingClientRect(), tol = 8 * (VW / (box.width || 1)), xs = [], ys = [];
    for (const a of areas) if (at[0] > a.box[0] - tol && at[0] < a.box[2] + tol && at[1] > a.box[1] - tol && at[1] < a.box[3] + tol) {
      xs.push([a.box[0], a.box[1], a.box[3]], [a.box[2], a.box[1], a.box[3]], [(a.box[0] + a.box[2]) / 2, a.box[1], a.box[3]], [a.box[0] + S.fold, a.box[1], a.box[3]], [a.box[2] - S.fold, a.box[1], a.box[3]]);
      ys.push([a.box[1], a.box[0], a.box[2]], [a.box[3], a.box[0], a.box[2]], [(a.box[1] + a.box[3]) / 2, a.box[0], a.box[2]], [a.box[1] + S.topCut, a.box[0], a.box[2]], [a.box[3] - S.fold, a.box[0], a.box[2]]);
    }
    for (const v of [0, W, -BLEED, W + BLEED]) xs.push([v, -BLEED, H + BLEED]);
    for (const v of [0, H, -BLEED, H + BLEED]) ys.push([v, -BLEED, W + BLEED]);
    for (const o of items) if (o.id !== skipId && o.kind !== "flood") {
      const ob = bboxOf(corners(o)), lo = Math.min(ob[1], bb[1]), hi = Math.max(ob[3], bb[3]), l2 = Math.min(ob[0], bb[0]), h2 = Math.max(ob[2], bb[2]);
      xs.push([ob[0], lo, hi], [(ob[0] + ob[2]) / 2, lo, hi], [ob[2], lo, hi]); ys.push([ob[1], l2, h2], [(ob[1] + ob[3]) / 2, l2, h2], [ob[3], l2, h2]);
    }
    return { xs, ys, tol };
  }
  function move(e) {
    const d = drag.current; if (!d) return;
    const [mx, my] = toMm(e);
    if (d.mode === "edge") { // ONE EDGE of a shape: only the width (left / right handle) or only the height (top / bottom) changes; it snaps
      const b = d.box.slice(), horiz = d.side === "l" || d.side === "r", g = []; let v = horiz ? mx : my;
      if (!e.altKey) {
        const { xs, ys, tol } = snapLines(d.id, [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], b);
        const hit = (horiz ? xs : ys).reduce((best, c) => (Math.abs(c[0] - v) < tol && (!best || Math.abs(c[0] - v) < Math.abs(best[0] - v)) ? c : best), null);
        if (hit) { v = hit[0]; g.push([horiz ? "v" : "h", hit[0], hit[1], hit[2]]); }
      }
      if (d.side === "l") b[0] = Math.min(v, b[2] - 0.3); else if (d.side === "r") b[2] = Math.max(v, b[0] + 0.3); else if (d.side === "t") b[1] = Math.min(v, b[3] - 0.3); else b[3] = Math.max(v, b[1] + 0.3);
      d.box = b; setGuides(g);
      const turned = Math.abs(((cur0(d.id)?.rot || 0) % 180)) === 90, bw = b[2] - b[0], bh = b[3] - b[1], w = turned ? bh : bw, h = turned ? bw : bh;
      patch(d.id, (i) => ({ ...reshape(i, { w, h }), w: r2(w), h: r2(h), x: r2((b[0] + b[2]) / 2), y: r2((b[1] + b[3]) / 2) }));
      return;
    }
    if (d.mode === "node") { // drag one point of a drawn shape; it catches the same nodes the pen does
      const sp = snapPoint([mx, my], e, { skipId: d.id, own: d.nodes.filter((_, n) => n !== d.k), from: d.nodes[(d.k + d.nodes.length - 1) % d.nodes.length] });
      d.nodes = d.nodes.map((q, n) => (n === d.k ? sp.p : q));
      setMark(sp.kind ? sp : null);
      patch(d.id, (i) => withNodes(i, d.nodes));
      return;
    }
    if (d.mode === "move") {
      let x = d.x + mx - d.mx, y = d.y + my - d.my; const g = [];
      if (!cup && !e.altKey) { // SNAP (hold Alt to switch off): this layer's left / centre / right and top / middle / bottom
        // catch the folds and cuts of its panel, the panel's centre lines and safe-area edges, the blank's edge and bleed
        // edge, and the edges and centres of every other layer
        const me = items.find((i) => i.id === d.id), bb = bboxOf(corners({ ...me, x, y })), { xs, ys, tol } = snapLines(d.id, [x, y], bb);
        const pick = (mine, list) => { let best = null; for (const m of mine) for (const c of list) { const dd = c[0] - m; if (Math.abs(dd) < tol && (!best || Math.abs(dd) < Math.abs(best[0]))) best = [dd, c]; } return best; };
        const sx = pick([bb[0], (bb[0] + bb[2]) / 2, bb[2]], xs), sy = pick([bb[1], (bb[1] + bb[3]) / 2, bb[3]], ys);
        if (sx) { x += sx[0]; g.push(["v", sx[1][0], sx[1][1], sx[1][2]]); }
        if (sy) { y += sy[0]; g.push(["h", sy[1][0], sy[1][1], sy[1][2]]); }
      }
      setGuides(g);
      patch(d.id, (i) => ({ ...i, x: r1(x), y: r1(y), ...(d.upright ? { rot: r1((toPolar(cup, [x, y]).a * 180) / Math.PI) } : {}) }));
    } else if (d.mode === "rotate") {
      // the handle sits above the element: straight up = 0 deg. Snaps to 0 / 90 / 180 / 270 within 4 deg; Shift = 15 deg steps.
      let a = (Math.atan2(my - d.y, mx - d.x) * 180) / Math.PI + 90;
      a = ((a % 360) + 360) % 360;
      if (e.shiftKey) a = Math.round(a / 15) * 15;
      else for (const q of [0, 90, 180, 270, 360]) if (Math.abs(a - q) < 4) a = q % 360;
      patch(d.id, (i) => ({ ...i, rot: r1(a % 360) }));
    } else if (d.anchor) {
      // A SHAPE (rectangle, line, ...) square to the page: the opposite corner stays put and the dragged corner goes where
      // the pointer is - so width and height change on their own - and each of its two edges snaps (Arjun 21-Nov-2026:
      // "If I am making a rectangle on a paper bag, the edges should snap"). Alt = free.
      let px = mx, py = my; const g = [];
      if (!cup && !e.altKey) {
        const bb = [Math.min(d.anchor[0], px), Math.min(d.anchor[1], py), Math.max(d.anchor[0], px), Math.max(d.anchor[1], py)], { xs, ys, tol } = snapLines(d.id, [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2], bb);
        const near = (v, list) => list.reduce((best, c) => (Math.abs(c[0] - v) < tol && (!best || Math.abs(c[0] - v) < Math.abs(best[0] - v)) ? c : best), null);
        const sx = near(px, xs), sy = near(py, ys);
        if (sx) { px = sx[0]; g.push(["v", sx[0], sx[1], sx[2]]); }
        if (sy) { py = sy[0]; g.push(["h", sy[0], sy[1], sy[2]]); }
      }
      setGuides(g);
      const w = Math.max(0.3, Math.abs(px - d.anchor[0])), h = Math.max(0.3, Math.abs(py - d.anchor[1]));
      patch(d.id, (i) => ({ ...reshape(i, { w, h }), w: r2(w), h: r2(h), x: r2((px + d.anchor[0]) / 2), y: r2((py + d.anchor[1]) / 2) }));
    } else {
      const k = Math.max(0.05, Math.hypot(mx - d.x, my - d.y) / (d.d0 || 1));
      patch(d.id, (i) => ({ ...i, w: r1(d.w * k), h: r1(d.h * k) }));
    }
  }
  const up = () => {
    if (pan.current) { if (!pan.current.moved) setSel(null); pan.current = null; } // a click on empty board still deselects
    const d = drag.current;
    if (d && d.mode === "scale") patch(d.id, (i) => (i.shape ? reshape(i) : i)); // a stretched shape is redrawn at true line weight
    drag.current = null; setGuides([]); setMark(null);
  };

  const setCrop = (side, pct) => patch(cur.id, (i) => {
    const c = { ...i.crop, [side]: Math.max(0, Math.min(0.9, pct / 100)) };
    if (c.l + c.r > 0.95 || c.t + c.b > 0.95) return i;
    const sx = i.w / (i.natW * (1 - i.crop.l - i.crop.r)), sy = i.h / (i.natH * (1 - i.crop.t - i.crop.b)); // keep the print scale
    return { ...i, crop: c, w: r1(i.natW * (1 - c.l - c.r) * sx), h: r1(i.natH * (1 - c.t - c.b) * sy) };
  });
  const setW = (w) => patch(cur.id, (i) => (!(w > 0) ? i : i.shape ? reshape(i, { w }) : { ...i, w: r1(w), h: r1((w * i.h) / i.w) }));
  const setHt = (h) => patch(cur.id, (i) => (!(h > 0) ? i : i.shape ? reshape(i, { h }) : { ...i, h: r1(h), w: r1((h * i.w) / i.h) }));
  // ALIGN: line the selected layer up with the safe area of its panel, the panel itself, the whole blank, or another layer
  const areaOf = (i) => areas.find((a) => i.x > a.box[0] && i.x < a.box[2] && i.y > a.box[1] && i.y < a.box[3]) || null;
  const refBox = (i) => {
    if (alignTo === "blank") return [0, 0, W, H];
    const other = items.find((o) => o.id === alignTo && o.id !== i.id);
    if (other) return bboxOf(corners(view(other)));
    const a = areaOf(i); if (!a) return [0, 0, W, H];
    return alignTo === "panel" ? a.box : [a.box[0] + S.fold, a.box[1] + S.topCut, a.box[2] - S.fold, a.box[3] - S.fold];
  };
  const align = (mode) => patch(cur.id, (i) => {
    const b = bboxOf(corners(view(i))), r = refBox(i);
    const dx = mode === "l" ? r[0] - b[0] : mode === "c" ? (r[0] + r[2]) / 2 - (b[0] + b[2]) / 2 : mode === "r" ? r[2] - b[2] : 0;
    const dy = mode === "t" ? r[1] - b[1] : mode === "m" ? (r[1] + r[3]) / 2 - (b[1] + b[3]) / 2 : mode === "b" ? r[3] - b[3] : 0;
    return { ...i, x: r1(i.x + dx), y: r1(i.y + dy) };
  });
  // space every logo / text layer on this panel evenly (equal gaps between them), across or down
  const spread = (axis) => setItems((l) => {
    const me = l.find((i) => i.id === sel), a = me && areaOf(me), k = axis === "x" ? 0 : 1;
    const set = l.filter((i) => i.kind !== "flood" && i.role === "content" && (!a || areaOf(i) === a)).map((i) => ({ i, b: bboxOf(corners(view(i))) })).sort((p, q) => p.b[k] - q.b[k]);
    if (set.length < 3) return l;
    const total = set.reduce((t, q) => t + q.b[k + 2] - q.b[k], 0), gap = (set[set.length - 1].b[k + 2] - set[0].b[k] - total) / (set.length - 1);
    let at = set[0].b[k]; const move = new Map();
    for (const q of set) { move.set(q.i.id, at - q.b[k]); at += q.b[k + 2] - q.b[k] + gap; }
    return l.map((i) => (move.has(i.id) ? { ...i, [axis]: r1(i[axis] + move.get(i.id)) } : i));
  });
  const sameSize = (dim) => patch(cur.id, (i) => { const o = items.find((q) => q.id === alignTo); if (!o || o.id === i.id) return i; return dim === "w" ? (i.shape ? reshape(i, { w: o.w }) : { ...i, w: o.w, h: r1((o.w * i.h) / i.w) }) : (i.shape ? reshape(i, { h: o.h }) : { ...i, h: o.h, w: r1((o.h * i.w) / i.h) }); });
  const pictures = items.filter((i) => (i.kind === "raster" && i.role === "content") || (i.kind === "svg" && i.embedded));
  async function runTrace() {
    setErr(""); setBusy("Tracing…");
    try { const { item: n, info } = await traceItem(cur, tr); snap(); patch(cur.id, () => n); setTrInfo({ id: n.id, ...info, svg: undefined }); }
    catch (ex) { setErr(ex.message || "Could not trace that picture."); }
    setBusy("");
  }
  // ---- JOB COLOURS: every ink the artwork already prints (with its Pantone name). One click gives another object the SAME
  // ink - same colour value, same plate name - so two objects meant to be one colour can never end up as two plates.
  const jobInks = (() => { const seen = new Map(); for (const i of items) for (const c2 of (i.kind === "flood" ? [{ to: i.colour, name: i.pantone || "" }] : i.kind === "svg" ? i.colours || [] : [])) { const k = String(c2.to).toLowerCase(); if (/^#[0-9a-f]{6}$/.test(k) && k !== "#ffffff" && (!seen.has(k) || (!seen.get(k).name && c2.name))) seen.set(k, { to: k, name: c2.name || "" }); } return [...seen.values()]; })();
  const lastInk = () => { for (let k = items.length - 1; k >= 0; k--) { const i = items[k]; if (i.house) continue; const c2 = i.kind === "flood" ? { to: i.colour, name: i.pantone || "" } : (i.colours || []).find((q) => /^#[0-9a-f]{6}$/i.test(q.to) && !/^#f{6}$/i.test(q.to)); if (c2) return { to: c2.to, name: c2.name || "" }; } return null; };
  const sameInk = (it) => { const ink = lastInk(); return ink && it.colours?.length === 1 ? refreshSvg({ ...it, colours: [{ ...it.colours[0], to: ink.to, name: ink.name }] }) : it; }; // a new one-colour object starts in the job's last colour
  // ---- BRAND KIT: a customer's vector logos and Pantone colours, saved once (table dieline_brand_kits) and dropped onto any
  // item. Saved under the customer / brand name typed on the design. Vector only: a picture is traced first.
  const [bk, setBk] = useState({ open: false, list: null, kit: null, msg: "" });
  const brand = (customer || "").trim();
  const kitLogos = items.filter((i) => i.kind === "svg" && !i.house && !["shape", "house", "text"].includes(i.source));
  const kitList = async () => { try { const j = await (await fetch("/api/design/brand-kits")).json(); setBk((q) => ({ ...q, list: j.kits || [], msg: j.error || "" })); return j.kits || []; } catch { setBk((q) => ({ ...q, list: [], msg: "Could not load the brand kits." })); return []; } };
  const kitOpen = async (id) => { if (!id) { setBk((q) => ({ ...q, kit: null })); return; } try { const j = await (await fetch(`/api/design/brand-kits/${id}`)).json(); if (j.error) throw new Error(j.error); setBk((q) => ({ ...q, kit: j.kit })); } catch (ex) { setBk((q) => ({ ...q, msg: ex.message })); } };
  const kitToggle = async () => {
    if (bk.open) { setBk((q) => ({ ...q, open: false })); return; }
    setBk((q) => ({ ...q, open: true, msg: "Loading…" }));
    const list = await kitList(), mine = list.find((k) => k.customer.trim().toLowerCase() === brand.toLowerCase());
    setBk((q) => ({ ...q, msg: q.msg === "Loading…" ? "" : q.msg }));
    if (mine) kitOpen(mine.id);
  };
  const kitPick = cur && kitLogos.includes(cur) ? [cur] : kitLogos; // the selected logo, or every logo of this job
  const kitSave = async () => {
    setBk((q) => ({ ...q, msg: "Saving…" }));
    try {
      const r = await fetch("/api/design/brand-kits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customer: brand, logos: kitPick.map(({ href, ...rest }) => rest), colours: jobInks.map((q) => ({ hex: q.to, name: q.name })) }) });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "Save failed");
      await kitList(); await kitOpen(j.kit.id);
      setBk((q) => ({ ...q, msg: `Saved to the brand kit of ${j.kit.customer}.` }));
    } catch (ex) { setBk((q) => ({ ...q, msg: ex.message })); }
  };
  const kitAdd = (lg) => { // lands where an uploaded file lands, at its saved size unless that is too big for this item
    const a0 = areas[0]?.box || [0, 0, W, H], w = Math.min(lg.w, cup ? 40 : Math.min(90, (a0[2] - a0[0]) * 0.55)), { key, ...rest } = lg;
    snap(); const it = refreshSvg({ ...rest, id: newId(), w: r1(w), h: r1((w * lg.h) / lg.w), rot: 0, ...landing() }); setItems((l) => [...l, it]); setSel(it.id);
  };
  const kitDrop = async (key) => { try { await fetch(`/api/design/brand-kits/${bk.kit.id}?logo=${encodeURIComponent(key)}`, { method: "DELETE" }); await kitOpen(bk.kit.id); kitList(); } catch { setBk((q) => ({ ...q, msg: "Could not remove the logo." })); } };
  const kitInk = (c) => { if (!cur || cur.house) return; snap(); patch(cur.id, (i) => (i.kind === "flood" ? { ...i, colour: c.hex, pantone: c.name } : i.kind === "svg" ? refreshSvg({ ...i, colours: (i.colours || []).map((c3) => ({ ...c3, to: c.hex, name: c.name })) }) : i)); };
  // ---- WRAP SHEETS: an ALL-OVER REPEAT, not a placed design (lib/dieline/wrap.js). The first file added is the lockup
  // (rows A), the second the small mark (rows B); where they sit is worked out by the repeat, so nothing is dragged.
  const repA = repeat ? items.find((i) => i.rep === "A" && i.kind !== "flood") : null, repB = repeat ? items.find((i) => i.rep === "B" && i.kind !== "flood") : null;
  useEffect(() => {
    if (!repeat) return;
    const free = items.filter((i) => i.kind !== "flood" && !i.rep);
    if (!free.length || (repA && repB)) return;
    const sized = (i, w) => ({ ...i, w: r1(w), h: r1((w * i.h) / i.w), rot: 0, curve: false });
    setItems((l) => { let a = l.some((i) => i.rep === "A"), b2 = l.some((i) => i.rep === "B"); return l.map((i) => { if (i.kind === "flood" || i.rep) return i; if (!a) { a = true; return { ...sized(i, Math.min(60, Math.max(45, repeat.plan.Px * 0.8))), rep: "A" }; } if (!b2) { b2 = true; return { ...sized(i, 11), rep: "B" }; } return i; }); });
  }, [repeat ? items.length : 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const repWidth = (it, w) => { const v = Math.max(1, +w || 0); patch(it.id, (i) => ({ ...i, w: r1(v), h: r1((v * i.h) / i.w) })); };
  const repRole = (id, role) => setItems((l) => l.map((i) => (i.kind === "flood" ? i : i.id === id ? { ...i, rep: role } : i.rep === role ? { ...i, rep: undefined } : i)));
  // ---- Aeros mark + ready symbols (lifted from the house files; lib/dieline/designer/house.js)
  const hasMark = items.some((i) => i.house === "mark");
  // THE FOOTER FOLLOWS THE JOB (Arjun 21-Nov-2026: "narrow the footer list"): of the footers on file for this size, only
  // those of the paper chosen (B brown / W white) are offered, and the one for the job's print is picked by itself
  // (-P50 = 2-colour, -P100 = 4-colour, no suffix = plain; oil-and-grease-resistant ones only when asked for).
  const feetAll = hs0 && house?.bag ? footersFor(hs0, house.bag.W, house.bag.G, house.bag.H) : [];
  const tail = (sku) => sku.split("-").slice(2).join("-"); // "B", "W-P50", "B-OGR-P100"
  const narrow = (list, test) => { const hit = list.filter(test); return hit.length ? hit : list; }; // a filter that would leave nothing is not applied
  const feet = narrow(narrow(feetAll, (f2) => !house?.bag?.paper || tail(f2.sku).split("-")[0] === house.bag.paper), (f2) => /OGR/.test(f2.sku) === !!house?.bag?.ogr); // OGR footers only on OGR paper (it comes brown or white, so both stay on offer)
  const bestFoot = house?.bag ? feet.find((f2) => { const q = tail(f2.sku).split("-"); return (house.bag.print ? q.includes(house.bag.print) : !q.includes("P50") && !q.includes("P100")); }) || feet[0] : null;
  const pickSku = footSku && feet.some((f2) => f2.sku === footSku) ? footSku : bestFoot?.sku || "";
  const footLabel = (sku) => { const q = tail(sku).split("-"); return `${sku} - ${q[0] === "W" ? "white" : "brown"}${q.includes("OGR") ? ", oil and grease resistant" : ""}, ${q.includes("P50") ? "2-colour print" : q.includes("P100") ? "4-colour print" : "plain"}`; };
  const darkest = () => { // the mark never adds a colour: it takes the darkest ink the artwork already prints
    const inks = items.flatMap((i) => (i.kind === "flood" ? [{ to: i.colour, name: i.pantone || "" }] : i.kind === "svg" && !i.house ? i.colours || [] : [])).filter((c2) => /^#[0-9a-f]{6}$/i.test(c2.to) && !/^#f{6}$/i.test(c2.to));
    const lum = (hx) => 0.299 * parseInt(hx.slice(1, 3), 16) + 0.587 * parseInt(hx.slice(3, 5), 16) + 0.114 * parseInt(hx.slice(5, 7), 16);
    return inks.sort((p2, q2) => lum(p2.to) - lum(q2.to))[0] || { to: "#000000", name: "" };
  };
  const inked = (it) => { const ink = darkest(); return refreshSvg({ ...it, colours: (it.colours || []).map((c2) => ({ ...c2, to: ink.to, name: ink.name || "" })) }); };
  // THE MARK NEVER ADDS A COLOUR (Arjun 21-Nov-2026: "always in colour of one of the colour in the bag so we dont add black as an
  // additional colour"): if its ink is not one the artwork prints, it moves to the darkest one by itself - also when the
  // artwork is added or recoloured after the mark.
  useEffect(() => {
    const other = items.filter((i) => !i.house), marks = items.filter((i) => i.house === "mark");
    if (!marks.length) return;
    const inks = other.flatMap((i) => (i.kind === "flood" ? [{ to: i.colour, name: i.pantone || "" }] : i.kind === "svg" ? i.colours || [] : [])).filter((c2) => /^#[0-9a-f]{6}$/i.test(c2.to) && !/^#f{6}$/i.test(c2.to));
    if (!inks.length) return;
    const has = new Map(inks.map((c2) => [c2.to.toLowerCase(), c2.name || ""]));
    const stale = marks.filter((mk) => (mk.colours || []).some((c2) => !has.has(String(c2.to).toLowerCase()) || (has.get(String(c2.to).toLowerCase()) || "") !== (c2.name || "")));
    if (!stale.length) return;
    const ink = darkest();
    setItems((l) => l.map((i) => (stale.some((q) => q.id === i.id) ? refreshSvg({ ...i, colours: (i.colours || []).map((c2) => (has.has(String(c2.to).toLowerCase()) ? { ...c2, name: has.get(String(c2.to).toLowerCase()) } : { ...c2, to: ink.to, name: ink.name || "" })) }) : i)));
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps
  async function addMark(quiet = false) {
    setErr("");
    try {
      if (cup) { // one line on a true arc in the hem's white strip (double wall) or upside down in the fold-in lip (single wall)
        const sp = cupMarkSpot(cup), t0 = await textItem({ content: house.cupText, fontId: "inter" });
        const hgt = MARK_CAP_MM / 0.6, k = hgt / t0.h, [x, y] = fromPolar(cup, sp.r, sp.a); // cap height = 0.6 of the line box of this font
        const it = inked({ ...t0, name: "Aeros mark", w: Math.round(t0.w * k * 100) / 100, h: Math.round(hgt * 100) / 100, x: r2(x), y: r2(y), rot: 0, curve: true, flip: sp.flip, house: "mark", noClip: true });
        snap(); setItems((l) => [...l, it]); if (!quiet) setSel(it.id);
      } else if (house?.bag) { // the locked footer block of this SKU, on the front's bottom flap
        const f = footerSvg(hs0, pickSku);
        if (!f) throw new Error("No Aeros footer is on file for this bag size.");
        // SIZE IN PROPORTION TO THE BAG (Arjun 21-Nov-2026): the footer is 23 % of the front width - the proportion of the house
        // files (58 mm on a 254 bag, 53 on a 230, 27 on the small one) - never under 27 mm (its small type) or over its drawn 60 mm
        const front = areas.find((a) => /^Front/.test(a.name)) || areas[0], fw = front.box[2] - front.box[0], w = Math.round(Math.max(27, Math.min(f.w, fw * 0.23, fw - 16)) * 10) / 10;
        const it = inked({ ...vectorItem(f.svg, `Aeros footer ${pickSku}`, w), houseSku: pickSku, h: Math.round(((w * f.h) / f.w) * 100) / 100, x: r1((front.box[0] + front.box[2]) / 2), y: r1(front.box[3] + house.bag.flapMid), house: "mark", source: "house" });
        snap(); setItems((l) => [...l, it]); if (!quiet) setSel(it.id);
      }
    } catch (ex) { setErr(ex.message || "Could not add the Aeros mark."); }
  }
  // THE MARK FOLLOWS "SOLD TO" BY ITSELF: direct = it goes on as soon as there is artwork (it is locked in its place and
  // takes the artwork's ink, so there is nothing for the user to decide); dealer = it comes off. A bag whose size matches
  // more than one footer still asks which SKU. One try per state, so a footer that fails to load cannot loop.
  const autoMark = useRef("");
  useEffect(() => {
    if (!house?.kind) return;
    if (house.channel === "dealer") { if (hasMark) setItems((l) => l.filter((i) => i.house !== "mark")); return; }
    if (house.channel !== "direct" || hasMark || !items.some((i) => !i.house)) return;
    if (!(cup || pickSku)) return;
    const key = `${cup ? cup.id : pickSku}-${items.length}`;
    if (autoMark.current === key) return;
    autoMark.current = key;
    addMark(true);
  }, [house?.kind, house?.channel, hasMark, items.length, pickSku, cup?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // the paper, the print or the SKU picked changed: the old footer comes off (the right one goes on by the rule above)
  useEffect(() => { const mk = items.find((i) => i.house === "mark" && i.houseSku); if (mk && pickSku && mk.houseSku !== pickSku) setItems((l) => l.filter((i) => i.id !== mk.id)); }, [pickSku]); // eslint-disable-line react-hooks/exhaustive-deps
  // JOB COLOURS, named in one place: a name typed here goes on every object that prints in that colour
  const nameInk = (hex, name) => { setItems((l) => l.map((i) => (i.kind === "flood" ? (String(i.colour).toLowerCase() === hex ? { ...i, pantone: name } : i) : i.kind === "svg" && (i.colours || []).some((c2) => String(c2.to).toLowerCase() === hex) ? { ...i, colours: i.colours.map((c2) => (String(c2.to).toLowerCase() === hex ? { ...c2, name } : c2)) } : i))); };
  function addSymbol(key) {
    const y = hs0 && symbolSvg(hs0, key); if (!y) return;
    snap(); const it = { ...vectorItem(y.svg, y.label, y.w), h: y.h, ...landing(), source: "house" }; setItems((l) => [...l, it]); setSel(it.id);
  }
  const centreOn = (a) => patch(cur.id, (i) => ({ ...i, x: r1((a.box[0] + a.box[2]) / 2), y: r1((a.box[1] + a.box[3]) / 2) }));
  const fitBlank = () => patch(cur.id, (i) => { const k = Math.max((W + 2 * BLEED) / i.w, (H + 2 * BLEED) / i.h); return { ...i, role: "background", x: r1(W / 2), y: r1(H / 2), w: r1(i.w * k + 0.2), h: r1(i.h * k + 0.2), rot: 0 }; });
  const fitArea = (a) => patch(cur.id, (i) => { const aw = a.box[2] - a.box[0] - 2 * S.fold, ah = a.box[3] - a.box[1] - S.fold - S.topCut, k = Math.min(aw / i.w, ah / i.h); return { ...i, x: r1((a.box[0] + a.box[2]) / 2), y: r1((a.box[1] + a.box[3]) / 2 + (S.topCut - S.fold) / 2), w: r1(i.w * k - 0.1), h: r1(i.h * k - 0.1) }; });
  // cups: polar placement about the cone centre
  const degOf = (a) => r1((a * 180) / Math.PI);
  const standUp = () => patch(cur.id, (i) => ({ ...i, rot: degOf(toPolar(cup, [i.x, i.y]).a) }));
  const cupSpot = (frac) => patch(cur.id, (i) => { const a = cup.aLeft + cup.wrap * frac, r = (cup.floorR + cup.topR) / 2, [x, y] = fromPolar(cup, r, a); return { ...i, x: r1(x), y: r1(y), rot: degOf(a) }; });
  const view = (it) => { if (!cup || !it.curve || it.kind !== "svg") return it; try { return curveItem(it, cup, parseSvgDom); } catch { return it; } };
  const reorder = (dir) => setItems((l) => { const k = l.findIndex((i) => i.id === sel), j = k + dir; if (k < 0 || j < 0 || j >= l.length) return l; const n = l.slice(); [n[k], n[j]] = [n[j], n[k]]; return n; });
  const remove = () => { setItems((l) => l.filter((i) => i.id !== sel)); setSel(null); };
  const recolour = (k, key, v) => patch(cur.id, (i) => refreshSvg({ ...i, colours: i.colours.map((c, n) => (n === k ? { ...c, [key]: v } : c)) }));

  const hs = Math.max(2.2, W / 160) / Math.sqrt(zoom); // handle size, mm (a little smaller when zoomed in, so it never hides the art)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className={`${btnCls} cursor-pointer border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900`}>
          Add artwork file
          <input type="file" multiple accept=".pdf,.ai,.svg,.png,.jpg,.jpeg,.webp,application/pdf,image/*" className="hidden" onChange={onFiles} />
        </label>
        <button className={btnCls} onClick={addText}>Add text</button>
        {SHAPES.map(([k, label]) => <button key={k} className={btnCls} onClick={() => addShape(k)} title={`Add a ${label.toLowerCase()}`}>{label}</button>)}
        <button className={`${btnCls} ${pen ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/40" : ""}`} onClick={() => { setSel(null); setPen((q) => (q ? null : { pts: [], at: null })); }} title="Click points on the die to draw">Pen</button>
        <button className={btnCls} onClick={addFlood}>Add colour ground</button>
        <button className={`${btnCls} ${bk.open ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/40" : ""}`} onClick={kitToggle} title="A customer's logos and Pantone colours, saved once and reused on every item">Brand kit</button>
        {hs0 && (
          <select value="" onChange={(e) => { if (e.target.value) addSymbol(e.target.value); }} className="rounded-md border border-gray-300 px-2 py-1.5 text-xs font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200" title="Ready vector symbols from the Aeros house files">
            <option value="">Add a symbol…</option>
            {hs0.symbols.map((y) => <option key={y.key} value={y.key}>{y.label}</option>)}
          </select>
        )}
        <button className={btnCls} onClick={undo} disabled={!canUndo} title="Ctrl/Cmd + Z">Undo</button>
        <button className={btnCls} onClick={redo} disabled={!canRedo} title="Ctrl/Cmd + Shift + Z">Redo</button>
        <span className="ml-1 inline-flex items-center overflow-hidden rounded-md border border-gray-300 dark:border-gray-700">
          <button className="px-2.5 py-1.5 text-sm font-semibold hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-gray-800" onClick={() => zoomBy(0.8)} disabled={zoom <= 1} title="Zoom out">−</button>
          <span className="w-14 border-x border-gray-300 px-1 py-1.5 text-center text-xs tabular-nums dark:border-gray-700">{Math.round(zoom * 100)}%</span>
          <button className="px-2.5 py-1.5 text-sm font-semibold hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-gray-800" onClick={() => zoomBy(1.25)} disabled={zoom >= 16} title="Zoom in">+</button>
        </span>
        <button className={btnCls} onClick={() => { setZoom(1); setCentre(null); }} disabled={zoom === 1} title="Show the whole die">Fit</button>
        <button className={btnCls} onClick={zoomSel} disabled={!cur || cur.kind === "flood"} title="Zoom to the selected layer">Zoom to selection</button>
        <span className="text-[11px] text-gray-500">Ctrl or Cmd + mouse wheel zooms; when zoomed in, drag empty board to move the view. PDF / AI / SVG stay vector. Drag to move, drag a corner to size, the round knob to rotate. Shapes and the pen draw new vector art. {busy}</span>
      </div>
      {pen && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
          <span>Pen: click on the die to add points ({pen.pts.length} so far). Click the first point again to close the shape.</span>
          <button className={btnCls} disabled={pen.pts.length < 3} onClick={() => finishPen(true)}>Close shape</button>
          <button className={btnCls} disabled={pen.pts.length < 2} onClick={() => finishPen(false)}>Finish as a line (Enter)</button>
          <button className={btnCls} disabled={!pen.pts.length} onClick={() => setPen((q) => ({ ...q, pts: q.pts.slice(0, -1) }))}>Undo point</button>
          <button className={btnCls} onClick={() => setPen(null)}>Cancel (Esc)</button>
        </div>
      )}
      {(pen || (cur && cur.shape?.type === "path")) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-gray-200 px-3 py-2 text-xs text-gray-700 dark:border-gray-800 dark:text-gray-300">
          <span className="font-semibold">Snap to:</span>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={snapOpt.nodes} onChange={(e) => setSnapOpt({ ...snapOpt, nodes: e.target.checked })} />Points of other layers (shape points, logo corners, middles, centres)</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={snapOpt.die} onChange={(e) => setSnapOpt({ ...snapOpt, die: e.target.checked })} />Die corners (ends of cut and fold lines)</label>
          {!cup && <label className="flex items-center gap-1.5"><input type="checkbox" checked={snapOpt.guides} onChange={(e) => setSnapOpt({ ...snapOpt, guides: e.target.checked })} />Panel centre lines and safe edges</label>}
          <label className="flex items-center gap-1.5">Grid<select value={snapOpt.grid} onChange={(e) => setSnapOpt({ ...snapOpt, grid: +e.target.value })} className="rounded border border-gray-300 px-1 py-0.5 text-xs dark:border-gray-700 dark:bg-gray-950"><option value={0}>off</option><option value={0.5}>0.5 mm</option><option value={1}>1 mm</option><option value={5}>5 mm</option></select></label>
          <span className="text-gray-500">The point's own path always snaps. Shift = 45° steps from the last point. Alt = no snapping. {!pen && "Drag the blue points of a drawn shape to move them."}</span>
        </div>
      )}
      {bk.open && (
        <div className="rounded-md border border-blue-200 bg-blue-50/40 px-3 py-2 text-xs text-gray-700 dark:border-blue-900 dark:bg-blue-950/20 dark:text-gray-300">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">Brand kit:</span>
            <select value={bk.kit?.id || ""} onChange={(e) => kitOpen(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-950">
              <option value="">{bk.list === null ? "Loading…" : bk.list.length ? "Choose a customer…" : "No kits saved yet"}</option>
              {(bk.list || []).map((k) => <option key={k.id} value={k.id}>{k.customer} ({k.logo_names.length} logo{k.logo_names.length === 1 ? "" : "s"})</option>)}
            </select>
            <button className={`${btnCls} border-gray-900 bg-gray-900 text-white disabled:opacity-40 dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900`} disabled={!brand || !kitPick.length} onClick={kitSave}
              title="Vector logos only, with their Pantone names. The same logo saved again replaces the old one.">
              {kitPick.length === 1 && kitPick[0] === cur ? "Save this logo" : `Save this job's logos (${kitPick.length})`} to the kit{brand ? ` of ${brand}` : ""}
            </button>
            {!brand && <span className="text-amber-700 dark:text-amber-300">type the customer / brand name above first: a kit is saved under it.</span>}
            {brand && !kitLogos.length && <span className="text-gray-500">place a vector logo to save it (a picture is traced to vector first).</span>}
            {bk.msg && <span className="text-gray-600 dark:text-gray-400">{bk.msg}</span>}
          </div>
          {bk.kit && (
            <div className="mt-2 flex flex-wrap gap-2">
              {(bk.kit.logos || []).map((lg) => (
                <div key={lg.key} className="w-36 rounded-md border border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-gray-900">
                  <div className="flex h-16 items-center justify-center rounded bg-gray-100 dark:bg-gray-800"><img src={refreshSvg(lg).href} alt={lg.name} className="max-h-14 max-w-full" /></div>
                  <p className="mt-1 truncate font-medium" title={lg.name}>{lg.name}</p>
                  <p className="truncate text-[10px] text-gray-500" title={(lg.colours || []).map((c) => c.name || c.to).join(", ")}>{(lg.colours || []).map((c) => c.name || c.to).join(", ") || "-"}</p>
                  <div className="mt-1 flex gap-1">
                    <button className="rounded border border-gray-900 bg-gray-900 px-2 py-0.5 text-[11px] font-semibold text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900" onClick={() => kitAdd(lg)}>Add</button>
                    <button className="rounded border border-gray-300 px-2 py-0.5 text-[11px] text-gray-600 dark:border-gray-700 dark:text-gray-300" onClick={() => kitDrop(lg.key)} title="Take this logo out of the kit">Remove</button>
                  </div>
                </div>
              ))}
              {!(bk.kit.logos || []).length && <span className="text-gray-500">No logos in this kit yet.</span>}
              {(bk.kit.colours || []).length > 0 && (
                <div className="flex basis-full flex-wrap items-center gap-2">
                  <span className="font-semibold">Brand colours:</span>
                  {bk.kit.colours.map((c) => (
                    <button key={c.hex} onClick={() => kitInk(c)} disabled={!cur || !!cur.house} title={cur && !cur.house ? "Give the selected object this colour" : "Select an object to give it this colour"} className="flex items-center gap-1 rounded border border-gray-300 px-1.5 py-0.5 text-[11px] disabled:opacity-70 dark:border-gray-700">
                      <span className="inline-block h-3.5 w-3.5 rounded-sm border border-gray-400" style={{ background: c.hex }} />{c.name || c.hex}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {repeat && (
        <div className="rounded-md border border-fuchsia-200 bg-fuchsia-50/40 px-3 py-2 text-xs text-gray-700 dark:border-fuchsia-900 dark:bg-fuchsia-950/20 dark:text-gray-300">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="font-semibold">Repeat:</span>
            <label className="flex items-center gap-1.5">Pitch<input type="number" min={20} max={150} step={1} value={repeat.pitch} onChange={(e) => repeat.setPitch(e.target.value)} className="w-16 rounded-md border border-gray-300 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-950" />mm</label>
            <span>tile <b>{repeat.plan.Px.toFixed(2)} × {repeat.plan.Py.toFixed(2)} mm</b> = {repeat.plan.nx} across × {repeat.plan.ny} down, rows half-drop</span>
            {[["A", "Lockup (rows A)", repA], ["B", "Small mark (rows B)", repB]].map(([k, label, it]) => (
              <span key={k} className="flex items-center gap-1.5">
                {label}
                <select value={it?.id || ""} onChange={(e) => (e.target.value ? repRole(e.target.value, k) : it && patch(it.id, (i) => ({ ...i, rep: undefined })))} className="max-w-[9rem] rounded-md border border-gray-300 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-950">
                  <option value="">{k === "A" ? "add a file…" : "none"}</option>
                  {items.filter((i) => i.kind !== "flood").map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
                {it && <><input type="number" min={1} step={0.5} value={it.w} onFocus={snap} onChange={(e) => repWidth(it, e.target.value)} className="w-16 rounded-md border border-gray-300 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-950" />mm wide</>}
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-gray-500">The tile always divides the sheet exactly, so every sheet is identical and the 4-up press sheet has no seam. The lockup sits whole in every tile; the small mark sits on the tile corners and is the only thing a cut splits. Nothing is dragged: change the pitch or a width.</p>
        </div>
      )}
      {jobInks.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-gray-200 px-3 py-2 text-xs text-gray-700 dark:border-gray-800 dark:text-gray-300">
          <span className="font-semibold">Job colours ({jobInks.length}):</span>
          {jobInks.map((q) => (
            <label key={q.to} className="flex items-center gap-1.5">
              <span className="inline-block h-4 w-4 rounded-sm border border-gray-400" style={{ background: q.to }} />
              {pantone ? <input value={q.name} onChange={(e) => nameInk(q.to, e.target.value)} placeholder="PANTONE … U" onFocus={snap} className="w-36 rounded-md border border-gray-300 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-950" /> : <span className="font-mono text-[11px]">{q.to}</span>}
            </label>
          ))}
          {pantone && <span className="text-gray-500">one plate per colour; a name typed here goes on every object in that colour.</span>}
        </div>
      )}
      {house && house.kind && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-xs text-gray-700 dark:border-gray-800 dark:text-gray-300">
          <span className="font-semibold">Aeros mark:</span>
          {!house.channel && <span className="text-amber-700 dark:text-amber-300">choose who the job is sold to in step 4 (Print) first. Direct = the mark goes on; dealer = no Aeros mark at all.</span>}
          {house.channel === "dealer" && <span>{hasMark ? "Dealer sale: delete the Aeros mark." : "Dealer sale: no Aeros mark on this pack."}</span>}
          {house.channel === "direct" && house.bag && feet.length > 1 && <select value={pickSku} onChange={(e) => setFootSku(e.target.value)} title="The footer of this SKU: picked from the paper and the print; change it here if the job is another SKU" className="rounded-md border border-gray-300 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-950">{feet.map((f2) => <option key={f2.sku} value={f2.sku}>{footLabel(f2.sku)}</option>)}</select>}
          {house.channel === "direct" && (hasMark ? <span>on the pack ({cup ? (cup.wall === "double" ? "in the hem's white strip" : "upside down in the fold-in lip") : "front bottom flap"}), in the artwork's darkest ink. It is added by itself for a direct sale and cannot be moved.</span> : <>
            {(cup || pickSku) ? <button className={`${btnCls} border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900`} onClick={() => addMark()}>Add Aeros mark</button>
              : <span>{hs0 ? "no Aeros footer is on file for this bag size (the house footers are made per SKU by the footer tool)." : "loading…"}</span>}
            <span className="text-gray-500">{cup ? `"${house.cupText}", one line hidden in the fold. It goes on by itself once there is artwork.` : "The footer block of this SKU (recycle line, SKU, QR), taken from the house file. It goes on by itself once there is artwork."}</span>
          </>)}
        </div>
      )}
      {err && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-300">{err}</p>}
      {pictures.length > 0 && (
        <div className="rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          <span className="font-semibold">Not vector: </span>
          {pictures.map((i, k) => <button key={i.id} onClick={() => setSel(i.id)} className="mr-1 underline">{i.name}{k < pictures.length - 1 ? "," : ""}</button>)}
          {pictures.length === 1 ? " is a picture" : " are pictures"}, marked with an amber dashed box. Ask the customer for the logo as AI / PDF / SVG / CDR. If they have none, select it and use "Trace to vector".
        </div>
      )}

      <div className="rounded-md border border-gray-200 bg-[#e9ebee] p-1 dark:border-gray-800">
        <svg ref={svgRef} viewBox={`${viewC[0] - VW / 2} ${viewC[1] - VH / 2} ${VW} ${VH}`} className="h-auto max-h-[620px] w-full touch-none select-none" onPointerMove={(e) => { if (pen) { const sp = snapPoint(toMm(e), e, { from: pen.pts[pen.pts.length - 1] || null, own: pen.pts }); setMark(sp.kind ? sp : null); setPen((q) => (q ? { ...q, at: sp.p } : q)); } else if (pan.current) { const bx = svgRef.current.getBoundingClientRect(), k = VW / (bx.width || 1), dx = (e.clientX - pan.current.x) * k, dy = (e.clientY - pan.current.y) * k; if (Math.abs(dx) + Math.abs(dy) > 0.5) pan.current.moved = true; setCentre(clampC([pan.current.c[0] - dx, pan.current.c[1] - dy])); } else move(e); }} onPointerUp={up} onPointerLeave={up}
          onPointerDownCapture={(e) => { if (!pen) return; e.stopPropagation(); e.preventDefault(); // pen: every click is a point; clicking the first point again closes the shape
            const at = snapPoint(toMm(e), e, { from: pen.pts[pen.pts.length - 1] || null, own: pen.pts }).p;
            if (pen.pts.length >= 3 && Math.hypot(at[0] - pen.pts[0][0], at[1] - pen.pts[0][1]) < 0.02) finishPen(true); else setPen((q) => ({ ...q, pts: [...q.pts, at] })); }}
          onDoubleClick={() => { if (pen) finishPen(false); }} onPointerDown={(e) => { if (zoom > 1 && !pen) { pan.current = { x: e.clientX, y: e.clientY, c: viewC, moved: false }; e.currentTarget.setPointerCapture?.(e.pointerId); } else setSel(null); }} style={pen ? { cursor: "crosshair" } : zoom > 1 ? { cursor: "grab" } : undefined}>
          <defs>
            <clipPath id="art-clip">{clipPoly ? <polygon points={clipPoly.map((q) => q.join(",")).join(" ")} /> : <rect x={-BLEED} y={-BLEED} width={W + 2 * BLEED} height={H + 2 * BLEED} />}</clipPath>
            <clipPath id="board-clip"><path d={board} clipRule="evenodd" /></clipPath>
            <pattern id="no-ink" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="3" fill="#ffffff" /><line x1="0" y1="0" x2="0" y2="3" stroke="#b9b9b9" strokeWidth="0.6" /></pattern>
          </defs>
          <path d={board} fill={boardColour || "#f4f2ec"} fillRule="evenodd" />
          {repeat && (
            <g clipPath="url(#art-clip)" pointerEvents="none">
              {repeat.placed.map((it) => it.kind === "flood" ? <rect key={it.id} x={-BLEED} y={-BLEED} width={W + 2 * BLEED} height={H + 2 * BLEED} fill={it.colour} /> : (
                <svg key={it.id} x={it.x - it.w / 2} y={it.y - it.h / 2} width={it.w} height={it.h} preserveAspectRatio="none" viewBox={`0 0 ${it.natW} ${it.natH}`}><image href={it.href} width={it.natW} height={it.natH} preserveAspectRatio="none" /></svg>
              ))}
            </g>
          )}
          {repeat && (
            <g pointerEvents="none" stroke="#d946ef" strokeWidth={0.25} strokeDasharray="2 1.5" opacity={0.7}>
              {Array.from({ length: repeat.plan.nx + 1 }, (_, i) => <line key={"tx" + i} x1={i * repeat.plan.Px} y1={0} x2={i * repeat.plan.Px} y2={H} />)}
              {Array.from({ length: repeat.plan.ny + 1 }, (_, j) => <line key={"ty" + j} x1={0} y1={j * repeat.plan.Py} x2={W} y2={j * repeat.plan.Py} />)}
            </g>
          )}
          <g clipPath="url(#art-clip)" style={repeat ? { display: "none" } : undefined}>
            {items.filter((i) => !i.noClip).map((it) => it.kind === "flood" ? (
              <rect key={it.id} x={-BLEED} y={-BLEED} width={W + 2 * BLEED} height={H + 2 * BLEED} fill={it.colour} onPointerDown={(e) => { e.stopPropagation(); setSel(it.id); }} />
            ) : ((it0) => { const it = view(it0); return (
              <g key={it.id} transform={`translate(${it.x} ${it.y}) rotate(${it.rot || 0})`} onPointerDown={(e) => down(e, it0, "move")} style={{ cursor: "move" }}>
                <svg x={-it.w / 2} y={-it.h / 2} width={it.w} height={it.h} preserveAspectRatio="none" overflow="hidden"
                  viewBox={it.curved ? `0 0 ${it.natW} ${it.natH}` : `${it.natW * it.crop.l} ${it.natH * it.crop.t} ${it.natW * (1 - it.crop.l - it.crop.r)} ${it.natH * (1 - it.crop.t - it.crop.b)}`}>
                  {it.missing ? <rect width={it.natW} height={it.natH} fill="#f3d2d2" stroke="#c0392b" strokeWidth={it.natW / 100} strokeDasharray={`${it.natW / 30}`} /> : <image href={it.href} width={it.natW} height={it.natH} preserveAspectRatio="none" />}
                </svg>
              </g>
            ); })(it))}
          </g>
          {/* the Aeros line in a cup's hem / lip sits outside the print area on purpose: drawn outside the clip */}
                      {items.filter((i) => i.noClip).map((it) => it.kind === "flood" ? (
              <rect key={it.id} x={-BLEED} y={-BLEED} width={W + 2 * BLEED} height={H + 2 * BLEED} fill={it.colour} onPointerDown={(e) => { e.stopPropagation(); setSel(it.id); }} />
            ) : ((it0) => { const it = view(it0); return (
              <g key={it.id} transform={`translate(${it.x} ${it.y}) rotate(${it.rot || 0})`} onPointerDown={(e) => down(e, it0, "move")} style={{ cursor: "move" }}>
                <svg x={-it.w / 2} y={-it.h / 2} width={it.w} height={it.h} preserveAspectRatio="none" overflow="hidden"
                  viewBox={it.curved ? `0 0 ${it.natW} ${it.natH}` : `${it.natW * it.crop.l} ${it.natH * it.crop.t} ${it.natW * (1 - it.crop.l - it.crop.r)} ${it.natH * (1 - it.crop.t - it.crop.b)}`}>
                  {it.missing ? <rect width={it.natW} height={it.natH} fill="#f3d2d2" stroke="#c0392b" strokeWidth={it.natW / 100} strokeDasharray={`${it.natW / 30}`} /> : <image href={it.href} width={it.natW} height={it.natH} preserveAspectRatio="none" />}
                </svg>
              </g>
            ); })(it))}
          {/* everything off the board fades: it is bleed or waste */}
          <path d={`M${-M} ${-M}H${W + M}V${H + M}H${-M}Z ${board}`} fill="#e9ebee" fillOpacity="0.72" fillRule="evenodd" pointerEvents="none" />
          <g clipPath="url(#board-clip)" pointerEvents="none">
            {noInk.map(([a, b, c, d], k) => <rect key={k} x={Math.max(a, -M)} y={Math.max(b, -M)} width={Math.min(c, W + M) - Math.max(a, -M)} height={Math.min(d, H + M) - Math.max(b, -M)} fill="url(#no-ink)" />)}
          </g>
          {die.safe && <path d={die.safe} fill="none" stroke="#ef8e0c" strokeWidth={0.35} strokeDasharray="2 1.5" pointerEvents="none" />}
          {cup && (() => { const P = (r, a) => fromPolar(cup, r, a).map((v) => v.toFixed(2)).join(" "), aj = (r) => cup.aLeft + CUP_RULES.joint / r, rf = cup.floorR, rt = cup.topR; return (
            <g pointerEvents="none" fill="none" stroke="#c0392b" strokeWidth={0.3} strokeDasharray="1.5 1.5">
              <path d={`M${P(rt, aj(rt))}L${P(rf, aj(rf))}`} />
              <path d={`M${P(rf, aj(rf))}A${rf} ${rf} 0 0 1 ${P(rf, cup.limit.aMax)}`} />
              {!cup.hasRim && <path d={`M${P(rt, aj(rt))}A${rt} ${rt} 0 0 1 ${P(rt, cup.limit.aMax)}`} />}
            </g>
          ); })()}
          <path d={die.crease} fill="none" stroke="#0aa10a" strokeWidth={0.35} pointerEvents="none" />
          <path d={die.cut} fill="none" stroke="#e11d1d" strokeWidth={0.35} pointerEvents="none" />
          {!cup && areas.map((a) => (
            <g key={a.name + a.box.join("-")} pointerEvents="none">
              <rect x={a.box[0] + S.fold} y={a.box[1] + S.topCut} width={Math.max(0, a.box[2] - a.box[0] - 2 * S.fold)} height={Math.max(0, a.box[3] - a.box[1] - S.topCut - S.fold)} fill="none" stroke="#ef8e0c" strokeWidth={0.3} strokeDasharray="2 1.5" />
              <text x={a.box[0] + S.fold + 1.5} y={a.box[1] + S.topCut + 5} fontSize={4} fill="#b86a00" fontFamily="Helvetica, Arial, sans-serif">{a.name}</text>
            </g>
          ))}
          {pen && pen.pts.length > 0 && (
            <g pointerEvents="none">
              <polyline points={[...pen.pts, ...(pen.at ? [pen.at] : [])].map((q) => q.join(",")).join(" ")} fill="none" stroke="#2563eb" strokeWidth={0.5} />
              {pen.pts.map((q, k) => <circle key={k} cx={q[0]} cy={q[1]} r={k === 0 ? Math.max(1.2, W / 260) : Math.max(0.8, W / 400)} fill={k === 0 ? "#2563eb" : "#ffffff"} stroke="#2563eb" strokeWidth={0.3} />)}
            </g>
          )}
          {cur && cur.shape?.type === "path" && !cur.curve && !pen && nodesOf(cur).map((q, k) => ( // drag a point of a drawn shape
            <circle key={"nd" + k} cx={q[0]} cy={q[1]} r={hs * 0.6} fill="#2563eb" stroke="#ffffff" strokeWidth={0.3} style={{ cursor: "crosshair" }} onPointerDown={(e) => down(e, cur, "node", k)}><title>Drag this point (it snaps to nodes; Alt = free, Shift = 45° steps)</title></circle>
          ))}
          {mark && (() => { const fs = Math.max(2, W / 170); return (
            <g pointerEvents="none">
              <rect x={mark.p[0] - hs * 0.7} y={mark.p[1] - hs * 0.7} width={hs * 1.4} height={hs * 1.4} fill="none" stroke="#f59e0b" strokeWidth={0.5} />
              <rect x={mark.p[0] + hs} y={mark.p[1] - hs - fs * 1.2} width={mark.kind.length * fs * 0.52 + fs * 0.6} height={fs * 1.35} fill="#f59e0b" />
              <text x={mark.p[0] + hs + fs * 0.3} y={mark.p[1] - hs - fs * 0.2} fontSize={fs} fontWeight="700" fill="#ffffff" fontFamily="system-ui, sans-serif">{mark.kind}</text>
            </g>
          ); })()}
          {!repeat && pictures.map((i) => { const cs = corners(view(i)), b = bboxOf(cs), fs = Math.max(2.2, W / 150); return (
            <g key={"nv" + i.id} pointerEvents="none">
              <polygon points={cs.map((q) => q.join(",")).join(" ")} fill="none" stroke="#d97706" strokeWidth={0.5} strokeDasharray="2 1.2" />
              <rect x={b[0]} y={b[1] - fs * 1.5} width={fs * 6.6} height={fs * 1.4} fill="#d97706" />
              <text x={b[0] + fs * 0.3} y={b[1] - fs * 0.45} fontSize={fs} fontWeight="700" fill="#ffffff" fontFamily="system-ui, sans-serif">NOT VECTOR</text>
            </g>
          ); })}
          {guides.map((g, k) => g[0] === "v" ? <line key={k} x1={g[1]} y1={g[2]} x2={g[1]} y2={g[3]} stroke="#2563eb" strokeWidth={0.3} /> : <line key={k} x1={g[2]} y1={g[1]} x2={g[3]} y2={g[1]} stroke="#2563eb" strokeWidth={0.3} />)}
          {cur && cur.kind !== "flood" && !repeat && (() => {
            const cs = corners(view(cur));
            return (
              <g>
                <polygon points={cs.map((p) => p.join(",")).join(" ")} fill="none" stroke="#2563eb" strokeWidth={0.4} pointerEvents="none" />
                {cur.house !== "mark" && cs.map((p, k) => <rect key={k} x={p[0] - hs / 2} y={p[1] - hs / 2} width={hs} height={hs} fill="#ffffff" stroke="#2563eb" strokeWidth={0.4} style={{ cursor: "nwse-resize" }} onPointerDown={(e) => down(e, cur, "scale", k)} />)}
                {cur.shape && cur.shape.type !== "path" && !((cur.rot || 0) % 90) && !cup && (() => { // edge handles: drag one to change only the width or only the height
                  const b = bboxOf(cs), mxx = (b[0] + b[2]) / 2, myy = (b[1] + b[3]) / 2;
                  return [["l", b[0], myy], ["r", b[2], myy], ["t", mxx, b[1]], ["b", mxx, b[3]]].map(([side, x, y]) => (
                    <rect key={side} x={x - hs / 2} y={y - hs / 2} width={hs} height={hs} fill="#2563eb" stroke="#ffffff" strokeWidth={0.3} style={{ cursor: side === "l" || side === "r" ? "ew-resize" : "ns-resize" }} onPointerDown={(e) => down(e, cur, "edge", side)}><title>{side === "l" || side === "r" ? "Drag to change the width only (snaps to folds and edges; Alt = free)" : "Drag to change the height only (snaps to folds and edges; Alt = free)"}</title></rect>
                  ));
                })()}
                {!cur.curve && cur.house !== "mark" && (() => { // rotate handle: a round knob above the top edge
                  const tm = [(cs[0][0] + cs[1][0]) / 2, (cs[0][1] + cs[1][1]) / 2], dx = tm[0] - cur.x, dy = tm[1] - cur.y, L = Math.hypot(dx, dy) || 1;
                  const hx = tm[0] + (dx / L) * hs * 3.2, hy = tm[1] + (dy / L) * hs * 3.2;
                  return (
                    <g>
                      <line x1={tm[0]} y1={tm[1]} x2={hx} y2={hy} stroke="#2563eb" strokeWidth={0.4} pointerEvents="none" />
                      <circle cx={hx} cy={hy} r={hs * 0.75} fill="#ffffff" stroke="#2563eb" strokeWidth={0.5} style={{ cursor: "grab" }} onPointerDown={(e) => down(e, cur, "rotate")}><title>Drag to rotate (Shift = 15° steps)</title></circle>
                    </g>
                  );
                })()}
              </g>
            );
          })()}
        </svg>
      </div>
      {cup ? <p className="text-[11px] text-gray-500">Red = cut, green = folds, orange dash = the KLD's limit line, red dash = keep logos right of the {CUP_RULES.joint} mm joint, {cup.rules.floor} mm above the {cup.rules.floorName}{cup.rules.top ? ` and ${cup.rules.top} mm below the top cut` : ""}. All ink is clipped to the KLD's bleed line.</p>
        : repeat ? <p className="text-[11px] text-gray-500">Red = cut. Magenta dashes = the repeat tiles (they do not print). The pattern runs {BLEED} mm past every cut.</p>
        : <p className="text-[11px] text-gray-500">Red = cut, green = fold, orange dash = safe area for logos ({S.fold} mm from folds, {S.topCut} mm from the top cut), hatch = glue (never printed). Art past the cut is {BLEED} mm bleed.</p>}

      <div className="grid grid-cols-1 gap-3 2xl:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
        <div>
          <p className="mb-1 text-xs font-semibold text-gray-700 dark:text-gray-300">Layers (top prints last)</p>
          {items.length === 0 && <p className="text-xs text-gray-500">No artwork yet.</p>}
          <ul className="space-y-1">
            {[...items].reverse().map((it) => (
              <li key={it.id}>
                <button onClick={() => setSel(it.id)} className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs ${it.id === sel ? "border-blue-600 bg-blue-50 dark:bg-blue-950/40" : "border-gray-200 dark:border-gray-800"}`}>
                  <span className="inline-block h-3 w-3 shrink-0 rounded-sm border border-gray-400" style={{ background: it.kind === "flood" ? it.colour : it.kind === "svg" ? "#fff" : "#ddd" }} />
                  <span className="min-w-0 flex-1 truncate text-gray-800 dark:text-gray-200">{it.name}</span>
                  {it.kind === "raster" || it.embedded ? <span className="shrink-0 rounded bg-amber-500 px-1 text-[10px] font-bold uppercase text-white">not vector</span>
                    : <span className="shrink-0 text-[10px] uppercase text-gray-500">{it.kind === "flood" ? "ground" : it.source === "trace" ? "traced" : "vector"}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {cur && cur.house === "mark" ? (
          <div className="space-y-2 rounded-md border border-gray-200 p-3 text-xs text-gray-700 dark:border-gray-800 dark:text-gray-300">
            <p className="font-semibold text-gray-900 dark:text-gray-100">{cur.name} - locked in its place</p>
            <p>The Aeros mark always sits in the same place on this item ({cup ? (cup.wall === "double" ? "the white strip of the hem" : "the fold-in lip, upside down") : "the front's bottom flap"}), at the house size. It cannot be moved, sized or turned.</p>
            <div className="flex flex-wrap items-center gap-2">
              <span>Ink (one of the job's own colours):</span>
              {jobInks.filter((q) => items.some((i) => !i.house && (i.kind === "flood" ? i.colour.toLowerCase() === q.to : (i.colours || []).some((c2) => String(c2.to).toLowerCase() === q.to)))).map((q) => (
                <button key={q.to} onClick={act(() => patch(cur.id, (i) => refreshSvg({ ...i, colours: (i.colours || []).map((c3) => ({ ...c3, to: q.to, name: q.name })) })))} className={`flex items-center gap-1 rounded border px-1.5 py-1 text-[11px] ${(cur.colours || []).every((c3) => String(c3.to).toLowerCase() === q.to) ? "border-blue-600" : "border-gray-300 dark:border-gray-700"}`}><span className="inline-block h-4 w-4 rounded-sm border border-gray-400" style={{ background: q.to }} />{q.name ? q.name.replace(/^PANTONE\s+/i, "") : q.to}</button>
              ))}
              <button className={`${btnCls} text-red-700`} onClick={act(remove)}>Delete (dealer job)</button>
            </div>
          </div>
        ) : cur ? (
          <div className="space-y-3 rounded-md border border-gray-200 p-3 dark:border-gray-800" onFocusCapture={(e) => { if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) snap(); }}>
            <div className="flex flex-wrap items-center gap-2">
              <input value={cur.name} onChange={(e) => patch(cur.id, (i) => ({ ...i, name: e.target.value }))} className={`${inputCls} max-w-[220px]`} />
              <button className={btnCls} onClick={act(() => reorder(1))}>Forward</button>
              <button className={btnCls} onClick={act(() => reorder(-1))}>Back</button>
              {cur.kind !== "flood" && !cur.text && !cur.shape && (
                <label className={`${btnCls} cursor-pointer`}>Replace file
                  <input type="file" accept=".pdf,.ai,.svg,.png,.jpg,.jpeg,.webp,application/pdf,image/*" className="hidden" onChange={async (e) => { const f2 = e.target.files[0]; e.target.value = ""; if (!f2) return; try { const n = await replaceFile(cur, f2); snap(); patch(cur.id, () => n); } catch (ex) { setErr(ex.message); } }} />
                </label>
              )}
              <button className={`${btnCls} text-red-700`} onClick={act(remove)}>Delete</button>
            </div>
            {cur.kind === "flood" ? (
              <div className="flex flex-wrap items-end gap-3 text-xs">
                <label>Colour<br /><input type="color" value={cur.colour} onChange={(e) => patch(cur.id, (i) => ({ ...i, colour: e.target.value }))} className="h-9 w-14" /></label>
                <label className="flex-1">Pantone name (U guide)<input value={cur.pantone} onChange={(e) => patch(cur.id, (i) => ({ ...i, pantone: e.target.value }))} placeholder="PANTONE 419 U" className={inputCls} /></label>
                {jobInks.filter((q) => q.to !== String(cur.colour).toLowerCase()).slice(0, 6).map((q) => (
                  <button key={q.to} title={`Use this job colour${q.name ? `: ${q.name}` : ""}`} onClick={act(() => patch(cur.id, (i) => ({ ...i, colour: q.to, pantone: q.name })))} className="flex items-center gap-1 rounded border border-gray-300 px-1.5 py-1 text-[11px] dark:border-gray-700"><span className="inline-block h-4 w-4 rounded-sm border border-gray-400" style={{ background: q.to }} />{q.name ? q.name.replace(/^PANTONE\s+/i, "") : "same"}</button>
                ))}
                <p className="w-full text-[11px] text-gray-500">Covers the whole blank with {BLEED} mm bleed; glue areas stay unprinted.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 text-xs xl:grid-cols-4">
                  <label className="col-span-2 xl:col-span-4">Role
                    <select value={cur.role} onChange={(e) => patch(cur.id, (i) => ({ ...i, role: e.target.value }))} className={inputCls}>
                      <option value="content">Logo / text</option><option value="wrap">Wrap (runs over folds)</option><option value="background">Background (full bleed)</option>
                    </select>
                  </label>
                  <label>Width mm<input type="number" step="0.5" value={cur.w} onChange={(e) => setW(+e.target.value)} className={inputCls} /></label>
                  <label>Height mm<input type="number" step="0.5" value={cur.h} onChange={(e) => setHt(+e.target.value)} className={inputCls} /></label>
                  <label>Centre X mm<input type="number" step="0.5" value={cur.x} onChange={(e) => patch(cur.id, (i) => ({ ...i, x: +e.target.value }))} className={inputCls} /></label>
                  <label>Centre Y mm<input type="number" step="0.5" value={cur.y} onChange={(e) => patch(cur.id, (i) => ({ ...i, y: +e.target.value }))} className={inputCls} /></label>
                </div>
                <div className="flex flex-wrap items-end gap-2 text-xs">
                  <label className="w-24">Rotate °<input type="number" step="1" value={cur.rot} onChange={(e) => patch(cur.id, (i) => ({ ...i, rot: +e.target.value || 0 }))} className={inputCls} /></label>
                  <button className={btnCls} disabled={!!cur.curve} onClick={act(() => patch(cur.id, (i) => ({ ...i, rot: ((i.rot || 0) + 270) % 360 })))}>−90°</button>
                  <button className={btnCls} disabled={!!cur.curve} onClick={act(() => patch(cur.id, (i) => ({ ...i, rot: ((i.rot || 0) + 90) % 360 })))}>+90°</button>
                  <button className={btnCls} onClick={act(() => patch(cur.id, (i) => ({ ...i, rot: ((i.rot || 0) + 180) % 360 })))}>180°</button>
                  {cup && <>
                    <button className={btnCls} onClick={act(standUp)}>Stand upright</button>
                    <button className={btnCls} onClick={act(() => cupSpot(0.5))}>Front (opposite the seam)</button>
                    <button className={btnCls} onClick={act(() => cupSpot(0.25))}>Left quarter</button>
                    <button className={btnCls} onClick={act(() => cupSpot(0.75))}>Right quarter</button>
                    {cur.kind === "svg" && (() => { const why = cur.curve ? null : curveBlocker(cur, parseSvgDom); return (
                      <button className={`${btnCls} ${cur.curve ? "border-blue-600 text-blue-700" : ""}`} disabled={!!why} title={why || ""} onClick={act(() => patch(cur.id, (i) => ({ ...i, curve: !i.curve, rot: i.curve ? degOf(toPolar(cup, [i.x, i.y]).a) : 0 })))}>{cur.curve ? "Curved to cup ✓" : "Curve to cup"}</button>
                    ); })()}
                  </>}
                  {!cup && areas.map((a) => <button key={a.name + a.box.join("-")} className={btnCls} onClick={act(() => centreOn(a))}>Centre on {a.name}</button>)}
                  {!cup && areas[0] && <button className={btnCls} onClick={act(() => fitArea(areas.find((a) => cur.x > a.box[0] && cur.x < a.box[2]) || areas[0]))}>Fit safe area</button>}
                  {!cup && <button className={btnCls} onClick={act(fitBlank)}>Fit to blank + bleed</button>}
                </div>
                {!cup && (
                  <div className="flex flex-wrap items-end gap-2 text-xs">
                    <label className="w-44">Align with
                      <select value={alignTo} onChange={(e) => setAlignTo(e.target.value)} className={inputCls}>
                        <option value="safe">Safe area of its panel</option><option value="panel">Its panel (fold to fold)</option><option value="blank">The whole blank</option>
                        {items.filter((o) => o.id !== cur.id && o.kind !== "flood").map((o) => <option key={o.id} value={o.id}>Layer: {o.name}</option>)}
                      </select>
                    </label>
                    {[["l", "Left"], ["c", "Centre"], ["r", "Right"], ["t", "Top"], ["m", "Middle"], ["b", "Bottom"]].map(([k, label]) => <button key={k} className={btnCls} onClick={act(() => align(k))} title={`Align ${label.toLowerCase()}`}>{label}</button>)}
                    <button className={btnCls} onClick={act(() => { align("c"); align("m"); })}>Dead centre</button>
                    {items.some((o) => o.id === alignTo && o.id !== cur.id) && <>
                      <button className={btnCls} onClick={act(() => sameSize("w"))}>Same width</button>
                      <button className={btnCls} onClick={act(() => sameSize("h"))}>Same height</button>
                    </>}
                    <button className={btnCls} onClick={act(() => spread("x"))} title="Equal gaps between the logos on this panel, left to right">Space evenly across</button>
                    <button className={btnCls} onClick={act(() => spread("y"))} title="Equal gaps between the logos on this panel, top to bottom">Space evenly down</button>
                    <span className="w-full text-[11px] text-gray-500">Dragging snaps edges and centres to the panel, its safe area and other layers (hold Alt to switch off). Arrow keys nudge 0.5 mm; Shift 5 mm; Alt 0.1 mm.</span>
                  </div>
                )}
                {cup && <button className={`${btnCls} w-fit`} onClick={act(() => patch(cur.id, (i) => { const q = toPolar(cup, [i.x, i.y]), [x, y] = fromPolar(cup, (cup.floorR + cup.topR) / 2, q.a); return { ...i, x: r1(x), y: r1(y) }; }))}>Middle of the print height</button>}
                {cur.kind === "raster" && !cur.missing && (
                  <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                    <p><span className="font-semibold">This is a picture, not a vector logo.</span> Best: the customer's AI / PDF / SVG / CDR ("Replace file"). No vector to be had? Trace it: the tool redraws the picture as flat-colour outlines by arithmetic (no AI). Works on a clean, flat logo photographed or scanned straight on, 1 to 4 solid colours. Angled photos, shadows, gradients and small type come out rough.</p>
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="w-28">Ink colours<select value={tr.colours} onChange={(e) => setTr({ ...tr, colours: +e.target.value })} className={inputCls}>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
                      <label className="w-40">Detail<select value={tr.detail} onChange={(e) => setTr({ ...tr, detail: +e.target.value })} className={inputCls}><option value={0.5}>Fine (more points)</option><option value={0.9}>Normal</option><option value={1.6}>Smooth (fewer points)</option></select></label>
                      <label className="flex items-center gap-1.5 pb-2"><input type="checkbox" checked={tr.keepPaper} onChange={(e) => setTr({ ...tr, keepPaper: e.target.checked })} />Keep the background colour too</label>
                      <button className={`${btnCls} border-amber-700 bg-amber-600 text-white`} onClick={runTrace} disabled={!!busy}>Trace to vector</button>
                    </div>
                    <p className="text-[11px]">Undo brings the picture back. Crop first to trace only part of it.</p>
                  </div>
                )}
                {cur.source === "trace" && (
                  <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    Traced from a picture{trInfo && trInfo.id === cur.id ? `: ${trInfo.colours.length} colour${trInfo.colours.length === 1 ? "" : "s"}, ${trInfo.points} points${trInfo.paper ? `, background ${trInfo.paper} left out` : ""}` : ""}. It is a redraw, not the customer's file: compare it with the original and get it approved. Not right? Undo, then try more colours or Fine detail. Each colour below can be changed or given its Pantone name.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2 text-xs xl:grid-cols-4">
                  {[["l", "Crop left %"], ["t", "Crop top %"], ["r", "Crop right %"], ["b", "Crop bottom %"]].map(([k, label]) => (
                    <label key={k}>{label}<input type="number" min="0" max="90" step="1" value={Math.round(cur.crop[k] * 100)} onChange={(e) => setCrop(k, +e.target.value || 0)} className={inputCls} /></label>
                  ))}
                </div>
                {cur.kind === "raster" && (() => { const dpi = effectiveDpi(cur); return (
                  <p className={`rounded-md px-3 py-2 text-xs ${dpi >= MIN_DPI ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300"}`}>
                    Image: {cur.natW} × {cur.natH} px = {Math.round(dpi)} dpi at this size (needs {MIN_DPI}).{cur.source === "pdf-raster" ? " This PDF has photos or live text, so it came in as an image." : ""}
                  </p>
                ); })()}
                {cur.shape && (
                  <div className="flex flex-wrap items-end gap-2 text-xs">
                    {cur.shape.type !== "line" && <label className="flex items-center gap-1.5 pb-2"><input type="checkbox" checked={cur.shape.filled !== false} onChange={act((e) => setShape({ filled: e.target.checked, ...(e.target.checked ? {} : { strokeMm: Math.max(0.5, cur.shape.strokeMm || 0) }) }))} />Filled</label>}
                    {cur.shape.type !== "line" && <label className="w-28">Outline mm (0 = none)<input type="number" min="0" step="0.1" value={cur.shape.strokeMm || 0} onChange={(e) => setShape({ strokeMm: Math.max(0, +e.target.value || 0) })} className={inputCls} /></label>}
                    {cur.shape.type === "rect" && <label className="w-28">Corner radius mm<input type="number" min="0" step="0.5" value={cur.shape.radius || 0} onChange={(e) => setShape({ radius: Math.max(0, +e.target.value || 0) })} className={inputCls} /></label>}
                    {cur.shape.type === "path" && <label className="flex items-center gap-1.5 pb-2"><input type="checkbox" checked={!!cur.shape.smooth} onChange={act((e) => setShape({ smooth: e.target.checked }))} />Smooth curve</label>}
                    {cur.shape.type === "line" && <span className="pb-2 text-gray-500">A line's Height is its weight. Turn it with the round knob.</span>}
                  </div>
                )}
                {cur.text && (
                  <div className="grid grid-cols-1 gap-2 text-xs xl:grid-cols-2" data-fonts={fontTick}>
                    <label className="xl:col-span-2">Text (prints as outlines, no font needed at the press)
                      <textarea rows={2} value={cur.text.content} onChange={(e) => setText({ content: e.target.value })} className={inputCls} />
                    </label>
                    <label>Font
                      <select value={cur.text.fontId} onChange={(e) => setText({ fontId: e.target.value })} className={inputCls}>
                        {FONTS.map((f2) => <option key={f2.id} value={f2.id}>{f2.label}</option>)}
                      </select>
                    </label>
                    <label>Align
                      <select value={cur.text.align} onChange={(e) => setText({ align: e.target.value })} className={inputCls}>
                        <option value="center">Centre</option><option value="left">Left</option><option value="right">Right</option>
                      </select>
                    </label>
                    <label className={`${btnCls} w-fit cursor-pointer`}>Use the customer's font (TTF / OTF)
                      <input type="file" accept=".ttf,.otf,font/ttf,font/otf" className="hidden" onChange={onFont} />
                    </label>
                  </div>
                )}
                {cur.kind === "svg" && !cur.text && !cur.shape && (() => { const parts = svgParts(cur), hidden = new Set(cur.hidden || []); return parts.length > 1 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer font-semibold text-gray-700 dark:text-gray-300">Shapes in this logo ({parts.length - hidden.size} of {parts.length} on) — switch off a box, a tagline, a background</summary>
                    <div className="mt-2 flex max-h-40 flex-wrap gap-1 overflow-auto">
                      {parts.slice(0, 120).map((pt) => (
                        <button key={pt.k} onClick={act(() => { const h2 = new Set(hidden); h2.has(pt.k) ? h2.delete(pt.k) : h2.add(pt.k); patch(cur.id, (i) => hideParts(i, [...h2])); })}
                          className={`flex items-center gap-1 rounded border px-1.5 py-1 ${hidden.has(pt.k) ? "border-gray-200 opacity-40 dark:border-gray-800" : "border-gray-400"}`}>
                          <span className="inline-block h-3 w-3 rounded-sm border border-gray-300" style={{ background: pt.fill }} />{pt.k + 1}
                        </button>
                      ))}
                    </div>
                    {parts.length > 120 && <p className="mt-1 text-[11px] text-gray-500">Showing the first 120 shapes.</p>}
                  </details>
                ); })()}
                {cur.kind === "svg" && (
                  <div>
                    <p className="mb-1 text-xs font-semibold text-gray-700 dark:text-gray-300">Colours in this artwork ({cur.colours.length}){jobInks.length > 0 && <span className="font-normal text-gray-500"> - the small swatches are the job's other colours: click one to print this in the same ink</span>}</p>
                    <div className="space-y-1">
                      {cur.colours.map((c, k) => (
                        <div key={c.from} className="flex items-center gap-2 text-xs">
                          <span className="inline-block h-6 w-6 rounded border border-gray-300" style={{ background: c.from }} title={`was ${c.from}`} />
                          <span>→</span>
                          <input type="color" value={/^#[0-9a-f]{6}$/i.test(c.to) ? c.to : "#000000"} onChange={(e) => recolour(k, "to", e.target.value)} className="h-8 w-12" />
                          <input value={c.name} onChange={(e) => recolour(k, "name", e.target.value)} placeholder="PANTONE … U" className={`${inputCls} max-w-[200px]`} />
                          <button className={btnCls} onClick={act(() => recolour(k, "to", "#ffffff"))}>No ink</button>
                          {jobInks.filter((q) => q.to !== String(c.to).toLowerCase() || q.name !== (c.name || "")).slice(0, 6).map((q) => (
                            <button key={q.to} title={`Use this job colour${q.name ? `: ${q.name}` : ""}`} onClick={act(() => patch(cur.id, (i) => refreshSvg({ ...i, colours: i.colours.map((c3, n) => (n === k ? { ...c3, to: q.to, name: q.name } : c3)) })))}
                              className="flex items-center gap-1 rounded border border-gray-300 px-1.5 py-1 text-[11px] dark:border-gray-700"><span className="inline-block h-4 w-4 rounded-sm border border-gray-400" style={{ background: q.to }} />{q.name ? q.name.replace(/^PANTONE\s+/i, "") : "same"}</button>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ) : <p className="text-xs text-gray-500">Select a layer to edit it.</p>}
      </div>
    </div>
  );
}
