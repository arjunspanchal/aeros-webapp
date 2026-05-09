"use client";
// Unified historical-quote table for the rate-cards "Past Quotes" tab.
// Renders bag + cup quotes side by side with type-aware columns flattened
// by lib/rate-cards/quote-history.js. Search box matches across ref / brand
// / product / spec / client; admin gets a Client column with filterable
// values, client view drops it.

import { useMemo, useState } from "react";
import { Card, inputCls } from "@/app/calculator/_components/ui";

const TYPE_LABEL = { bag: "Paper Bag", cup: "Paper Cup" };
const TYPE_COLOUR = {
  bag: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  cup: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
};

function formatINR(v) {
  if (v === null || v === undefined) return "—";
  return `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatQty(v) {
  if (v === null || v === undefined) return "—";
  return Number(v).toLocaleString("en-IN");
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function QuoteHistory({ quotes, isAdmin }) {
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return quotes.filter((x) => {
      if (typeFilter && x.type !== typeFilter) return false;
      if (!needle) return true;
      return [x.quoteRef, x.brand, x.productLabel, x.specLine, x.clientEmail, x.notes]
        .filter(Boolean).some((s) => String(s).toLowerCase().includes(needle));
    });
  }, [quotes, q, typeFilter]);

  if (quotes.length === 0) {
    return (
      <Card>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {isAdmin
            ? "No quotes saved yet across any calculator."
            : "No quotes have been saved for your account yet. Once your account manager runs a quote in the calculator, it'll appear here automatically."}
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          className={`${inputCls} flex-1`}
          placeholder="Search by ref, brand, product, spec…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className={`${inputCls} sm:w-48`}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">All types</option>
          <option value="bag">Paper Bag</option>
          <option value="cup">Paper Cup</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 uppercase border-b border-gray-100 dark:text-gray-500 dark:border-gray-800">
              <th className="text-left pb-2 font-medium">Date</th>
              <th className="text-left pb-2 font-medium">Type</th>
              <th className="text-left pb-2 font-medium">Ref · Brand</th>
              <th className="text-left pb-2 font-medium">Product · Spec</th>
              {isAdmin && <th className="text-left pb-2 font-medium">Client</th>}
              <th className="text-right pb-2 font-medium">Qty</th>
              <th className="text-right pb-2 font-medium">Rate</th>
              <th className="text-right pb-2 font-medium">Order Total</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((quote) => (
              <tr key={quote.id} className="border-b border-gray-50 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800">
                <td className="py-2 text-gray-500 text-xs dark:text-gray-400 whitespace-nowrap">{formatDate(quote.date)}</td>
                <td className="py-2">
                  <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full ${TYPE_COLOUR[quote.type] || "bg-gray-100 text-gray-600"}`}>
                    {TYPE_LABEL[quote.type] || quote.type}
                  </span>
                </td>
                <td className="py-2">
                  <div className="font-medium text-gray-900 dark:text-gray-100">{quote.quoteRef || "—"}</div>
                  {quote.brand && <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{quote.brand}</div>}
                </td>
                <td className="py-2">
                  <div className="text-gray-700 dark:text-gray-200">{quote.productLabel}</div>
                  {quote.specLine && <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{quote.specLine}</div>}
                  {quote.plainPrinted && <div className="text-[11px] text-gray-400 dark:text-gray-500">{quote.plainPrinted}</div>}
                </td>
                {isAdmin && (
                  <td className="py-2 text-gray-500 text-xs dark:text-gray-400 break-all">{quote.clientEmail || "—"}</td>
                )}
                <td className="py-2 text-right text-gray-700 dark:text-gray-200">{formatQty(quote.orderQty)}</td>
                <td className="py-2 text-right text-gray-700 dark:text-gray-200">{formatINR(quote.sellingPrice)}</td>
                <td className="py-2 text-right font-medium text-gray-900 dark:text-gray-100">{formatINR(quote.orderTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4 dark:text-gray-500">No matches.</p>
      )}
      <p className="text-xs text-gray-400 mt-4 dark:text-gray-500">
        {filtered.length} of {quotes.length} {quotes.length === 1 ? "quote" : "quotes"} shown.
        {isAdmin ? " Pivot to a single client by typing their email in the search box." : ""}
      </p>
    </Card>
  );
}
