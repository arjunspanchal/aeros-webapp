"use client";
import { useEffect, useRef, useState } from "react";
import { formatDateTime } from "@/app/factoryos/_components/ui";

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const MAX_BYTES = 25 * 1024 * 1024;
const KIND_LABEL = { artwork: "Artwork", proof: "Proof", challan: "Challan" };

// Unified per-job conversation: text + file attachments interleaved, shared by
// the Aeros team, the assigned vendor, and the customer. `viewerRole` is
// 'team' | 'vendor' | 'customer' and only affects bubble alignment + the "You"
// label. `initialThread` lets a server component seed the first render; the
// component refetches on mount to also stamp the thread read.

const OTHER_LABEL = {
  team: "Aeros team",
  vendor: "Vendor",
  customer: "Customer",
};
export default function JobThread({ jobId, viewerRole = "team", initialThread = null, title = "Messages" }) {
  const [thread, setThread] = useState(initialThread || []);
  const [loading, setLoading] = useState(!initialThread);
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const endRef = useRef(null);

  async function load() {
    try {
      const res = await fetch(`/api/factoryos/jobs/${jobId}/thread`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.thread) setThread(data.thread);
    } catch {
      /* keep current */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  // Light polling so new messages from the other side appear without a manual
  // refresh (no websockets needed). Only fires while the tab is visible, and
  // also refetches when the window regains focus.
  useEffect(() => {
    const tick = () => {
      if (typeof document !== "undefined" && !document.hidden) load();
    };
    const id = setInterval(tick, 20000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [thread.length]);

  async function send() {
    setErr("");
    if (!text.trim() && !file) return;
    if (file && file.size > MAX_BYTES) {
      setErr("File too large. Max 25 MB.");
      return;
    }
    setBusy(true);
    try {
      const payload = { body: text.trim() };
      if (file) {
        payload.filename = file.name;
        payload.contentType = file.type;
        payload.fileBase64 = await fileToBase64(file);
      }
      const res = await fetch(`/api/factoryos/jobs/${jobId}/thread`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to send");
      if (data.thread) setThread(data.thread);
      setText("");
      setFile(null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    if (!confirm("Delete this message?")) return;
    try {
      const res = await fetch(`/api/factoryos/jobs/${jobId}/thread?messageId=${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Delete failed");
      if (data.thread) setThread(data.thread);
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 dark:bg-gray-900 dark:border-gray-800">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{title}</h2>

      <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
        {loading && <p className="text-xs text-gray-400">Loading…</p>}
        {!loading && thread.length === 0 && (
          <p className="text-xs text-gray-400">No messages yet. Start the conversation below.</p>
        )}
        {thread.map((m) => {
          if (m.kind === "system") {
            return (
              <div key={m.id} className="text-center">
                <span className="inline-block text-[11px] text-gray-500 bg-gray-100 rounded-full px-3 py-1 dark:bg-gray-800 dark:text-gray-400">
                  {m.body} · {formatDateTime(m.createdAt)}
                </span>
              </div>
            );
          }
          const mine = m.authorRole === viewerRole;
          const isImage = m.file && (m.file.contentType || "").startsWith("image/");
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  mine
                    ? "bg-blue-600 text-white rounded-br-sm"
                    : "bg-gray-100 text-gray-900 rounded-bl-sm dark:bg-gray-800 dark:text-gray-100"
                }`}
              >
                <div className={`text-[10px] mb-0.5 ${mine ? "text-blue-100" : "text-gray-500 dark:text-gray-400"}`}>
                  {mine ? "You" : OTHER_LABEL[m.authorRole] || "Aeros team"}
                  {m.file && KIND_LABEL[m.kind] ? ` · ${KIND_LABEL[m.kind]}` : ""}
                </div>
                {m.body && <div className="whitespace-pre-wrap break-words">{m.body}</div>}
                {m.file && (
                  <div className="mt-1">
                    {isImage && m.file.url ? (
                      <a href={m.file.url} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={m.file.url} alt={m.file.filename} className="max-h-44 rounded-lg border border-black/10" />
                      </a>
                    ) : null}
                    {m.file.url ? (
                      <a
                        href={m.file.url}
                        target="_blank"
                        rel="noreferrer"
                        className={`inline-flex items-center gap-1 text-xs underline ${mine ? "text-blue-100" : "text-blue-600 dark:text-blue-400"}`}
                      >
                        ⬇ {m.file.filename}
                      </a>
                    ) : (
                      <span className="text-xs opacity-70">{m.file.filename}</span>
                    )}
                  </div>
                )}
                <div className={`text-[10px] mt-1 flex items-center gap-2 ${mine ? "text-blue-100" : "text-gray-400"}`}>
                  <span>{formatDateTime(m.createdAt)}</span>
                  {mine && (
                    <button onClick={() => remove(m.id)} className="underline opacity-80 hover:opacity-100">
                      delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="mt-3 border-t border-gray-100 dark:border-gray-800 pt-3">
        {file && (
          <div className="flex items-center justify-between text-xs bg-gray-50 dark:bg-gray-800 rounded-lg px-2 py-1 mb-2">
            <span className="truncate">📎 {file.name}</span>
            <button onClick={() => setFile(null)} className="text-red-600 dark:text-red-400 ml-2">remove</button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            rows={2}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 resize-none"
            placeholder="Write a message…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
            }}
          />
          <label className="shrink-0 cursor-pointer px-2.5 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800" title="Attach a file">
            📎
            <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
          <button
            onClick={send}
            disabled={busy || (!text.trim() && !file)}
            className="shrink-0 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "…" : "Send"}
          </button>
        </div>
        {err && <p className="text-xs mt-1 text-red-600 dark:text-red-400">{err}</p>}
        <p className="text-[10px] text-gray-400 mt-1">Files up to 25 MB · ⌘/Ctrl+Enter to send</p>
      </div>
    </div>
  );
}
