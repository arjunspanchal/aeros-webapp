"use client";
// Read-only list of PDF attachments on a rate card. Used by the customer
// detail page so a client can download every quote PDF ever sent to them.
// Rendered as a flat list of cards with file name, size, upload date and
// a primary download button.

import { Card } from "@/app/calculator/_components/ui";

function fmtBytes(b) {
  if (b == null) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function AttachmentList({ attachments, title = "Quote PDFs" }) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <Card title={title}>
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
                {[fmtBytes(a.bytes), fmtDate(a.createdAt), a.uploadedBy && `by ${a.uploadedBy}`]
                  .filter(Boolean).join(" · ")}
              </div>
              {a.notes && <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{a.notes}</div>}
            </div>
            <a
              href={a.url || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-md"
            >
              Download
            </a>
          </li>
        ))}
      </ul>
    </Card>
  );
}
