"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Card } from "@/app/components/ui";
import BagForm from "./forms/BagForm";
import CupForm from "./forms/CupForm";
import BoxForm from "./forms/BoxForm";
import ResultPanel from "./ResultPanel";
import QuoteList from "./QuoteList";
import { parseSizes } from "./parseSizes";
import { BAG_INITIAL, CUP_INITIAL, BOX_INITIAL, bagSpec, cupSpec, boxSpec, num } from "./specs";

let nextLineId = 1;
const newLine = (spec, ref = "", note = "") => ({ id: nextLineId++, spec, ref, note });

const FAMILIES = [
  { key: "bag", label: "Paper bags", hint: "SOS, twisted and flat handle, V-bottom" },
  { key: "cup", label: "Cups and tubs", hint: "Single wall, double wall, Ø115 tubs" },
  { key: "box", label: "Boxes and cartons", hint: "Cup holders, food boxes, cake and tuck boxes" },
];

export default function QuoteStudio() {
  const [family, setFamily] = useState("bag");
  const [bag, setBag] = useState(BAG_INITIAL);
  const [cup, setCup] = useState(CUP_INITIAL);
  const [box, setBox] = useState(BOX_INITIAL);
  const [meta, setMeta] = useState({ papers: [], rates: [] });
  const [metaError, setMetaError] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  // The quote being built: lines added from the calculator or pasted in.
  const [list, setList] = useState([]);
  const [listResults, setListResults] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [added, setAdded] = useState(null);

  // Paper catalogue and rate book.
  useEffect(() => {
    fetch("/api/calc/v2/meta")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Could not load rates (${r.status})`))))
      .then((m) => {
        setMeta(m);
        // Start on a real paper so the first screen shows a real price.
        const p = m.papers.find((x) => /jodhani/i.test(x.supplier) && x.gsm === 90 && x.bf === 28) ?? m.papers.find((x) => x.colour === "brown");
        if (p) setBag((s) => (s.paperRate ? s : { ...s, paperId: p.id, gsm: String(p.gsm), paperRate: String(p.landed), colour: p.colour, supplier: p.supplier, paperLabel: p.label }));
      })
      .catch((e) => setMetaError(e.message));
  }, []);

  const rateOf = useMemo(() => {
    const map = Object.fromEntries(meta.rates.map((r) => [r.key, r.value]));
    return (key) => map[key];
  }, [meta.rates]);

  const spec = useMemo(
    () => (family === "bag" ? bagSpec(bag) : family === "cup" ? cupSpec(cup) : boxSpec(box)),
    [family, bag, cup, box],
  );
  const specJson = JSON.stringify(spec);

  // Price on the server, a beat after the last keystroke. The moment the spec
  // changes, the price on screen is stale: it is marked so (Save is held) and
  // any request in flight is cancelled, so an old answer can never land on top
  // of a newer spec or on another product's tab.
  const inFlight = useRef(null);
  useEffect(() => {
    setAdded(null);
    setLoading(true);
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/calc/v2/price", { method: "POST", headers: { "Content-Type": "application/json" }, body: `{"spec":${specJson}}`, signal: ctrl.signal });
        const out = await res.json();
        if (!ctrl.signal.aborted) setResult(out);
      } catch (e) {
        if (e.name !== "AbortError") setResult({ errors: ["Could not reach the pricing service. Check your connection and try again."] });
      } finally {
        if (inFlight.current === ctrl) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [specJson]);

  // Re-price the whole quote on the server whenever a line changes.
  const listJson = JSON.stringify(list.map((l) => l.spec));
  useEffect(() => {
    if (list.length === 0) {
      setListResults([]);
      setListLoading(false);
      return undefined;
    }
    setListLoading(true);
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/calc/v2/price", { method: "POST", headers: { "Content-Type": "application/json" }, body: `{"specs":${listJson}}`, signal: ctrl.signal });
        const out = await res.json();
        if (!ctrl.signal.aborted) {
          setListResults(out.results ?? []);
          setListLoading(false);
        }
      } catch (e) {
        if (e.name !== "AbortError") setListLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listJson]);

  function addCurrent() {
    setList((l) => [...l, newLine(spec)]);
    setAdded(list.length + 1);
  }

  const editLine = (id, patch) =>
    setList((l) => l.map((line) => (line.id !== id ? line
      : "qty" in patch ? { ...line, spec: { ...line.spec, qty: num(patch.qty) } } : { ...line, ...patch })));

  // Pasted bag sizes take everything but size, GSM, quantity and type from the
  // bag form. Paper is priced per GSM, so a line at another GSM looks up the
  // same mill and grade at that GSM; if the paper master has no such row, the
  // form's rate is kept and the line says so.
  function pasteSizes(text, opts) {
    const { rows, skipped } = parseSizes(text, opts);
    const chosen = meta.papers.find((p) => p.id === bag.paperId);
    let fallback = 0;
    const lines = rows.map((row) => {
      const type = row.type ?? bag.type;
      const state = { ...bag, unit: "mm", W: String(row.W), G: String(row.G), H: String(row.H), type, handleKind: type === bag.type ? bag.handleKind : "", qty: row.qty ? String(row.qty) : bag.qty };
      let note = "";
      if (row.gsm && String(row.gsm) !== String(bag.gsm)) {
        state.gsm = String(row.gsm);
        const match = chosen && meta.papers.find((p) => p.supplier === chosen.supplier && p.type === chosen.type && (p.bf ?? null) === (chosen.bf ?? null) && p.gsm === row.gsm);
        if (match) Object.assign(state, { paperId: match.id, paperRate: String(match.landed), paperLabel: match.label });
        else if (!(chosen && chosen.gsm === null)) {
          fallback += 1;
          note = `Paper rate ₹${bag.paperRate}/kg is the form's rate: check it for ${row.gsm} GSM.`;
        }
      }
      return newLine(bagSpec(state), row.ref, note);
    });
    setList((l) => [...l, ...lines]);
    return { added: lines.length, skipped, rateNotes: fallback ? [`${fallback} line${fallback === 1 ? " uses" : "s use"} the form's paper rate at a different GSM. Check those rates.`] : [] };
  }

  const bagSummary = `${bag.paperLabel || `${bag.colour} kraft`} at ₹${bag.paperRate || "?"}/kg, ${bag.gsm} GSM, ${bag.slab === "none" ? "plain" : "printed"}, ${Number(bag.qty || 15000).toLocaleString("en-IN")} pcs each`;

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-6 text-ink-800">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Quote calculator</h1>
          <p className="mt-1 text-sm text-ink-600">Costs the way the quotes are worked: packing in every rate, plates and setup outside it.</p>
        </div>
        <nav className="flex gap-4 text-sm">
          <Link href="/calculator/v2/rates" className="font-medium text-royal-600 hover:text-royal-700">Rate book</Link>
          <Link href="/calculator" className="text-ink-600 hover:text-ink-800">Old calculators</Link>
        </nav>
      </div>

      <div role="tablist" aria-label="Product" className="mt-5 grid gap-px overflow-hidden rounded-md border border-ink-200 bg-ink-200 sm:grid-cols-3">
        {FAMILIES.map((f) => {
          const on = f.key === family;
          return (
            <button key={f.key} role="tab" aria-selected={on} onClick={() => { setFamily(f.key); setResult(null); }}
              className={`px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-royal-600 ${on ? "bg-ink-800 text-white" : "bg-white hover:bg-ink-50"}`}>
              <span className="block text-sm font-semibold">{f.label}</span>
              <span className={`block text-xs ${on ? "text-ink-200" : "text-ink-400"}`}>{f.hint}</span>
            </button>
          );
        })}
      </div>

      {metaError ? <p className="mt-4 rounded border-l-2 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-700">{metaError}</p> : null}

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <Card padded={false} className="min-w-0">
          {family === "bag" ? <BagForm s={bag} set={(p) => setBag((s) => ({ ...s, ...p }))} papers={meta.papers} /> : null}
          {family === "cup" ? <CupForm s={cup} set={(p) => setCup((s) => ({ ...s, ...p }))} rateOf={rateOf} /> : null}
          {family === "box" ? <BoxForm s={box} set={(p) => setBox((s) => ({ ...s, ...p }))} rateOf={rateOf} /> : null}
        </Card>
        <Card padded={false} className="min-w-0 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto" aria-live="polite">
          <ResultPanel result={result} loading={loading} onAdd={addCurrent} added={added} family={family} />
        </Card>
      </div>

      <QuoteList
        list={list} results={listResults} loading={listLoading} bagSummary={bagSummary}
        onRemove={(id) => setList((l) => l.filter((x) => x.id !== id))} onEdit={editLine} onClear={() => setList([])} onPaste={pasteSizes}
      />
    </div>
  );
}
