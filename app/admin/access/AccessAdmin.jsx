"use client";
// One-row-per-user editor for the unified access page. Click a row to
// expand into an inline edit form — every access knob (FactoryOS role,
// Calculator role, client links, pricing, active flag) is in one place.
// Save is per-user PATCH; the row collapses on success and the list
// re-renders with the latest snapshot.

import { useMemo, useState } from "react";

const inputCls =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:focus:ring-blue-400";
const labelCls = "block text-xs font-medium text-gray-500 mb-1 dark:text-gray-400";

const FACTORYOS_ROLES = [
  { value: "", label: "— None —" },
  { value: "admin", label: "Admin" },
  { value: "factory_manager", label: "Factory Manager" },
  { value: "factory_executive", label: "Factory Executive" },
  { value: "account_manager", label: "Customer Manager" },
  { value: "customer", label: "Customer" },
];

const CALCULATOR_ROLES = [
  { value: "", label: "— None —" },
  { value: "client", label: "Client" },
  { value: "admin", label: "Admin" },
];

function roleBadge(value) {
  if (!value) return <span className="text-gray-400 dark:text-gray-500">—</span>;
  const lookup = FACTORYOS_ROLES.find((r) => r.value === value)?.label
    || CALCULATOR_ROLES.find((r) => r.value === value)?.label
    || value;
  return <span className="text-gray-900 dark:text-gray-100">{lookup}</span>;
}

function fmtClients(clients) {
  if (!clients || clients.length === 0) return <span className="text-gray-400 dark:text-gray-500">—</span>;
  return clients.map((c) => c.name).join(", ");
}

function pickFormFromUser(u) {
  return {
    name: u.name || "",
    designation: u.designation || "",
    phone: u.phone || "",
    company: u.company || "",
    factoryosRole: u.factoryosRole || "",
    calculatorRole: u.calculatorRole || "",
    active: u.active !== false,
    marginPct: u.marginPct ?? "",
    marginCupsPct: u.marginCupsPct ?? "",
    discountPct: u.discountPct ?? "",
    preferredCurrency: u.preferredCurrency || "INR",
    preferredUnit: u.preferredUnit || "mm",
    clientIds: [...(u.clientIds || [])],
    notes: u.notes || "",
  };
}

