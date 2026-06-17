"use client";
// Payouts — vendor payment tracker. Accountants (Aarti, Kadambari) add a
// payout (vendor from the shared directory + amount + due date + optional
// note), then mark it paid when the money goes out. The page rolls those up
// into a per-week summary (done vs pending) and a month calendar so nothing
// slips past its due date.

import Link from "next/link";
import { useMemo, useState, useCallback } from "react";

// ─── date helpers (all local-time, YYYY-MM-DD strings) ──────────────────────
function pad(n) { return String(n).padStart(2, "0"); }
function fmtYmd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function todayYmd() { return fmtYmd(new Date()); }
function parseYmd(s) {
  if (!s) return null;
  const [y, m, d] = String(s).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
// Monday-anchored start of week.
function startOfWeek(d) {
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - dow);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }

const inr0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
function money(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? inr0.format(v) : inr2.format(v);
}
// Amount already paid against a payout (running total of installments).
function outstandingPaid(p) { return Math.max(0, Number(p.amountPaid) || 0); }
// Amount still owed = total − paid (never below zero).
function outstandingOf(p) {
  if (p.outstanding != null) return Math.max(0, Number(p.outstanding) || 0);
  return Math.max(0, (Number(p.amount) || 0) - outstandingPaid(p));
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function weekLabel(start) {
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const s = `${start.getDate()} ${MONTHS[start.getMonth()].slice(0, 3)}`;
  const e = sameMonth ? `${end.getDate()} ${MONTHS[end.getMonth()].slice(0, 3)}` : `${end.getDate()} ${MONTHS[end.getMonth()].slice(0, 3)}`;
  return `${s} – ${e}`;
}

const NEW_VENDOR = "__new__";

const inputCls =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:focus:ring-blue-400";
const labelCls = "block text-xs font-medium text-gray-500 mb-1 dark:text-gray-400";

export default function PayoutsClient({ initialPayouts = [], initialVendors = [], currentEmail = "" }) {
  const [payouts, setPayouts] = useState(initialPayouts);
  const [vendors, setVendors] = useState(initialVendors);
  const [view, setView] = useState("list"); // 'list' | 'calendar'
  const [filter, setFilter] = useState("all"); // 'all' | 'pending' | 'paid'
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const [busyId, setBusyId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState("");

  const today = todayYmd();

  // ─── derived: overall + per-week summaries ────────────────────────────────
  const summary = useMemo(() => {
    let pending = 0, paid = 0, overdue = 0, overdueCount = 0, pendingCount = 0, paidCount = 0;
    for (const p of payouts) {
      paid += outstandingPaid(p);                 // money actually paid so far
      const out = outstandingOf(p);               // money still owed
      if (p.status === "paid") { paidCount++; }
      else if (out > 0) {
        pending += out; pendingCount++;
        if (p.dueDate && p.dueDate < today) { overdue += out; overdueCount++; }
      }
    }
    return { pending, paid, overdue, overdueCount, pendingCount, paidCount, total: payouts.length };
  }, [payouts, today]);

  const weeks = useMemo(() => {
    const map = new Map();
    for (const p of payouts) {
      const d = parseYmd(p.dueDate);
      if (!d) continue;
      const ws = startOfWeek(d);
      const key = fmtYmd(ws);
      if (!map.has(key)) {
        map.set(key, { key, start: ws, end: addDays(ws, 6), total: 0, paid: 0, pending: 0, pendingCount: 0, paidCount: 0 });
      }
      const w = map.get(key);
      w.total += p.amount;
      w.paid += outstandingPaid(p);
      const out = outstandingOf(p);
      if (out > 0) { w.pending += out; }
      if (p.status === "paid") { w.paidCount++; } else { w.pendingCount++; }
    }
    return [...map.values()].sort((a, b) => a.start - b.start);
  }, [payouts]);

  const thisWeekKey = fmtYmd(startOfWeek(new Date()));

  const visiblePayouts = useMemo(() => {
    // "Pending" covers anything not fully settled — includes partial.
    const arr =
      filter === "all" ? payouts
      : filter === "paid" ? payouts.filter((p) => p.status === "paid")
      : payouts.filter((p) => p.status !== "paid");
    // Open first (soonest due at top), then paid (most recent due first).
    return [...arr].sort((a, b) => {
      const aOpen = a.status !== "paid", bOpen = b.status !== "paid";
      if (aOpen !== bOpen) return aOpen ? -1 : 1;
      const da = a.dueDate || "", db = b.dueDate || "";
      return aOpen ? da.localeCompare(db) : db.localeCompare(da);
    });
  }, [payouts, filter]);

  // ─── mutations ────────────────────────────────────────────────────────────
  const upsertLocal = useCallback((p) => {
    setPayouts((prev) => {
      const i = prev.findIndex((x) => x.id === p.id);
      if (i === -1) return [...prev, p];
      const next = [...prev]; next[i] = p; return next;
    });
  }, []);

  async function handleAdd(draft) {
    setError("");
    let vendorId = draft.vendorId;
    let vendorName = draft.vendorName;
    try {
      // New vendor → create in the shared directory first, then reuse its id.
      if (vendorId === NEW_VENDOR) {
        const r = await fetch("/api/payouts/vendors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: draft.newVendorName }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Could not add vendor");
        setVendors((prev) => (prev.some((v) => v.id === j.vendor.id) ? prev : [...prev, j.vendor].sort((a, b) => a.name.localeCompare(b.name))));
        vendorId = j.vendor.id;
        vendorName = j.vendor.name;
      }
      const r = await fetch("/api/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId, vendorName, amount: draft.amount, dueDate: draft.dueDate, note: draft.note }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not add payout");
      upsertLocal(j.payout);
      return true;
    } catch (e) {
      setError(e.message || "Failed");
      return false;
    }
  }

  async function togglePaid(p) {
    setBusyId(p.id);
    setError("");
    try {
      const r = await fetch(`/api/payouts/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paid: p.status !== "paid" }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      upsertLocal(j.payout);
    } catch (e) {
      setError(e.message || "Failed");
    } finally {
      setBusyId(null);
    }
  }

  // Record a partial payment (installment). `amount` is what was just paid;
  // the server caps it at the outstanding balance and re-derives status.
  async function recordPayment(p, amount) {
    setBusyId(p.id);
    setError("");
    try {
      const r = await fetch(`/api/payouts/${p.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      upsertLocal(j.payout);
      return true;
    } catch (e) {
      setError(e.message || "Failed");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function saveEdit(id, patch) {
    setBusyId(id);
    setError("");
    try {
      const r = await fetch(`/api/payouts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      upsertLocal(j.payout);
      setEditId(null);
    } catch (e) {
      setError(e.message || "Failed");
    } finally {
      setBusyId(null);
    }
  }

  async function removePayout(id) {
    if (!window.confirm("Delete this payout? This can't be undone.")) return;
    setBusyId(id);
    setError("");
    try {
      const r = await fetch(`/api/payouts/${id}`, { method: "DELETE" });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || "Failed"); }
      setPayouts((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      setError(e.message || "Failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/hub" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400">
          ← Hub
        </Link>

        <div className="mt-4 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Payouts</h1>
            <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
              Vendor payments — amount, due date, and what&apos;s done vs still pending.
            </p>
          </div>
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 dark:bg-gray-900 dark:border-gray-800">
            {["list", "calendar"].map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-sm rounded-md capitalize transition-colors ${
                  view === v ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
            {error}
          </div>
        )}

        {/* ── Summary cards ── */}
        <section className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Pending" value={money(summary.pending)} sub={`${summary.pendingCount} payout${summary.pendingCount === 1 ? "" : "s"}`} tone="amber" />
          <StatCard label="Overdue" value={money(summary.overdue)} sub={summary.overdueCount ? `${summary.overdueCount} past due` : "Nothing overdue"} tone={summary.overdueCount ? "red" : "gray"} />
          <StatCard label="Paid" value={money(summary.paid)} sub={`${summary.paidCount} cleared`} tone="emerald" />
          <StatCard label="Total tracked" value={String(summary.total)} sub="all payouts" tone="sky" />
        </section>

        {/* ── Add payout ── */}
        <AddPayoutForm vendors={vendors} onAdd={handleAdd} />

        {/* ── Per-week summary ── */}
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">By week</h2>
          <div className="mt-2 overflow-x-auto rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                  <th className="py-2 px-3 font-medium">Week</th>
                  <th className="py-2 px-3 font-medium text-right">Due total</th>
                  <th className="py-2 px-3 font-medium text-right">Pending</th>
                  <th className="py-2 px-3 font-medium text-right">Paid</th>
                  <th className="py-2 px-3 font-medium text-right">Items</th>
                </tr>
              </thead>
              <tbody>
                {weeks.length === 0 && (
                  <tr><td colSpan={5} className="py-6 text-center text-gray-400 dark:text-gray-500">No payouts yet.</td></tr>
                )}
                {weeks.map((w) => {
                  const isThis = w.key === thisWeekKey;
                  return (
                    <tr key={w.key} className={`border-b border-gray-50 dark:border-gray-800/50 ${isThis ? "bg-blue-50/60 dark:bg-blue-900/10" : ""}`}>
                      <td className="py-2 px-3">
                        <span className="font-medium text-gray-900 dark:text-gray-100">{weekLabel(w.start)}</span>
                        {isThis && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">This week</span>}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-700 dark:text-gray-300">{money(w.total)}</td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {w.pending > 0 ? <span className="text-amber-700 dark:text-amber-400 font-medium">{money(w.pending)}</span> : <span className="text-gray-300 dark:text-gray-600">—</span>}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {w.paid > 0 ? <span className="text-emerald-700 dark:text-emerald-400">{money(w.paid)}</span> : <span className="text-gray-300 dark:text-gray-600">—</span>}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-500 dark:text-gray-400">
                        {w.pendingCount + w.paidCount}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── List / calendar ── */}
        {view === "list" ? (
          <section className="mt-8">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">All payouts</h2>
              <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs dark:bg-gray-900 dark:border-gray-800">
                {[["all", "All"], ["pending", "Pending"], ["paid", "Paid"]].map(([v, lbl]) => (
                  <button
                    key={v}
                    onClick={() => setFilter(v)}
                    className={`px-3 py-1 rounded-md transition-colors ${filter === v ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900" : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"}`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {visiblePayouts.length === 0 && (
                <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-400 dark:bg-gray-900 dark:border-gray-800 dark:text-gray-500">
                  Nothing here yet. Add a payout above.
                </div>
              )}
              {visiblePayouts.map((p) => (
                <PayoutRow
                  key={p.id}
                  p={p}
                  today={today}
                  vendors={vendors}
                  busy={busyId === p.id}
                  editing={editId === p.id}
                  onEdit={() => setEditId(p.id)}
                  onCancelEdit={() => setEditId(null)}
                  onSaveEdit={(patch) => saveEdit(p.id, patch)}
                  onToggle={() => togglePaid(p)}
                  onRecordPayment={(amt) => recordPayment(p, amt)}
                  onDelete={() => removePayout(p.id)}
                />
              ))}
            </div>
          </section>
        ) : (
          <CalendarView
            payouts={payouts}
            monthCursor={monthCursor}
            setMonthCursor={setMonthCursor}
            today={today}
            onToggle={togglePaid}
          />
        )}
      </main>
    </div>
  );
}

// ─── Add form ───────────────────────────────────────────────────────────────
function AddPayoutForm({ vendors, onAdd }) {
  const [vendorId, setVendorId] = useState("");
  const [newVendorName, setNewVendorName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(todayYmd());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const vendorName = vendors.find((v) => v.id === vendorId)?.name || "";
  const valid =
    (vendorId === NEW_VENDOR ? newVendorName.trim() : vendorId) &&
    Number(amount) > 0 &&
    dueDate;

  async function submit(e) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    const ok = await onAdd({ vendorId, vendorName, newVendorName: newVendorName.trim(), amount, dueDate, note });
    setBusy(false);
    if (ok) {
      setVendorId(""); setNewVendorName(""); setAmount(""); setNote(""); setDueDate(todayYmd());
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-gray-200 bg-white p-4 sm:p-5 dark:bg-gray-900 dark:border-gray-800">
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Add a payout</h2>
      <form onSubmit={submit} className="mt-3 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
        <div className="sm:col-span-4">
          <label className={labelCls}>Vendor</label>
          <select className={inputCls} value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
            <option value="">Select vendor…</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.name}{v.type ? ` · ${v.type}` : ""}</option>
            ))}
            <option value={NEW_VENDOR}>+ Add new vendor…</option>
          </select>
          {vendorId === NEW_VENDOR && (
            <input
              className={`${inputCls} mt-2`}
              placeholder="New vendor name"
              value={newVendorName}
              onChange={(e) => setNewVendorName(e.target.value)}
              autoFocus
            />
          )}
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Amount (₹)</label>
          <input
            className={`${inputCls} tabular-nums`}
            type="number" min="0" step="0.01" inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Due date</label>
          <input className={inputCls} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div className="sm:col-span-3">
          <label className={labelCls}>Note (optional)</label>
          <input className={inputCls} placeholder="e.g. PO-231 printing balance" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="sm:col-span-1">
          <button
            type="submit"
            disabled={!valid || busy}
            className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? "…" : "Add"}
          </button>
        </div>
      </form>
    </section>
  );
}

// ─── A single payout row (view + inline edit) ───────────────────────────────
function PayoutRow({ p, today, vendors, busy, editing, onEdit, onCancelEdit, onSaveEdit, onToggle, onRecordPayment, onDelete }) {
  const open = p.status !== "paid";
  const overdue = open && p.dueDate && p.dueDate < today;
  const dueToday = open && p.dueDate === today;
  const paid = p.status === "paid";
  const partial = p.status === "partial";
  const paidSoFar = outstandingPaid(p);
  const outstanding = outstandingOf(p);
  const [paying, setPaying] = useState(false);

  if (editing) {
    return <EditRow p={p} vendors={vendors} busy={busy} onCancel={onCancelEdit} onSave={onSaveEdit} />;
  }

  async function submitPay(amt) {
    const ok = await onRecordPayment(amt);
    if (ok) setPaying(false);
  }

  return (
    <div className={`rounded-xl border bg-white dark:bg-gray-900 ${
      overdue ? "border-red-200 dark:border-red-900/50" : "border-gray-200 dark:border-gray-800"
    } ${paid ? "opacity-70" : ""}`}>
      <div className="px-4 py-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-medium text-gray-900 dark:text-gray-100 ${paid ? "line-through decoration-gray-300" : ""}`}>{p.vendorName}</span>
            {overdue && <Badge tone="red">Overdue</Badge>}
            {dueToday && <Badge tone="amber">Due today</Badge>}
            {partial && <Badge tone="sky">Part-paid</Badge>}
            {paid && <Badge tone="emerald">Paid</Badge>}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Due {fmtDisplayDate(p.dueDate)}
            {p.note ? <span> · {p.note}</span> : null}
            {paid && p.paidAt ? <span> · paid {fmtDisplayDateTime(p.paidAt)}</span> : null}
          </div>
        </div>
        <div className="text-right shrink-0">
          {/* For an open payout the headline number is what's still OWED; the
              total + paid-so-far sit underneath so the split is clear. */}
          <div className={`tabular-nums font-semibold ${paid ? "text-gray-400 dark:text-gray-500" : "text-gray-900 dark:text-gray-100"}`}>
            {money(open ? outstanding : p.amount)}
          </div>
          {open && paidSoFar > 0 && (
            <div className="text-[11px] tabular-nums text-gray-400 dark:text-gray-500">
              {money(paidSoFar)} paid of {money(p.amount)}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {open && (
            <button
              onClick={() => setPaying((v) => !v)}
              disabled={busy}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 dark:border-emerald-900/50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
            >
              Pay part
            </button>
          )}
          <button
            onClick={onToggle}
            disabled={busy}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 ${
              paid
                ? "border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                : "bg-emerald-600 text-white hover:bg-emerald-700"
            }`}
          >
            {busy ? "…" : paid ? "Undo" : "Pay full"}
          </button>
          <button onClick={onEdit} disabled={busy} title="Edit" className="px-2 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800">Edit</button>
          <button onClick={onDelete} disabled={busy} title="Delete" className="px-2 py-1.5 rounded-lg text-xs text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">✕</button>
        </div>
      </div>

      {paying && open && (
        <PayPanel outstanding={outstanding} busy={busy} onCancel={() => setPaying(false)} onPay={submitPay} />
      )}

      {p.payments && p.payments.length > 0 && (
        <div className="px-4 pb-2.5 -mt-0.5">
          <div className="text-[11px] text-gray-400 dark:text-gray-500 flex flex-wrap gap-x-3 gap-y-0.5">
            {p.payments.map((pay) => (
              <span key={pay.id} className="tabular-nums">
                {money(pay.amount)} · {fmtDisplayDateTime(pay.paidAt)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Inline "record a payment" panel. Defaults to the full outstanding so the
// common "clear it" case is one click; edit the figure for a part payment.
function PayPanel({ outstanding, busy, onCancel, onPay }) {
  const [amt, setAmt] = useState(String(outstanding));
  const n = Number(amt);
  const valid = Number.isFinite(n) && n > 0;
  return (
    <div className="px-4 pb-3 pt-1 flex items-end gap-2 flex-wrap border-t border-gray-50 dark:border-gray-800/60">
      <div>
        <label className={labelCls}>Amount paid now (₹)</label>
        <input
          className={`${inputCls} tabular-nums w-40`}
          type="number" min="0" step="0.01" inputMode="decimal" autoFocus
          value={amt}
          onChange={(e) => setAmt(e.target.value)}
        />
      </div>
      <button
        onClick={() => valid && onPay(n)}
        disabled={!valid || busy}
        className="px-3 py-2 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
      >
        {busy ? "…" : "Record payment"}
      </button>
      <button onClick={onCancel} className="px-3 py-2 rounded-lg text-xs text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800">Cancel</button>
      <span className="text-[11px] text-gray-400 dark:text-gray-500 ml-auto self-center">{money(outstanding)} outstanding</span>
    </div>
  );
}

function EditRow({ p, vendors, busy, onCancel, onSave }) {
  const [vendorId, setVendorId] = useState(p.vendorId || "");
  const [amount, setAmount] = useState(String(p.amount));
  const [dueDate, setDueDate] = useState(p.dueDate || todayYmd());
  const [note, setNote] = useState(p.note || "");

  const vendorName = vendors.find((v) => v.id === vendorId)?.name || p.vendorName;
  const valid = (vendorId || vendorName) && Number(amount) > 0 && dueDate;

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/40 px-4 py-3 dark:bg-blue-900/10 dark:border-blue-900/50">
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
        <div className="sm:col-span-4">
          <label className={labelCls}>Vendor</label>
          <select className={inputCls} value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
            {/* Keep the snapshot name selectable even if the vendor was unlinked */}
            {!vendors.some((v) => v.id === vendorId) && <option value={vendorId}>{p.vendorName}</option>}
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Amount (₹)</label>
          <input className={`${inputCls} tabular-nums`} type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Due date</label>
          <input className={inputCls} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div className="sm:col-span-4">
          <label className={labelCls}>Note</label>
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <div className="mt-2 flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1.5 rounded-lg text-xs text-gray-600 hover:bg-white dark:text-gray-300 dark:hover:bg-gray-800">Cancel</button>
        <button
          onClick={() => onSave({ vendorId: vendorId || null, vendorName, amount, dueDate, note })}
          disabled={!valid || busy}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

// ─── Calendar ───────────────────────────────────────────────────────────────
function CalendarView({ payouts, monthCursor, setMonthCursor, today, onToggle }) {
  const byDay = useMemo(() => {
    const m = new Map();
    for (const p of payouts) {
      if (!p.dueDate) continue;
      if (!m.has(p.dueDate)) m.set(p.dueDate, []);
      m.get(p.dueDate).push(p);
    }
    return m;
  }, [payouts]);

  // 6-week grid starting on the Monday on/before the 1st.
  const gridStart = startOfWeek(monthCursor);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const monthIdx = monthCursor.getMonth();

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          {MONTHS[monthCursor.getMonth()]} {monthCursor.getFullYear()}
        </h2>
        <div className="flex items-center gap-1">
          <button onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))} className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800">←</button>
          <button onClick={() => setMonthCursor(startOfMonth(new Date()))} className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800">Today</button>
          <button onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))} className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800">→</button>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-gray-200 bg-white overflow-hidden dark:bg-gray-900 dark:border-gray-800">
        <div className="grid grid-cols-7 text-[11px] font-medium text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-800">
          {DOW.map((d) => <div key={d} className="px-2 py-1.5 text-center">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const ymd = fmtYmd(d);
            const inMonth = d.getMonth() === monthIdx;
            const isToday = ymd === today;
            const items = byDay.get(ymd) || [];
            const dayTotal = items.reduce((s, x) => s + x.amount, 0);
            return (
              <div
                key={i}
                className={`min-h-[92px] border-b border-r border-gray-50 dark:border-gray-800/60 p-1.5 ${
                  inMonth ? "bg-white dark:bg-gray-900" : "bg-gray-50/50 dark:bg-gray-950/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs ${
                    isToday ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white font-semibold"
                    : inMonth ? "text-gray-600 dark:text-gray-300" : "text-gray-300 dark:text-gray-600"
                  }`}>{d.getDate()}</span>
                  {items.length > 0 && inMonth && (
                    <span className="text-[9px] tabular-nums text-gray-400 dark:text-gray-500">{money(dayTotal)}</span>
                  )}
                </div>
                <div className="mt-1 space-y-1">
                  {items.slice(0, 3).map((p) => {
                    const open = p.status !== "paid";
                    const overdue = open && ymd < today;
                    const partial = p.status === "partial";
                    const shown = open ? outstandingOf(p) : p.amount;
                    return (
                      <button
                        key={p.id}
                        onClick={() => onToggle(p)}
                        title={`${p.vendorName} — ${money(shown)}${partial ? ` outstanding (${money(outstandingPaid(p))} paid)` : ""} · ${p.status === "paid" ? "paid (click to undo)" : "click to pay in full"}`}
                        className={`w-full text-left truncate rounded px-1 py-0.5 text-[10px] leading-tight transition-colors ${
                          p.status === "paid"
                            ? "bg-emerald-50 text-emerald-700 line-through dark:bg-emerald-900/20 dark:text-emerald-400"
                            : overdue
                            ? "bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400"
                            : partial
                            ? "bg-sky-50 text-sky-700 hover:bg-sky-100 dark:bg-sky-900/20 dark:text-sky-400"
                            : "bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-300"
                        }`}
                      >
                        {p.vendorName} · {money(shown)}
                      </button>
                    );
                  })}
                  {items.length > 3 && (
                    <div className="text-[9px] text-gray-400 dark:text-gray-500 px-1">+{items.length - 3} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">Tip: click a payout chip to toggle paid / pending.</p>
    </section>
  );
}

// ─── small bits ─────────────────────────────────────────────────────────────
const STAT_TONES = {
  amber: "text-amber-700 dark:text-amber-300",
  red: "text-red-600 dark:text-red-400",
  emerald: "text-emerald-700 dark:text-emerald-300",
  sky: "text-sky-700 dark:text-sky-300",
  gray: "text-gray-400 dark:text-gray-500",
};
function StatCard({ label, value, sub, tone = "gray" }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 dark:bg-gray-900 dark:border-gray-800">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`mt-1 text-xl sm:text-2xl font-bold tabular-nums ${STAT_TONES[tone] || STAT_TONES.gray}`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

const BADGE_TONES = {
  red: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
};
function Badge({ tone, children }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${BADGE_TONES[tone]}`}>{children}</span>;
}

function fmtDisplayDate(ymd) {
  const d = parseYmd(ymd);
  if (!d) return "—";
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
}
function fmtDisplayDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}
