"use client";
import { useState } from "react";
import { StageBadge, formatDate, formatDateTime, inputCls } from "@/app/factoryos/_components/ui";

// Read a File into a bare base64 string (no data: prefix) for the JSON upload
// API, matching the existing lr-files upload contract.
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const PROOF_MAX_BYTES = 15 * 1024 * 1024;
const PROOF_ALLOWED = ["application/pdf", "image/jpeg", "image/png"];

function Spec({ label, value }) {
  if (value == null || value === "") return null;
  return (
    <div>
      <dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{value}</dd>
    </div>
  );
}

export default function VendorJobDetailClient({ initialJob, initialArtworks }) {
  const job = initialJob;
  const [artworks, setArtworks] = useState(initialArtworks || []);

  const [dueDate, setDueDate] = useState(job.printingDueDate || "");
  const [savingDate, setSavingDate] = useState(false);
  const [dateMsg, setDateMsg] = useState(null);

  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState(null);

  const teamArtworks = artworks.filter((a) => a.kind === "artwork");
  const proofs = artworks.filter((a) => a.kind === "proof");

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

  async function uploadProof(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setUploadErr(null);
    if (!PROOF_ALLOWED.includes(file.type)) {
      setUploadErr("Only PDF, JPG, or PNG accepted.");
      return;
    }
    if (file.size > PROOF_MAX_BYTES) {
      setUploadErr("File too large. Max 15 MB.");
      return;
    }
    setUploading(true);
    try {
      const fileBase64 = await fileToBase64(file);
      const res = await fetch(`/api/factoryos/jobs/${job.id}/artworks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "proof", filename: file.name, contentType: file.type, fileBase64 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed");
      if (data.artworks) setArtworks(data.artworks);
    } catch (err) {
      setUploadErr(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function removeProof(id) {
    if (!confirm("Remove this proof?")) return;
    try {
      const res = await fetch(`/api/factoryos/jobs/${job.id}/artworks?artworkId=${id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Delete failed");
      if (data.artworks) setArtworks(data.artworks);
    } catch (err) {
      setUploadErr(err.message);
    }
  }

  return (
    <div className="mt-3 space-y-5">
      {/* Header */}
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

      {/* Artwork from Aeros (download) */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 dark:bg-gray-900 dark:border-gray-800">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Artwork from Aeros</h2>
        {teamArtworks.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            No artwork uploaded yet. The Aeros team will post print-ready files here.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">
            {teamArtworks.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{a.filename}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{formatDateTime(a.createdAt)}</div>
                </div>
                {a.url ? (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 inline-flex items-center px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    Download
                  </a>
                ) : (
                  <span className="text-xs text-gray-400">Unavailable</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Proof upload (vendor → team) */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 dark:bg-gray-900 dark:border-gray-800">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Send a proof</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Upload a printed proof or sample photo for the Aeros team to approve. PDF/JPG/PNG, max 15 MB.
        </p>
        <label className="mt-3 inline-flex items-center px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-black cursor-pointer dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100">
          {uploading ? "Uploading…" : "Upload proof"}
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            className="hidden"
            disabled={uploading}
            onChange={uploadProof}
          />
        </label>
        {uploadErr && <p className="text-xs mt-2 text-red-600 dark:text-red-400">{uploadErr}</p>}
        {proofs.length > 0 && (
          <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">
            {proofs.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{a.filename}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{formatDateTime(a.createdAt)}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {a.url && (
                    <a href={a.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline dark:text-blue-400">
                      View
                    </a>
                  )}
                  <button onClick={() => removeProof(a.id)} className="text-xs text-red-600 hover:underline dark:text-red-400">
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
