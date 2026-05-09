"use client";
// Admin widget on the rate-card edit page: drop-zone for PDFs + list of
// existing attachments with delete. Multi-select supported so admin can
// drag every past quote PDF for a customer in one go.

import { useEffect, useRef, useState } from "react";
import { Card } from "@/app/calculator/_components/ui";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = "application/pdf";

function fmtBytes(b) {
  if (b == null) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function AttachmentsEditor({ cardId }) {
  const [attachments, setAttachments] = useState(null); // null = loading
  const [busyFile, setBusyFile] = useState(null); // currently-uploading filename
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [err, setErr] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    fetch(`/api/rate-cards/${cardId}/attachments`)
      .then((r) => r.ok ? r.json() : [])
      .then((list) => setAttachments(Array.isArray(list) ? list : []))
      .catch(() => setAttachments([]));
  }, [cardId]);

  async function uploadOne(file) {
    if (file.type !== ACCEPT) {
      throw new Error(`Skipped ${file.name} — only PDFs are supported.`);
    }
    if (file.size > MAX_BYTES) {
      throw new Error(`${file.name} is too large (${fmtBytes(file.size)}). Max ${MAX_BYTES / (1024 * 1024)} MB.`);
    }
    setBusyFile(file.name);
    const fileBase64 = await fileToBase64(file);
    const res = await fetch(`/api/rate-cards/${cardId}/attachments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type,
        fileBase64,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Upload failed (${res.status})`);
    }
    return res.json();
  }

  async function handleFiles(files) {
    setErr("");
    const list = Array.from(files || []);
    if (list.length === 0) return;
    setProgress({ done: 0, total: list.length });
    const created = [];
    for (let i = 0; i < list.length; i += 1) {
      try {
        const att = await uploadOne(list[i]);
        created.push(att);
      } catch (e) {
        setErr((prev) => (prev ? `${prev}\n${e.message}` : e.message));
      }
      setProgress({ done: i + 1, total: list.length });
    }
    if (created.length > 0) {
      setAttachments((prev) => [...created, ...(prev || [])]);
    }
    setBusyFile(null);
    setProgress({ done: 0, total: 0 });
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleDelete(att) {
    if (!confirm(`Delete "${att.filename}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/rate-cards/attachments/${att.id}`, { method: "DELETE" });
    if (res.ok) {
      setAttachments((prev) => prev.filter((x) => x.id !== att.id));
    } else {
      const body = await res.json().catch(() => ({}));
      alert(body.error || "Delete failed");
    }
  }

  const uploading = !!busyFile;

  return (
    <Card
      title="Quote PDFs"
      right={
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-60"
        >
          {uploading ? "Uploading…" : "+ Upload PDFs"}
        </button>
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {progress.total > 0 && (
        <p className="text-xs text-blue-600 dark:text-blue-400 mb-3">
          Uploading {progress.done} / {progress.total} — {busyFile}
        </p>
      )}
      {err && (
        <p className="text-xs text-red-600 bg-red-50 dark:bg-red-950/40 dark:text-red-300 p-2 mb-3 rounded whitespace-pre-line">
          {err}
        </p>
      )}

      {attachments === null ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading attachments…</p>
      ) : attachments.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No PDFs yet. Drop existing quote PDFs you've shared with this customer here so they show up on their portal.
        </p>
      ) : (
        <ul className="space-y-2">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 border border-gray-100 dark:border-gray-800 rounded-lg p-3">
              <div className="min-w-0">
                <a
                  href={a.url || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-blue-700 dark:hover:text-blue-400 truncate block"
                >
                  {a.filename}
                </a>
                <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                  {[fmtBytes(a.bytes), a.createdAt && new Date(a.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }), a.uploadedBy && `by ${a.uploadedBy}`]
                    .filter(Boolean).join(" · ")}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={a.url || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
                >
                  View
                </a>
                <button
                  type="button"
                  onClick={() => handleDelete(a)}
                  className="text-xs text-red-500 hover:text-red-600 px-1"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
