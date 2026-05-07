"use client";

// "Job Finished — Push to Warehouse" card on the job edit page.
// Shows running pushed-vs-job-qty, recent pushes, and a button that opens
// the push modal. The card is FE/FM/Admin-only; AccountManager + Customer
// don't see it.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const REJECT_REASONS = ["", "discard", "lost", "damaged"];

const FG_LOCATIONS = [
  { code: "BWD-FG-RECV", label: "FG Receiving (default)" },
  { code: "BWD-FG-A",    label: "FG Storage – Aisle A" },
  { code: "BWD-FG-B",    label: "FG Storage – Aisle B" },
];

function fmtNum(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export default function PushToWarehouseCard({ job, canPush }) {
  const router = useRouter();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState("");

  // Form state
  const [goodQty, setGoodQty] = useState("");
  const [rejectQty, setRejectQty] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [goodLoc, setGoodLoc] = useState("BWD-FG-RECV");
  const [finalPush, setFinalPush] = useState(false);

  useEffect(() => {
    if (!canPush) { setLoading(false); return; }
    fetch(`/api/factoryos/jobs/${job.id}/push-to-warehouse`)
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((d) => setStatus(d.status))
      .catch(() => setStatus({ pushed_total: 0, push_count: 0, movements: [] }))
      .finally(() => setLoading(false));
  }, [job.id, canPush]);

  if (!canPush) return null;

  const jobQty = job.qty || 0;
  const pushed = status?.pushed_total || 0;
  const remaining = Math.max(0, jobQty - pushed);
  const pct = jobQty > 0 ? Math.min(100, Math.round((pushed / jobQty) * 100)) : 0;

  const blockers = [];
  if (!job.masterSku) blockers.push("Job has no Master SKU set — link it before pushing.");

  function openModal() {
    setErr(""); setSuccess("");
    setGoodQty(remaining > 0 ? String(remaining) : "");
    setRejectQty(""); setRejectReason("");
    setUnitCost(""); setGoodLoc("BWD-FG-RECV");
    setFinalPush(false);
    setOpen(true);
  }

  async function submit(e) {
    e.preventDefault();
    setErr(""); setSuccess("");
    const g = Number(goodQty || 0);
    const r = Number(rejectQty || 0);
    if (g + r <= 0) { setErr("Enter a good qty or a reject qty (or both)."); return; }
    if (r > 0 && !rejectReason) { setErr("Pick a reject reason."); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/factoryos/jobs/${job.id}/push-to-warehouse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goodQty: g, rejectQty: r, rejectReason: rejectReason || null,
          unitCost: unitCost === "" ? null : Number(unitCost),
          goodLocationCode: goodLoc, finalPush,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Push failed");
      setSuccess(`Posted ${data.result?.movement_no} → ${data.result?.item_sku}${data.result?.is_branded ? " (branded variant auto-created)" : ""}.`);
      // Refresh status + parent page
      const next = await fetch(`/api/factoryos/jobs/${job.id}/push-to-warehouse`).then((r) => r.json());
      setStatus(next.status);
      router.refresh();
      setOpen(false);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 dark:bg-gray-900 dark:border-gray-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Warehouse handoff</h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Push finished cups to WarehouseOS. Branded variants spawn automatically from the job&apos;s Master SKU + brand.
          </p>
        </div>
        <button
          onClick={openModal}
          disabled={blockers.length > 0}
          className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Push to Warehouse
        </button>
      </div>

      {blockers.length > 0 && (
        <div className="mt-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          {blockers.map((b, i) => <div key={i}>• {b}</div>)}
        </div>
      )}

      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Job qty</div>
          <div className="font-semibold text-gray-900 dark:text-gray-100">{fmtNum(jobQty)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Pushed so far</div>
          <div className="font-semibold text-gray-900 dark:text-gray-100">{loading ? "…" : fmtNum(pushed)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Remaining</div>
          <div className={`font-semibold ${remaining === 0 && jobQty > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-gray-900 dark:text-gray-100"}`}>
            {loading ? "…" : fmtNum(remaining)}
          </div>
        </div>
      </div>

      {jobQty > 0 && (
        <div className="mt-3 h-2 w-full overflow-hidden rounded bg-gray-100 dark:bg-gray-800">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {status && status.movements && status.movements.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Recent pushes</div>
          <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-800">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800 text-xs">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr>
                  <th className="px-2 py-1.5 text-left font-semibold text-gray-600 dark:text-gray-400">Date</th>
                  <th className="px-2 py-1.5 text-left font-semibold text-gray-600 dark:text-gray-400">Movement</th>
                  <th className="px-2 py-1.5 text-right font-semibold text-gray-600 dark:text-gray-400">Good</th>
                  <th className="px-2 py-1.5 text-right font-semibold text-gray-600 dark:text-gray-400">Reject</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
                {status.movements.map((m) => (
                  <tr key={m.movement_id}>
                    <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300">{m.movement_date}</td>
                    <td className="px-2 py-1.5 font-mono text-gray-700 dark:text-gray-300">{m.movement_no}</td>
                    <td className="px-2 py-1.5 text-right text-gray-900 dark:text-gray-100">{fmtNum(m.good_qty)}</td>
                    <td className="px-2 py-1.5 text-right text-gray-900 dark:text-gray-100">{fmtNum(m.reject_qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {success && (
        <div className="mt-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
          {success}
        </div>
      )}

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <form onSubmit={submit} className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl dark:bg-gray-900">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Push to Warehouse</h3>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  J# {job.jNumber}{job.brand ? ` · ${job.brand}` : ""}{job.masterSku ? ` · ${job.masterSku}` : ""}
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Good qty" type="number" step="any" min="0" value={goodQty} onChange={setGoodQty} />
              <Field label="Reject qty" type="number" step="any" min="0" value={rejectQty} onChange={setRejectQty} />
              <Select label="Reject reason" value={rejectReason} onChange={setRejectReason} options={REJECT_REASONS.map((r) => ({ value: r, label: r || "—" }))} />
              <Field label="Unit cost (₹)" type="number" step="any" min="0" value={unitCost} onChange={setUnitCost} placeholder="optional" />
              <div className="col-span-2">
                <Select
                  label="Receiving location"
                  value={goodLoc}
                  onChange={setGoodLoc}
                  options={FG_LOCATIONS.map((l) => ({ value: l.code, label: `${l.code} · ${l.label}` }))}
                />
              </div>
              <label className="col-span-2 flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={finalPush}
                  onChange={(e) => setFinalPush(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300"
                />
                <span>
                  Mark as final push.
                  <span className="block text-[11px] text-gray-500 dark:text-gray-400">
                    Flips the job to <strong>Ready for Dispatch</strong> even if pushed qty &lt; job qty. Auto-flips anyway when pushed ≥ job qty.
                  </span>
                </span>
              </label>
            </div>

            {err && <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">{err}</div>}

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {busy ? "Posting…" : "Post inward"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = "text", step, min, placeholder }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-600 dark:text-gray-400">{label}</span>
      <input
        type={type}
        step={step}
        min={min}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
      />
    </label>
  );
}
function Select({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-600 dark:text-gray-400">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
