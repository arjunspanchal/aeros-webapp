"use client";
import { useEffect, useState } from "react";
import { formatDateTime } from "@/app/factoryos/_components/ui";

// Read a File into a bare base64 string (no data: prefix) for the JSON upload.
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const ARTWORK_MAX_BYTES = 25 * 1024 * 1024;

// Team-side artwork manager for a job: upload print-ready artwork for the
// assigned vendor (replacing WhatsApp), and review proofs the vendor sends
// back. Self-contained — fetches its own state from the artworks API.
export default function JobArtworkCard({ jobId }) {
  const [artworks, setArtworks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    try {
      const res = await fetch(`/api/factoryos/jobs/${jobId}/artworks`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.artworks) setArtworks(data.artworks);
    } catch {
      // leave list empty on transient failure
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  async function uploadArtwork(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr("");
    if (file.size > ARTWORK_MAX_BYTES) {
      setErr("File too large. Max 25 MB.");
      return;
    }
    setUploading(true);
    try {
      const fileBase64 = await fileToBase64(file);
      const res = await fetch(`/api/factoryos/jobs/${jobId}/artworks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "artwork", filename: file.name, contentType: file.type, fileBase64 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed");
      if (data.artworks) setArtworks(data.artworks);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setUploading(false);
    }
  }

  async function remove(id) {
    if (!confirm("Remove this file?")) return;
    try {
      const res = await fetch(`/api/factoryos/jobs/${jobId}/artworks?artworkId=${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Delete failed");
      if (data.artworks) setArtworks(data.artworks);
    } catch (e) {
      setErr(e.message);
    }
  }

  const teamArtworks = artworks.filter((a) => a.kind === "artwork");
  const proofs = artworks.filter((a) => a.kind === "proof");

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 dark:bg-gray-900 dark:border-gray-800">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Artwork</h2>
        <label className="inline-flex items-center px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 cursor-pointer disabled:opacity-50">
          {uploading ? "Uploading…" : "+ Upload artwork"}
          <input type="file" className="hidden" disabled={uploading} onChange={uploadArtwork} />
        </label>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Files here are shared with the assigned printing vendor. PDF/AI/EPS/ZIP/JPG/PNG, max 25 MB.
      </p>
      {err && <p className="text-xs mt-2 text-red-600 dark:text-red-400">{err}</p>}

      {loading ? (
        <p className="text-xs text-gray-400 mt-3">Loading…</p>
      ) : (
        <>
          <div className="mt-4">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              For the vendor
            </div>
            {teamArtworks.length === 0 ? (
              <p className="text-xs text-gray-400 mt-1">No artwork uploaded yet.</p>
            ) : (
              <ul className="mt-1 divide-y divide-gray-100 dark:divide-gray-800">
                {teamArtworks.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{a.filename}</div>
                      <div className="text-xs text-gray-400">{formatDateTime(a.createdAt)}</div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {a.url && (
                        <a href={a.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline dark:text-blue-400">
                          Download
                        </a>
                      )}
                      <button onClick={() => remove(a.id)} className="text-xs text-red-600 hover:underline dark:text-red-400">
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Proofs from vendor
            </div>
            {proofs.length === 0 ? (
              <p className="text-xs text-gray-400 mt-1">None yet.</p>
            ) : (
              <ul className="mt-1 divide-y divide-gray-100 dark:divide-gray-800">
                {proofs.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{a.filename}</div>
                      <div className="text-xs text-gray-400">
                        {formatDateTime(a.createdAt)}
                        {a.uploadedByEmail && <> · {a.uploadedByEmail}</>}
                      </div>
                    </div>
                    {a.url && (
                      <a href={a.url} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-blue-600 hover:underline dark:text-blue-400">
                        View
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
