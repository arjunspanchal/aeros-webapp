"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import ManifestClient from "./ManifestClient";

function fmtINR(n, dp = 2) {
  if (n == null) return "—";
  return `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}
function fmtNum(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-IN");
}
function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateTime(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const STATUS_BADGE = {
  pending:    "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-700/40",
  dispatched: "bg-blue-50 text-blue-800 ring-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:ring-blue-700/40",
  delivered:  "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:ring-emerald-700/40",
  cancelled:  "bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700",
};

// How long the vehicle has been in transit (dispatched → delivered, or → now
// if still on the road). Returns "" when not yet dispatched.
function transitLabel(d) {
  if (!d.dispatched_at) return "";
  const start = new Date(d.dispatched_at).getTime();
  const end = d.delivered_at ? new Date(d.delivered_at).getTime() : Date.now();
  if (Number.isNaN(start) || end < start) return "";
  const hrs = (end - start) / 36e5;
  if (hrs < 1) return "<1h";
  if (hrs < 24) return `${Math.floor(hrs)}h`;
  const days = Math.floor(hrs / 24);
  const remH = Math.floor(hrs % 24);
  return remH ? `${days}d ${remH}h` : `${days}d`;
}

// Render a city as a Google Maps link when it's pinned to a place/coords,
// else just the text. Lets the team open the exact location in one tap.
function cityLink(city, placeId, lat, lng) {
  if (!city) return null;
  let href = null;
  if (placeId) {
    href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(city)}&query_place_id=${encodeURIComponent(placeId)}`;
  } else if (lat != null && lng != null) {
    href = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  if (!href) return city;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:text-blue-800 dark:text-blue-400">
      {city}
    </a>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-1 text-sm text-gray-900 dark:text-gray-100">{children ?? "—"}</div>
    </div>
  );
}

export default function VehicleDetailClient({
  dispatch: initial,
  isAdmin,
  boxTypes = [],
  manifestLines = [],
  history = [],
  lastManifest = null,
}) {
  const router = useRouter();
  const [d, setD] = useState(initial);
  const [deleting, setDeleting] = useState(false);
  const [statusBusy, setStatusBusy] = useState("");
  const [error, setError] = useState("");

  async function setStatus(next) {
    setStatusBusy(next);
    setError("");
    try {
      const res = await fetch(`/api/warehouse/vehicle-dispatches/${d.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to update status");
      setD(data.dispatch);
      router.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setStatusBusy("");
    }
  }

  // Status-driven action buttons: the primary forward move plus a small
  // escape hatch, so the team isn't stuck if they tap too early.
  const actions = {
    pending:    [{ label: "Mark dispatched", to: "dispatched", primary: true }, { label: "Cancel", to: "cancelled" }],
    dispatched: [{ label: "Mark delivered", to: "delivered", primary: true }, { label: "Back to pending", to: "pending" }],
    delivered:  [{ label: "Reopen (dispatched)", to: "dispatched" }],
    cancelled:  [{ label: "Reopen (pending)", to: "pending" }],
  }[d.status] || [];

  async function onDelete() {
    if (!confirm(`Delete ${d.dispatch_no}? This removes it from the log.`)) return;
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/warehouse/vehicle-dispatches/${d.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to delete");
      }
      router.push("/warehouse/vehicle-dispatch");
      router.refresh();
    } catch (e) {
      setError(e.message);
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/warehouse/vehicle-dispatch" className="text-sm text-blue-700 hover:text-blue-800 dark:text-blue-400">← Vehicle Dispatch</Link>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{d.dispatch_no}</h1>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${STATUS_BADGE[d.status] || ""}`}>
              {d.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{fmtDate(d.dispatch_date)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/warehouse/vehicle-dispatch/${d.id}/edit`}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Edit
          </Link>
          {isAdmin && (
            <button
              onClick={onDelete}
              disabled={deleting}
              className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:bg-gray-900 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      )}

      {/* Status workflow */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Dispatched</div>
              <div className="mt-0.5 text-gray-900 dark:text-gray-100">{fmtDateTime(d.dispatched_at)}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Delivered</div>
              <div className="mt-0.5 text-gray-900 dark:text-gray-100">{fmtDateTime(d.delivered_at)}</div>
            </div>
            {transitLabel(d) && (
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {d.delivered_at ? "Transit time" : "On the road"}
                </div>
                <div className="mt-0.5 font-medium text-gray-900 dark:text-gray-100">{transitLabel(d)}</div>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {actions.map((a) => (
              <button
                key={a.to}
                onClick={() => setStatus(a.to)}
                disabled={!!statusBusy}
                className={
                  a.primary
                    ? "rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
                    : "rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                }
              >
                {statusBusy === a.to ? "Saving…" : a.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Cost headline */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Freight (lump sum)</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{fmtINR(d.freight_lumpsum_inr, 0)}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Cost per box</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{fmtINR(d.inr_per_box)}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Cost per kg</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{fmtINR(d.inr_per_kg)}</div>
        </div>
      </div>

      <div className="space-y-6">
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-200">Paperwork &amp; customer</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Invoice no.">{d.invoice_no}</Field>
            <Field label="E-way bill no.">{d.eway_bill_no}</Field>
            <Field label="Customer">{d.customer_name}</Field>
            <Field label="Account manager">{d.account_manager_name}</Field>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-200">Vehicle &amp; transporter</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Transporter">{d.transporter_name}</Field>
            <Field label="Vehicle size">{d.vehicle_size}</Field>
            <Field label="Vehicle number">{d.vehicle_number}</Field>
            <Field label="Driver name">{d.driver_name}</Field>
            <Field label="Driver phone">
              {d.driver_phone ? (
                <a href={`tel:${d.driver_phone}`} className="text-blue-700 hover:text-blue-800 dark:text-blue-400">{d.driver_phone}</a>
              ) : null}
            </Field>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-200">Lane &amp; load</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="From city">{cityLink(d.from_city, d.from_place_id, d.from_lat, d.from_lng)}</Field>
            <Field label="To city">{cityLink(d.to_city, d.to_place_id, d.to_lat, d.to_lng)}</Field>
            <Field label="Approx kms">{fmtNum(d.approx_kms)}</Field>
            <Field label="No. of boxes">{fmtNum(d.box_count)}</Field>
            <Field label="Total weight (kg)">{fmtNum(d.total_weight_kg)}</Field>
          </div>
        </section>

        <ManifestClient
          dispatchId={d.id}
          dispatch={d}
          boxTypes={boxTypes}
          initialLines={manifestLines}
          history={history}
          lastManifest={lastManifest}
        />

        {d.notes && (
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">Notes</h2>
            <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-200">{d.notes}</p>
          </section>
        )}
      </div>
    </div>
  );
}
