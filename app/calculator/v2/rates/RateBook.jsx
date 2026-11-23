"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, Table, THead, TBody, TR, TH, TD } from "@/app/components/ui";

const FAMILY = { bag: "Paper bags", cup: "Cups and tubs", box: "Boxes and cartons", corrugated: "Corrugated", export: "Export", traded: "Bought-in items" };
const STATUS = { confirmed: ["success", "Confirmed"], assumed: ["warning", "Assumed"], disputed: ["danger", "Disputed"] };

export default function RateBook() {
  const [rates, setRates] = useState([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [edit, setEdit] = useState(null); // { key, value, status, source }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/calc/v2/rates")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Could not load the rate book (${r.status})`))))
      .then((d) => setRates(d.rates))
      .catch((e) => setError(e.message));
  }, []);

  async function put(body) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/calc/v2/rates", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not save the rate");
      setRates(d.rates);
      setEdit(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const groups = useMemo(() => {
    const shown = rates.filter((r) => filter === "all" || (filter === "open" ? r.status !== "confirmed" : r.overridden));
    return Object.entries(FAMILY).map(([key, label]) => [label, shown.filter((r) => r.family === key)]).filter(([, list]) => list.length);
  }, [rates, filter]);
  const open = rates.filter((r) => r.status !== "confirmed").length;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 text-ink-800">
      <Link href="/calculator/v2" className="text-sm text-ink-600 hover:text-ink-800">← Quote calculator</Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Rate book</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-600">
        Every rate the calculator uses. Change one here and the next quote uses it, with no code change. Paper ₹/kg lives in the paper master, not here.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {[["all", `All (${rates.length})`], ["open", `To confirm (${open})`], ["changed", "Changed here"]].map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)} aria-pressed={filter === key}
            className={`h-9 rounded border px-3 text-sm ${filter === key ? "border-ink-800 bg-ink-800 text-white" : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50"}`}>{label}</button>
        ))}
      </div>
      {error ? <p className="mt-4 rounded border-l-2 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      {groups.map(([label, list]) => (
        <Card key={label} padded={false} className="mt-5 overflow-x-auto">
          <h2 className="px-4 pb-1 pt-4 text-sm font-semibold">{label}</h2>
          <Table>
            <THead><TR><TH>Rate</TH><TH className="text-right">Value</TH><TH>Status</TH><TH /></TR></THead>
            <TBody>
              {list.map((r) => {
                const editing = edit?.key === r.key;
                const [variant, text] = STATUS[r.status];
                return (
                  <TR key={r.key}>
                    <TD className="py-2">
                      <span className="font-mono text-xs">{r.key}</span>
                      {editing
                        ? <input value={edit.source} onChange={(e) => setEdit({ ...edit, source: e.target.value })} placeholder="Where this rate comes from (bill, vendor, date)"
                            className="mt-1 block h-9 w-full rounded border border-ink-200 px-2 text-sm focus:border-royal-600 focus:outline-none focus:ring-1 focus:ring-royal-600" />
                        : <span className="block text-xs text-ink-400">{r.source}</span>}
                    </TD>
                    <TD className="whitespace-nowrap py-2 text-right font-mono">
                      {editing
                        ? <input type="number" autoFocus value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })}
                            className="h-9 w-28 rounded border border-ink-200 px-2 text-right font-mono text-sm focus:border-royal-600 focus:outline-none focus:ring-1 focus:ring-royal-600" />
                        : r.value}
                      <span className="ml-1.5 font-sans text-xs text-ink-400">{r.unit}</span>
                      {r.overridden && !editing ? <span className="block font-sans text-xs text-ink-400">was {r.defaultValue}</span> : null}
                    </TD>
                    <TD className="py-2">
                      {editing
                        ? <select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })} className="h-9 rounded border border-ink-200 px-2 text-sm">
                            {Object.entries(STATUS).map(([k, [, t]]) => <option key={k} value={k}>{t}</option>)}
                          </select>
                        : <Badge variant={variant}>{text}</Badge>}
                    </TD>
                    <TD className="whitespace-nowrap py-2 text-right">
                      {editing ? (
                        <span className="inline-flex gap-2">
                          <Button size="sm" loading={busy} onClick={() => put({ key: r.key, value: edit.value, status: edit.status, source: edit.source })}>Save</Button>
                          <Button size="sm" variant="tertiary" onClick={() => setEdit(null)}>Cancel</Button>
                        </span>
                      ) : (
                        <span className="inline-flex gap-2">
                          <Button size="sm" variant="secondary" onClick={() => setEdit({ key: r.key, value: String(r.value), status: r.status === "disputed" ? "confirmed" : r.status, source: "" })}>Change</Button>
                          {r.overridden ? <Button size="sm" variant="tertiary" disabled={busy} onClick={() => put({ key: r.key, reset: true })}>Undo</Button> : null}
                        </span>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      ))}
    </div>
  );
}
