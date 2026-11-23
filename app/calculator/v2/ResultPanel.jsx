"use client";
import { useState } from "react";
import { Badge, Button, Table, THead, TBody, TR, TH, TD } from "@/app/components/ui";
import { marginFor, MARGIN_MODES } from "@/lib/quote-engine/core/pricing.js";
import { num } from "./specs";

export const inr = (n, dp = 2) => (n === null || n === undefined || Number.isNaN(n) ? "–" : `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`);
const int = (n) => (n === null || n === undefined ? "–" : Number(n).toLocaleString("en-IN"));
// Every number on this panel goes through a formatter that survives a missing value.
const fix = (n, dp = 4) => (typeof n === "number" && Number.isFinite(n) ? n.toFixed(dp) : "–");
const FCL_NOTE = "Rates are for full container loads; part loads cost more.";
const BASIS = { EXW_BHIWANDI: "ex-factory", FOB: "FOB" };
const UNIT = { bag: "bag", cup: "pc", box: "pc" };

const STATUS = {
  assumed: { variant: "warning", label: "Assumed" },
  disputed: { variant: "danger", label: "Disputed" },
  override: { variant: "info", label: "Set for this quote" },
};
const LEVEL = {
  block: "border-red-600 bg-red-50 text-red-700",
  warn: "border-amber-500 bg-amber-50 text-amber-800",
  info: "border-ink-200 bg-ink-50 text-ink-600",
};

