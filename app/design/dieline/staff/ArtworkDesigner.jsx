"use client";
// ARTWORK DESIGNER — place customer artwork on the flat die, in millimetres. Open a PDF / AI / SVG / PNG / JPG, then move,
// size, rotate, crop and recolour it; snap it to a panel centre; add a flat colour ground. Everything is in the die's own
// frame, so what is placed here is what prints and what the 3D model shows. Rules live in lib/dieline/designer/model.js.
import { useEffect, useMemo, useRef, useState } from "react";
import { PT_PER_MM } from "@/lib/dieline/cakebox";
import { corners, effectiveDpi, newId, BLEED, SAFE, MIN_DPI } from "@/lib/dieline/designer/model";
import { parseSvgDom } from "@/lib/dieline/designer/io";
import { curveItem, curveBlocker } from "@/lib/dieline/designer/cup-warp";
import { toPolar, fromPolar, CUP_RULES } from "@/lib/dieline/cup";
import { importFile, refreshSvg, textItem, retext, FONTS, addCustomFont, svgParts, hideParts, replaceFile } from "@/lib/dieline/designer/io";

const inputCls = "w-full rounded-md border border-gray-300 px-2 py-1.5 text-base dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100";
const btnCls = "rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:border-gray-900 disabled:opacity-40 dark:border-gray-700 dark:text-gray-200";
const r1 = (v) => Math.round(v * 10) / 10;

