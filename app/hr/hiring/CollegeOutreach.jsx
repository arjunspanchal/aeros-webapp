"use client";
// College placement-cell outreach tracker — a collapsible panel above the
// Hiring board. Add/edit colleges, update outreach status inline, and see how
// many internship applicants each college has produced (matched on the
// application source). Any HR user can manage it.
import { useMemo, useState } from "react";
import { inputCls, labelCls } from "@/app/factoryos/_components/ui";
import { COLLEGE_STATUSES, COLLEGE_STATUS_LABEL } from "@/lib/hr/colleges";

const STATUS_STYLE = {
  to_contact: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  contacted: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  in_talks: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  declined: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200",
};

const EMPTY = {
  collegeName: "", course: "", contactName: "", contactEmail: "",
  contactPhone: "", city: "", status: "to_contact", lastContacted: "", owner: "", notes: "",
};

async function api(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export default function CollegeOutreach({ initial }) {
  const [colleges, setColleges] = useState(initial || []);
  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [q, setQ] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Distinct locations for the filter dropdown (+ whether any blanks exist).
  const locations = useMemo(() => {
    const set = new Set();
    let hasBlank = false;
    for (const c of colleges) {
      const city = (c.city || "").trim();
      if (city) set.add(city);
      else hasBlank = true;
    }
    return { list: [...set].sort((a, b) => a.localeCompare(b)), hasBlank };
  }, [colleges]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return colleges.filter((c) => {
      if (statusFilter && c.status !== statusFilter) return false;
      if (locationFilter) {
        const city = (c.city || "").trim();
        if (locationFilter === "__none__") { if (city) return false; }
        else if (city !== locationFilter) return false;
      }
      if (needle) {
        const hay = [c.collegeName, c.city, c.course, c.contactEmail, c.contactName, c.owner]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [colleges, statusFilter, locationFilter, q]);

  const totals = useMemo(() => {
    const t = { count: colleges.length, applicants: 0, active: 0, toContact: 0 };
    for (const c of colleges) {
      t.applicants += c.applicantCount || 0;
      if (c.status === "active") t.active += 1;
      if (c.status === "to_contact") t.toContact += 1;
    }
    return t;
  }, [colleges]);

  function patchLocal(id, patch) {
    setColleges((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async function setStatus(id, status) {
    const before = colleges.find((c) => c.id === id);
    if (!before || before.status === status) return;
    patchLocal(id, { status });
    const { ok } = await api(`/api/hr/colleges/${id}`, "PATCH", { status });
    if (!ok) patchLocal(id, { status: before.status });
  }

  function openCreate() { setEditingId(null); setForm(EMPTY); setErr(""); setDrawerOpen(true); }
  function openEdit(c) {
    setEditingId(c.id);
    setForm({
      collegeName: c.collegeName || "", course: c.course || "", contactName: c.contactName || "",
      contactEmail: c.contactEmail || "", contactPhone: c.contactPhone || "", city: c.city || "",
      status: c.status || "to_contact", lastContacted: c.lastContacted || "", owner: c.owner || "",
      notes: c.notes || "",
    });
    setErr(""); setDrawerOpen(true);
  }

  async function save(e) {
    e?.preventDefault();
    if (!form.collegeName.trim()) { setErr("College name is required"); return; }
    setBusy(true); setErr("");
    if (editingId) {
      const { ok, data } = await api(`/api/hr/colleges/${editingId}`, "PATCH", form);
      setBusy(false);
      if (!ok) { setErr(data.error || "Save failed"); return; }
      patchLocal(editingId, data.college);
    } else {
      const { ok, data } = await api("/api/hr/colleges", "POST", form);
      setBusy(false);
      if (!ok) { setErr(data.error || "Save failed"); return; }
      setColleges((prev) => [...prev, data.college]);
    }
    setDrawerOpen(false);
  }

  async function remove(c) {
    if (!window.confirm(`Remove ${c.collegeName} from outreach? This can't be undone.`)) return;
    const before = colleges;
    setColleges((prev) => prev.filter((x) => x.id !== c.id));
    const { ok } = await api(`/api/hr/colleges/${c.id}`, "DELETE");
    if (!ok) setColleges(before);
  }

  return (
    <div className="mt-6 rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className={`text-gray-400 transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">College outreach</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {totals.count} college{totals.count === 1 ? "" : "s"} · {totals.active} active · {totals.toContact} to contact · {totals.applicants} applicant{totals.applicants === 1 ? "" : "s"}
        </span>
        <span className="ml-auto text-xs text-blue-600 dark:text-blue-400">{open ? "Hide" : "Manage"}</span>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-4 py-4 dark:border-gray-800">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search college, city, course…"
              className={`${inputCls} w-56`}
            />
            <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className={`${inputCls} w-auto`}>
              <option value="">All locations</option>
              {locations.list.map((city) => <option key={city} value={city}>{city}</option>)}
              {locations.hasBlank && <option value="__none__">No location</option>}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${inputCls} w-auto`}>
              <option value="">All statuses</option>
              {COLLEGE_STATUSES.map((s) => <option key={s} value={s}>{COLLEGE_STATUS_LABEL[s]}</option>)}
            </select>
            {(q || locationFilter || statusFilter) && (
              <button
                onClick={() => { setQ(""); setLocationFilter(""); setStatusFilter(""); }}
                className="text-xs text-gray-500 hover:text-gray-800 dark:text-gray-400"
              >
                Clear
              </button>
            )}
            <span className="text-xs text-gray-400">{filtered.length} shown</span>
            <button onClick={openCreate} className="ml-auto text-sm font-medium px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">
              + Add college
            </button>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="py-2 pr-3 font-medium">College</th>
                  <th className="py-2 pr-3 font-medium">Location</th>
                  <th className="py-2 pr-3 font-medium">Course</th>
                  <th className="py-2 pr-3 font-medium">Placement contact</th>
                  <th className="py-2 pr-3 font-medium">Applicants</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className="py-8 text-center text-gray-400">No colleges match these filters.</td></tr>
                ) : filtered.map((c) => (
                  <tr key={c.id} className="align-top">
                    <td className="py-2 pr-3">
                      <button onClick={() => openEdit(c)} className="text-left font-medium text-gray-900 hover:text-blue-700 dark:text-white dark:hover:text-blue-400">
                        {c.collegeName}
                      </button>
                    </td>
                    <td className="py-2 pr-3 text-gray-600 dark:text-gray-300">
                      {c.city ? c.city : <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                    <td className="py-2 pr-3 text-gray-600 dark:text-gray-300">{c.course || "—"}</td>
                    <td className="py-2 pr-3">
                      {c.contactEmail ? (
                        <a href={`mailto:${c.contactEmail}`} className="text-blue-600 hover:underline dark:text-blue-400 break-all">{c.contactEmail}</a>
                      ) : <span className="text-gray-400">—</span>}
                      {c.contactName && <div className="text-xs text-gray-400">{c.contactName}</div>}
                      {c.contactPhone && <div className="text-xs"><a href={`tel:${c.contactPhone}`} className="text-gray-500 hover:text-blue-600 dark:text-gray-400">{c.contactPhone}</a></div>}
                    </td>
                    <td className="py-2 pr-3">
                      {c.applicantCount > 0 ? (
                        <span className="inline-flex items-center rounded-md bg-indigo-100 px-1.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200">{c.applicantCount}</span>
                      ) : <span className="text-gray-300 dark:text-gray-600">0</span>}
                    </td>
                    <td className="py-2 pr-3">
                      <select
                        value={c.status}
                        onChange={(e) => setStatus(c.id, e.target.value)}
                        className={`rounded px-1.5 py-1 text-xs font-medium border-0 ${STATUS_STYLE[c.status] || STATUS_STYLE.to_contact}`}
                      >
                        {COLLEGE_STATUSES.map((s) => <option key={s} value={s}>{COLLEGE_STATUS_LABEL[s]}</option>)}
                      </select>
                    </td>
                    <td className="py-2 pr-1 text-right">
                      <button onClick={() => remove(c)} className="text-xs text-gray-400 hover:text-red-600" title="Remove">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {drawerOpen && (
        <CollegeDrawer
          form={form} setForm={setForm} editing={!!editingId}
          busy={busy} err={err} onSave={save} onClose={() => setDrawerOpen(false)}
        />
      )}
    </div>
  );
}

function CollegeDrawer({ form, setForm, editing, busy, err, onSave, onClose }) {
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full overflow-y-auto p-5 dark:bg-gray-900">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{editing ? "Edit college" : "Add college"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">✕</button>
        </div>
        {err && <p className="text-sm text-red-600 bg-red-50 border-l-2 border-red-600 px-3 py-2 mb-3 rounded-sm dark:bg-red-900/20">{err}</p>}
        <form onSubmit={onSave} className="space-y-3">
          <div>
            <label className={labelCls}>College name *</label>
            <input className={inputCls} value={form.collegeName} onChange={set("collegeName")} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Course</label>
              <input className={inputCls} value={form.course} onChange={set("course")} placeholder="e.g. MBA - L&SC" />
            </div>
            <div>
              <label className={labelCls}>City</label>
              <input className={inputCls} value={form.city} onChange={set("city")} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Placement contact email</label>
            <input className={inputCls} value={form.contactEmail} onChange={set("contactEmail")} type="email" inputMode="email" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Contact name</label>
              <input className={inputCls} value={form.contactName} onChange={set("contactName")} />
            </div>
            <div>
              <label className={labelCls}>Contact phone</label>
              <input className={inputCls} value={form.contactPhone} onChange={set("contactPhone")} inputMode="tel" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Status</label>
              <select className={inputCls} value={form.status} onChange={set("status")}>
                {COLLEGE_STATUSES.map((s) => <option key={s} value={s}>{COLLEGE_STATUS_LABEL[s]}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Last contacted</label>
              <input className={inputCls} value={form.lastContacted || ""} onChange={set("lastContacted")} type="date" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Owner</label>
            <input className={inputCls} value={form.owner} onChange={set("owner")} placeholder="Who's handling this college" />
          </div>
          <div>
            <label className={labelCls}>Notes</label>
            <textarea className={`${inputCls} h-24`} value={form.notes} onChange={set("notes")} placeholder="Call notes, next step, drive dates…" />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={busy} className="flex-1 text-sm font-medium px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
              {busy ? "Saving…" : editing ? "Save changes" : "Add college"}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
