"use client";
import { useEffect, useState } from "react";
import { inputCls, labelCls } from "@/app/factoryos/_components/ui";
import { ROLES, ROLE_OPTIONS } from "@/lib/factoryos/constants";

const EMPTY = {
  email: "",
  name: "",
  phone: "",
  designation: "",
  role: ROLES.CUSTOMER,
  clientIds: [],
  active: true,
};

// Display labels — code values stay snake_case. The role we store as
// `account_manager` is shown to the user as "Customer Manager".
const ROLE_LABEL = {
  [ROLES.ADMIN]: "Admin",
  [ROLES.ACCOUNT_MANAGER]: "Customer Manager",
  [ROLES.FACTORY_MANAGER]: "Factory Manager",
  [ROLES.FACTORY_EXECUTIVE]: "Factory Executive",
  [ROLES.CUSTOMER]: "Customer",
};

function roleLabel(role) {
  return ROLE_LABEL[role] || (role || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function UsersAdmin({ initialUsers, clients }) {
  const [users, setUsers] = useState(initialUsers);
  // mode: null = closed, "create" = new user, recordId string = editing
  const [mode, setMode] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [search, setSearch] = useState("");
  const clientMap = Object.fromEntries(clients.map((c) => [c.id, c]));

  const isOpen = mode !== null;
  const isEditing = isOpen && mode !== "create";
  const needsClient = form.role === ROLES.CUSTOMER;
  const allowedRoleOptions = ROLE_OPTIONS
    .filter((o) => o.value !== ROLES.ADMIN)
    .map((o) => ({ value: o.value, label: roleLabel(o.value) }));

  const q = clientQuery.trim().toLowerCase();
  const selectedClients = clients.filter((c) => form.clientIds.includes(c.id));
  const unselectedClients = clients.filter((c) => !form.clientIds.includes(c.id));
  const filteredUnselected = q
    ? unselectedClients.filter((c) => c.name.toLowerCase().includes(q))
    : unselectedClients;

  // List filter
  const sq = search.trim().toLowerCase();
  const filteredUsers = sq
    ? users.filter((u) =>
        (u.email || "").toLowerCase().includes(sq) ||
        (u.name || "").toLowerCase().includes(sq) ||
        roleLabel(u.role).toLowerCase().includes(sq) ||
        u.clientIds.some((cid) => (clientMap[cid]?.name || "").toLowerCase().includes(sq)),
      )
    : users;

  // Lock body scroll while modal is open + close on Escape.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e) { if (e.key === "Escape") closeModal(); }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  function openCreate() {
    setMode("create");
    setForm(EMPTY);
    setErr("");
    setClientQuery("");
  }

  function openEdit(u) {
    setMode(u.id);
    setForm({
      email: u.email,
      name: u.name || "",
      phone: u.phone || "",
      designation: u.designation || "",
      role: u.role,
      clientIds: u.clientIds || [],
      active: u.active !== false,
    });
    setErr("");
    setClientQuery("");
  }

  function closeModal() {
    setMode(null);
    setForm(EMPTY);
    setErr("");
    setClientQuery("");
  }

  async function submit(e) {
    e.preventDefault();
    setErr(""); setBusy(true);
    const url = isEditing ? `/api/factoryos/users/${mode}` : "/api/factoryos/users";
    const method = isEditing ? "PATCH" : "POST";
    const body = isEditing
      ? {
          name: form.name,
          phone: form.phone,
          designation: form.designation,
          role: form.role,
          clientIds: form.clientIds,
          active: form.active,
        }
      : form;
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) { setErr((await res.json()).error || "Failed"); return; }
    const data = await res.json();
    if (isEditing) {
      setUsers((prev) => prev.map((u) => (u.id === mode ? data.user : u)).sort((a, b) => a.email.localeCompare(b.email)));
    } else {
      setUsers((prev) => [...prev, data.user].sort((a, b) => a.email.localeCompare(b.email)));
    }
    closeModal();
  }

  return (
    <div className="mt-6 space-y-4">
      {/* Toolbar: search + invite */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, role, or client…"
            className={`${inputCls} text-base pl-9`}
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">🔎</span>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg whitespace-nowrap"
        >
          + Invite user
        </button>
      </div>

      {/* Desktop table view */}
      <div className="hidden md:block bg-white border border-gray-200 rounded-xl dark:bg-gray-900 dark:border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase dark:bg-gray-800/50 dark:text-gray-400">
              <tr>
                <th className="text-left px-3 sm:px-4 py-2 font-medium whitespace-nowrap w-10">&nbsp;</th>
                <th className="text-left px-3 sm:px-4 py-2 font-medium">Name / Email</th>
                <th className="text-left px-3 sm:px-4 py-2 font-medium whitespace-nowrap">Role</th>
                <th className="text-left px-3 sm:px-4 py-2 font-medium">Client(s)</th>
                <th className="text-left px-3 sm:px-4 py-2 font-medium whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filteredUsers.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => openEdit(u)}
                  className="cursor-pointer hover:bg-blue-50/40 dark:hover:bg-blue-900/10"
                >
                  <td className="px-3 sm:px-4 py-2.5">
                    <div className="h-8 w-8 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center text-[10px] font-semibold text-gray-500 dark:bg-gray-800 dark:text-gray-300">
                      {u.photoUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={u.photoUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        (u.name || u.email || "?").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?"
                      )}
                    </div>
                  </td>
                  <td className="px-3 sm:px-4 py-2.5">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">{u.name || "—"}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 break-all">{u.email}</div>
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 text-xs text-gray-700 dark:text-gray-200 whitespace-nowrap">
                    {roleLabel(u.role)}
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 text-xs text-gray-600 dark:text-gray-300">
                    {u.clientIds.length === 0
                      ? <span className="text-gray-400">—</span>
                      : (
                        <div className="flex flex-wrap gap-1">
                          {u.clientIds.slice(0, 4).map((cid) => clientMap[cid]?.name).filter(Boolean).map((name) => (
                            <span key={name} className="inline-block bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded text-gray-700 dark:text-gray-200">{name}</span>
                          ))}
                          {u.clientIds.length > 4 && (
                            <span className="text-gray-400">+{u.clientIds.length - 4} more</span>
                          )}
                        </div>
                      )}
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap">
                    <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full ${u.active ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" : "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300"}`}>
                      {u.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr><td colSpan={5} className="text-center text-sm text-gray-500 py-8 dark:text-gray-400">
                  {sq ? "No users match that search." : "No users yet."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile card view */}
      <div className="md:hidden space-y-3">
        {filteredUsers.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-4 text-center text-sm text-gray-500 dark:bg-gray-900 dark:border-gray-800 dark:text-gray-400">
            {sq ? "No users match that search." : "No users yet."}
          </div>
        ) : (
          filteredUsers.map((u) => (
            <button
              key={u.id}
              onClick={() => openEdit(u)}
              className="w-full text-left bg-white border border-gray-200 rounded-lg p-4 space-y-3 dark:bg-gray-900 dark:border-gray-800 active:bg-blue-50/50 dark:active:bg-blue-900/10"
            >
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full overflow-hidden bg-gray-100 flex-shrink-0 flex items-center justify-center text-xs font-semibold text-gray-500 dark:bg-gray-800 dark:text-gray-300">
                  {u.photoUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={u.photoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    (u.name || u.email || "?").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?"
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{u.name || u.email}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{u.email}</p>
                </div>
                <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full self-start ${u.active ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" : "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300"}`}>
                  {u.active ? "Active" : "Inactive"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Role</p>
                  <p className="text-gray-900 dark:text-white">{roleLabel(u.role)}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Clients</p>
                  <p className="text-gray-900 dark:text-white">{u.clientIds.length || "—"}</p>
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Profile modal */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50"
          onClick={closeModal}
        >
          <div
            className="w-full sm:max-w-2xl bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <form onSubmit={submit} className="p-5 sm:p-6 space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-12 w-12 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-sm font-semibold text-gray-500 dark:text-gray-300 flex-shrink-0">
                    {(form.name || form.email || "?").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?"}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                      {isEditing ? (form.name || "Edit user") : "Invite user"}
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {isEditing ? form.email : "New user — they'll log in via OTP"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none p-1 -mr-1"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              {/* Active toggle (edit mode only) */}
              {isEditing && (
                <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Account status</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {form.active ? "User can sign in" : "User is blocked from signing in"}
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(e) => setForm({ ...form, active: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-300 peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border after:border-gray-300 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600 dark:bg-gray-700"></div>
                  </label>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Email</label>
                  <input
                    type="email"
                    className={`${inputCls} text-base`}
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                    disabled={isEditing}
                  />
                  {isEditing && <p className="text-xs text-gray-400 mt-1 dark:text-gray-500">Email can&apos;t be changed. Remove + re-invite if needed.</p>}
                </div>
                <div>
                  <label className={labelCls}>Name</label>
                  <input
                    className={`${inputCls} text-base`}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Vinay Dubey"
                  />
                </div>
                <div>
                  <label className={labelCls}>Phone</label>
                  <input
                    type="tel"
                    className={`${inputCls} text-base`}
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+91 …"
                  />
                </div>
                <div>
                  <label className={labelCls}>Designation</label>
                  <input
                    className={`${inputCls} text-base`}
                    value={form.designation}
                    onChange={(e) => setForm({ ...form, designation: e.target.value })}
                    placeholder="e.g. Sales Lead"
                  />
                </div>
                <div>
                  <label className={labelCls}>Role</label>
                  <select className={`${inputCls} text-base`} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                    {allowedRoleOptions.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
              </div>

              {(needsClient || form.role === ROLES.ACCOUNT_MANAGER) && (
                <div>
                  <label className={`${labelCls} flex items-center justify-between gap-2`}>
                    <span>{needsClient ? "Client" : "Assigned clients"}</span>
                    {!needsClient && form.clientIds.length > 0 && (
                      <span className="text-blue-600 dark:text-blue-400 font-medium">
                        {form.clientIds.length} selected
                      </span>
                    )}
                  </label>
                  {needsClient ? (
                    <select
                      className={`${inputCls} text-base`}
                      value={form.clientIds[0] || ""}
                      onChange={(e) => setForm({ ...form, clientIds: e.target.value ? [e.target.value] : [] })}
                      required
                    >
                      <option value="">Select client…</option>
                      {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  ) : (
                    <div className="space-y-2">
                      <div className="relative">
                        <input
                          type="search"
                          value={clientQuery}
                          onChange={(e) => setClientQuery(e.target.value)}
                          placeholder="Search clients…"
                          className={`${inputCls} text-base pl-8`}
                        />
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">🔎</span>
                      </div>
                      <div className="max-h-56 overflow-y-auto border border-gray-200 dark:border-gray-800 rounded-md divide-y divide-gray-100 dark:divide-gray-800">
                        {selectedClients.length > 0 && (
                          <div className="bg-blue-50/60 dark:bg-blue-900/10">
                            {selectedClients.map((c) => (
                              <label
                                key={c.id}
                                className="flex items-center gap-3 cursor-pointer px-3 py-2 hover:bg-blue-100/60 dark:hover:bg-blue-900/20"
                              >
                                <input
                                  type="checkbox"
                                  checked
                                  onChange={() =>
                                    setForm({ ...form, clientIds: form.clientIds.filter((id) => id !== c.id) })
                                  }
                                  className="w-5 h-5 rounded border-gray-300 accent-blue-600 cursor-pointer"
                                />
                                <span className="text-sm sm:text-base text-gray-800 dark:text-gray-200 font-medium">
                                  {c.name}
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                        {filteredUnselected.length === 0 && selectedClients.length === 0 && (
                          <p className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                            {q ? "No clients match that search." : "No clients yet."}
                          </p>
                        )}
                        {filteredUnselected.length === 0 && selectedClients.length > 0 && q && (
                          <p className="px-3 py-3 text-xs text-gray-500 dark:text-gray-400 text-center">
                            No other clients match &quot;{clientQuery}&quot;.
                          </p>
                        )}
                        {filteredUnselected.map((c) => (
                          <label
                            key={c.id}
                            className="flex items-center gap-3 cursor-pointer px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/40"
                          >
                            <input
                              type="checkbox"
                              checked={false}
                              onChange={() => setForm({ ...form, clientIds: [...form.clientIds, c.id] })}
                              className="w-5 h-5 rounded border-gray-300 accent-blue-600 cursor-pointer"
                            />
                            <span className="text-sm sm:text-base text-gray-700 dark:text-gray-300">{c.name}</span>
                          </label>
                        ))}
                      </div>
                      {form.clientIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, clientIds: [] })}
                          className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium"
                        >
                          Clear all
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {err && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-2 text-xs sm:text-sm text-red-700 dark:text-red-300 font-medium">
                  ⚠️ {err}
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-60 ${isEditing ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"}`}
                >
                  {busy ? (isEditing ? "Saving…" : "Inviting…") : (isEditing ? "✓ Save changes" : "Invite")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
