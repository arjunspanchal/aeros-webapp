"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Card, inputCls } from "@/app/calculator/_components/ui";

export default function RateCardsList({ cards, isAdmin }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return cards;
    return cards.filter((c) =>
      [c.ref, c.title, c.brand, c.clientEmail, c.clientName, c.status]
        .filter(Boolean).some((s) => String(s).toLowerCase().includes(needle)),
    );
  }, [cards, q]);

  if (!cards || cards.length === 0) {
    return (
      <Card>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {isAdmin
            ? "No rate cards yet. Click “+ New Card” in the top bar to create one."
            : "No rate cards published for you yet. Your account manager will share them here."}
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <input
        className={`${inputCls} mb-4`}
        placeholder="Search by ref, brand, customer…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 uppercase border-b border-gray-100 dark:text-gray-500 dark:border-gray-800">
              <th className="text-left pb-2 font-medium">Ref</th>
              <th className="text-left pb-2 font-medium">Title</th>
              <th className="text-left pb-2 font-medium">Brand</th>
              {isAdmin && <th className="text-left pb-2 font-medium">Customer</th>}
              <th className="text-left pb-2 font-medium">Status</th>
              <th className="text-left pb-2 font-medium">Created</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800">
                <td className="py-2 font-medium text-gray-900 dark:text-gray-100">{c.ref}</td>
                <td className="py-2 text-gray-700 dark:text-gray-300">{c.title || "—"}</td>
                <td className="py-2 text-gray-500 text-xs dark:text-gray-400">{c.brand || "—"}</td>
                {isAdmin && (
                  <td className="py-2 text-gray-500 text-xs dark:text-gray-400">
                    {c.clientName ? `${c.clientName} · ` : ""}{c.clientEmail}
                  </td>
                )}
                <td className="py-2">
                  <StatusBadge status={c.status} />
                </td>
                <td className="py-2 text-gray-500 text-xs dark:text-gray-400">
                  {c.created ? new Date(c.created).toLocaleDateString() : "—"}
                </td>
                <td className="py-2 text-right">
                  <Link href={`/rate-cards/${c.id}`} className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400">
                    View
                  </Link>
                  {isAdmin && (
                    <>
                      <span className="text-gray-300 dark:text-gray-700 mx-1">·</span>
                      <Link href={`/rate-cards/admin/${c.id}/edit`} className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400">
                        Edit
                      </Link>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && <p className="text-sm text-gray-400 text-center py-4 dark:text-gray-500">No matches.</p>}
    </Card>
  );
}

function StatusBadge({ status }) {
  const tone = status === "Published" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
    : status === "Archived"  ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
    : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${tone}`}>
      {status || "Draft"}
    </span>
  );
}
