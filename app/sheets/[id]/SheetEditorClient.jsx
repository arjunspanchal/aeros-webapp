"use client";
// The Sheets grid editor — a Google-Sheets-style spreadsheet that lives
// entirely online. All edits autosave to Supabase (debounced, versioned);
// the page also polls for teammates' saves so everyone converges on the
// same data without manual refreshes.
//
// Concurrency model: optimistic compare-and-swap on `version`. If someone
// else saved while you were typing, your save comes back 409 with their
// copy and a banner lets you load theirs or overwrite with yours.

import Link from "next/link";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  colLabel,
  refOf,
  computeSheet,
  shiftCells,
  rangeToTSV,
  parseClipboard,
  toCSV,
} from "@/lib/sheets/engine";

const DEFAULT_COL_W = 120;
const MIN_COL_W = 56;
const ROW_H = 28;
const SAVE_DEBOUNCE_MS = 1200;
const POLL_MS = 5000;
const MAX_UNDO = 100;

function isEnterKey(e) {
  return e.key === "Enter" || e.key === "Return";
}

const NUMERIC_RE = /^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

function normData(d) {
  return {
    cells: d?.cells || {},
    rows: Math.max(20, Number(d?.rows) || 100),
    cols: Math.max(6, Number(d?.cols) || 26),
    colWidths: d?.colWidths || {},
  };
}

function who(email) {
  return email ? email.split("@")[0] : "someone";
}

// ── one grid cell (memoised — only re-renders when its own props change) ──
const Cell = memo(function Cell({ r, c, display, isFormula, selected, inRange, width, onMouseDown, onDoubleClick }) {
  const numeric = NUMERIC_RE.test(display);
  return (
    <div
      data-cell={`${r}:${c}`}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      className={`shrink-0 border-b border-r border-gray-200 dark:border-gray-800 px-1.5 flex items-center overflow-hidden whitespace-nowrap text-[13px] select-none ${
        numeric ? "justify-end tabular-nums" : ""
      } ${
        selected
          ? "ring-2 ring-inset ring-blue-600 bg-white dark:bg-gray-900 z-10"
          : inRange
          ? "bg-blue-50 dark:bg-blue-900/30"
          : "bg-white dark:bg-gray-900"
      } ${display.startsWith("#") && isFormula ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-gray-100"}`}
      style={{ width, height: ROW_H }}
    >
      {display}
    </div>
  );
});