export default function ArtworkDesigner({ doc, geom, family, areas, noInk, items, setItems, boardColour, snap, undo, redo, canUndo, canRedo, cup = null, clipPoly = null }) {
  const svgRef = useRef(null), drag = useRef(null);
  const [sel, setSel] = useState(null), [busy, setBusy] = useState(""), [err, setErr] = useState(""), [guides, setGuides] = useState([]);
  const W = doc.blank.widthPt / PT_PER_MM, H = doc.blank.heightPt / PT_PER_MM, M = 14;
  const S = SAFE[family] || SAFE.box;
  const cur = items.find((i) => i.id === sel) || null;

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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if ((e.key === "Delete" || e.key === "Backspace") && sel) { e.preventDefault(); snap(); setItems((l) => l.filter((i) => i.id !== sel)); setSel(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const toMm = (e) => { const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svgRef.current.getScreenCTM().inverse()); return [p.x, p.y]; };

  async function onFiles(e) {
    const files = [...e.target.files]; e.target.value = "";
    setErr(""); setBusy("Reading…");
    try {
      const a0 = areas[0]?.box || [0, 0, W, H], cx = (a0[0] + a0[2]) / 2, cy = (a0[1] + a0[3]) / 2, startW = Math.min(90, (a0[2] - a0[0]) * 0.55);
      const added = [];
      const spot = cup ? (() => { const a = cup.aLeft + cup.wrap / 2, r = (cup.rFold + CUP_RULES.floor + cup.limit.rMax) / 2, [x, y] = fromPolar(cup, r, a); return { x: r1(x), y: r1(y), rot: r1((a * 180) / Math.PI) }; })() : { x: cx, y: cy };
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
      const spot = cup ? (() => { const a = cup.aLeft + cup.wrap / 2, r = (cup.rFold + CUP_RULES.floor + cup.limit.rMax) / 2, [x, y] = fromPolar(cup, r, a); return { x: r1(x), y: r1(y), rot: r1((a * 180) / Math.PI), curve: true }; })() : { x: r1((a0[0] + a0[2]) / 2), y: r1((a0[1] + a0[3]) / 2) };
      setItems((l) => [...l, { ...it, ...spot }]); setSel(it.id);
    } catch (ex) { setErr(ex.message); }
  }
  const setText = async (p2) => { try { const n = await retext(cur, p2); patch(cur.id, () => n); } catch (ex) { setErr(ex.message); } };
  async function onFont(e) {
    const f2 = e.target.files[0]; e.target.value = "";
    if (!f2) return;
    try { const id = await addCustomFont(f2); setFontTick((n) => n + 1); snap(); await setText({ fontId: id }); } catch { setErr("Could not read that font. Use a TTF or OTF file."); }
  }
  const addFlood = () => { snap(); const it = { id: newId(), kind: "flood", name: "Colour ground", role: "background", colour: "#1f1f1f", pantone: "" }; setItems((l) => [it, ...l]); setSel(it.id); };

  // ---- pointer: move, and scale from a corner handle
  function down(e, it, mode) {
    if (it.kind === "flood") { setSel(it.id); return; }
    e.stopPropagation(); e.currentTarget.setPointerCapture?.(e.pointerId);
    snap();
    const [mx, my] = toMm(e);
    const upright = cup && Math.abs(((((it.rot || 0) - (toPolar(cup, [it.x, it.y]).a * 180) / Math.PI) + 540) % 360) - 180) <= 1;
    drag.current = { id: it.id, mode, mx, my, x: it.x, y: it.y, w: it.w, h: it.h, d0: Math.hypot(mx - it.x, my - it.y), upright };
    setSel(it.id);
  }
  function move(e) {
    const d = drag.current; if (!d) return;
    const [mx, my] = toMm(e);
    if (d.mode === "move") {
      let x = d.x + mx - d.mx, y = d.y + my - d.my; const g = [];
      for (const a of areas) { // snap the centre to a panel centre line
        const cx = (a.box[0] + a.box[2]) / 2, cy = (a.box[1] + a.box[3]) / 2;
        if (x > a.box[0] && x < a.box[2] && y > a.box[1] && y < a.box[3]) {
          if (Math.abs(x - cx) < 2) { x = cx; g.push(["v", cx, a.box[1], a.box[3]]); }
          if (Math.abs(y - cy) < 2) { y = cy; g.push(["h", cy, a.box[0], a.box[2]]); }
        }
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
    } else {
      const k = Math.max(0.05, Math.hypot(mx - d.x, my - d.y) / (d.d0 || 1));
      patch(d.id, (i) => ({ ...i, w: r1(d.w * k), h: r1(d.h * k) }));
    }
  }
  const up = () => { drag.current = null; setGuides([]); };

  const setCrop = (side, pct) => patch(cur.id, (i) => {
    const c = { ...i.crop, [side]: Math.max(0, Math.min(0.9, pct / 100)) };
    if (c.l + c.r > 0.95 || c.t + c.b > 0.95) return i;
    const sx = i.w / (i.natW * (1 - i.crop.l - i.crop.r)), sy = i.h / (i.natH * (1 - i.crop.t - i.crop.b)); // keep the print scale
    return { ...i, crop: c, w: r1(i.natW * (1 - c.l - c.r) * sx), h: r1(i.natH * (1 - c.t - c.b) * sy) };
  });
  const setW = (w) => patch(cur.id, (i) => (w > 0 ? { ...i, w: r1(w), h: r1((w * i.h) / i.w) } : i));
  const setHt = (h) => patch(cur.id, (i) => (h > 0 ? { ...i, h: r1(h), w: r1((h * i.w) / i.h) } : i));
  const centreOn = (a) => patch(cur.id, (i) => ({ ...i, x: r1((a.box[0] + a.box[2]) / 2), y: r1((a.box[1] + a.box[3]) / 2) }));
  const fitBlank = () => patch(cur.id, (i) => { const k = Math.max((W + 2 * BLEED) / i.w, (H + 2 * BLEED) / i.h); return { ...i, role: "background", x: r1(W / 2), y: r1(H / 2), w: r1(i.w * k + 0.2), h: r1(i.h * k + 0.2), rot: 0 }; });
  const fitArea = (a) => patch(cur.id, (i) => { const aw = a.box[2] - a.box[0] - 2 * S.fold, ah = a.box[3] - a.box[1] - S.fold - S.topCut, k = Math.min(aw / i.w, ah / i.h); return { ...i, x: r1((a.box[0] + a.box[2]) / 2), y: r1((a.box[1] + a.box[3]) / 2 + (S.topCut - S.fold) / 2), w: r1(i.w * k - 0.1), h: r1(i.h * k - 0.1) }; });
  // cups: polar placement about the cone centre
  const degOf = (a) => r1((a * 180) / Math.PI);
  const standUp = () => patch(cur.id, (i) => ({ ...i, rot: degOf(toPolar(cup, [i.x, i.y]).a) }));
  const cupSpot = (frac) => patch(cur.id, (i) => { const a = cup.aLeft + cup.wrap * frac, r = (cup.rFold + CUP_RULES.floor + cup.limit.rMax) / 2, [x, y] = fromPolar(cup, r, a); return { ...i, x: r1(x), y: r1(y), rot: degOf(a) }; });
  const view = (it) => { if (!cup || !it.curve || it.kind !== "svg") return it; try { return curveItem(it, cup, parseSvgDom); } catch { return it; } };
  const reorder = (dir) => setItems((l) => { const k = l.findIndex((i) => i.id === sel), j = k + dir; if (k < 0 || j < 0 || j >= l.length) return l; const n = l.slice(); [n[k], n[j]] = [n[j], n[k]]; return n; });
  const remove = () => { setItems((l) => l.filter((i) => i.id !== sel)); setSel(null); };
  const recolour = (k, key, v) => patch(cur.id, (i) => refreshSvg({ ...i, colours: i.colours.map((c, n) => (n === k ? { ...c, [key]: v } : c)) }));

  const hs = Math.max(2.2, W / 160); // handle size, mm
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className={`${btnCls} cursor-pointer border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900`}>
          Add artwork file
          <input type="file" multiple accept=".pdf,.ai,.svg,.png,.jpg,.jpeg,.webp,application/pdf,image/*" className="hidden" onChange={onFiles} />
        </label>
        <button className={btnCls} onClick={addText}>Add text</button>
        <button className={btnCls} onClick={addFlood}>Add colour ground</button>
        <button className={btnCls} onClick={undo} disabled={!canUndo} title="Ctrl/Cmd + Z">Undo</button>
        <button className={btnCls} onClick={redo} disabled={!canRedo} title="Ctrl/Cmd + Shift + Z">Redo</button>
        <span className="text-[11px] text-gray-500">PDF / AI / SVG stay vector. Drag to move, drag a corner to size, drag the round knob to rotate. {busy}</span>
      </div>
      {err && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-300">{err}</p>}

      <div className="rounded-md border border-gray-200 bg-[#e9ebee] p-1 dark:border-gray-800">
        <svg ref={svgRef} viewBox={`${-M} ${-M} ${W + 2 * M} ${H + 2 * M}`} className="h-auto max-h-[620px] w-full touch-none select-none" onPointerMove={move} onPointerUp={up} onPointerLeave={up} onPointerDown={() => setSel(null)}>
          <defs>
            <clipPath id="art-clip">{clipPoly ? <polygon points={clipPoly.map((q) => q.join(",")).join(" ")} /> : <rect x={-BLEED} y={-BLEED} width={W + 2 * BLEED} height={H + 2 * BLEED} />}</clipPath>
            <clipPath id="board-clip"><path d={board} clipRule="evenodd" /></clipPath>
            <pattern id="no-ink" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="3" fill="#ffffff" /><line x1="0" y1="0" x2="0" y2="3" stroke="#b9b9b9" strokeWidth="0.6" /></pattern>
          </defs>
          <path d={board} fill={boardColour || "#f4f2ec"} fillRule="evenodd" />
          <g clipPath="url(#art-clip)">
            {items.map((it) => it.kind === "flood" ? (
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
          {/* everything off the board fades: it is bleed or waste */}
          <path d={`M${-M} ${-M}H${W + M}V${H + M}H${-M}Z ${board}`} fill="#e9ebee" fillOpacity="0.72" fillRule="evenodd" pointerEvents="none" />
          <g clipPath="url(#board-clip)" pointerEvents="none">
            {noInk.map(([a, b, c, d], k) => <rect key={k} x={Math.max(a, -M)} y={Math.max(b, -M)} width={Math.min(c, W + M) - Math.max(a, -M)} height={Math.min(d, H + M) - Math.max(b, -M)} fill="url(#no-ink)" />)}
          </g>
          {die.safe && <path d={die.safe} fill="none" stroke="#ef8e0c" strokeWidth={0.35} strokeDasharray="2 1.5" pointerEvents="none" />}
          {cup && (() => { const P = (r, a) => fromPolar(cup, r, a).map((v) => v.toFixed(2)).join(" "), aj = (r) => cup.aLeft + CUP_RULES.joint / r, rf = cup.rFold + CUP_RULES.floor; return (
            <g pointerEvents="none" fill="none" stroke="#c0392b" strokeWidth={0.3} strokeDasharray="1.5 1.5">
              <path d={`M${P(cup.limit.rMax, aj(cup.limit.rMax))}L${P(rf, aj(rf))}`} />
              <path d={`M${P(rf, aj(rf))}A${rf} ${rf} 0 0 1 ${P(rf, cup.limit.aMax)}`} />
            </g>
          ); })()}
          <path d={die.crease} fill="none" stroke="#0aa10a" strokeWidth={0.35} pointerEvents="none" />
          <path d={die.cut} fill="none" stroke="#e11d1d" strokeWidth={0.35} pointerEvents="none" />
          {!cup && areas.map((a) => (
            <g key={a.name + a.box[0]} pointerEvents="none">
              <rect x={a.box[0] + S.fold} y={a.box[1] + S.topCut} width={Math.max(0, a.box[2] - a.box[0] - 2 * S.fold)} height={Math.max(0, a.box[3] - a.box[1] - S.topCut - S.fold)} fill="none" stroke="#ef8e0c" strokeWidth={0.3} strokeDasharray="2 1.5" />
              <text x={a.box[0] + S.fold + 1.5} y={a.box[1] + S.topCut + 5} fontSize={4} fill="#b86a00" fontFamily="Helvetica, Arial, sans-serif">{a.name}</text>
            </g>
          ))}
          {guides.map((g, k) => g[0] === "v" ? <line key={k} x1={g[1]} y1={g[2]} x2={g[1]} y2={g[3]} stroke="#2563eb" strokeWidth={0.3} /> : <line key={k} x1={g[2]} y1={g[1]} x2={g[3]} y2={g[1]} stroke="#2563eb" strokeWidth={0.3} />)}
          {cur && cur.kind !== "flood" && (() => {
            const cs = corners(view(cur));
            return (
              <g>
                <polygon points={cs.map((p) => p.join(",")).join(" ")} fill="none" stroke="#2563eb" strokeWidth={0.4} pointerEvents="none" />
                {cs.map((p, k) => <rect key={k} x={p[0] - hs / 2} y={p[1] - hs / 2} width={hs} height={hs} fill="#ffffff" stroke="#2563eb" strokeWidth={0.4} style={{ cursor: "nwse-resize" }} onPointerDown={(e) => down(e, cur, "scale")} />)}
                {!cur.curve && (() => { // rotate handle: a round knob above the top edge
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
      {cup ? <p className="text-[11px] text-gray-500">Red = cut, green = folds (rim-curl line, bottom fold, glue-seam line), orange dash = the KLD's limit line, red dash = keep logos right of the {CUP_RULES.joint} mm joint and {CUP_RULES.floor} mm above the bottom fold. All ink is clipped to the KLD's bleed line.</p>
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
                  <span className="shrink-0 text-[10px] uppercase text-gray-500">{it.kind === "flood" ? "ground" : it.kind === "svg" ? "vector" : "image"}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {cur ? (
          <div className="space-y-3 rounded-md border border-gray-200 p-3 dark:border-gray-800" onFocusCapture={(e) => { if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) snap(); }}>
            <div className="flex flex-wrap items-center gap-2">
              <input value={cur.name} onChange={(e) => patch(cur.id, (i) => ({ ...i, name: e.target.value }))} className={`${inputCls} max-w-[220px]`} />
              <button className={btnCls} onClick={act(() => reorder(1))}>Forward</button>
              <button className={btnCls} onClick={act(() => reorder(-1))}>Back</button>
              {cur.kind !== "flood" && !cur.text && (
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
                  {!cup && areas.map((a) => <button key={a.name + a.box[0]} className={btnCls} onClick={act(() => centreOn(a))}>Centre on {a.name}</button>)}
                  {!cup && areas[0] && <button className={btnCls} onClick={act(() => fitArea(areas.find((a) => cur.x > a.box[0] && cur.x < a.box[2]) || areas[0]))}>Fit safe area</button>}
                  {!cup && <button className={btnCls} onClick={act(fitBlank)}>Fit to blank + bleed</button>}
                </div>
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
                {cur.kind === "svg" && !cur.text && (() => { const parts = svgParts(cur), hidden = new Set(cur.hidden || []); return parts.length > 1 && (
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
                    <p className="mb-1 text-xs font-semibold text-gray-700 dark:text-gray-300">Colours in this artwork ({cur.colours.length})</p>
                    <div className="space-y-1">
                      {cur.colours.map((c, k) => (
                        <div key={c.from} className="flex items-center gap-2 text-xs">
                          <span className="inline-block h-6 w-6 rounded border border-gray-300" style={{ background: c.from }} title={`was ${c.from}`} />
                          <span>→</span>
                          <input type="color" value={/^#[0-9a-f]{6}$/i.test(c.to) ? c.to : "#000000"} onChange={(e) => recolour(k, "to", e.target.value)} className="h-8 w-12" />
                          <input value={c.name} onChange={(e) => recolour(k, "name", e.target.value)} placeholder="PANTONE … U" className={`${inputCls} max-w-[200px]`} />
                          <button className={btnCls} onClick={act(() => recolour(k, "to", "#ffffff"))}>No ink</button>
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
