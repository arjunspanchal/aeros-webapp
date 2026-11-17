// Team Sheets grid engine — pure JS, runs in the browser (and node).
// Cell values are raw strings; a leading "=" makes a formula. Supported:
//   arithmetic  + - * / ^  parentheses, unary minus, % suffix
//   comparison  = <> < <= > >=      text  "..." literals and & concat
//   refs        A1, $B$2, ranges A1:C10
//   functions   SUM AVERAGE AVG MIN MAX COUNT COUNTA ROUND ABS IF
// Circular references resolve to #CYCLE, bad formulas to #ERROR.

// ── column labels ──────────────────────────────────────────────────────────
export function colLabel(n) {
  // 0 → A, 25 → Z, 26 → AA …
  let s = "";
  n = Math.floor(n);
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

export function colIndex(label) {
  let n = 0;
  for (const ch of label.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function refOf(c, r) {
  return `${colLabel(c)}${r + 1}`;
}

const REF_RE = /^\$?([A-Z]{1,3})\$?(\d{1,7})$/;

export function parseRef(s) {
  const m = REF_RE.exec(s.toUpperCase());
  if (!m) return null;
  return { c: colIndex(m[1]), r: Number(m[2]) - 1 };
}

// ── raw value classification ───────────────────────────────────────────────
const NUM_RE = /^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

function rawToValue(raw) {
  if (raw == null || raw === "") return null;
  const t = String(raw).trim();
  if (NUM_RE.test(t)) return Number(t);
  return String(raw);
}

// ── tokenizer ──────────────────────────────────────────────────────────────
function tokenize(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === " " || ch === "\t") { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < src.length && /[0-9.eE]/.test(src[j])) {
        // allow 1e-5 / 1e+5
        if ((src[j] === "e" || src[j] === "E") && (src[j + 1] === "-" || src[j + 1] === "+")) j++;
        j++;
      }
      toks.push({ t: "num", v: Number(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (ch === '"') {
      let j = i + 1, out = "";
      while (j < src.length && src[j] !== '"') { out += src[j]; j++; }
      toks.push({ t: "str", v: out });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_$.]/.test(src[j])) j++;
      let word = src.slice(i, j);
      i = j;
      // range?  A1:B3
      if (src[i] === ":" && REF_RE.test(word)) {
        let k = i + 1, w2 = "";
        while (k < src.length && /[A-Za-z0-9$]/.test(src[k])) { w2 += src[k]; k++; }
        if (REF_RE.test(w2)) {
          toks.push({ t: "range", a: word, b: w2 });
          i = k;
          continue;
        }
      }
      if (REF_RE.test(word)) toks.push({ t: "ref", v: word });
      else toks.push({ t: "name", v: word.toUpperCase() });
      continue;
    }
    if (ch === "<" && src[i + 1] === ">") { toks.push({ t: "op", v: "<>" }); i += 2; continue; }
    if ((ch === "<" || ch === ">") && src[i + 1] === "=") { toks.push({ t: "op", v: ch + "=" }); i += 2; continue; }
    if ("+-*/^()=,&<>%".includes(ch)) { toks.push({ t: "op", v: ch }); i++; continue; }
    throw new Error(`bad char ${ch}`);
  }
  return toks;
}

// ── parser / evaluator ─────────────────────────────────────────────────────
// ctx: { get(refKey) → number|string|null, getRange(a,b) → raw values[] }
function evalFormula(src, ctx) {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const eat = () => toks[p++];
  const expectOp = (v) => {
    const t = eat();
    if (!t || t.t !== "op" || t.v !== v) throw new Error(`expected ${v}`);
  };

  function num(v) {
    if (v == null || v === "") return 0;
    if (typeof v === "number") return v;
    if (typeof v === "boolean") return v ? 1 : 0;
    const n = Number(String(v).trim());
    if (Number.isNaN(n)) throw new Error("not a number");
    return n;
  }

  function flatten(args) {
    // spreads range arrays into a flat list of raw cell values
    const out = [];
    for (const a of args) {
      if (Array.isArray(a)) out.push(...a);
      else out.push(a);
    }
    return out;
  }

  const FNS = {
    SUM: (args) => flatten(args).reduce((s, v) => s + (typeof v === "number" ? v : (v == null || v === "" || Number.isNaN(Number(v)) ? 0 : Number(v))), 0),
    AVERAGE: (args) => {
      const nums = flatten(args).filter((v) => typeof v === "number" || (v != null && v !== "" && !Number.isNaN(Number(v)))).map(Number);
      if (!nums.length) throw new Error("#DIV/0");
      return nums.reduce((s, v) => s + v, 0) / nums.length;
    },
    MIN: (args) => {
      const nums = flatten(args).filter((v) => typeof v === "number" || (v != null && v !== "" && !Number.isNaN(Number(v)))).map(Number);
      return nums.length ? Math.min(...nums) : 0;
    },
    MAX: (args) => {
      const nums = flatten(args).filter((v) => typeof v === "number" || (v != null && v !== "" && !Number.isNaN(Number(v)))).map(Number);
      return nums.length ? Math.max(...nums) : 0;
    },
    COUNT: (args) => flatten(args).filter((v) => typeof v === "number" || (v != null && v !== "" && !Number.isNaN(Number(v)))).length,
    COUNTA: (args) => flatten(args).filter((v) => v != null && v !== "").length,
    ROUND: (args) => {
      const x = num(args[0]);
      const d = args.length > 1 ? num(args[1]) : 0;
      const f = Math.pow(10, d);
      return Math.round(x * f) / f;
    },
    ABS: (args) => Math.abs(num(args[0])),
    IF: (args) => {
      const cond = args[0];
      const truthy = typeof cond === "number" ? cond !== 0 : !!cond;
      return truthy ? (args.length > 1 ? args[1] : true) : (args.length > 2 ? args[2] : false);
    },
  };
  FNS.AVG = FNS.AVERAGE;

  function atom() {
    const t = eat();
    if (!t) throw new Error("unexpected end");
    if (t.t === "num") return t.v;
    if (t.t === "str") return t.v;
    if (t.t === "ref") return ctx.get(t.v.replace(/\$/g, ""));
    if (t.t === "range") return ctx.getRange(t.a.replace(/\$/g, ""), t.b.replace(/\$/g, ""));
    if (t.t === "name") {
      if (t.v === "TRUE") return true;
      if (t.v === "FALSE") return false;
      const fn = FNS[t.v];
      if (!fn) throw new Error(`unknown fn ${t.v}`);
      expectOp("(");
      const args = [];
      if (!(peek()?.t === "op" && peek().v === ")")) {
        args.push(cmp());
        while (peek()?.t === "op" && peek().v === ",") { eat(); args.push(cmp()); }
      }
      expectOp(")");
      return fn(args);
    }
    if (t.t === "op" && t.v === "(") {
      const v = cmp();
      expectOp(")");
      return v;
    }
    if (t.t === "op" && (t.v === "-" || t.v === "+")) {
      const v = atom();
      return t.v === "-" ? -num(v) : num(v);
    }
    throw new Error("unexpected token");
  }

  function postfix() {
    let v = atom();
    while (peek()?.t === "op" && peek().v === "%") { eat(); v = num(v) / 100; }
    return v;
  }

  function pow() {
    let v = postfix();
    if (peek()?.t === "op" && peek().v === "^") {
      eat();
      return Math.pow(num(v), num(pow()));
    }
    return v;
  }

  function mul() {
    let v = pow();
    while (peek()?.t === "op" && (peek().v === "*" || peek().v === "/")) {
      const op = eat().v;
      const r = pow();
      if (op === "/") {
        const d = num(r);
        if (d === 0) throw new Error("#DIV/0");
        v = num(v) / d;
      } else {
        v = num(v) * num(r);
      }
    }
    return v;
  }

  function add() {
    let v = mul();
    while (peek()?.t === "op" && (peek().v === "+" || peek().v === "-" || peek().v === "&")) {
      const op = eat().v;
      const r = mul();
      if (op === "&") v = `${v ?? ""}${r ?? ""}`;
      else v = op === "+" ? num(v) + num(r) : num(v) - num(r);
    }
    return v;
  }

  function cmp() {
    let v = add();
    while (peek()?.t === "op" && ["=", "<>", "<", "<=", ">", ">="].includes(peek().v)) {
      const op = eat().v;
      const r = add();
      const a = typeof v === "string" && typeof r === "string" ? v : Number(v ?? 0);
      const b = typeof v === "string" && typeof r === "string" ? r : Number(r ?? 0);
      if (op === "=") v = a === b;
      else if (op === "<>") v = a !== b;
      else if (op === "<") v = a < b;
      else if (op === "<=") v = a <= b;
      else if (op === ">") v = a > b;
      else v = a >= b;
    }
    return v;
  }

  const out = cmp();
  if (p < toks.length) throw new Error("trailing tokens");
  return out;
}

// ── whole-sheet evaluation with memo + cycle detection ─────────────────────
// cells: { "A1": { v: "raw" } } → returns Map key → { value, display, error }
export function computeSheet(cells) {
  const memo = new Map();
  const visiting = new Set();

  function rawAt(key) {
    return cells[key]?.v ?? "";
  }

  function valueAt(key) {
    if (memo.has(key)) {
      const m = memo.get(key);
      if (m.error) throw new Error(m.error);
      return m.value;
    }
    if (visiting.has(key)) {
      memo.set(key, { value: null, display: "#CYCLE", error: "#CYCLE" });
      throw new Error("#CYCLE");
    }
    const raw = rawAt(key);
    if (typeof raw === "string" && raw.startsWith("=")) {
      visiting.add(key);
      try {
        const v = evalFormula(raw.slice(1), ctx);
        const value = typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : v;
        memo.set(key, { value, display: displayOf(value), error: null });
        return value;
      } catch (e) {
        const err = /#(CYCLE|DIV\/0)/.test(e.message) ? e.message.match(/#(CYCLE|DIV\/0)/)[0] : "#ERROR";
        if (!memo.has(key) || !memo.get(key).error) {
          memo.set(key, { value: null, display: err, error: err });
        }
        throw e;
      } finally {
        visiting.delete(key);
      }
    }
    const value = rawToValue(raw);
    memo.set(key, { value, display: displayOf(value), error: null });
    return value;
  }

  function displayOf(v) {
    if (v == null) return "";
    if (typeof v === "number") {
      if (!Number.isFinite(v)) return "#ERROR";
      // trim float noise: 0.30000000000000004 → 0.3
      const rounded = Math.round(v * 1e10) / 1e10;
      return String(rounded);
    }
    return String(v);
  }

  const ctx = {
    get(refKey) {
      return valueAt(refKey);
    },
    getRange(a, b) {
      const ra = parseRef(a);
      const rb = parseRef(b);
      if (!ra || !rb) throw new Error("#REF");
      const out = [];
      for (let r = Math.min(ra.r, rb.r); r <= Math.max(ra.r, rb.r); r++) {
        for (let c = Math.min(ra.c, rb.c); c <= Math.max(ra.c, rb.c); c++) {
          try {
            out.push(valueAt(refOf(c, r)));
          } catch {
            out.push(null); // an error cell inside a range counts as empty
          }
        }
      }
      return out;
    },
  };

  for (const key of Object.keys(cells)) {
    try {
      valueAt(key);
    } catch {
      /* error already memoised */
    }
  }
  return memo;
}

// ── structural edits: insert / delete rows & columns ───────────────────────
// Shifts both the cell map keys and any cell references inside formulas.
// axis: "row" | "col".  index: 0-based position of the insert/delete.
// delta: +1 (insert one) or -1 (delete one). Refs pointing INTO a deleted
// row/col become #REF! so the mistake is visible instead of silent.
const FORMULA_REF_RE = /(\$?)([A-Z]{1,3})(\$?)(\d{1,7})/g;

export function shiftFormula(text, axis, index, delta) {
  return text.replace(FORMULA_REF_RE, (all, d1, colStr, d2, rowStr) => {
    let c = colIndex(colStr);
    let r = Number(rowStr) - 1;
    const pos = axis === "row" ? r : c;
    if (delta < 0 && pos === index) return "#REF!";
    if (pos >= index) {
      if (axis === "row") r += delta;
      else c += delta;
    }
    if (r < 0 || c < 0) return "#REF!";
    return `${d1}${colLabel(c)}${d2}${r + 1}`;
  });
}

export function shiftCells(cells, axis, index, delta) {
  const out = {};
  for (const [key, cell] of Object.entries(cells)) {
    const ref = parseRef(key);
    if (!ref) continue;
    const pos = axis === "row" ? ref.r : ref.c;
    if (delta < 0 && pos === index) continue; // deleted
    let { c, r } = ref;
    if (pos >= index) {
      if (axis === "row") r += delta;
      else c += delta;
    }
    let v = cell.v;
    if (typeof v === "string" && v.startsWith("=")) {
      v = "=" + shiftFormula(v.slice(1), axis, index, delta);
    }
    out[refOf(c, r)] = { ...cell, v };
  }
  return out;
}

// ── clipboard helpers ──────────────────────────────────────────────────────
export function rangeToTSV(cells, computed, r1, c1, r2, c2, { computedValues = false } = {}) {
  const lines = [];
  for (let r = r1; r <= r2; r++) {
    const row = [];
    for (let c = c1; c <= c2; c++) {
      const key = refOf(c, r);
      if (computedValues) row.push(computed.get(key)?.display ?? "");
      else row.push(cells[key]?.v ?? "");
    }
    lines.push(row.join("\t"));
  }
  return lines.join("\n");
}

export function parseClipboard(text) {
  // returns rows[][] — handles both TSV (Excel/Sheets) and single values
  const t = text.replace(/\r\n?/g, "\n");
  const body = t.endsWith("\n") ? t.slice(0, -1) : t;
  return body.split("\n").map((line) => line.split("\t"));
}

export function toCSV(cells, computed, rows, cols) {
  const esc = (s) => {
    const t = String(s ?? "");
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const lines = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      row.push(esc(computed.get(refOf(c, r))?.display ?? ""));
    }
    lines.push(row.join(","));
  }
  // drop trailing all-empty lines
  while (lines.length && /^,*$/.test(lines[lines.length - 1])) lines.pop();
  return lines.join("\n");
}
