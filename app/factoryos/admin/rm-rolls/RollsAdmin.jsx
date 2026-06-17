"use client";
import { useMemo, useState } from "react";

const input = "rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100";

function lineLabel(l) {
  return [l.name, l.paperType, l.gsm ? `${l.gsm} GSM` : null, l.supplier].filter(Boolean).join(" · ") || l.name || "(unnamed)";
}

const STATUS_TONE = {
  in_stock: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  in_use:   "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  consumed: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

export default function RollsAdmin({ stockLines = [], initialRolls = [] }) {
  const [rolls, setRolls] = useState(initialRolls);
  const [mode, setMode] = useState("single"); // single | bulk
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [filter, setFilter] = useState("in_stock");

  // single
  const [rawMaterialId, setRawMaterialId] = useState("");
  const [serial, setSerial] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [location, setLocation] = useState("");

  // bulk
  const [bulkLine, setBulkLine] = useState("");
  const [bulkText, setBulkText] = useState("");

  const shown = useMemo(
    () => rolls.filter((r) => filter === "all" || r.status === filter),
    [rolls, filter],
  );
  const counts = useMemo(() => {
    const c = { all: rolls.length, in_stock: 0, in_use: 0, consumed: 0 };
    for (const r of rolls) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [rolls]);

  async function addSingle(e) {
    e.preventDefault();
    setErr(""); setOk("");
    if (!Number(weightKg)) { setErr("Weight (kg) is required"); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/factoryos/rm-rolls", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawMaterialId: rawMaterialId || null, serial, weightKg: Number(weightKg), location }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setRolls((p) => [d.roll, ...p]);
      setOk(`Added roll ${d.roll.serial}`);
      setSerial(""); setWeightKg("");
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  async function addBulk(e) {
    e.preventDefault();
    setErr(""); setOk("");
    // Each line: "serial, weight" OR just "weight" (auto-serial). Tab/comma separated.
    const parsed = bulkText.split("\n").map((ln) => ln.trim()).filter(Boolean).map((ln) => {
      const parts = ln.split(/[,\t]/).map((p) => p.trim());
      if (parts.length === 1) return { serial: "", weightKg: Number(parts[0]) };
      return { serial: parts[0], weightKg: Number(parts[1]) };
    }).filter((r) => Number.isFinite(r.weightKg) && r.weightKg > 0);
    if (!parsed.length) { setErr("Paste at least one line with a weight"); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/factoryos/rm-rolls", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rolls: parsed.map((r) => ({ ...r, rawMaterialId: bulkLine || null })) }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setRolls((p) => [...d.rolls, ...p]);
      setOk(`Added ${d.rolls.length} roll(s)`);
      setBulkText("");
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  return (
    <div className="mt-6 space-y-6">
      {/* Add form */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-3 inline-flex rounded-lg border border-gray-200 p-1 dark:border-gray-800">
          {["single", "bulk"].map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-3 py-1.5 text-sm rounded-md ${mode === m ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "text-gray-600 dark:text-gray-300"}`}>
              {m === "single" ? "Add one roll" : "Bulk paste"}
            </button>
          ))}
        </div>

        {mode === "single" ? (
          <form onSubmit={addSingle} className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
            <label className="sm:col-span-2 text-sm">
              <span className="block text-gray-600 dark:text-gray-300 mb-1">Paper (stock line)</span>
              <select className={`${input} w-full`} value={rawMaterialId} onChange={(e) => setRawMaterialId(e.target.value)}>
                <option value="">— none / generic —</option>
                {stockLines.map((l) => <option key={l.id} value={l.id}>{lineLabel(l)}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-gray-600 dark:text-gray-300 mb-1">Serial (blank = auto)</span>
              <input className={`${input} w-full`} value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="auto" />
            </label>
            <label className="text-sm">
              <span className="block text-gray-600 dark:text-gray-300 mb-1">Weight (kg) *</span>
              <input className={`${input} w-full`} value={weightKg} onChange={(e) => setWeightKg(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" />
            </label>
            <label className="text-sm">
              <span className="block text-gray-600 dark:text-gray-300 mb-1">Location</span>
              <input className={`${input} w-full`} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Godown A" />
            </label>
            <div className="sm:col-span-5">
              <button disabled={busy} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                {busy ? "Adding…" : "Add roll"}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={addBulk} className="space-y-3">
            <label className="block text-sm">
              <span className="block text-gray-600 dark:text-gray-300 mb-1">Paper (stock line) for all rolls</span>
              <select className={`${input} w-full sm:w-1/2`} value={bulkLine} onChange={(e) => setBulkLine(e.target.value)}>
                <option value="">— none / generic —</option>
                {stockLines.map((l) => <option key={l.id} value={l.id}>{lineLabel(l)}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="block text-gray-600 dark:text-gray-300 mb-1">One roll per line — <code>serial, weight</code> or just <code>weight</code> (auto-serial)</span>
              <textarea className={`${input} w-full font-mono`} rows={6} value={bulkText} onChange={(e) => setBulkText(e.target.value)}
                placeholder={"JOD-001, 1450\nJOD-002, 1480\n1500"} />
            </label>
            <button disabled={busy} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {busy ? "Adding…" : "Add rolls"}
            </button>
          </form>
        )}
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        {ok && <p className="mt-2 text-sm text-green-600">{ok}</p>}
      </div>

      {/* Roll list */}
      <div>
        <div className="mb-2 inline-flex rounded-lg border border-gray-200 p-1 text-sm dark:border-gray-800">
          {[["in_stock", "In stock"], ["in_use", "In use"], ["consumed", "Consumed"], ["all", "All"]].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-md ${filter === k ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "text-gray-600 dark:text-gray-300"}`}>
              {l} <span className="opacity-60">{counts[k] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
              <tr>
                <th className="px-3 py-2 text-left">Serial</th>
                <th className="px-3 py-2 text-left">Paper</th>
                <th className="px-3 py-2 text-right">Weight</th>
                <th className="px-3 py-2 text-right">Remaining</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {shown.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-500">No rolls in this view.</td></tr>
              ) : shown.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-mono text-xs text-gray-900 dark:text-gray-100">{r.serial}</td>
                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{[r.supplier, r.paperType, r.gsm ? `${r.gsm}g` : null].filter(Boolean).join(" · ") || r.paperName || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.weightKg} kg</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.remainingKg} kg</td>
                  <td className="px-3 py-2"><span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${STATUS_TONE[r.status] || ""}`}>{r.status.replace("_", " ")}</span></td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{r.location || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