function Block({ title, aside, children }) {
  return (
    <section className="min-w-0 overflow-x-auto border-t border-ink-200 px-5 py-5">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold text-ink-800">{title}</h3>
        {aside ? <span className="text-xs text-ink-400">{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}

const Fact = ({ label, value }) => (
  <div className="min-w-0">
    <dt className="text-xs text-ink-400">{label}</dt>
    <dd className="truncate font-mono text-sm text-ink-800">{value}</dd>
  </div>
);

function facts(r) {
  const g = r.geometry ?? {};
  const out = [];
  if (r.family === "bag") {
    out.push(["Deckle", `${g.deckle} mm`], ["Cut-off", `${g.cutoff} mm`], ["Paper per bag", `${fix(g.paperG, 2)} g`], ["Bag weight", `${fix(g.bagG, 1)} g`], ["Reel to order", `${g.reel?.min}–${g.reel?.max} mm`]);
    if (g.envelope) out.push(["Machine tube", `${Math.round(g.envelope.tube)} mm (min ${Math.round(g.envelope.minTube)})`], ["Forming plate", g.envelope.plate.stocked ? "In stock" : `Not held; nearest ${g.envelope.plate.nearest} mm`]);
  } else if (r.family === "cup" && g.paperG) {
    out.push(["Paper bought", `${fix(g.paperG, 2)} g`], ["Basis", g.dieNote], ["Cost per kg of paper", inr(g.perKgOfPaper)]);
  } else if (r.family === "box") {
    out.push(["Board per piece", `${fix(g.boardG, 2)} g`], ["Pieces per sheet", g.ups ?? "–"], ["Sheet used", g.utilisation ? `${Math.round(g.utilisation * 100)}%` : "–"], ["Sheets to print", int(g.sheets)], ["Sheets to buy", int(g.sheetsToBuy)], ["Board to buy", g.boardKg ? `${int(Math.round(g.boardKg))} kg` : "–"]);
  }
  const p = r.packing;
  if (p?.casePack) out.push(["Case pack", int(p.casePack)]);
  if (p?.carton) out.push(["Carton (inside)", `${p.carton.w} × ${p.carton.l} × ${p.carton.h} mm`], ["Case weight", `${fix(p.grossKg, 1)} kg gross`]);
  if (p?.baled) out.push(["Packed in", "Bales, no carton"]);
  return out;
}

/** The working as a Markdown table, for pasting into chat or a note. */
function toMarkdown(r) {
  const unit = UNIT[r.family];
  const rows = [`**${r.title}**`, "", `| Line | Basis | ₹/${unit} |`, "|---|---|--:|"];
  for (const l of r.lines) rows.push(`| ${l.label} | ${l.basis ?? ""} | ${fix(l.value)} |`);
  rows.push(`| **Cost** | | **${fix(r.cost, 2)}** |`, `| **Sell** (${r.marginPct}% ${MARGIN_MODES[r.marginMode].label}) | | **${fix(r.sellRounded, 2)}** |`);
  if (r.family === "bag" && r.export) rows.push(`| **FOB** | port charges ÷ ${int(r.export.unitsPerContainer)} bags | **${fix(r.export.fob, 2)}** |`);
  if (r.oneTime?.length) rows.push("", "One-time, outside the rate: " + r.oneTime.map((o) => `${o.label} ${o.value === null ? "at actuals" : inr(o.value, 0)}`).join(" · "));
  rows.push("", `${r.export ? "FOB" : "Ex-factory"}, GST extra. ${FCL_NOTE}`);
  return rows.join("\n");
}

export default function ResultPanel({ result, loading, onSave, saving, saved, family }) {
  const [target, setTarget] = useState("");
  const [customer, setCustomer] = useState("");
  const [brand, setBrand] = useState("");
  const [notes, setNotes] = useState("");
  const [copied, setCopied] = useState(false);

  // A result for another product (mid tab-switch) is not this tab's result.
  if (!result || (result.family && result.family !== family)) {
    return <div className="px-5 py-10 text-sm text-ink-400">{loading ? "Working it out…" : "Fill in the spec to see the cost."}</div>;
  }

  if (!result.lines) {
    return (
      <div className="px-5 py-6">
        <h2 className="text-sm font-semibold text-ink-800">{result.title ?? "Not priced yet"}</h2>
        <ul className="mt-3 space-y-2">
          {(result.errors ?? []).map((e) => <li key={e} className={`rounded border-l-2 px-3 py-2 text-sm ${LEVEL.warn}`}>{e}</li>)}
        </ul>
      </div>
    );
  }

  const unit = UNIT[family];
  const mode = MARGIN_MODES[result.marginMode];
  const t = num(target);
  const targetMargin = t ? marginFor(result.cost, t, result.marginMode) : null;
  const flagged = result.ratesUsed.filter((u) => STATUS[u.status]);
  const exp = result.export;

  return (
    <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
      <header className="px-5 py-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-ink-800">{result.title}</h2>
          {result.route === "vendor" ? <Badge variant="warning">Vendor-made</Badge> : null}
          {result.route === "bought_in" ? <Badge variant="info">Bought in{result.source ? `: ${result.source}` : ""}</Badge> : null}
          {result.route === "converter" ? <Badge variant="info">Outside converter</Badge> : null}
          {!result.ok ? <Badge variant="danger">Cannot be made as specified</Badge> : null}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-ink-400">Cost per {unit}</dt>
            <dd className="font-mono text-2xl text-ink-800">{inr(result.cost)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-400">Sell per {unit}</dt>
            <dd className="font-mono text-2xl font-semibold text-royal-600">{inr(result.sellRounded)}</dd>
            <dd className="mt-0.5 text-xs text-ink-400">{result.marginPct}% {mode.label}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-400">{result.qty ? `Order of ${int(result.qty)}` : "Per case"}</dt>
            <dd className="font-mono text-2xl text-ink-800">{result.qty ? inr(result.sellRounded * result.qty, 0) : inr(result.packing?.perCase, 0)}</dd>
            <dd className="mt-0.5 text-xs text-ink-400">{family === "cup" && exp ? "FOB" : "Ex-factory"}, GST extra</dd>
          </div>
        </dl>
        {exp ? (
          <p className="mt-3 rounded bg-ink-50 px-3 py-2 font-mono text-sm text-ink-800">
            {family === "bag"
              ? <>FOB {inr(exp.fob)} per bag · ${fix(exp.fobUsdPerCase, 2)} per case FOB · ${fix(exp.exwUsdPerCase, 2)} ex-factory · {int(Math.floor(exp.casesPerContainer))} cases per 40HC at ₹{exp.fx}</>
              : <>The price above is FOB: port charges are inside it · ${fix(exp.usdPer1000, 2)} per 1,000 · ${fix(exp.usdPerCase, 2)} per case at ₹{exp.fx}</>}
          </p>
        ) : null}
        <p className="mt-2 text-xs text-ink-400">{FCL_NOTE}</p>
        {result.warnings.length ? (
          <ul className="mt-4 space-y-2">
            {result.warnings.map((w) => <li key={w.code} className={`rounded border-l-2 px-3 py-2 text-sm ${LEVEL[w.level]}`}>{w.message}</li>)}
          </ul>
        ) : null}
      </header>

      <Block title="Cost build-up" aside={`₹ per ${unit}`}>
        <Table>
          <TBody>
            {result.lines.map((l) => (
              <TR key={l.key}>
                <TD className="py-2">{l.label}<span className="block text-xs text-ink-400">{l.basis}</span></TD>
                <TD className="w-16 py-2 text-right font-mono text-xs text-ink-400">{result.cost ? `${Math.round((l.value / result.cost) * 100)}%` : ""}</TD>
                <TD className="w-24 py-2 text-right font-mono">{fix(l.value)}</TD>
              </TR>
            ))}
            <TR><TD className="py-2 font-semibold" colSpan={2}>Cost</TD><TD className="py-2 text-right font-mono font-semibold">{fix(result.cost)}</TD></TR>
          </TBody>
        </Table>
        <div className="mt-3 flex items-end gap-3">
          <label className="block w-44">
            <span className="mb-1 block text-xs font-medium text-ink-600">Customer's target price</span>
            <input type="number" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder={`₹ per ${unit}`}
              className="h-10 w-full rounded border border-ink-200 px-3 font-mono text-sm focus:border-royal-600 focus:outline-none focus:ring-1 focus:ring-royal-600" />
          </label>
          {targetMargin !== null ? (
            <p className={`pb-2 text-sm ${targetMargin < 0 ? "text-red-700" : "text-ink-800"}`}>
              {targetMargin < 0 ? `Below cost by ${inr(result.cost - t)}` : `${fix(targetMargin, 1)}% ${mode.label}, ${inr(t - result.cost)} per ${unit}`}
            </p>
          ) : null}
        </div>
      </Block>

      {result.oneTime?.length ? (
        <Block title="One-time charges" aside="Billed once, never inside the rate">
          <Table>
            <TBody>
              {result.oneTime.map((o) => (
                <TR key={o.key}>
                  <TD className="py-2">{o.label}<span className="block text-xs text-ink-400">{o.note}</span></TD>
                  <TD className="py-2 text-right">{STATUS[o.status] ? <Badge variant={STATUS[o.status].variant}>{STATUS[o.status].label}</Badge> : null}</TD>
                  <TD className="w-28 py-2 text-right font-mono">{o.value === null ? "At actuals" : inr(o.value, 0)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Block>
      ) : null}

      {result.ladder?.length ? (
        <Block title="Quantity ladder">
          <Table>
            <THead><TR><TH>Quantity</TH><TH className="text-right">Rate</TH><TH className="text-right">Order value</TH><TH className="text-right">Cases</TH><TH className="text-right">One-time per {unit}</TH></TR></THead>
            <TBody>
              {result.ladder.map((row) => (
                <TR key={row.qty}>
                  <TD className="py-2 font-mono">{int(row.qty)}{row.belowMoq ? <span className="ml-2 font-sans text-xs text-amber-800">under MOQ</span> : null}{row.underMin ? <span className="ml-2 font-sans text-xs text-ink-400">under 1,000 sheets</span> : null}</TD>
                  <TD className="py-2 text-right font-mono">{inr(row.sellRounded)}</TD>
                  <TD className="py-2 text-right font-mono">{inr(row.orderValue, 0)}</TD>
                  <TD className="py-2 text-right font-mono">{int(row.cases)}</TD>
                  <TD className="py-2 text-right font-mono text-ink-400">{inr(row.oneTimePerBag ?? row.oneTimePerUnit ?? row.oneTimePerPc)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {result.sellOptions ? <p className="mt-2 text-xs text-ink-400">At {result.sellOptions.map((o) => `${o.marginPct}%: ${inr(o.sell)}`).join(" · ")}</p> : null}
        </Block>
      ) : null}

      <Block title="Production facts">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">{facts(result).map(([label, value]) => <Fact key={label} label={label} value={value} />)}</dl>
      </Block>

      {flagged.length ? (
        <Block title="Rates to confirm" aside="Used in this price">
          <ul className="space-y-2">
            {flagged.map((u) => (
              <li key={u.key} className="flex items-start justify-between gap-3 text-sm">
                <span className="min-w-0 text-ink-800"><span className="font-mono text-xs text-ink-400">{u.key}</span><span className="block text-xs text-ink-400">{u.source}</span></span>
                <span className="flex shrink-0 items-center gap-2"><span className="font-mono">{u.value} {u.unit}</span><Badge variant={STATUS[u.status].variant}>{STATUS[u.status].label}</Badge></span>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      <Block title="Save this quote" aside="Saved with the spec and every rate used">
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="mb-1 block text-xs font-medium text-ink-600">Customer</span>
            <input value={customer} onChange={(e) => setCustomer(e.target.value)} className="h-10 w-full rounded border border-ink-200 px-3 text-sm focus:border-royal-600 focus:outline-none focus:ring-1 focus:ring-royal-600" /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-ink-600">Brand, if different</span>
            <input value={brand} onChange={(e) => setBrand(e.target.value)} className="h-10 w-full rounded border border-ink-200 px-3 text-sm focus:border-royal-600 focus:outline-none focus:ring-1 focus:ring-royal-600" /></label>
          <label className="col-span-2 block"><span className="mb-1 block text-xs font-medium text-ink-600">Notes</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-10 w-full rounded border border-ink-200 px-3 text-sm focus:border-royal-600 focus:outline-none focus:ring-1 focus:ring-royal-600" /></label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {/* Held while a re-price is in flight, so what is saved is what is on screen. */}
          <Button onClick={() => onSave({ customer, brand, notes })} loading={saving} disabled={!result.ok || loading}>Save quote</Button>
          <Button variant="secondary" onClick={async () => { await navigator.clipboard.writeText(toMarkdown(result)); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
            {copied ? "Copied" : "Copy working"}
          </Button>
          {saved?.quoteRef ? <span className="font-mono text-sm text-green-800">Saved as {saved.quoteRef}{saved.rate !== undefined ? ` at ${inr(saved.rate)} ${BASIS[saved.basis] ?? ""}` : ""}</span> : null}
          {saved?.error ? <span className="text-sm text-red-700">{saved.error}</span> : null}
        </div>
        {saved?.lineWarning ? <p className="mt-2 text-xs text-amber-800">{saved.lineWarning}</p> : null}
        {!result.ok ? <p className="mt-2 text-xs text-ink-400">Fix the red item above before saving.</p> : null}
      </Block>
    </div>
  );
}
