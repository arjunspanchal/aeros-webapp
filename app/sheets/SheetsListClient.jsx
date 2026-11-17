"use client";
// Sheets — the team's shared online spreadsheets. This page lists every
// live workbook; the grid editor lives at /sheets/[id]. Everything is
// stored in Supabase (team_sheets) so any teammate can open, edit and the
// changes are saved online automatically.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

function timeSince(iso) {
  if (!iso) return "";
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24); if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function who(email) {
  if (!email) return "—";
  return email.split("@")[0];
}

export default function SheetsListClient({ initialSheets, currentEmail }) {
  const router = useRouter();
  const [sheets, setSheets] = useState(initialSheets || []);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  async function handleCreate() {
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create sheet");
      router.push(`/sheets/${json.sheet.id}`);
    } catch (e) {
      setError(e.message || "Failed");
      setCreating(false);
    }
  }

  async function handleArchive(id, name) {
    if (!window.confirm(`Archive "${name}"? It disappears from this list (data is kept).`)) return;
    setBusyId(id);
    setError("");
    try {
      const res = await fetch(`/api/sheets/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to archive");
      setSheets((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      setError(e.message || "Failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/hub" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400">
          ← Hub
        </Link>

        <div className="mt-4 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Sheets</h1>
            <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
              Shared spreadsheets for the team. Everything saves online automatically — open a sheet
              from any device and pick up where anyone left off.
            </p>
          </div>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? "Creating…" : "＋ New sheet"}
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="mt-6 rounded-xl border border-gray-200 bg-white overflow-hidden dark:bg-gray-900 dark:border-gray-800">
          {sheets.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="text-4xl">🗒️</div>
              <p className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-200">No sheets yet</p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Create the first one — stock counts, dispatch plans, price workings, anything the team
                tracks in a grid.
              </p>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="mt-4 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {creating ? "Creating…" : "Create a sheet"}
              </button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                  <th className="py-2.5 px-4 font-medium">Name</th>
                  <th className="py-2.5 px-4 font-medium hidden sm:table-cell">Last edited</th>
                  <th className="py-2.5 px-4 font-medium hidden md:table-cell">By</th>
                  <th className="py-2.5 px-4 font-medium hidden md:table-cell">Created by</th>
                  <th className="py-2.5 px-4" />
                </tr>
              </thead>
              <tbody>
                {sheets.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50/70 dark:border-gray-800/60 dark:hover:bg-gray-800/40"
                  >
                    <td className="py-0 px-0">
                      <Link href={`/sheets/${s.id}`} className="block py-3 px-4 font-medium text-gray-900 hover:text-blue-700 dark:text-gray-100 dark:hover:text-blue-400">
                        {s.name}
                      </Link>
                    </td>
                    <td className="py-3 px-4 text-gray-500 dark:text-gray-400 hidden sm:table-cell">{timeSince(s.updated_at)}</td>
                    <td className="py-3 px-4 text-gray-500 dark:text-gray-400 hidden md:table-cell">{who(s.updated_by)}</td>
                    <td className="py-3 px-4 text-gray-500 dark:text-gray-400 hidden md:table-cell">{who(s.created_by)}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleArchive(s.id, s.name)}
                        disabled={busyId === s.id}
                        className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-50"
                        title="Archive sheet"
                      >
                        {busyId === s.id ? "…" : "Archive"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="mt-4 text-xs text-gray-400 dark:text-gray-500">
          Signed in as {currentEmail || "admin"} · sheets are visible to the whole internal team.
        </p>
      </main>
    </div>
  );
}
