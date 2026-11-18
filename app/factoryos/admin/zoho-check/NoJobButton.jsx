"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// "No job needed" for a Zoho SO (stock, traded item, sample) — asks for the
// reason; managers only (the API checks).
export default function NoJobButton({ number, customer, date, undo = false }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function go() {
    let body = { number };
    if (!undo) {
      const reason = window.prompt(`Why does ${number} need no job? (e.g. stock item, traded item, sample)`);
      if (!reason || !reason.trim()) return;
      body = { number, reason: reason.trim(), customer, date };
    }
    setBusy(true);
    const res = await fetch("/api/factoryos/zoho/so-review", {
      method: undo ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) { const d = await res.json().catch(() => ({})); window.alert(d.error || "Failed"); return; }
    router.refresh();
  }
  return (
    <button type="button" onClick={go} disabled={busy} className="text-xs text-blue-700 hover:underline disabled:opacity-50 dark:text-blue-400">
      {busy ? "Saving…" : undo ? "Undo" : "No job needed"}
    </button>
  );
}
