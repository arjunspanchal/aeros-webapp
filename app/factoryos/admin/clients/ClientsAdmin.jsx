"use client";
import { useState } from "react";
import { inputCls, labelCls } from "@/app/factoryos/_components/ui";

const EMPTY = {
  name: "",
  code: "",
  contactPerson: "",
  contactEmail: "",
  contactPhone: "",
  brandManager: "",
  brandManagerEmail: "",
};

// Sentinel values for the Brand Manager <select> — empty = "none", "__new__"
// triggers the inline add-new form.
const BM_NONE = "";
const BM_NEW = "__new__";

// Given the list of BMs + the client's stored name/email, pick the option the
// dropdown should start on. Match by email first (stable); fall back to name.
function pickInitialBm(bms, name, email) {
  const e = (email || "").toLowerCase().trim();
  if (e) {
    const byEmail = bms.find((x) => (x.email || "").toLowerCase() === e);
    if (byEmail) return byEmail.id;
  }
  const n = (name || "").trim().toLowerCase();
  if (n) {
    const byName = bms.find((x) => (x.name || "").trim().toLowerCase() === n);
    if (byName) return byName.id;
  }
  return BM_NONE;
}

export default function ClientsAdmin({ initialClients, initialBrandManagers = [] }) {
  const [clients, setClients] = useState(initialClients);
  const [brandManagers, setBrandManagers] = useState(initialBrandManagers);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [bmChoice, setBmChoice] = useState(BM_NONE); // id of picked BM, or BM_NEW, or BM_NONE
  const [newBm, setNewBm] = useState({ name: "", email: "", busy: false, err: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const isEditing = editingId !== null;

  function setBm(id) {
    setBmChoice(id);
    if (id === BM_NONE) {
      setForm((f) => ({ ...f, brandManager: "", brandManagerEmail: "" }));
    } else if (id === BM_NEW) {
      // Keep any pre-existing manual values as a starting point for the inline form.
      setNewBm({ name: form.brandManager || "", email: form.brandManagerEmail || "", busy: false, err: "" });
    } else {
      const bm = brandManagers.find((x) => x.id === id);
      if (bm) setForm((f) => ({ ...f, brandManager: bm.name, brandManagerEmail: bm.email }));
    }
  }

  async function saveNewBm() {
    setNewBm((n) => ({ ...n, busy: true, err: "" }));
    const res = await fetch("/api/factoryos/brand-managers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newBm.name, email: newBm.email }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setNewBm((n) => ({ ...n, busy: false, err: data.error || "Failed" }));
      return;
    }
    const { brandManager } = await res.json();
    // Merge into list (dedup by id), auto-select, and copy name/email onto the client form.
    setBrandManagers((prev) => {
      const map = new Map(prev.map((x) => [x.id, x]));
      map.set(brandManager.id, brandManager);
      return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    });
    setBmChoice(brandManager.id);
    setForm((f) => ({ ...f, brandManager: brandManager.name, brandManagerEmail: brandManager.email }));
    setNewBm({ name: "", email: "", busy: false, err: "" });
  }

  function startEdit(c) {
    setEditingId(c.id);
    const next = {
      name: c.name || "",
      code: c.code || "",
      contactPerson: c.contactPerson || "",
      contactEmail: c.contactEmail || "",
      contactPhone: c.contactPhone || "",
      brandManager: c.brandManager || "",
      brandManagerEmail: c.brandManagerEmail || "",
    };
    setForm(next);
    setBmChoice(pickInitialBm(brandManagers, next.brandManager, next.brandManagerEmail));
    setErr("");
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY);
    setBmChoice(BM_NONE);
    setNewBm({ name: "", email: "", busy: false, err: "" });
    setErr("");
  }

  async function submit(e) {
    e.preventDefault();
    setErr(""); setBusy(true);
    const url = isEditing ? `/api/factoryos/clients/${editingId}` : "/api/factoryos/clients";
    const method = isEditing ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setBusy(false);
    if (!res.ok) { setErr((await res.json()).error || "Failed"); return; }
    const data = await res.json();
    if (isEditing) {
      setClients((prev) => prev.map((c) => (c.id === editingId ? data.client : c)).sort((a, b) => a.name.localeCompare(b.name)));
    } else {
      setClients((prev) => [...prev, data.client].sort((a, b) => a.name.localeCompare(b.name)));
    }
    cancelEdit();
  }

  async function requestDelete(c) {
    const res = await fetch(`/api/factoryos/clients/${c.id}?count=jobs`);
    if (!res.ok) {
      alert(`Couldn't check jobs for this client. ${(await res.json()).error || ""}`);
      return;
    }
    const { jobCount } = await res.json();
    const msg = jobCount > 0
      ? `Delete "${c.name}" and its ${jobCount} job${jobCount === 1 ? "" : "s"}? This also removes every timeline entry on those jobs. This cannot be undone.`
      : `Delete "${c.name}"? It has no jobs. This cannot be undone.`;
    if (!window.confirm(msg)) return;

    setBusy(true);
    const del = await fetch(`/api/factoryos/clients/${c.id}`, { method: "DELETE" });
    setBusy(false);
    if (!del.ok) {
      alert(`Delete failed: ${(await del.json()).error || "unknown"}`);
      return;
    }
    setClients((prev) => prev.filter((x) => x.id !== c.id));
    if (editingId === c.id) cancelEdit();
  }

  return (
    <div className="mt-6 grid grid-cols-1 lg:grid-cols-5 gap-6">
      <form onSubmit={submit} className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-5 space-y-3 dark:bg-gray-900 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
            {isEditing ? "Edit client" : "Add client"}
          </h2>
          {isEditing && (
            <button type="button" onClick={cancelEdit} className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
              Cancel
            </button>
          )}
        </div>

        <div>
          <label className={labelCls}>Name</label>
          <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div>
          <label className={labelCls}>Code (optional)</label>
          <input className={inputCls} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        </div>

        <div>
          <label className={labelCls}>Brand manager</label>
          <select className={inputCls} value={bmChoice} onChange={(e) => setBm(e.target.value)}>
            <option value={BM_NONE}>— None —</option>
            {brandManagers.map((bm) => (
              <option key={bm.id} value={bm.id}>
                {bm.name ? `${bm.name} (${bm.email})` : bm.email}
              </option>
            ))}
            <option value={BM_NEW}>+ Add new brand manager…</option>
          </select>
          {bmChoice === BM_NEW && (
            <div className="mt-2 rounded-lg border border-dashed border-gray-300 p-3 space-y-2 dark:border-gray-700">
              <div>
                <label className={labelCls}>New brand manager name</label>
                <input className={inputCls} value={newBm.name} onChange={(e) => setNewBm({ ...newBm, name: e.target.value })} placeholder="e.g. Sneha" />
              </div>
              <div>
                <label className={labelCls}>New brand manager email</label>
                <input type="email" className={inputCls} value={newBm.email} onChange={(e) => setNewBm({ ...newBm, email: e.target.value })} placeholder="sneha@theepackagingcompany.com" />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={newBm.busy || !newBm.name.trim() || !newBm.email.trim()}
                  onClick={saveNewBm}
                  className="bg-blue-600 text-white text-xs font-medium px-3 py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-60"
                >
                  {newBm.busy ? "Saving…" : "Save brand manager"}
                </button>
                <button
                  type="button"
                  onClick={() => setBm(BM_NONE)}
                  className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  Cancel
                </button>
              </div>
              {newBm.err && <p className="text-xs text-red-500">{newBm.err}</p>}
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Creating a brand manager adds them as an Account Manager user with OTP login access to FactoryOS.
              </p>
            </div>
          )}
        </div>

        <div>
          <label className={labelCls}>Contact person</label>
          <input className={inputCls} value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>Contact email</label>
          <input type="email" className={inputCls} value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>Contact phone</label>
          <input className={inputCls} value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
        </div>
        <button disabled={busy} className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60">
          {busy ? (isEditing ? "Saving…" : "Adding…") : (isEditing ? "Save changes" : "Add client")}
        </button>
        {err && <p className="text-xs text-red-500">{err}</p>}
      </form>

      {/* Mobile: stacked cards so Edit/Delete are always visible.
          Desktop (sm+): traditional table with actions in the last column. */}
      <div className="lg:col-span-3 bg-white border border-gray-200 rounded-xl dark:bg-gray-900 dark:border-gray-800 overflow-x-auto">
        {/* --- Mobile cards --- */}
        <ul className="sm:hidden divide-y divide-gray-100 dark:divide-gray-800">
          {clients.map((c) => (
            <li key={c.id} className={`px-4 py-3 ${editingId === c.id ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">{c.name}</div>
                  {c.code && <div className="text-xs text-gray-500 dark:text-gray-400">{c.code}</div>}
                  {(c.brandManager || c.brandManagerEmail) && (
                    <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                      <span className="text-gray-400 dark:text-gray-500">BM: </span>
                      {c.brandManager || c.brandManagerEmail}
                    </div>
                  )}
                  {(c.contactPerson || c.contactEmail) && (
                    <div className="text-xs text-gray-600 dark:text-gray-300">
                      <span className="text-gray-400 dark:text-gray-500">Contact: </span>
                      {c.contactPerson || c.contactEmail}
                    </div>
                  )}
                </div>
                <div className="shrink-0 flex flex-col gap-2 items-end">
                  <button
                    onClick={() => startEdit(c)}
                    className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => requestDelete(c)}
                    disabled={busy}
                    className="text-xs text-red-600 hover:underline dark:text-red-400 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
          {clients.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">No clients yet.</li>
          )}
        </ul>

        {/* --- Desktop table --- */}
        <table className="hidden sm:table w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase dark:bg-gray-800/50 dark:text-gray-400">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Name</th>
              <th className="text-left px-4 py-2 font-medium">Brand manager</th>
              <th className="text-left px-4 py-2 font-medium">Contact</th>
              <th className="text-right px-4 py-2 font-medium">&nbsp;</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {clients.map((c) => (
              <tr key={c.id} className={editingId === c.id ? "bg-blue-50 dark:bg-blue-900/20" : ""}>
                <td className="px-4 py-2">
                  <div className="text-gray-900 dark:text-white">{c.name}</div>
                  {c.code && <div className="text-xs text-gray-500 dark:text-gray-400">{c.code}</div>}
                </td>
                <td className="px-4 py-2">
                  {c.brandManager || c.brandManagerEmail ? (
                    <>
                      <div className="text-gray-900 dark:text-white">{c.brandManager || "—"}</div>
                      {c.brandManagerEmail && <div className="text-xs text-gray-500 dark:text-gray-400">{c.brandManagerEmail}</div>}
                    </>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500">—</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <div className="text-gray-600 dark:text-gray-300">{c.contactPerson || "—"}</div>
                  {c.contactEmail && <div className="text-xs text-gray-500 dark:text-gray-400">{c.contactEmail}</div>}
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <button
                    onClick={() => startEdit(c)}
                    className="text-xs text-blue-600 hover:underline dark:text-blue-400 mr-3"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => requestDelete(c)}
                    disabled={busy}
                    className="text-xs text-red-600 hover:underline dark:text-red-400 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {clients.length === 0 && <tr><td colSpan={4} className="text-center text-sm text-gray-500 py-8 dark:text-gray-400">No clients yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
