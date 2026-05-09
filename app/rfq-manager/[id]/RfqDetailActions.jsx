"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RfqDetailActions({ quoteId, downloadUrl, filename, isInternal }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (!confirm(`Delete RFQ ${filename || quoteId}? This cannot be undone.`)) return;
    setBusy(true);
    const res = await fetch(`/api/rfq/${quoteId}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      alert("Delete failed");
      return;
    }
    router.push("/rfq-manager");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      {downloadUrl && (
        <a
          href={downloadUrl}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg whitespace-nowrap"
        >
          Download
        </a>
      )}
      {isInternal && (
        <button
          onClick={onDelete}
          disabled={busy}
          className="inline-flex items-center text-sm text-red-600 hover:text-red-700 dark:text-red-400 px-2 py-1.5 disabled:opacity-50"
        >
          {busy ? "…" : "Delete"}
        </button>
      )}
    </div>
  );
}
