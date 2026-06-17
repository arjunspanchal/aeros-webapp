"use client";
// Candidate pipeline as a Kanban board. Drag a card between stage columns (or
// use the per-card "Move" menu on mobile), add/edit candidates in a slide-over,
// and "Hire" to carry a candidate into the employee roster. Rejected / On-hold
// live below the board, not as columns. Any HR user can manage candidates.
import { useMemo, useState } from "react";
import { inputCls, labelCls } from "@/app/factoryos/_components/ui";
import { HIRING_BOARD_STAGES, HIRING_STAGES, HIRING_STAGE_MAP, HIRING_SOURCES } from "@/lib/factoryos/constants";

const STAGE_DOT = {
  new: "bg-gray-400",
  screening: "bg-sky-500",
  interview: "bg-amber-500",
  selected: "bg-violet-500",
  hired: "bg-emerald-500",
  rejected: "bg-red-500",
  on_hold: "bg-gray-400",
};

const SIDE_STAGES = HIRING_STAGES.filter((s) => !s.board);

const EMPTY = {
  name: "", phone: "", source: "", role: "", experience: "",
  expectedSalary: "", location: "", linkUrl: "", notes: "",
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

export default function HiringBoard({ initial }) {
  const [candidates, setCandidates] = useState(initial || []);
  const [source, setSource] = useState("");
  const [q, setQ] = useState("");
  const [dragOver, setDragOver] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return candidates.filter((c) => {
      if (source && c.source !== source) return false;
      if (!needle) return true;
      return (
        c.name.toLowerCase().includes(needle) ||
        (c.phone || "").toLowerCase().includes(needle) ||
        (c.role || "").toLowerCase().includes(needle)
      );
    });
  }, [candidates, source, q]);

  const byStage = useMemo(() => {
    const m = {};
    for (const s of HIRING_STAGES) m[s.value] = [];
    for (const c of filtered) (m[c.stage] || (m[c.stage] = [])).push(c);
    return m;
  }, [filtered]);

  function patchLocal(id, patch) {
    setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async function move(id, stage) {
    const before = candidates.find((c) => c.id === id);
    if (!before || before.stage === stage) return;
    patchLocal(id, { stage }); // optimistic
    const { ok } = await api(`/api/hr/hiring/${id}`, "PATCH", { stage });
    if (!ok) patchLocal(id, { stage: before.stage }); // revert
  }

  function openCreate() {
    setEditingId(null); setForm(EMPTY); setErr(""); setDrawerOpen(true);
  }
  function openEdit(c) {
    setEditingId(c.id);
    setForm({
      name: c.name || "", phone: c.phone || "", source: c.source || "", role: c.role || "",
      experience: c.experience || "", expectedSalary: c.expectedSalary ?? "",
      location: c.location || "", linkUrl: c.linkUrl || "", notes: c.notes || "",
    });
    setErr(""); setDrawerOpen(true);
  }

  async function save(e) {
    e?.preventDefault();
    if (!form.name.trim()) { setErr("Name is required"); return; }
    setBusy(true); setErr("");
    if (editingId) {
      const { ok, data } = await api(`/api/hr/hiring/${editingId}`, "PATCH", form);
      setBusy(false);
      if (!ok) { setErr(data.error || "Save failed"); return; }
      patchLocal(editingId, data.candidate);
    } else {
      const { ok, data } = await api("/api/hr/hiring", "POST", form);
      setBusy(false);
      if (!ok) { setErr(data.error || "Save failed"); return; }
      setCandidates((prev) => [data.candidate, ...prev]);
    }
    setDrawerOpen(false);
  }

  async function remove(c) {
    if (!window.confirm(`Remove ${c.name} from the pipeline? This can't be undone.`)) return;
    const before = candidates;
    setCandidates((prev) => prev.filter((x) => x.id !== c.id));
    const { ok } = await api(`/api/hr/hiring/${c.id}`, "DELETE");
    if (!ok) setCandidates(before);
  }

  function hire(c) {
    // Mark hired, then carry name/phone/role into the Add-Employee form.
    move(c.id, "hired");
    const params = new URLSearchParams({ create: "1", name: c.name || "", phone: c.phone || "", designation: c.role || "" });
    window.location.href = `/hr?${params.toString()}`;
  }

  const sideCount = SIDE_STAGES.reduce((n, s) => n + (byStage[s.value]?.length || 0), 0);

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-2 justify-between bg-white border border-gray-200 rounded-xl p-3 dark:bg-gray-900 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, phone, role…"
            className={`${inputCls} w-56`}
          />
          <select value={source} onChange={(e) => setSource(e.target.value)} className={`${inputCls} w-auto`}>
            <option value="">All sources</option>
            {HIRING_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <span className="text-xs text-gray-500 dark:text-gray-400">{filtered.length} candidate{filtered.length === 1 ? "" : "s"}</span>
        </div>
        <button onClick={openCreate} className="text-sm font-medium px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">
          + Add candidate
        </button>
      </div>

      <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: `repeat(${HIRING_BOARD_STAGES.length}, minmax(200px, 1fr))` }}>
        {HIRING_BOARD_STAGES.map((stage) => (
          <div
            key={stage.value}
            onDragOver={(e) => { e.preventDefault(); setDragOver(stage.value); }}
            onDragLeave={() => setDragOver((d) => (d === stage.value ? "" : d))}
            onDrop={(e) => { e.preventDefault(); setDragOver(""); move(e.dataTransfer.getData("text/plain"), stage.value); }}
            className={`rounded-xl border p-2 min-h-[120px] ${dragOver === stage.value ? "border-blue-400 bg-blue-50/40 dark:bg-blue-900/10" : "border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/40"}`}
          >
            <div className="flex items-center gap-2 px-1 pb-2">
              <span className={`w-2 h-2 rounded-full ${STAGE_DOT[stage.value] || "bg-gray-400"}`} />
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">{stage.label}</span>
              <span className="text-xs text-gray-400">{byStage[stage.value]?.length || 0}</span>
            </div>
            <div className="space-y-2">
              {(byStage[stage.value] || []).map((c) => (
                <CandidateCard key={c.id} c={c} onEdit={openEdit} onMove={move} onHire={hire} onRemove={remove} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {sideCount > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Rejected · On hold ({sideCount})</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {SIDE_STAGES.flatMap((s) => byStage[s.value] || []).map((c) => (
              <CandidateCard key={c.id} c={c} muted onEdit={openEdit} onMove={move} onHire={hire} onRemove={remove} />
            ))}
          </div>
        </div>
      )}

      {drawerOpen && (
        <CandidateDrawer
          form={form} setForm={setForm} editing={!!editingId}
          busy={busy} err={err} onSave={save} onClose={() => setDrawerOpen(false)}
        />
      )}
    </div>
  );
}

function CandidateCard({ c, muted, onEdit, onMove, onHire, onRemove }) {
  const stageMeta = HIRING_STAGE_MAP[c.stage];
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)}
      className={`rounded-lg border bg-white p-2.5 cursor-grab active:cursor-grabbing dark:bg-gray-900 ${muted ? "border-gray-200 opacity-80 dark:border-gray-800" : "border-gray-200 dark:border-gray-800"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <button onClick={() => onEdit(c)} className="text-left min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 truncate dark:text-white">{c.name}</p>
          {c.role && <p className="text-xs text-gray-500 truncate dark:text-gray-400">{c.role}</p>}
        </button>
        {c.source && (
          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">{c.source}</span>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500 dark:text-gray-400">
        {c.phone && <a href={`tel:${c.phone}`} className="hover:text-blue-600 dark:hover:text-blue-400">{c.phone}</a>}
        {c.experience && <span>· {c.experience}</span>}
        {c.expectedSalary != null && <span>· ₹{Number(c.expectedSalary).toLocaleString("en-IN")}</span>}
        {c.location && <span>· {c.location}</span>}
      </div>
      {c.linkUrl && (
        <a href={c.linkUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] text-blue-600 hover:underline dark:text-blue-400 truncate max-w-full">
          🔗 profile / CV
        </a>
      )}
      <div className="mt-2 flex items-center gap-1.5">
        <select
          value={c.stage}
          onChange={(e) => onMove(c.id, e.target.value)}
          className="text-[11px] border border-gray-200 rounded px-1 py-0.5 bg-white text-gray-600 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-300"
          title="Move to stage"
        >
          {HIRING_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {c.stage !== "hired" && (
          <button onClick={() => onHire(c)} className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-600 text-white hover:bg-emerald-700">Hire →</button>
        )}
        <button onClick={() => onRemove(c)} className="ml-auto text-[11px] text-gray-400 hover:text-red-600" title="Remove">✕</button>
      </div>
    </div>
  );
}

function CandidateDrawer({ form, setForm, editing, busy, err, onSave, onClose }) {
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full overflow-y-auto p-5 dark:bg-gray-900">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{editing ? "Edit candidate" : "Add candidate"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">✕</button>
        </div>
        {err && <p className="text-sm text-red-600 bg-red-50 border-l-2 border-red-600 px-3 py-2 mb-3 rounded-sm dark:bg-red-900/20">{err}</p>}
        <form onSubmit={onSave} className="space-y-3">
          <div>
            <label className={labelCls}>Name *</label>
            <input className={inputCls} value={form.name} onChange={set("name")} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Phone</label>
              <input className={inputCls} value={form.phone} onChange={set("phone")} inputMode="tel" />
            </div>
            <div>
              <label className={labelCls}>Source</label>
              <select className={inputCls} value={form.source} onChange={set("source")}>
                <option value="">—</option>
                {HIRING_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Role applied for</label>
              <input className={inputCls} value={form.role} onChange={set("role")} placeholder="e.g. Bag machine operator" />
            </div>
            <div>
              <label className={labelCls}>Experience</label>
              <input className={inputCls} value={form.experience} onChange={set("experience")} placeholder="e.g. 2 yrs / Fresher" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Expected salary (₹/mo)</label>
              <input className={inputCls} value={form.expectedSalary} onChange={set("expectedSalary")} inputMode="numeric" />
            </div>
            <div>
              <label className={labelCls}>Location</label>
              <input className={inputCls} value={form.location} onChange={set("location")} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Profile / CV link</label>
            <input className={inputCls} value={form.linkUrl} onChange={set("linkUrl")} placeholder="https://…" />
          </div>
          <div>
            <label className={labelCls}>Notes</label>
            <textarea className={`${inputCls} h-24`} value={form.notes} onChange={set("notes")} placeholder="Screening notes, availability, interview feedback…" />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={busy} className="flex-1 text-sm font-medium px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
              {busy ? "Saving…" : editing ? "Save changes" : "Add candidate"}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
