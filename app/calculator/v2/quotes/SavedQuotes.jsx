"use client";
// Every quote saved from the calculator, newest first. Opening one puts its
// lines back on the quote list, re-priced at today's rates.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Card, EmptyState, Table, THead, TBody, TR, TH, TD } from "@/app/components/ui";
import { StaffPreviewBanner } from "../ViewAsStaff";

const inr0 = (n) => `₹${Math.round(Number(n)).toLocaleString("en-IN")}`;
const FAMILY = { bag: "Bags", cup: "Cups and tubs", box: "Boxes", wrap: "Wrap paper", pp: "PP items" };
const day = (iso) => (iso ? iso.split("-").reverse().join("-") : "");

export default function SavedQuotes({ previewing = false }) {
  const [quotes, setQuotes] = useState(null);
  const [error, setError] = useState("");
  const [find, setFind] = useState("");

  useEffect(() => {
    fetch("/api/calc/v2/quotes")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Could not load saved quotes (${r.status})`))))
      .then((d) => setQuotes(d.quotes))
      .catch((e) => setError(e.message));
  }, []);

  const shown = useMemo(() => {
    const q = find.trim().toLowerCase();
    if (!q) return quotes ?? [];
    return (quotes ?? []).filter((x) => [x.customer, x.brand, x.quoteRef, x.by, x.notes, ...x.items.map((i) => i.title)].some((v) => String(v || "").toLowerCase().includes(q)));
  }, [quotes, find]);

  return (
    <>
    {previewing ? <StaffPreviewBanner /> : null}
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 text-ink-800">
      <Link href="/calculator/v2" className="text-sm text-ink-600 hover:text-ink-800">← Quote calculator</Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Saved quotes</h1>
          <p className="mt-1 text-sm text-ink-600">Quotes saved from the calculator. Open one to change it, re-price it at today's rates or make its Excel again.</p>
        </div>
        <label className="block w-full sm:w-72">
          <span className="mb-1 block text-xs font-medium text-ink-600">Find by customer, item or reference</span>
          <input value={find} onChange={(e) => setFind(e.target.value)} className="h-10 w-full rounded border border-ink-200 bg-white px-3 text-sm focus:border-royal-600 focus:outline-none focus:ring-1 focus:ring-royal-600" />
        </label>
      </div>
      {error ? <p className="mt-4 rounded border-l-2 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p> : null}

      {quotes === null && !error ? <p className="mt-8 text-sm text-ink-400">Loading…</p> : null}
      {quotes !== null && shown.length === 0 ? (
        <div className="mt-8">
          <EmptyState title={find ? "No saved quote matches that" : "No quotes saved yet"} description={find ? "Try part of the customer's name or the item." : "Build a quote in the calculator and press Save quote. It will be listed here."} />
        </div>
      ) : null}

      {shown.length ? (
        <Card padded={false} className="mt-5 overflow-x-auto">
          <Table className="min-w-[760px]">
            <THead><TR><TH className="w-28">Date</TH><TH>Customer</TH><TH>Items</TH><TH className="w-32 text-right">Value</TH><TH className="w-36">Saved by</TH><TH className="w-20" /></TR></THead>
            <TBody>
              {shown.map((q) => (
                <TR key={q.key ?? q.quoteRef}>
                  <TD className="py-3 font-mono text-xs">{day(q.date)}</TD>
                  <TD className="py-3">
                    <span className="font-medium">{q.customer || "No customer named"}</span>
                    {q.brand && q.brand !== q.customer ? <span className="text-ink-600"> · {q.brand}</span> : null}
                    <span className="block font-mono text-xs text-ink-400">{q.legacy ? "From the earlier calculator" : q.quoteRef}</span>
                  </TD>
                  <TD className="py-3">
                    {q.items[0]?.title}
                    {q.legacy && q.items[0]?.rate ? <span className="text-ink-600"> · ₹{q.items[0].rate}{q.items[0].qty ? ` at ${Number(q.items[0].qty).toLocaleString("en-IN")} pcs` : ""}</span> : null}
                    {q.lines > 1 ? <span className="text-ink-600"> and {q.lines - 1} more</span> : null}
                    <span className="mt-1 block">{q.families.map((f) => <Badge key={f} className="mr-1">{FAMILY[f] ?? f}</Badge>)}</span>
                    {q.notes ? <span className="mt-1 block text-xs text-ink-400">{q.notes}</span> : null}
                  </TD>
                  <TD className="py-3 text-right font-mono">{q.total ? inr0(q.total) : "–"}</TD>
                  <TD className="py-3 text-sm text-ink-600">{q.by}</TD>
                  <TD className="py-3 text-right">
                    {q.canOpen === false
                      ? <span className="text-xs text-ink-400">{q.legacy ? "Record only" : "Priced by admin"}</span>
                      : <Link href={`/calculator/v2?quote=${encodeURIComponent(q.quoteRef)}`} className="text-sm font-medium text-royal-600 hover:text-royal-700">Open</Link>}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      ) : null}
    </div>
    </>
  );
}
