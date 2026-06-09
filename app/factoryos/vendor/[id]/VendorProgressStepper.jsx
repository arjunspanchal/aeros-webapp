"use client";
import { useState } from "react";
import { formatDate } from "@/app/factoryos/_components/ui";

const STEPS = [
  { value: "accepted", label: "Job accepted" },
  { value: "printing_started", label: "Printing started" },
  { value: "printing_completed", label: "Printing completed" },
  { value: "dispatched", label: "Dispatched to factory" },
];
const ORDER = Object.fromEntries(STEPS.map((s, i) => [s.value, i]));

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Vendor-controlled milestone tracker. Separate from the team's internal
// Stage. Tapping a step advances the status; 'Dispatched' first collects a
// dispatch date + optional challan (posted to the thread).
export default function VendorProgressStepper({ jobId, initialStatus, initialDispatchDate }) {
  const [status, setStatus] = useState(initialStatus || null);
  const [dispatchDate, setDispatchDate] = useState(initialDispatchDate || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [challan, setChallan] = useState(null);
  const [dateInput, setDateInput] = useState(initialDispatchDate ? String(initialDispatchDate).slice(0, 10) : "");

  const currentIdx = status ? ORDER[status] : -1;

  async function patchStatus(value, dDate) {
    const res = await fetch(`/api/factoryos/jobs/${jobId}/vendor-status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: value, dispatchDate: dDate || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not update");
    return data.job;
  }

  async function mark(value) {
    setErr("");
    if (value === "dispatched") {
      setDispatchOpen(true);
      return;
    }
    setBusy(true);
    try {
      const job = await patchStatus(value);
      setStatus(job?.vendorStatus || value);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDispatch() {
    setErr("");
    if (!dateInput) {
      setErr("Please pick a dispatch date.");
      return;
    }
    setBusy(true);
    try {
      // Post the challan to the thread first (if attached), then set status.
      if (challan) {
        const fileBase64 = await fileToBase64(challan);
        await fetch(`/api/factoryos/jobs/${jobId}/thread`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body: "Dispatch challan",
            kind: "challan",
            filename: challan.name,
            contentType: challan.type,
            fileBase64,
          }),
        });
      }
      const job = await patchStatus("dispatched", dateInput);
      setStatus(job?.vendorStatus || "dispatched");
      setDispatchDate(job?.vendorDispatchDate || dateInput);
      setDispatchOpen(false);
      setChallan(null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 dark:bg-gray-900 dark:border-gray-800">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Your progress</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
        Tap a step as you complete it. This keeps the Aeros team updated without messages.
      </p>

      <ol className="mt-4 space-y-2">
        {STEPS.map((s, i) => {
          const done = currentIdx >= i;
          const isNext = currentIdx === i - 1 || (currentIdx === -1 && i === 0);
          return (
            <li key={s.value} className="flex items-center gap-3">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                  done
                    ? "bg-green-600 text-white"
                    : "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-300"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span className={`text-sm flex-1 ${done ? "text-gray-900 dark:text-white font-medium" : "text-gray-500 dark:text-gray-400"}`}>
                {s.label}
                {s.value === "dispatched" && status === "dispatched" && dispatchDate && (
                  <span className="text-xs text-gray-400"> · {formatDate(dispatchDate)}</span>
                )}
              </span>
              {!done && isNext && (
                <button
                  onClick={() => mark(s.value)}
                  disabled={busy}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Mark
                </button>
              )}
            </li>
          );
        })}
      </ol>

      {dispatchOpen && (
        <div className="mt-4 rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
          <div className="text-xs font-medium text-gray-700 dark:text-gray-200">Confirm dispatch</div>
          <div>
            <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Dispatch date</label>
            <input
              type="date"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Challan (optional, PDF/JPG/PNG)</label>
            <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setChallan(e.target.files?.[0] || null)} className="text-xs" />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button onClick={confirmDispatch} disabled={busy} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
              {busy ? "Saving…" : "Confirm dispatch"}
            </button>
            <button onClick={() => setDispatchOpen(false)} className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400">Cancel</button>
          </div>
        </div>
      )}
      {err && <p className="text-xs mt-2 text-red-600 dark:text-red-400">{err}</p>}
    </div>
  );
}
