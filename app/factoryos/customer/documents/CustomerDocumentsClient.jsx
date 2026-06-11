"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { formatDateTime, inputCls } from "@/app/factoryos/_components/ui";

// Friendly labels for each `kind`. `lr` and `challan` are dispatch docs we
// expect customers to care about most.
const KIND_LABEL = {
  artwork: "Artwork from Aeros",
  proof:   "Proofs",
  challan: "Dispatch challans",
  lr:      "LR / waybill",
  message: "Other files",
};

const KIND_ORDER = ["artwork", "proof", "challan", "lr", "message"];

const FILTERS = [
  { value: "all",     label: "All" },
  { value: "artwork", label: "Artwork" },
  { value: "proof",   label: "Proofs" },
  { value: "challan", label: "Challans" },
  { value: "lr",      label: "LR / waybill" },
];

function humanSize(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function CustomerDocumentsClient({ initialDocs }) {
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return initialDocs.filter((d) => {
      if (filter !== "all" && d.kind !== filter) return false;
      if (!term) return true;
      const hay = `${d.filename} ${d.jNumber || ""} ${d.jobItem || ""} ${d.jobBrand || ""}`.toLowerCase();
      return hay.includes(term);
    });
  }, [initialDocs, filter, q]);

  // Group by kind for the page, then within each group keep the recency order
  // we received them in. Grouped is easier to scan than a flat 200-row list.
  const grouped = useMemo(() => {
    const map = new Map();
    for (const d of filtered) {
      const k = d.kind || "message";
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(d);
    }
    const out = [];
    for (const k of KIND_ORDER) {
      const list = map.get(k);
      if (list && list.length) out.push({ kind: k, list });
    }
    return out;
  }, [filtered]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Documents</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Every artwork, proof, challan, and LR copy across your orders. Files
          are signed and may expire — re-open this page to get fresh links.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1 text-xs dark:bg-gray-900 dark:border-gray-800 shrink-0 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 rounded-md font-medium whitespace-nowrap ${
                filter === f.value
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          className={inputCls}
          placeholder="Search by filename, J# or item…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {grouped.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-500 dark:bg-gray-900 dark:border-gray-800 dark:text-gray-400">
          {q || filter !== "all" ? "No files match." : "No documents on file yet. Aeros will share artwork, proofs, and dispatch papers here as your orders progress."}
        </div>
      ) : (
        grouped.map(({ kind, list }) => (
          <section key={kind} className="bg-white border border-gray-200 rounded-xl overflow-hidden dark:bg-gray-900 dark:border-gray-800">
            <header className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{KIND_LABEL[kind] || kind}</h3>
              <span className="text-xs text-gray-500 dark:text-gray-400">{list.length}</span>
            </header>
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {list.map((d) => (
                <li key={d.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm text-gray-900 dark:text-white truncate">{d.filename}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                      {d.jobId ? (
                        <Link href={`/factoryos/customer/${d.jobId}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                          J# {d.jNumber}
                        </Link>
                      ) : (
                        <>J# {d.jNumber}</>
                      )}
                      {d.jobItem && <> · {d.jobItem}</>}
                      {d.jobBrand && <> · {d.jobBrand}</>}
                      {d.createdAt && <> · {formatDateTime(d.createdAt)}</>}
                      {d.sizeBytes ? <> · {humanSize(d.sizeBytes)}</> : null}
                    </div>
                  </div>
                  {d.url ? (
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-xs text-blue-600 hover:underline dark:text-blue-400"
                    >
                      Download ↗
                    </a>
                  ) : (
                    <span className="shrink-0 text-xs text-gray-400">link expired</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
