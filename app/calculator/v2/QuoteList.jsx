"use client";
// The quote: every item added from the calculator above, or pasted in as a list
// of bag sizes. One customer, one reference, one Save, and the two Excel files.
import { useEffect, useState } from "react";
import { Badge, Button, Card, Table, THead, TBody, TR, TH, TD } from "@/app/components/ui";
import { SIZE_ORDERS } from "./parseSizes";
import { inr } from "./ResultPanel";

const CONTROL = "h-10 w-full rounded border border-ink-200 bg-white px-3 text-sm text-ink-800 placeholder:text-ink-400 focus:border-royal-600 focus:outline-none focus:ring-1 focus:ring-royal-600";
const int = (n) => (n === null || n === undefined ? "–" : Number(n).toLocaleString("en-IN"));
const ROUTE = { handmade: "Hand-made", vendor: "Vendor", bought_in: "Bought in", converter: "Converter" };

/** The rate a line is quoted at: FOB on an export bag, otherwise the selling price. A blocked line has no rate. */
const quoted = (line, r) => (r?.lines && r.ok ? (line.spec.family === "bag" && r.export ? r.export.fob : r.sell) : null);

function PasteSizes({ onAdd, bagSummary }) {
  const [text, setText] = useState("");
  const [unit, setUnit] = useState("in");
  const [order, setOrder] = useState("WGH");
  const [report, setReport] = useState(null);

  function add() {
    const out = onAdd(text, { unit, order });
    setReport(out);
    if (out.added > 0 && out.skipped.length === 0) setText("");
  }

  return (
    <div className="border-t border-ink-200 bg-ink-50 px-5 py-5">
      <h3 className="text-sm font-semibold">Paste a list of bag sizes</h3>
      <p className="mt-1 max-w-3xl text-xs text-ink-600">
        One bag per line, straight from an RFQ sheet or a message. A name before the size is kept as the customer's reference. You can add a GSM (100gsm), a quantity, and a bag type (SOS, TH, flat).
        Everything else comes from the bag form above: {bagSummary}.
      </p>
      <textarea
        value={text} onChange={(e) => setText(e.target.value)} rows={6} spellCheck={false}
        placeholder={"Venus 10 x 5 x 13\nEarth 10 x 7 x 12\nSOS 6 x 4 x 12 60gsm 25000"}
        className="mt-3 block w-full rounded border border-ink-200 bg-white p-3 font-mono text-sm text-ink-800 placeholder:text-ink-400 focus:border-royal-600 focus:outline-none focus:ring-1 focus:ring-royal-600"
      />
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="block"><span className="mb-1 block text-xs font-medium text-ink-600">Sizes are in</span>
          <select value={unit} onChange={(e) => setUnit(e.target.value)} className={`${CONTROL} w-28`}><option value="in">inches</option><option value="cm">cm</option><option value="mm">mm</option></select></label>
        <label className="block"><span className="mb-1 block text-xs font-medium text-ink-600">Written as</span>
          <select value={order} onChange={(e) => setOrder(e.target.value)} className={`${CONTROL} w-64`}>{Object.entries(SIZE_ORDERS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
        <Button onClick={add} disabled={!text.trim()}>Add these bags</Button>
      </div>
      {report ? (
        <div className="mt-3 text-sm" role="status">
          {report.added > 0 ? <p className="text-green-800">Added {report.added} bag{report.added === 1 ? "" : "s"} to the quote.</p> : null}
          {report.skipped.length ? (
            <ul className="mt-1 space-y-1 text-amber-800">
              {report.skipped.map((s) => <li key={s.line}>Line {s.line} not added ({s.why}): <span className="font-mono">{s.text}</span></li>)}
            </ul>
          ) : null}
          {report.rateNotes?.length ? <p className="mt-1 text-xs text-ink-600">{report.rateNotes.join(" ")}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export default function QuoteList({ list, results, loading, onRemove, onEdit, onEditSpec, onClear, onPaste, bagSummary, meta, setMeta, opened, editingId, customers }) {
  const { customer, brand, notes } = meta;
  const setCustomer = (v) => setMeta((m) => ({ ...m, customer: v }));
  const setBrand = (v) => setMeta((m) => ({ ...m, brand: v }));
  const setNotes = (v) => setMeta((m) => ({ ...m, notes: v }));
  const [pasting, setPasting] = useState(false);
  const [history, setHistory] = useState(null); // what this customer was quoted before, per line

  // Look up the customer's earlier quotes once a name is typed and the list settles.
  const specsJson = JSON.stringify(list.map((l) => l.spec));
  useEffect(() => {
    const name = customer.trim();
    if (name.length < 2 || list.length === 0) {
      setHistory(null);
      return undefined;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch("/api/calc/v2/history", { method: "POST", headers: { "Content-Type": "application/json" }, body: `{"customer":${JSON.stringify(name)},"specs":${specsJson}}`, signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (!ctrl.signal.aborted) setHistory(d); })
        .catch(() => {});
    }, 500);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer, specsJson]);
  const day = (iso) => (iso ? String(iso).split("-").reverse().join("-") : "");
  const [busy, setBusy] = useState("");
  const [saved, setSaved] = useState(null); // { quoteRef, count, total, lineWarning } for the list as it stood
  const [error, setError] = useState(null); // { message, details }

  const priced = list.map((line, i) => ({ line, r: results[i] }));
  const blocked = priced.filter(({ r }) => r && (!r.lines || !r.ok));
  const ready = list.length > 0 && !loading && priced.every(({ r }) => r?.lines && r.ok);
  // A blank quantity is priced at the engine's default (the machine MOQ for bags).
  const qtyOf = (line, r) => r?.qty ?? line.spec.qty ?? null;
  const amountOf = (line, r) => {
    const rate = quoted(line, r);
    const qty = qtyOf(line, r);
    return rate && qty ? (Math.round(rate * 100) / 100) * qty : null;
  };
  const total = priced.reduce((s, { line, r }) => s + (amountOf(line, r) ?? 0), 0);
  const payload = () => ({ lines: list.map((l) => ({ spec: l.spec, ref: l.ref })), customer, brand, notes });
  // A saved reference only stands for the list exactly as it was saved.
  const savedRef = saved && saved.signature === JSON.stringify(payload().lines) ? saved.quoteRef : "";

  async function save() {
    setBusy("save");
    setError(null);
    try {
      const res = await fetch("/api/calc/v2/quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload()) });
      const out = await res.json();
      if (!out.ok) setError({ message: "The quote was not saved.", details: out.errors ?? [out.error ?? "Save failed"] });
      else setSaved({ quoteRef: out.quoteRef, count: out.count, total: out.saved?.total, lineWarning: out.lineWarning, signature: JSON.stringify(payload().lines) });
    } catch {
      setError({ message: "The quote was not saved. Check your connection and try again.", details: [] });
    } finally {
      setBusy("");
    }
  }

  async function excel(kind) {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch("/api/calc/v2/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload(), kind, quoteRef: savedRef }) });
      if (!res.ok) {
        const out = await res.json().catch(() => ({}));
        setError({ message: out.error ?? "Could not build the Excel file.", details: out.details ?? [] });
        return;
      }
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] ?? "Aeros Quote.xlsx";
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError({ message: "Could not build the Excel file. Check your connection and try again.", details: [] });
    } finally {
      setBusy("");
    }
  }

  return (
    <Card padded={false} className="mt-5 min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3 px-5 py-5">
        <div>
          <h2 className="text-base font-semibold">Quote</h2>
          <p className="mt-0.5 text-sm text-ink-600">
            {list.length === 0 ? "Add items from the calculator above, or paste a list of bag sizes." : `${list.length} item${list.length === 1 ? "" : "s"}${total ? `, ${inr(total, 0)} before GST and one-time charges` : ""}`}
          </p>
          {opened && list.length ? (
            <p className="mt-1 text-xs text-ink-600">
              Reopened from <span className="font-mono">{opened.quoteRef}</span>, saved {opened.date}. Prices are worked out again at today's rates; saving makes a new quote and leaves the old one as it was.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setPasting((v) => !v)} aria-expanded={pasting}>{pasting ? "Close the list box" : "Paste bag sizes"}</Button>
          {list.length ? <Button variant="tertiary" onClick={() => { onClear(); setSaved(null); setError(null); }}>Clear the quote</Button> : null}
        </div>
      </div>

      {pasting ? <PasteSizes onAdd={onPaste} bagSummary={bagSummary} /> : null}

      {list.length ? (
        <>
          <div className="overflow-x-auto border-t border-ink-200">
            <Table className="min-w-[760px]">
              <THead><TR><TH className="w-10">#</TH><TH className="w-44">Customer's reference</TH><TH>Item</TH><TH className="w-32 text-right">Quantity</TH><TH className="w-24 text-right">Rate</TH><TH className="w-32 text-right">Amount</TH><TH className="w-32" /></TR></THead>
              <TBody>
                {priced.map(({ line, r }, i) => {
                  const rate = quoted(line, r);
                  const cautions = r?.warnings?.filter((w) => w.level === "warn") ?? [];
                  const stop = r && (!r.lines ? r.errors?.[0] : !r.ok ? r.warnings.find((w) => w.level === "block")?.message : null);
                  return (
                    <TR key={line.id}>
                      <TD className="py-2 font-mono text-ink-400">{i + 1}</TD>
                      <TD className="py-2"><input aria-label={`Customer's reference for line ${i + 1}`} value={line.ref} onChange={(e) => onEdit(line.id, { ref: e.target.value })} placeholder="optional" className={`${CONTROL} h-9`} /></TD>
                      <TD className="py-2">
                        <span className="font-medium">{r?.title ?? "Working it out…"}</span>
                        {r?.route && ROUTE[r.route] ? <Badge variant="info" className="ml-2">{ROUTE[r.route]}</Badge> : null}
                        {r?.export ? <Badge className="ml-2">FOB</Badge> : null}
                        {stop ? <span className="mt-1 block text-xs text-red-700">{stop}</span> : null}
                        {!stop && cautions.length ? <span className="mt-1 block text-xs text-amber-800">{cautions.map((w) => w.message).join(" ")}</span> : null}
                        {line.note ? <span className="mt-1 block text-xs text-ink-400">{line.note}</span> : null}
                        {line.id === editingId ? <span className="mt-1 block text-xs font-medium text-royal-600">In the form above, being changed</span> : null}
                        {(() => {
                          const prev = history?.lines?.[i];
                          if (!prev || !rate) return null;
                          const now = Math.round(rate * 100) / 100;
                          // Arjun's rule: never quote higher than an earlier rate for the same item at the same or a larger quantity without a reason.
                          const higher = now > prev.rate + 0.004 && (qtyOf(line, r) ?? 0) >= (prev.qty ?? 0);
                          return (
                            <span className={`mt-1 block text-xs ${higher ? "font-medium text-amber-800" : "text-ink-600"}`}>
                              Last quoted to them: {inr(prev.rate)}{prev.qty ? ` at ${int(prev.qty)} pcs` : ""}, {day(prev.date)} ({prev.basis === "FOB" ? "FOB" : prev.basis === "DELIVERED_FOR" ? "delivered" : "ex-factory"}, {prev.quoteRef}).
                              {higher ? " Today's rate is higher: have a reason ready." : ""}
                            </span>
                          );
                        })()}
                      </TD>
                      <TD className="py-2 text-right">
                        <input type="number" inputMode="numeric" aria-label={`Quantity for line ${i + 1}`} value={line.spec.qty ?? ""} placeholder={r?.qty ? String(r.qty) : ""} onChange={(e) => onEdit(line.id, { qty: e.target.value })} className={`${CONTROL} h-9 text-right font-mono`} />
                      </TD>
                      <TD className="py-2 text-right font-mono">
                        {rate ? inr(rate) : "–"}
                        {line.saved && rate && Math.abs(Math.round(rate * 100) / 100 - line.saved.rate) >= 0.005 ? (
                          <span className={`block font-sans text-xs ${rate > line.saved.rate ? "text-amber-800" : "text-ink-400"}`}>was {inr(line.saved.rate)} when saved</span>
                        ) : null}
                      </TD>
                      <TD className="py-2 text-right font-mono">{amountOf(line, r) ? inr(amountOf(line, r), 0) : "–"}</TD>
                      <TD className="whitespace-nowrap py-2 text-right">
                        <button type="button" onClick={() => onEditSpec(line)} className="mr-3 text-sm font-medium text-royal-600 hover:text-royal-700" aria-label={`Change line ${i + 1}`}>Change</button>
                        <button type="button" onClick={() => onRemove(line.id)} className="text-sm text-ink-400 hover:text-red-600" aria-label={`Remove line ${i + 1}`}>Remove</button>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>

          <div className="border-t border-ink-200 px-5 py-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block"><span className="mb-1 block text-xs font-medium text-ink-600">Customer</span>
                <input value={customer} onChange={(e) => setCustomer(e.target.value)} list="calc-v2-customers" autoComplete="off" className={CONTROL} />
                <datalist id="calc-v2-customers">{customers.map((c) => <option key={c.name} value={c.name} />)}</datalist>
                {customer.trim().length >= 2 && history?.customer ? (
                  <span className="mt-1 block text-xs text-ink-400">
                    {history.customer.known ? (history.recent.length ? `Known customer, ${history.recent.length === 8 ? "8 or more" : history.recent.length} earlier quote line${history.recent.length === 1 ? "" : "s"} on record.` : "Known customer, nothing quoted to them on record yet.") : "A new name: it will be saved as typed."}
                  </span>
                ) : null}</label>
              <label className="block"><span className="mb-1 block text-xs font-medium text-ink-600">Brand, if different</span>
                <input value={brand} onChange={(e) => setBrand(e.target.value)} className={CONTROL} /></label>
              <label className="block"><span className="mb-1 block text-xs font-medium text-ink-600">Notes, internal</span>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} className={CONTROL} /></label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button onClick={save} loading={busy === "save"} disabled={!ready || Boolean(busy)}>Save quote</Button>
              <Button variant="secondary" onClick={() => excel("customer")} loading={busy === "customer"} disabled={!ready || Boolean(busy)}>Excel for the customer</Button>
              <Button variant="secondary" onClick={() => excel("internal")} loading={busy === "internal"} disabled={loading || Boolean(busy)}>Excel, internal working</Button>
              {savedRef ? <span className="font-mono text-sm text-green-800">Saved as {savedRef}</span> : null}
            </div>
            <p className="mt-2 text-xs text-ink-400">
              {blocked.length
                ? `${blocked.length} item${blocked.length === 1 ? " is" : "s are"} not priced or blocked. Fix or remove ${blocked.length === 1 ? "it" : "them"} to save the quote or make the customer's Excel.`
                : savedRef ? "The Excel files carry this reference." : "The customer's Excel has no cost, margin or supplier names. Save first to put the reference on it; unsaved, it says Draft."}
            </p>
            {saved?.lineWarning && savedRef ? <p className="mt-2 text-xs text-amber-800">{saved.lineWarning}</p> : null}
            {error ? (
              <div className="mt-3 rounded border-l-2 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {error.message}
                {error.details?.length ? <ul className="mt-1 list-disc pl-5">{error.details.map((d) => <li key={d}>{d}</li>)}</ul> : null}
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </Card>
  );
}