export default function SheetEditorClient({ initialSheet, currentEmail }) {
  const [name, setName] = useState(initialSheet.name || "Untitled sheet");
  const [data, setData] = useState(() => normData(initialSheet.data));
  const [version, setVersion] = useState(initialSheet.version);
  const [saveState, setSaveState] = useState("saved"); // saved | dirty | saving | conflict | error
  const [conflictSheet, setConflictSheet] = useState(null);
  const [remoteNote, setRemoteNote] = useState("");
  const [lastSavedBy, setLastSavedBy] = useState({ by: initialSheet.updated_by, at: initialSheet.updated_at });

  const [sel, setSel] = useState({ r: 0, c: 0 });
  const [selEnd, setSelEnd] = useState(null); // range end (shift-select), null = single cell
  const [editing, setEditing] = useState(null); // { r, c, draft, replace }
  const [formulaDraft, setFormulaDraft] = useState(null); // editing via formula bar

  const gridRef = useRef(null);
  const editInputRef = useRef(null);
  const stateRef = useRef({});
  stateRef.current = { data, version, name, saveState, editing };
  const saveTimer = useRef(null);
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const dragSelecting = useRef(false);

  const computed = useMemo(() => computeSheet(data.cells), [data.cells]);

  const range = useMemo(() => {
    const e = selEnd || sel;
    return {
      r1: Math.min(sel.r, e.r),
      r2: Math.max(sel.r, e.r),
      c1: Math.min(sel.c, e.c),
      c2: Math.max(sel.c, e.c),
    };
  }, [sel, selEnd]);

  // ── mutation core: every data change goes through here (undo + autosave) ──
  const mutate = useCallback((fn) => {
    setData((prev) => {
      const next = fn(prev);
      if (next === prev) return prev;
      undoStack.current.push(prev);
      if (undoStack.current.length > MAX_UNDO) undoStack.current.shift();
      redoStack.current = [];
      return next;
    });
    setSaveState((s) => (s === "conflict" ? s : "dirty"));
    scheduleSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function undo() {
    const prev = undoStack.current.pop();
    if (!prev) return;
    setData((cur) => {
      redoStack.current.push(cur);
      return prev;
    });
    setSaveState((s) => (s === "conflict" ? s : "dirty"));
    scheduleSave();
  }

  function redo() {
    const next = redoStack.current.pop();
    if (!next) return;
    setData((cur) => {
      undoStack.current.push(cur);
      return next;
    });
    setSaveState((s) => (s === "conflict" ? s : "dirty"));
    scheduleSave();
  }

  // ── autosave ──────────────────────────────────────────────────────────────
  function scheduleSave() {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => doSave(), SAVE_DEBOUNCE_MS);
  }

  async function doSave() {
    const { data: d, version: v, name: n, saveState: st } = stateRef.current;
    if (st === "conflict" || st === "saving") return;
    setSaveState("saving");
    try {
      const res = await fetch(`/api/sheets/${initialSheet.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseVersion: v, data: d, name: n }),
      });
      const json = await res.json();
      if (res.status === 409) {
        setConflictSheet(json.sheet);
        setSaveState("conflict");
        return;
      }
      if (!res.ok) throw new Error(json.error || "Save failed");
      setVersion(json.sheet.version);
      setLastSavedBy({ by: currentEmail, at: json.sheet.updated_at });
      // if more edits landed while the request was in flight, go again
      if (stateRef.current.data !== d || stateRef.current.name !== n) {
        setSaveState("dirty");
        scheduleSave();
      } else {
        setSaveState("saved");
      }
    } catch (e) {
      console.error(e);
      setSaveState("error");
      // retry with backoff — the sheet lives online, keep trying
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        setSaveState("dirty");
        doSave();
      }, 4000);
    }
  }

  // flush on tab close
  useEffect(() => {
    function onBeforeUnload(e) {
      if (stateRef.current.saveState === "dirty" || stateRef.current.saveState === "saving") {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // ── poll for teammates' saves while we're clean ───────────────────────────
  useEffect(() => {
    const id = setInterval(async () => {
      const { saveState: st, version: v, editing: ed } = stateRef.current;
      if (st !== "saved" || ed) return;
      try {
        const res = await fetch(`/api/sheets/${initialSheet.id}?ifNotVersion=${v}`);
        if (!res.ok) return;
        const json = await res.json();
        if (json.unchanged || !json.sheet) return;
        if (stateRef.current.saveState !== "saved" || stateRef.current.editing) return;
        setData(normData(json.sheet.data));
        setName(json.sheet.name);
        setVersion(json.sheet.version);
        setLastSavedBy({ by: json.sheet.updated_by, at: json.sheet.updated_at });
        setRemoteNote(`Updated by ${who(json.sheet.updated_by)}`);
        setTimeout(() => setRemoteNote(""), 4000);
        undoStack.current = [];
        redoStack.current = [];
      } catch {
        /* offline — next tick */
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [initialSheet.id]);

  // ── conflict resolution ───────────────────────────────────────────────────
  function loadTheirs() {
    if (!conflictSheet) return;
    setData(normData(conflictSheet.data));
    setName(conflictSheet.name);
    setVersion(conflictSheet.version);
    setLastSavedBy({ by: conflictSheet.updated_by, at: conflictSheet.updated_at });
    setConflictSheet(null);
    setSaveState("saved");
    undoStack.current = [];
    redoStack.current = [];
  }

  function keepMine() {
    if (!conflictSheet) return;
    setVersion(conflictSheet.version); // rebase onto their version, then overwrite
    setConflictSheet(null);
    setSaveState("dirty");
    setTimeout(() => doSave(), 0);
  }

  // ── cell edits ────────────────────────────────────────────────────────────
  const setCell = useCallback(
    (r, c, raw) => {
      mutate((prev) => {
        const key = refOf(c, r);
        const cur = prev.cells[key]?.v ?? "";
        if (cur === raw) return prev;
        const cells = { ...prev.cells };
        if (raw === "" || raw == null) delete cells[key];
        else cells[key] = { v: raw };
        return { ...prev, cells };
      });
    },
    [mutate]
  );

  function clearRange() {
    mutate((prev) => {
      const cells = { ...prev.cells };
      let changed = false;
      for (let r = range.r1; r <= range.r2; r++) {
        for (let c = range.c1; c <= range.c2; c++) {
          const key = refOf(c, r);
          if (cells[key]) {
            delete cells[key];
            changed = true;
          }
        }
      }
      return changed ? { ...prev, cells } : prev;
    });
  }

  function startEdit(r, c, replaceWith) {
    const key = refOf(c, r);
    const raw = data.cells[key]?.v ?? "";
    setEditing({ r, c, draft: replaceWith != null ? replaceWith : raw, replace: replaceWith != null });
    setFormulaDraft(null);
  }

  function commitEdit(move) {
    if (!editing) return;
    setCell(editing.r, editing.c, editing.draft);
    setEditing(null);
    if (move) moveSel(move.dr, move.dc, false);
    requestAnimationFrame(() => gridRef.current?.focus());
  }

  function cancelEdit() {
    setEditing(null);
    requestAnimationFrame(() => gridRef.current?.focus());
  }

  function moveSel(dr, dc, extend) {
    const base = extend ? selEnd || sel : sel;
    const r = Math.min(Math.max(0, base.r + dr), data.rows - 1);
    const c = Math.min(Math.max(0, base.c + dc), data.cols - 1);
    if (extend) {
      setSelEnd({ r, c });
    } else {
      setSel({ r, c });
      setSelEnd(null);
    }
    // keep the active cell in view
    requestAnimationFrame(() => {
      const el = gridRef.current?.querySelector(`[data-cell="${r}:${c}"]`);
      el?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }

  // ── structure edits ───────────────────────────────────────────────────────
  function addRows(n) {
    mutate((prev) => ({ ...prev, rows: prev.rows + n }));
  }
  function addCols(n) {
    mutate((prev) => ({ ...prev, cols: prev.cols + n }));
  }
  function insertRow(at) {
    mutate((prev) => ({ ...prev, rows: prev.rows + 1, cells: shiftCells(prev.cells, "row", at, 1) }));
  }
  function deleteRow(at) {
    mutate((prev) =>
      prev.rows <= 1 ? prev : { ...prev, rows: prev.rows - 1, cells: shiftCells(prev.cells, "row", at, -1) }
    );
    setSel((s) => ({ ...s, r: Math.min(s.r, data.rows - 2) }));
    setSelEnd(null);
  }
  function insertCol(at) {
    mutate((prev) => {
      const colWidths = {};
      for (const [k, w] of Object.entries(prev.colWidths)) {
        const idx = Number(k);
        colWidths[idx >= at ? idx + 1 : idx] = w;
      }
      return { ...prev, cols: prev.cols + 1, colWidths, cells: shiftCells(prev.cells, "col", at, 1) };
    });
  }
  function deleteCol(at) {
    mutate((prev) => {
      if (prev.cols <= 1) return prev;
      const colWidths = {};
      for (const [k, w] of Object.entries(prev.colWidths)) {
        const idx = Number(k);
        if (idx === at) continue;
        colWidths[idx > at ? idx - 1 : idx] = w;
      }
      return { ...prev, cols: prev.cols - 1, colWidths, cells: shiftCells(prev.cells, "col", at, -1) };
    });
    setSel((s) => ({ ...s, c: Math.min(s.c, data.cols - 2) }));
    setSelEnd(null);
  }

  // ── clipboard ─────────────────────────────────────────────────────────────
  function onCopy(e) {
    if (editing || formulaDraft != null) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", rangeToTSV(data.cells, computed, range.r1, range.c1, range.r2, range.c2));
  }

  function onCut(e) {
    if (editing || formulaDraft != null) return;
    onCopy(e);
    clearRange();
  }

  function onPaste(e) {
    if (editing || formulaDraft != null) return;
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    const grid = parseClipboard(text);
    mutate((prev) => {
      const cells = { ...prev.cells };
      let rows = prev.rows;
      let cols = prev.cols;
      grid.forEach((line, dr) => {
        line.forEach((val, dc) => {
          const r = sel.r + dr;
          const c = sel.c + dc;
          rows = Math.max(rows, r + 1);
          cols = Math.max(cols, c + 1);
          const key = refOf(c, r);
          if (val === "") delete cells[key];
          else cells[key] = { v: val };
        });
      });
      return { ...prev, cells, rows, cols };
    });
    setSelEnd({ r: sel.r + grid.length - 1, c: sel.c + Math.max(...grid.map((l) => l.length)) - 1 });
  }

  // ── CSV import / export ───────────────────────────────────────────────────
  function exportCSV() {
    const csv = toCSV(data.cells, computed, data.rows, data.cols);
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name.replace(/[^\w\- ]+/g, "").trim() || "sheet"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importCSV(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      // minimal CSV parse (handles quoted fields)
      const rows = [];
      let row = [], field = "", inQ = false;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQ) {
          if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
          else if (ch === '"') inQ = false;
          else field += ch;
        } else if (ch === '"') inQ = true;
        else if (ch === ",") { row.push(field); field = ""; }
        else if (ch === "\n" || ch === "\r") {
          if (ch === "\r" && text[i + 1] === "\n") i++;
          row.push(field); field = "";
          rows.push(row); row = [];
        } else field += ch;
      }
      if (field !== "" || row.length) { row.push(field); rows.push(row); }
      if (!rows.length) return;
      mutate((prev) => {
        const cells = {};
        rows.forEach((line, r) => line.forEach((val, c) => {
          if (val !== "") cells[refOf(c, r)] = { v: val };
        }));
        return {
          ...prev,
          cells,
          rows: Math.max(prev.rows, rows.length),
          cols: Math.max(prev.cols, Math.max(...rows.map((l) => l.length))),
        };
      });
    };
    reader.readAsText(file);
  }

  // ── keyboard ──────────────────────────────────────────────────────────────
  function onGridKeyDown(e) {
    if (editing || formulaDraft != null) return; // the inputs handle their own keys
    const meta = e.metaKey || e.ctrlKey;
    if (meta && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (meta && (e.key === "y" || e.key === "Y")) { e.preventDefault(); redo(); return; }
    if (meta && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      clearTimeout(saveTimer.current);
      doSave();
      return;
    }
    if (meta && (e.key === "a" || e.key === "A")) {
      e.preventDefault();
      setSel({ r: 0, c: 0 });
      setSelEnd({ r: data.rows - 1, c: data.cols - 1 });
      return;
    }
    if (meta) return; // let copy/cut/paste events fire
    switch (e.key) {
      case "ArrowUp": e.preventDefault(); moveSel(-1, 0, e.shiftKey); return;
      case "ArrowDown": e.preventDefault(); moveSel(1, 0, e.shiftKey); return;
      case "ArrowLeft": e.preventDefault(); moveSel(0, -1, e.shiftKey); return;
      case "ArrowRight": e.preventDefault(); moveSel(0, 1, e.shiftKey); return;
      case "Tab": e.preventDefault(); moveSel(0, e.shiftKey ? -1 : 1, false); return;
      case "Enter":
      case "Return": e.preventDefault(); startEdit(sel.r, sel.c); return;
      case "F2": e.preventDefault(); startEdit(sel.r, sel.c); return;
      case "Delete":
      case "Backspace": e.preventDefault(); clearRange(); return;
      case "Escape": setSelEnd(null); return;
      default:
        if (e.key.length === 1) {
          e.preventDefault();
          startEdit(sel.r, sel.c, e.key);
        }
    }
  }

  // focus the edit input when editing begins
  useEffect(() => {
    if (editing) {
      const el = editInputRef.current;
      if (el) {
        el.focus();
        if (!editing.replace) el.select();
      }
    }
  }, [editing?.r, editing?.c]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── column resize ─────────────────────────────────────────────────────────
  function startColResize(e, c) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = data.colWidths[c] || DEFAULT_COL_W;
    function onMove(ev) {
      const w = Math.max(MIN_COL_W, startW + (ev.clientX - startX));
      setData((prev) => ({ ...prev, colWidths: { ...prev.colWidths, [c]: w } }));
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setSaveState((s) => (s === "conflict" ? s : "dirty"));
      scheduleSave();
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ── mouse selection (click + drag) ────────────────────────────────────────
  const onCellMouseDown = useCallback((r, c, e) => {
    if (e.shiftKey) {
      setSelEnd({ r, c });
    } else {
      setSel({ r, c });
      setSelEnd(null);
      dragSelecting.current = true;
    }
    if (stateRef.current.editing) {
      const ed = stateRef.current.editing;
      setCell(ed.r, ed.c, ed.draft);
      setEditing(null);
    }
    gridRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setCell]);

  useEffect(() => {
    function onMove(e) {
      if (!dragSelecting.current) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const attr = el?.closest?.("[data-cell]")?.getAttribute("data-cell");
      if (attr) {
        const [r, c] = attr.split(":").map(Number);
        setSelEnd((prev) => (prev?.r === r && prev?.c === c ? prev : { r, c }));
      }
    }
    function onUp() {
      dragSelecting.current = false;
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // ── render ────────────────────────────────────────────────────────────────
  const selKey = refOf(sel.c, sel.r);
  const selRaw = editing
    ? editing.draft
    : formulaDraft != null
    ? formulaDraft
    : data.cells[selKey]?.v ?? "";

  const statusText =
    saveState === "saved"
      ? "All changes saved"
      : saveState === "saving"
      ? "Saving…"
      : saveState === "dirty"
      ? "Unsaved changes…"
      : saveState === "error"
      ? "Save failed — retrying…"
      : "";

  const colWidthOf = (c) => data.colWidths[c] || DEFAULT_COL_W;

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* ── top bar ── */}
      <div className="shrink-0 border-b border-gray-200 bg-white px-3 sm:px-4 py-2 dark:bg-gray-900 dark:border-gray-800">
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/sheets" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 whitespace-nowrap">
            ← Sheets
          </Link>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSaveState((s) => (s === "conflict" ? s : "dirty"));
              scheduleSave();
            }}
            className="font-semibold text-gray-900 dark:text-white bg-transparent border border-transparent hover:border-gray-200 focus:border-blue-500 focus:outline-none rounded px-2 py-1 text-sm min-w-[10rem] max-w-xs"
            aria-label="Sheet name"
          />
          <span
            className={`text-xs whitespace-nowrap ${
              saveState === "error" ? "text-red-600" : saveState === "saved" ? "text-gray-400" : "text-amber-600"
            }`}
          >
            {statusText}
          </span>
          {remoteNote && <span className="text-xs text-blue-600 dark:text-blue-400 whitespace-nowrap">{remoteNote}</span>}
          <span className="text-[11px] text-gray-400 hidden lg:inline whitespace-nowrap">
            Last save: {who(lastSavedBy.by)}
          </span>

          <div className="ml-auto flex items-center gap-1.5 flex-wrap">
            <ToolButton onClick={() => insertRow(sel.r)} title="Insert row above the selected row">＋ Row</ToolButton>
            <ToolButton onClick={() => deleteRow(sel.r)} title="Delete the selected row">－ Row</ToolButton>
            <ToolButton onClick={() => insertCol(sel.c)} title="Insert column left of the selected column">＋ Col</ToolButton>
            <ToolButton onClick={() => deleteCol(sel.c)} title="Delete the selected column">－ Col</ToolButton>
            <span className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1 hidden sm:block" />
            <label className="cursor-pointer">
              <span className="px-2.5 py-1.5 rounded-md border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 inline-block">
                Import CSV
              </span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f && window.confirm("Importing replaces everything currently in this sheet. Continue?")) importCSV(f);
                  e.target.value = "";
                }}
              />
            </label>
            <ToolButton onClick={exportCSV}>Export CSV</ToolButton>
          </div>
        </div>

        {/* formula bar */}
        <div className="mt-2 flex items-center gap-2">
          <span className="shrink-0 w-16 text-center text-xs font-mono text-gray-500 border border-gray-200 rounded-md py-1.5 bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400">
            {selKey}
          </span>
          <input
            value={selRaw}
            onChange={(e) => {
              if (editing) setEditing({ ...editing, draft: e.target.value });
              else setFormulaDraft(e.target.value);
            }}
            onFocus={() => {
              if (!editing && formulaDraft == null) setFormulaDraft(data.cells[selKey]?.v ?? "");
            }}
            onBlur={() => {
              if (formulaDraft != null) {
                setCell(sel.r, sel.c, formulaDraft);
                setFormulaDraft(null);
              }
            }}
            onKeyDown={(e) => {
              if (isEnterKey(e)) {
                e.preventDefault();
                if (editing) {
                  commitEdit({ dr: 1, dc: 0 });
                } else if (formulaDraft != null) {
                  setCell(sel.r, sel.c, formulaDraft);
                  setFormulaDraft(null);
                  moveSel(1, 0, false);
                }
                gridRef.current?.focus();
              } else if (e.key === "Escape") {
                setFormulaDraft(null);
                cancelEdit();
                gridRef.current?.focus();
              }
            }}
            placeholder="Type a value or =formula (SUM, AVERAGE, MIN, MAX, COUNT, ROUND, IF …)"
            className="flex-1 text-sm font-mono border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
            aria-label="Formula bar"
          />
        </div>
      </div>

      {/* ── conflict banner ── */}
      {saveState === "conflict" && (
        <div className="shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-3 flex-wrap text-sm text-amber-900 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-200">
          <span>
            {who(conflictSheet?.updated_by)} saved this sheet while you were editing. Load their version, or overwrite it
            with yours?
          </span>
          <button onClick={loadTheirs} className="px-3 py-1 rounded-md bg-amber-600 text-white text-xs font-medium hover:bg-amber-700">
            Load theirs (discard mine)
          </button>
          <button onClick={keepMine} className="px-3 py-1 rounded-md border border-amber-600 text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-900/40">
            Keep mine (overwrite)
          </button>
        </div>
      )}

      {/* ── grid ── */}
      <div
        ref={gridRef}
        tabIndex={0}
        onKeyDown={onGridKeyDown}
        onCopy={onCopy}
        onCut={onCut}
        onPaste={onPaste}
        className="flex-1 overflow-auto outline-none relative"
      >
        <div className="inline-block min-w-full">
          {/* header row */}
          <div className="flex sticky top-0 z-20">
            <div
              className="shrink-0 sticky left-0 z-30 bg-gray-100 border-b border-r border-gray-300 dark:bg-gray-800 dark:border-gray-700"
              style={{ width: 44, height: ROW_H }}
            />
            {Array.from({ length: data.cols }, (_, c) => (
              <div
                key={c}
                className={`shrink-0 relative flex items-center justify-center text-[11px] font-semibold border-b border-r select-none ${
                  c >= range.c1 && c <= range.c2
                    ? "bg-blue-100 text-blue-800 border-gray-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-gray-700"
                    : "bg-gray-100 text-gray-500 border-gray-300 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700"
                }`}
                style={{ width: colWidthOf(c), height: ROW_H }}
                onMouseDown={() => {
                  setSel({ r: 0, c });
                  setSelEnd({ r: data.rows - 1, c });
                  gridRef.current?.focus();
                }}
              >
                {colLabel(c)}
                <span
                  onMouseDown={(e) => startColResize(e, c)}
                  className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-400/60"
                />
              </div>
            ))}
          </div>

          {/* body */}
          {Array.from({ length: data.rows }, (_, r) => (
            <div key={r} className="flex">
              <div
                className={`shrink-0 sticky left-0 z-10 flex items-center justify-center text-[11px] border-b border-r select-none ${
                  r >= range.r1 && r <= range.r2
                    ? "bg-blue-100 text-blue-800 border-gray-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-gray-700"
                    : "bg-gray-100 text-gray-500 border-gray-300 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700"
                }`}
                style={{ width: 44, height: ROW_H }}
                onMouseDown={() => {
                  setSel({ r, c: 0 });
                  setSelEnd({ r, c: data.cols - 1 });
                  gridRef.current?.focus();
                }}
              >
                {r + 1}
              </div>
              {Array.from({ length: data.cols }, (_, c) => {
                const key = refOf(c, r);
                const isEditing = editing && editing.r === r && editing.c === c;
                if (isEditing) {
                  return (
                    <div key={c} className="shrink-0 relative z-20" style={{ width: colWidthOf(c), height: ROW_H }}>
                      <input
                        ref={editInputRef}
                        value={editing.draft}
                        onChange={(e) => setEditing({ ...editing, draft: e.target.value })}
                        onKeyDown={(e) => {
                          if (isEnterKey(e)) { e.preventDefault(); commitEdit({ dr: 1, dc: 0 }); }
                          else if (e.key === "Tab") { e.preventDefault(); commitEdit({ dr: 0, dc: e.shiftKey ? -1 : 1 }); }
                          else if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
                        }}
                        onBlur={() => commitEdit()}
                        className="absolute inset-0 w-full h-full px-1.5 text-[13px] font-mono border-2 border-blue-600 outline-none bg-white dark:bg-gray-900 dark:text-gray-100"
                      />
                    </div>
                  );
                }
                const cell = data.cells[key];
                const comp = computed.get(key);
                return (
                  <Cell
                    key={c}
                    r={r}
                    c={c}
                    display={comp?.display ?? cell?.v ?? ""}
                    isFormula={typeof cell?.v === "string" && cell.v.startsWith("=")}
                    selected={sel.r === r && sel.c === c}
                    inRange={selEnd != null && r >= range.r1 && r <= range.r2 && c >= range.c1 && c <= range.c2}
                    width={colWidthOf(c)}
                    onMouseDown={(e) => onCellMouseDown(r, c, e)}
                    onDoubleClick={() => startEdit(r, c)}
                  />
                );
              })}
            </div>
          ))}

          {/* grow controls */}
          <div className="flex gap-2 p-3">
            <ToolButton onClick={() => addRows(50)}>＋ 50 rows</ToolButton>
            <ToolButton onClick={() => addCols(5)}>＋ 5 columns</ToolButton>
          </div>
        </div>
      </div>

      {/* ── status bar ── */}
      <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-1.5 flex items-center gap-4 text-[11px] text-gray-500 dark:bg-gray-900 dark:border-gray-800 dark:text-gray-400">
        <span>
          {selEnd
            ? `${refOf(range.c1, range.r1)}:${refOf(range.c2, range.r2)}`
            : selKey}
        </span>
        <RangeStats computed={computed} range={range} hasRange={!!selEnd} />
        <span className="ml-auto hidden sm:inline">
          Autosaves online · Enter to edit · ⌘C/⌘V copy-paste · ⌘Z undo
        </span>
      </div>
    </div>
  );
}

function ToolButton({ onClick, title, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="px-2.5 py-1.5 rounded-md border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 whitespace-nowrap"
    >
      {children}
    </button>
  );
}

// Sum / average / count of the selected range — the little live readout
// Google Sheets shows bottom-right.
function RangeStats({ computed, range, hasRange }) {
  if (!hasRange) return null;
  const nums = [];
  let filled = 0;
  for (let r = range.r1; r <= range.r2; r++) {
    for (let c = range.c1; c <= range.c2; c++) {
      const d = computed.get(refOf(c, r))?.display;
      if (d != null && d !== "") {
        filled++;
        if (NUMERIC_RE.test(d)) nums.push(Number(d));
      }
    }
  }
  if (!filled) return null;
  const sum = nums.reduce((s, v) => s + v, 0);
  const fmt = (v) => (Math.round(v * 100) / 100).toLocaleString("en-IN");
  return (
    <span className="tabular-nums">
      {nums.length > 0 && (
        <>
          Sum {fmt(sum)} · Avg {fmt(sum / nums.length)} ·{" "}
        </>
      )}
      Count {filled}
    </span>
  );
}
