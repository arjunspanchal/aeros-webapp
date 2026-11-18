"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import CountScreen from "./CountScreen";

const STATUS_TONE = {
  counting:  "bg-blue-100 text-blue-800",
  review:    "bg-amber-100 text-amber-800",
  posted:    "bg-emerald-100 text-emerald-800",
  cancelled: "bg-gray-100 text-gray-700",
};

export default function AuditDetailClient({ initialAudit, items, locations, currentUserEmail }) {
  const router = useRouter();
  const [audit, setAudit] = useState(initialAudit);
  const [tab, setTab] = useState(initialAudit.status === "posted" ? "review" : "counting");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function refresh() {
    try {
      const res = await fetch(`/api/warehouse/audits/${audit.id}`);
      if (res.ok) {
        const data = await res.json();
        setAudit(data.audit);
      }
    } catch {}
  }

  async function setStatus(status) {
    setBusy(true); setErr("");
    try {
      const res = await fetch(`/api/warehouse/audits/${audit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      await refresh();
      if (status === "review") setTab("review");
      router.refresh();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function postAudit() {
    if (!confirm(`Post ${audit.audit_no}? This creates one adjustment movement for every non-zero variance and locks the audit.`)) return;
    setBusy(true); setErr("");
    try {
      const res = await fetch(`/api/warehouse/audits/${audit.id}/post`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Post failed");
      alert(`Posted ${audit.audit_no}. ${data.result.adjustments} adjustment line(s)${data.result.movement_no ? ` → ${data.result.movement_no}` : ""}.`);
      await refresh();
      router.refresh();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const counted     = audit.lines.filter((l) => l.counted_qty != null).length;
  const total       = audit.lines.length;
  const variances   = audit.lines.filter((l) => l.counted_qty != null && Number(l.variance) !== 0);
  const isLocked    = audit.status === "posted" || audit.status === "cancelled";
  const allCounted  = total > 0 && counted === total;

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-semibold text-gray-900 dark:text-white">{audit.audit_no}</h1>
        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[audit.status] || ""}`}>{audit.status}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">scope: {audit.scope}</span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label="Scheduled" value={audit.scheduled_date} />
        <Field label="Audit manager" value={audit.audit_manager_email} />
        <Field label="Created by" value={audit.created_by || "—"} />
        <Field label="Posted at" value={audit.posted_at ? new Date(audit.posted_at).toLocaleString("en-IN") : "—"} />
        {audit.notes && <Field label="Notes" value={audit.notes} className="sm:col-span-4" />}
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-800 dark:bg-gray-800/40">
        <Stat label="Lines" value={total} />
        <Stat label="Counted" value={`${counted} / ${total}`} />
        <Stat label="Variance lines" value={variances.length} tone={variances.length ? "warn" : "ok"} />
        <div className="ml-auto flex flex-wrap gap-2">
          {audit.status === "counting" && (
            <button
              onClick={() => setStatus("review")}
              disabled={busy || !allCounted}
              title={!allCounted ? `Count all ${total} lines first` : ""}
              className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {busy ? "…" : "Close counting → Review"}
            </button>
          )}
          {audit.status === "review" && (
            <>
              <button
                onClick={() => setStatus("counting")}
                disabled={busy}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Re-open counting
              </button>
              <button
                onClick={postAudit}
                disabled={busy}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy ? "Posting…" : "Approve & post adjustments"}
              </button>
            </>
          )}
          {!isLocked && (
            <button
              onClick={() => { if (confirm("Cancel this audit? Counts are kept but no adjustments will be posted.")) setStatus("cancelled"); }}
              disabled={busy}
              className="rounded-md border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-950/30"
            >
              Cancel audit
            </button>
          )}
        </div>
      </div>

      {err && <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>}

      <div className="mt-5 flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-800">
        <Tab label="Counting" active={tab === "counting"} onClick={() => setTab("counting")} />
        <Tab label={`Review (${variances.length})`} active={tab === "review"} onClick={() => setTab("review")} />
        <Tab label="Log" active={tab === "log"} onClick={() => setTab("log")} />
      </div>

      {tab === "counting" && (
        <CountScreen
          audit={audit}
          items={items}
          locations={locations}
          currentUserEmail={currentUserEmail}
          locked={isLocked}
          onLineUpdated={refresh}
        />
      )}

      {tab === "review" && <ReviewTab audit={audit} variances={variances} />}

      {tab === "log" && <LogTab audit={audit} />}
    </>
  );
}

