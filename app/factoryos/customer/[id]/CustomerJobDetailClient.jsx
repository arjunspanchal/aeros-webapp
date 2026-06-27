"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate, formatDateTime } from "@/app/factoryos/_components/ui";
import JobThread from "@/app/factoryos/_components/JobThread";
import {
  derivedEta,
  friendlyStage,
  milestoneIndex,
  milestonesFor,
  nextStep,
  activityIsCustomerVisible,
  sanitizeActivityNote,
} from "../_lib/customerView";

// Customer-facing job detail page. Designed as a "single source of truth"
// for the order: status hero, milestones, what Aeros needs from you, full
// conversation, documents, delivery, and a sanitized activity log. Everything
// internal-only (staff emails, action_points, internal_status jargon) is
// translated or hidden — see _lib/customerView.js for the rules.

const TONE_CHIP = {
  action: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  info:   "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  soon:   "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200",
  good:   "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
};

function MilestoneStrip({ stage, sourcing }) {
  const ms = milestonesFor(sourcing);
  const current = milestoneIndex(stage, sourcing);
  return (
    <div>
      <div className="flex items-center gap-1.5">
        {ms.map((m, i) => {
          const done = i <= current;
          const isCurrent = i === current;
          return (
            <div key={m.key} className="flex-1 flex items-center gap-1.5 min-w-0">
              <div
                className={`h-2 rounded-full flex-1 transition-colors ${
                  done ? (isCurrent ? "bg-blue-600" : "bg-blue-400") : "bg-gray-200 dark:bg-gray-700"
                }`}
              />
            </div>
          );
        })}
      </div>
      <div
        className="mt-2 grid gap-1 text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400"
        style={{ gridTemplateColumns: `repeat(${ms.length}, minmax(0, 1fr))` }}
      >
        {ms.map((m, i) => (
          <span
            key={m.key}
            className={`truncate ${i <= current ? "text-blue-700 dark:text-blue-300 font-medium" : ""}`}
          >
            {m.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function CustomerJobDetailClient({ initialJob, initialUpdates, initialThread = [] }) {
  const router = useRouter();
  const [job, setJob] = useState(initialJob);
  const [updates, setUpdates] = useState(initialUpdates);
  const [thread, setThread] = useState(initialThread);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [approveBusy, setApproveBusy] = useState(false);
  const [approveErr, setApproveErr] = useState("");
  const [reorderBusy, setReorderBusy] = useState(false);
  const [reorderMsg, setReorderMsg] = useState(null);
  const [specsOpen, setSpecsOpen] = useState(false);

  async function patchJob(patch, optimisticNote) {
    setErr("");
    setBusy(true);
    const res = await fetch(`/api/factoryos/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setBusy(false);
    if (!res.ok) { setErr((await res.json()).error || "Failed"); return; }
    const data = await res.json();
    setJob({ ...data.job, customerArtworkApprovedAt: job.customerArtworkApprovedAt });
    if (optimisticNote) {
      setUpdates((prev) => [
        {
          id: `local-${Date.now()}`,
          stage: patch.stage || job.stage,
          note: optimisticNote,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    }
    router.refresh();
  }

  async function toggleUrgent() {
    const next = !job.urgent;
    await patchJob(
      { urgent: next },
      next ? "Customer marked order URGENT" : "Customer cleared urgent flag",
    );
  }

  async function markDelivered() {
    if (!window.confirm("Mark this order as delivered? Aeros will be notified.")) return;
    await patchJob(
      { stage: "Delivered", note: "Customer confirmed delivery" },
      "Customer confirmed delivery",
    );
  }

  async function approveArtwork() {
    setApproveErr(""); setApproveBusy(true);
    try {
      const res = await fetch(`/api/factoryos/jobs/${job.id}/customer-artwork-approval`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not approve");
      setJob((j) => ({ ...j, customerArtworkApprovedAt: data.approvedAt }));
      setThread((t) => [
        ...t,
        {
          id: `local-${Date.now()}`,
          kind: "system",
          body: "Customer approved artwork.",
          authorRole: "customer",
          createdAt: new Date().toISOString(),
          file: null,
        },
      ]);
      router.refresh();
    } catch (e) {
      setApproveErr(e.message);
    } finally {
      setApproveBusy(false);
    }
  }

  async function requestReorder() {
    if (!window.confirm("Send Aeros a request to reorder this item with the same specs?")) return;
    setReorderMsg(null); setReorderBusy(true);
    try {
      const res = await fetch(`/api/factoryos/jobs/${job.id}/customer-reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed");
      setReorderMsg({ ok: true, text: "Reorder request sent. Aeros will follow up in the conversation." });
      router.refresh();
    } catch (e) {
      setReorderMsg({ ok: false, text: e.message });
    } finally {
      setReorderBusy(false);
    }
  }

  const canMarkDelivered = job.stage === "Dispatched";
  const delivered = job.stage === "Delivered";
  const artworkApproved = !!job.customerArtworkApprovedAt;
  const eta = derivedEta(job);

  // Documents pulled from the thread + Airtable LR field. Anything the
  // customer themselves uploaded stays in the thread (no need to re-list it).
  const docs = useMemo(() => {
    const out = { artwork: [], proof: [], challan: [], lr: [] };
    for (const m of thread) {
      if (!m.file) continue;
      const entry = { ...m.file, createdAt: m.createdAt };
      if (m.kind === "artwork")      out.artwork.push(entry);
      else if (m.kind === "proof")   out.proof.push(entry);
      else if (m.kind === "challan") out.challan.push(entry);
    }
    for (const f of job.lrFiles || []) {
      out.lr.push({ filename: f.filename, url: f.url, createdAt: null });
    }
    return out;
  }, [thread, job.lrFiles]);

  const docCount = docs.artwork.length + docs.proof.length + docs.challan.length + docs.lr.length;
  // Next-step chip only claims "awaiting your approval" when artwork is
  // actually on the thread and unapproved — same gate the sign-off card uses.
  const ns = nextStep({
    ...job,
    artworkAwaitingApproval: !artworkApproved && docs.artwork.length > 0,
  });
  const visibleUpdates = useMemo(
    () => updates.filter(activityIsCustomerVisible),
    [updates],
  );

  const trackingKnown = job.transportMode || job.lrOrVehicleNumber || job.driverContact;
  const isPast = job.stage === "Dispatched" || job.stage === "Delivered";

  return (
    <>
      {/* Status hero — answers "where is my order?" with no clicks. */}
      <div className="mt-4 bg-white border border-gray-200 rounded-xl p-5 dark:bg-gray-900 dark:border-gray-800">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              {job.urgent && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold bg-red-100 text-red-800 px-2 py-0.5 rounded-md mr-2 align-middle dark:bg-red-900/40 dark:text-red-200">
                  URGENT
                </span>
              )}
              {job.item}
            </h1>
            <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
              J# {job.jNumber}
              {job.brand && <> · {job.brand}</>}
              {job.poNumber && <> · PO {job.poNumber}</>}
              {job.qty != null && <> · {job.qty.toLocaleString("en-IN")} pcs</>}
            </p>
          </div>
          {ns && (
            <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${TONE_CHIP[ns.tone]}`}>
              {ns.text}
            </span>
          )}
        </div>

        <div className="mt-5">
          <MilestoneStrip stage={job.stage} sourcing={job.sourcing} />
          <div className="mt-3 flex items-center justify-between text-xs text-gray-600 dark:text-gray-300">
            <span className="font-medium">{friendlyStage(job.stage, job.sourcing)}</span>
            {eta?.date ? (
              <span className="text-gray-500 dark:text-gray-400">
                {eta.isExplicit ? "ETA " : "Expected by "}{formatDate(eta.date)}
              </span>
            ) : eta?.isPending ? (
              <span className="text-gray-400 dark:text-gray-500">ETA confirmed soon</span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Specs — collapsible so the page leads with status, not metadata. */}
      <div className="mt-5 bg-white border border-gray-200 rounded-xl dark:bg-gray-900 dark:border-gray-800">
        <button
          onClick={() => setSpecsOpen((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3 text-left"
        >
          <span className="text-sm font-semibold text-gray-900 dark:text-white">Item specifications</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">{specsOpen ? "Hide" : "Show"}</span>
        </button>
        {specsOpen && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm px-5 pb-5 border-t border-gray-100 dark:border-gray-800 pt-4">
            {job.qty != null && <Field label="Quantity" value={`${job.qty.toLocaleString("en-IN")} pcs`} />}
            {job.itemSize && <Field label="Item size" value={job.itemSize} />}
            {job.category && <Field label="Category" value={job.category} />}
            {job.masterSku && <Field label="Master SKU" value={job.masterSku} />}
            {job.printingType && <Field label="Printing" value={job.printingType} />}
            {job.paperType && <Field label="Paper" value={job.paperType} />}
            {job.gsm && <Field label="GSM" value={job.gsm} />}
            {job.orderDate && <Field label="Order date" value={formatDate(job.orderDate)} />}
            {job.expectedDispatchDate && <Field label="Expected dispatch" value={formatDate(job.expectedDispatchDate)} />}
            {job.city && <Field label="Delivery city" value={job.city} />}
          </dl>
        )}
      </div>

      {/* Artwork sign-off — appears only once Aeros has shared artwork, or
          after it's already been approved (for the receipt). */}
      {(docs.artwork.length > 0 || artworkApproved) && (
        <div className="mt-5 bg-white border border-gray-200 rounded-xl p-5 dark:bg-gray-900 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Artwork sign-off</h2>
          {artworkApproved ? (
            <p className="text-sm text-green-700 dark:text-green-300 mt-1.5">
              ✓ You approved the artwork on {formatDateTime(job.customerArtworkApprovedAt)}.
              Aeros will keep you posted on production.
            </p>
          ) : (
            <>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Aeros has shared the artwork in the conversation below. Review it carefully —
                once you approve, printing can start. Anything to change? Reply in the thread
                instead of approving.
              </p>
              <button
                onClick={approveArtwork}
                disabled={approveBusy}
                className="mt-3 inline-flex items-center px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {approveBusy ? "Saving…" : "Approve artwork"}
              </button>
              {approveErr && <p className="text-xs text-red-600 dark:text-red-400 mt-2">{approveErr}</p>}
            </>
          )}
        </div>
      )}

      {/* Delivery — shows when something is known; otherwise reassures the
          customer that details will appear once dispatched. */}
      <div className="mt-5 bg-white border border-gray-200 rounded-xl p-5 dark:bg-gray-900 dark:border-gray-800">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Delivery</h2>
        {trackingKnown ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mt-3">
            {job.transportMode && <Field label="Mode" value={job.transportMode} />}
            {job.lrOrVehicleNumber && (
              <Field
                label={job.transportMode === "Direct Vehicle" ? "Vehicle no." : "LR no."}
                value={job.lrOrVehicleNumber}
              />
            )}
            {job.driverContact && <Field label="Driver" value={job.driverContact} />}
            {job.city && <Field label="Destination" value={job.city} />}
            {eta?.date && (
              <Field
                label={eta.isExplicit ? "ETA" : "Expected by"}
                value={formatDate(eta.date)}
              />
            )}
          </dl>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            {isPast
              ? "We don't have transport details on file for this dispatch — ping Aeros in the chat below if you need the LR copy."
              : eta?.date
                ? `We'll share LR and vehicle details here as soon as the order is dispatched. ${eta.isExplicit ? "ETA" : "Expected by"} ${formatDate(eta.date)}.`
                : "We'll share LR and vehicle details here as soon as the order is dispatched."}
          </p>
        )}
      </div>

      {/* Two-way conversation — the chat layer with Aeros. */}
      <div className="mt-5">
        <JobThread
          jobId={job.id}
          viewerRole="customer"
          initialThread={thread}
          title="Messages & files with Aeros"
        />
      </div>

      {/* Documents — quick-access downloads collected from the thread + LR. */}
      {docCount > 0 && (
        <div className="mt-5 bg-white border border-gray-200 rounded-xl p-5 dark:bg-gray-900 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Documents</h2>
          <DocGroup label="Artwork from Aeros" files={docs.artwork} />
          <DocGroup label="Proofs" files={docs.proof} />
          <DocGroup label="Dispatch challans" files={docs.challan} />
          <DocGroup label="LR / waybill" files={docs.lr} />
        </div>
      )}

      {/* Customer actions — clustered at the bottom so the page leads with
          information and ends with what you can do. */}
      <div className="mt-5 bg-white border border-gray-200 rounded-xl p-5 dark:bg-gray-900 dark:border-gray-800 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Actions</h2>

        {!delivered && (
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!!job.urgent}
              disabled={busy}
              onChange={toggleUrgent}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            <div className="text-sm">
              <div className="font-medium text-gray-900 dark:text-white">Mark order urgent</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Flags this order as urgent for Aeros. Visible to their whole team.
              </div>
            </div>
          </label>
        )}

        {(canMarkDelivered || delivered) && (
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={delivered}
              disabled={delivered || busy}
              onChange={markDelivered}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div className="text-sm">
              <div className="font-medium text-gray-900 dark:text-white">
                {delivered ? "Delivered" : "Mark as delivered"}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {delivered
                  ? "Thanks for confirming."
                  : "Check this once the order has reached you. Aeros sees this instantly."}
              </div>
            </div>
          </label>
        )}

        {(isPast || job.stage === "Ready for Dispatch") && (
          <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
            <button
              onClick={requestReorder}
              disabled={reorderBusy}
              className="inline-flex items-center px-4 py-2 rounded-lg border border-blue-600 text-blue-700 text-sm font-medium hover:bg-blue-50 disabled:opacity-50 dark:border-blue-500 dark:text-blue-300 dark:hover:bg-blue-900/30"
            >
              {reorderBusy ? "Sending…" : "Reorder this item"}
            </button>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
              Aeros will pick this up and reply in the conversation above with a quote and timeline.
            </p>
            {reorderMsg && (
              <p className={`text-xs mt-2 ${reorderMsg.ok ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                {reorderMsg.text}
              </p>
            )}
          </div>
        )}

        {err && <p className="text-xs text-red-500">{err}</p>}
      </div>

      {/* Activity log — sanitized: staff emails masked, internal jargon hidden.
          See _lib/customerView.js for the rules. */}
      <div className="mt-5 mb-8 bg-white border border-gray-200 rounded-xl p-5 dark:bg-gray-900 dark:border-gray-800">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Order history</h2>
        {visibleUpdates.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">No updates yet.</p>
        )}
        <ol className="space-y-3">
          {visibleUpdates.map((u) => (
            <li key={u.id} className="flex items-start gap-3">
              <div className="mt-1.5 w-2 h-2 rounded-full bg-blue-500 shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{friendlyStage(u.stage, job.sourcing)}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{formatDateTime(u.createdAt)}</span>
                </div>
                {u.note && (
                  <p className="text-sm text-gray-700 mt-1 dark:text-gray-300">
                    {sanitizeActivityNote(u.note)}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

function Field({ label, value }) {
  return (
    <>
      <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="text-gray-900 dark:text-white">{value}</dd>
    </>
  );
}

function DocGroup({ label, files }) {
  if (!files || files.length === 0) return null;
  return (
    <div className="mb-4 last:mb-0">
      <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">{label}</div>
      <ul className="space-y-1.5">
        {files.map((f, i) => (
          <li key={`${f.url || f.filename}-${i}`} className="flex items-center justify-between text-sm">
            <span className="text-gray-700 dark:text-gray-300 truncate">
              {f.filename || "file"}
              {f.createdAt && (
                <span className="text-xs text-gray-400 ml-2">{formatDateTime(f.createdAt)}</span>
              )}
            </span>
            {f.url ? (
              <a
                href={f.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline dark:text-blue-400 ml-3 shrink-0"
              >
                Download ↗
              </a>
            ) : (
              <span className="text-xs text-gray-400 ml-3 shrink-0">link expired</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
