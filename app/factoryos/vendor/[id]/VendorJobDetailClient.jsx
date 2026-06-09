"use client";
import { useState } from "react";
import { StageBadge, formatDate, inputCls } from "@/app/factoryos/_components/ui";
import JobThread from "@/app/factoryos/_components/JobThread";
import VendorProgressStepper from "./VendorProgressStepper";
import VendorInvoicePanel from "./VendorInvoicePanel";

function Spec({ label, value }) {
  if (value == null || value === "") return null;
  return (
    <div>
      <dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{value}</dd>
    </div>
  );
}

export default function VendorJobDetailClient({ initialJob, initialThread }) {
  const job = initialJob;
  const [dueDate, setDueDate] = useState(job.printingDueDate || "");
  const [savingDate, setSavingDate] = useState(false);
  const [dateMsg, setDateMsg] = useState(null);

  async function saveDate() {
    setSavingDate(true);
    setDateMsg(null);
    try {
      const res = await fetch(`/api/factoryos/vendor/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printingDueDate: dueDate || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save");
      setDateMsg({ ok: true, text: "Delivery date updated." });
    } catch (e) {
      setDateMsg({ ok: false, text: e.message });
    } finally {
      setSavingDate(false);
    }
  }

  return (
    <div className="mt-3 space-y-5">
      {/* Header + specs */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 dark:bg-gray-900 dark:border-gray-800">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{job.item}</h1>
            <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              J# {job.jNumber}
              {job.brand && <> · {job.brand}</>}
            </div>
          </div>
          <StageBadge stage={job.stage} />
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-5">
          <Spec label="Print type" value={job.printingType} />
          <Spec label="Quantity" value={job.qty != null ? `${job.qty.toLocaleString("en-IN")} pcs` : null} />
          <Spec label="Size" value={job.itemSize} />
          <Spec label="Paper / GSM" value={[job.paperType, job.gsm ? `${job.gsm} GSM` : null].filter(Boolean).join(" · ")} />
          <Spec label="RM size (mm)" value={job.rmSizeMm} />
          <Spec label="Order date" value={job.orderDate ? formatDate(job.orderDate) : null} />
        </dl>
        {job.actionPoints && (
          <div className="mt-4 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-sm text-blue-900 dark:bg-blue-900/20 dark:border-blue-900 dark:text-blue-200">
            <span className="font-semibold">Note from Aeros: </span>
            {job.actionPoints}
          </div>
        )}
      </div>

      {/* Editable delivery date */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 dark:bg-gray-900 dark:border-gray-800">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Your delivery date</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          When will this job be printed and ready for hand-back? Update it whenever your plan changes.
        </p>
        <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2">
          <input
            type="date"
            className={`${inputCls} sm:max-w-xs`}
            value={dueDate ? String(dueDate).slice(0, 10) : ""}
            onChange={(e) => setDueDate(e.target.value)}
          />
          <button
            onClick={saveDate}
            disabled={savingDate}
            className="inline-flex justify-center items-center px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {savingDate ? "Saving…" : "Save date"}
          </button>
        </div>
        {dateMsg && (
          <p className={`text-xs mt-2 ${dateMsg.ok ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
            {dateMsg.text}
          </p>
        )}
      </div>

      {/* Progress milestones (separate from the team's internal Stage) */}
      <VendorProgressStepper
        jobId={job.id}
        initialStatus={job.vendorStatus}
        initialDispatchDate={job.vendorDispatchDate}
      />

      {/* Unified conversation — messages, artwork, proofs, challans */}
      <JobThread jobId={job.id} viewerRole="vendor" initialThread={initialThread} title="Messages & files" />

      {/* Invoices */}
      <VendorInvoicePanel jobId={job.id} />
    </div>
  );
}