function ReviewTab({ audit, variances }) {
  const sumPos = variances.filter((v) => Number(v.variance) > 0).reduce((s, v) => s + Number(v.variance), 0);
  const sumNeg = variances.filter((v) => Number(v.variance) < 0).reduce((s, v) => s + Number(v.variance), 0);
  return (
    <div className="mt-4">
      <div className="mb-3 grid grid-cols-3 gap-3 text-sm sm:max-w-xl">
        <Stat label="Variance lines" value={variances.length} />
        <Stat label="Σ positive" value={`+${sumPos.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`} tone="ok" />
        <Stat label="Σ negative" value={sumNeg.toLocaleString("en-IN", { maximumFractionDigits: 2 })} tone="warn" />
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-gray-800/50">
            <tr>
              <Th>SKU</Th>
              <Th>Item</Th>
              <Th>Location</Th>
              <Th right>System</Th>
              <Th right>Counted</Th>
              <Th right>Variance</Th>
              <Th>Counted by</Th>
              <Th>Remarks</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
            {variances.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-500">No variances. {audit.status === "review" && "Approve & post will be a no-op."}</td></tr>
            ) : variances.map((l) => (
              <tr key={l.id}>
                <Td mono>{l.inventory_items?.sku}</Td>
                <Td>{l.inventory_items?.name}</Td>
                <Td>{l.inventory_locations?.code}</Td>
                <Td right>{Number(l.system_qty).toLocaleString("en-IN")}</Td>
                <Td right>{Number(l.counted_qty).toLocaleString("en-IN")}</Td>
                <Td right>
                  <span className={Number(l.variance) > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}>
                    {Number(l.variance) > 0 ? "+" : ""}{Number(l.variance).toLocaleString("en-IN")}
                  </span>
                </Td>
                <Td>{l.counted_by || "—"}</Td>
                <Td>{l.remarks || "—"}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LogTab({ audit }) {
  const events = audit.lines
    .filter((l) => l.counted_at)
    .sort((a, b) => new Date(b.counted_at) - new Date(a.counted_at))
    .map((l) => ({
      when: l.counted_at,
      who: l.counted_by || "—",
      what: `Counted ${l.inventory_items?.sku} @ ${l.inventory_locations?.code}: ${Number(l.counted_qty)} (sys ${Number(l.system_qty)}, var ${Number(l.variance) > 0 ? "+" : ""}${Number(l.variance)})`,
    }));
  if (audit.posted_at) events.unshift({ when: audit.posted_at, who: audit.posted_by || "—", what: "Posted audit" });
  events.unshift({ when: audit.created_at, who: audit.created_by || "—", what: `Created audit (${audit.scope} scope, ${audit.lines.length} lines)` });
  return (
    <div className="mt-4">
      {events.length === 0 ? (
        <p className="text-sm text-gray-500">No activity yet.</p>
      ) : (
        <ol className="space-y-2 border-l-2 border-gray-200 pl-4 dark:border-gray-800">
          {events.map((e, i) => (
            <li key={i} className="text-sm">
              <div className="text-xs text-gray-500 dark:text-gray-400">{new Date(e.when).toLocaleString("en-IN")} · {e.who}</div>
              <div className="text-gray-900 dark:text-gray-100">{e.what}</div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Tab({ label, active, onClick }) {
  return (
    <button onClick={onClick} className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
      active ? "border-blue-600 text-blue-700 dark:text-blue-400" : "border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
    }`}>{label}</button>
  );
}
function Stat({ label, value, tone }) {
  const cls = tone === "warn"
    ? "text-amber-700 dark:text-amber-300"
    : tone === "ok"
    ? "text-emerald-700 dark:text-emerald-300"
    : "text-gray-900 dark:text-gray-100";
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`text-base font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
function Field({ label, value, className = "" }) {
  return (
    <div className={className}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">{value}</dd>
    </div>
  );
}
function Th({ children, right }) {
  return <th className={`px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 ${right ? "text-right" : "text-left"}`}>{children}</th>;
}
function Td({ children, right, mono }) {
  return <td className={`px-3 py-2 text-sm ${right ? "text-right" : ""} ${mono ? "font-mono text-xs text-gray-700 dark:text-gray-300" : "text-gray-900 dark:text-gray-100"}`}>{children}</td>;
}