function UserRow({ user, clients, onSaved }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => pickFormFromUser(user));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [clientQuery, setClientQuery] = useState("");

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  function toggle() {
    if (open) {
      // Reset form to current user state when closing — discards in-flight edits.
      setForm(pickFormFromUser(user));
      setErr("");
      setClientQuery("");
    }
    setOpen((o) => !o);
  }

  function toggleClient(id) {
    setForm((f) => {
      const has = f.clientIds.includes(id);
      return { ...f, clientIds: has ? f.clientIds.filter((x) => x !== id) : [...f.clientIds, id] };
    });
  }

  async function save() {
    setBusy(true); setErr("");
    const res = await fetch(`/api/admin/access/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setErr(body.error || `Save failed (${res.status})`);
      return;
    }
    const { user: updated } = await res.json();
    onSaved(updated);
    setOpen(false);
  }

  const filteredClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => `${c.name} ${c.code}`.toLowerCase().includes(q));
  }, [clients, clientQuery]);

  return (
    <>
      <tr
        onClick={toggle}
        className={`cursor-pointer border-b border-gray-50 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800 ${open ? "bg-blue-50/40 dark:bg-blue-900/20" : ""}`}
      >
        <td className="py-2 pr-3">
          <span className="text-gray-400 mr-1 dark:text-gray-500 inline-block w-3">{open ? "▾" : "▸"}</span>
          <span className="font-medium text-gray-900 dark:text-gray-100">{user.name || "—"}</span>
          <span className="block text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 break-all">{user.email}</span>
        </td>
        <td className="py-2 text-sm">{roleBadge(user.factoryosRole)}</td>
        <td className="py-2 text-sm">{roleBadge(user.calculatorRole)}</td>
        <td className="py-2 text-xs text-gray-600 dark:text-gray-400 max-w-xs">{fmtClients(user.clients)}</td>
        <td className="py-2 text-right text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
          {user.active ? <span className="text-green-700 dark:text-green-400">Active</span> : <span className="text-red-600 dark:text-red-400">Inactive</span>}
        </td>
      </tr>

      {open && (
        <tr>
          <td colSpan={5} className="p-0">
            <div className="bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 p-5 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div><label className={labelCls}>Name</label><input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
                <div><label className={labelCls}>Designation</label><input className={inputCls} value={form.designation} onChange={(e) => set("designation", e.target.value)} /></div>
                <div><label className={labelCls}>Phone</label><input className={inputCls} value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
                <div><label className={labelCls}>Company (label only)</label><input className={inputCls} value={form.company} onChange={(e) => set("company", e.target.value)} placeholder="legacy free-text label" /></div>
                <div>
                  <label className={labelCls}>FactoryOS role</label>
                  <select className={inputCls} value={form.factoryosRole} onChange={(e) => set("factoryosRole", e.target.value)}>
                    {FACTORYOS_ROLES.map((r) => <option key={r.value || "none"} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Calculator role</label>
                  <select className={inputCls} value={form.calculatorRole} onChange={(e) => set("calculatorRole", e.target.value)}>
                    {CALCULATOR_ROLES.map((r) => <option key={r.value || "none"} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <div className="flex items-end gap-2">
                  <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-200">
                    <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
                    Active (can sign in)
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div><label className={labelCls}>Margin % — bags / boxes</label><input type="number" step="0.5" className={inputCls} value={form.marginPct} onChange={(e) => set("marginPct", e.target.value)} /></div>
                <div><label className={labelCls}>Margin % — cups</label><input type="number" step="0.5" className={inputCls} value={form.marginCupsPct} onChange={(e) => set("marginCupsPct", e.target.value)} /></div>
                <div><label className={labelCls}>Discount %</label><input type="number" step="0.5" className={inputCls} value={form.discountPct} onChange={(e) => set("discountPct", e.target.value)} /></div>
                <div>
                  <label className={labelCls}>Currency</label>
                  <input className={inputCls} value={form.preferredCurrency} onChange={(e) => set("preferredCurrency", e.target.value)} placeholder="INR" />
                </div>
                <div>
                  <label className={labelCls}>Units</label>
                  <select className={inputCls} value={form.preferredUnit} onChange={(e) => set("preferredUnit", e.target.value)}>
                    <option value="mm">mm</option>
                    <option value="cm">cm</option>
                    <option value="in">inches</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={labelCls}>
                  Linked clients ({form.clientIds.length} selected)
                  <span className="ml-2 text-[11px] font-normal text-gray-400 dark:text-gray-500">
                    Companies this user works for. Customers should have at least one.
                  </span>
                </label>
                <input
                  className={`${inputCls} mb-2`}
                  placeholder="Filter clients by name or code…"
                  value={clientQuery}
                  onChange={(e) => setClientQuery(e.target.value)}
                />
                <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-800">
                  {filteredClients.length === 0 && (
                    <div className="p-3 text-xs text-gray-400 dark:text-gray-500">No clients match.</div>
                  )}
                  {filteredClients.map((c) => {
                    const checked = form.clientIds.includes(c.id);
                    return (
                      <label key={c.id} className="flex items-center gap-2 p-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 text-sm">
                        <input type="checkbox" checked={checked} onChange={() => toggleClient(c.id)} />
                        <span className="text-gray-900 dark:text-gray-100">{c.name}</span>
                        {c.code && <span className="text-[11px] text-gray-400 dark:text-gray-500">{c.code}</span>}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className={labelCls}>Notes</label>
                <textarea rows={2} className={inputCls} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
              </div>

              <div className="flex items-center gap-3">
                <button onClick={save} disabled={busy} className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60">
                  {busy ? "Saving…" : "Save changes"}
                </button>
                <button onClick={toggle} className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">Cancel</button>
                {err && <span className="text-xs text-red-600 dark:text-red-400">{err}</span>}
                <span className="ml-auto text-[11px] text-gray-400 dark:text-gray-500 break-all">{user.id}</span>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function AccessAdmin({ initialUsers, clients }) {
  const [users, setUsers] = useState(initialUsers);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter === "factoryos" && !u.factoryosRole) return false;
      if (roleFilter === "calculator" && !u.calculatorRole) return false;
      if (roleFilter === "customer" && u.factoryosRole !== "customer") return false;
      if (roleFilter === "staff" && (u.factoryosRole === "customer" || !u.factoryosRole)) return false;
      if (roleFilter === "inactive" && u.active) return false;
      if (!q) return true;
      const hay = `${u.email} ${u.name} ${u.company} ${u.factoryosRole} ${u.calculatorRole} ${u.clients.map((c) => c.name).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [users, search, roleFilter]);

  function onSaved(updated) {
    setUsers((list) => list.map((u) => (u.id === updated.id ? updated : u)));
  }

  return (
    <div className="mt-6 bg-white border border-gray-200 rounded-xl p-4 sm:p-5 dark:bg-gray-900 dark:border-gray-800">
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          className={`${inputCls} flex-1`}
          placeholder="Search by email, name, company, role, or linked client…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className={`${inputCls} sm:w-56`} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">All users</option>
          <option value="staff">Staff (FactoryOS, non-customer)</option>
          <option value="customer">Customers (factoryos = customer)</option>
          <option value="calculator">With Calculator role</option>
          <option value="factoryos">With FactoryOS role</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 uppercase border-b border-gray-100 dark:text-gray-500 dark:border-gray-800">
              <th className="text-left pb-2 font-medium">Name · Email</th>
              <th className="text-left pb-2 font-medium">FactoryOS role</th>
              <th className="text-left pb-2 font-medium">Calculator role</th>
              <th className="text-left pb-2 font-medium">Linked clients</th>
              <th className="text-right pb-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <UserRow key={u.id} user={u} clients={clients} onSaved={onSaved} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-4 dark:text-gray-500">
        {filtered.length} of {users.length} users · Click any row to edit.
      </p>
    </div>
  );
}
