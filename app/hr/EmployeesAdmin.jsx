"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { inputCls, labelCls } from "@/app/factoryos/_components/ui";
import { formatINR, otHourlyRate } from "@/lib/factoryos/hr";

const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || "");
      resolve(res.slice(res.indexOf(",") + 1));
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const EMPTY = {
  name: "",
  aadhar: "",
  phone: "", // local 10-digit number; +91 is prefixed on save
  employeeCode: "",
  workMode: "WFO",
  monthlySalary: "",
  joiningDate: "",
  managerId: "",
  otEligible: false,
  designation: "",
  notes: "",
};

// Strip any country code / formatting to the local 10-digit number for editing.
function localTen(p) {
  return String(p || "").replace(/\D/g, "").slice(-10);
}

export default function EmployeesAdmin({ initialEmployees, factoryManagers, isAdmin = true, currentUserId = null }) {
  const [employees, setEmployees] = useState(initialEmployees);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [q, setQ] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState("");
  // Punch-clock PIN set/reset (only available while editing an existing row).
  const [pinInput, setPinInput] = useState("");
  const [pinBusy, setPinBusy] = useState(false);
  const [pinMsg, setPinMsg] = useState("");
  // Add/Edit form lives in a right-side slide-over drawer so the roster table
  // gets the full page width (no more horizontal scrolling to reach Edit).
  const [drawerOpen, setDrawerOpen] = useState(false);
  const formRef = useRef(null);
  const photoInputRef = useRef(null);

  // Close the drawer on Escape.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e) => { if (e.key === "Escape") closeDrawer(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerOpen]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY);
    setErr(""); setPinInput(""); setPinMsg("");
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingId(null);
    setForm(EMPTY);
    setErr(""); setPinInput(""); setPinMsg("");
  }

  const managerMap = useMemo(
    () => Object.fromEntries(factoryManagers.map((u) => [u.id, u])),
    [factoryManagers],
  );

  const isEditing = editingId !== null;

  const editingEmployee = useMemo(
    () => (editingId ? employees.find((e) => e.id === editingId) : null),
    [editingId, employees],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return employees.filter((e) => {
      if (!showInactive && !e.active) return false;
      if (!term) return true;
      return (
        e.name.toLowerCase().includes(term) ||
        e.phone.toLowerCase().includes(term) ||
        (e.employeeCode || "").toLowerCase().includes(term) ||
        (e.workMode || "").toLowerCase().includes(term) ||
        e.aadhar.includes(term) ||
        (managerMap[e.managerId]?.name || "").toLowerCase().includes(term)
      );
    });
  }, [employees, showInactive, q, managerMap]);

  function startEdit(e) {
    setEditingId(e.id);
    setForm({
      name: e.name,
      aadhar: e.aadhar,
      phone: localTen(e.phone),
      employeeCode: e.employeeCode || "",
      workMode: e.workMode || "WFO",
      monthlySalary: e.monthlySalary ? String(e.monthlySalary) : "",
      joiningDate: e.joiningDate || "",
      managerId: e.managerId || "",
      otEligible: e.otEligible,
      designation: e.designation,
      notes: e.notes,
    });
    setErr("");
    setPinInput(""); setPinMsg("");
    setDrawerOpen(true);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY);
    setErr("");
    setPinInput(""); setPinMsg("");
    setDrawerOpen(false);
  }

  async function savePin() {
    if (!editingId) return;
    setPinMsg(""); setPinBusy(true);
    const res = await fetch(`/api/hr/employees/${editingId}/pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: pinInput }),
    });
    setPinBusy(false);
    if (!res.ok) {
      setPinMsg((await res.json().catch(() => ({}))).error || "Could not set PIN");
      return;
    }
    setPinInput("");
    setPinMsg("PIN set ✓");
    // Reflect hasPin in the local list so the indicator updates immediately.
    setEmployees((prev) => prev.map((e) => (e.id === editingId ? { ...e, hasPin: true } : e)));
  }

  async function submit(ev) {
    ev.preventDefault();
    setErr("");
    setBusy(true);
    // Phone is entered as a local 10-digit number; persist it with the India
    // country code so every record is consistent (+91 XXXXXXXXXX).
    const localPhone = localTen(form.phone);
    const payload = {
      name: form.name,
      aadhar: form.aadhar.trim(),
      phone: localPhone ? `+91 ${localPhone}` : "",
      employeeCode: form.employeeCode.trim(),
      workMode: form.workMode === "WFH" ? "WFH" : "WFO",
      monthlySalary: Number(form.monthlySalary) || 0,
      joiningDate: form.joiningDate || null,
      managerId: form.managerId || null,
      otEligible: !!form.otEligible,
      designation: form.designation,
      notes: form.notes,
    };
    const url = isEditing ? `/api/hr/employees/${editingId}` : "/api/hr/employees";
    const method = isEditing ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!res.ok) {
      setErr((await res.json()).error || "Failed");
      return;
    }
    const data = await res.json();
    if (isEditing) {
      setEmployees((prev) =>
        prev.map((e) => (e.id === editingId ? data.employee : e)).sort((a, b) => a.name.localeCompare(b.name)),
      );
    } else {
      setEmployees((prev) => [...prev, data.employee].sort((a, b) => a.name.localeCompare(b.name)));
    }
    cancelEdit();
  }

  async function removeEmployee(e, hard = false) {
    const msg = hard
      ? `Permanently delete "${e.name}" and all their attendance history? This cannot be undone.`
      : `Deactivate "${e.name}"? Their attendance history will be preserved. You can also hard-delete.`;
    if (!confirm(msg)) return;
    const url = hard ? `/api/hr/employees/${e.id}?hard=1` : `/api/hr/employees/${e.id}`;
    const res = await fetch(url, { method: "DELETE" });
    if (!res.ok) {
      alert((await res.json()).error || "Failed");
      return;
    }
    if (hard) {
      setEmployees((prev) => prev.filter((x) => x.id !== e.id));
    } else {
      const { employee } = await res.json();
      setEmployees((prev) =>
        prev.map((x) => (x.id === e.id ? employee : x)).sort((a, b) => a.name.localeCompare(b.name)),
      );
    }
    if (editingId === e.id) cancelEdit();
  }

  async function uploadAadharPhoto(file) {
    if (!editingId) return;
    setPhotoErr("");
    if (!PHOTO_TYPES.has(file.type)) { setPhotoErr("Must be JPG, PNG, WebP, or GIF"); return; }
    if (file.size > PHOTO_MAX_BYTES) { setPhotoErr("Too large. Max 5 MB."); return; }
    setPhotoBusy(true);
    try {
      const fileBase64 = await readAsBase64(file);
      const res = await fetch(`/api/hr/employees/${editingId}/aadhar-photo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type, filename: file.name, fileBase64 }),
      });
      if (!res.ok) {
        setPhotoErr((await res.json()).error || "Upload failed");
        return;
      }
      const { employee } = await res.json();
      setEmployees((prev) => prev.map((x) => (x.id === editingId ? employee : x)));
    } finally {
      setPhotoBusy(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

  async function removeAadharPhoto(attachmentId) {
    if (!editingId) return;
    if (!confirm("Remove this Aadhar photo?")) return;
    setPhotoBusy(true);
    setPhotoErr("");
    try {
      const res = await fetch(
        `/api/hr/employees/${editingId}/aadhar-photo?attachmentId=${encodeURIComponent(attachmentId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        setPhotoErr((await res.json()).error || "Remove failed");
        return;
      }
      const { employee } = await res.json();
      setEmployees((prev) => prev.map((x) => (x.id === editingId ? employee : x)));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function reactivate(e) {
    const res = await fetch(`/api/hr/employees/${e.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: true }),
    });
    if (!res.ok) return;
    const { employee } = await res.json();
    setEmployees((prev) =>
      prev.map((x) => (x.id === e.id ? employee : x)).sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {/* Roster header — title + count + Add button */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          Employees <span className="text-sm font-normal text-gray-400">· {filtered.length}</span>
        </h2>
        <button
          type="button"
          onClick={openCreate}
          className="text-sm font-medium px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
        >
          + Add employee
        </button>
      </div>

      {/* ===== Add / Edit slide-over drawer ===== */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={closeDrawer} aria-hidden />
          <form
            ref={formRef}
            onSubmit={submit}
            className="absolute inset-y-0 right-0 w-full max-w-md bg-white dark:bg-gray-900 shadow-2xl overflow-y-auto p-4 sm:p-5 space-y-3 border-l border-gray-200 dark:border-gray-800"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className={`text-base font-semibold ${isEditing ? "text-blue-600 dark:text-blue-400" : "text-gray-900 dark:text-white"}`}>
                {isEditing ? "✏️ Edit employee" : "Register employee (KYC)"}
              </h2>
              <button type="button" onClick={closeDrawer} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none px-2 py-1" aria-label="Close">
                ✕
              </button>
            </div>

        <div>
          <label className={labelCls}>Full name *</label>
          <input className={`${inputCls} text-base`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>

        <div>
          <label className={labelCls}>Aadhar # (12 digits)</label>
          <input
            className={`${inputCls} text-base font-mono`}
            value={form.aadhar}
            onChange={(e) => setForm({ ...form, aadhar: e.target.value.replace(/\D/g, "").slice(0, 12) })}
            placeholder="123456789012"
            inputMode="numeric"
          />
        </div>

        <div>
          <label className={labelCls}>Phone</label>
          <div className="flex items-stretch">
            <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
              +91
            </span>
            <input
              className={`${inputCls} text-base rounded-l-none`}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
              placeholder="98765 43210"
              inputMode="numeric"
              maxLength={10}
            />
          </div>
          <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
            India (+91) assumed — enter the 10-digit number. Used to sign in to the punch clock; must be unique.
          </p>
        </div>

        <div>
          <label className={labelCls}>Employee code <span className="font-normal text-gray-400">· optional</span></label>
          <input
            className={`${inputCls} text-base`}
            value={form.employeeCode}
            onChange={(e) => setForm({ ...form, employeeCode: e.target.value })}
            placeholder="e.g. E-101"
          />
          <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
            Optional. Workers can sign in to the punch clock with this code instead of their phone. Must be unique.
          </p>
        </div>

        <div>
          <label className={labelCls}>Work mode</label>
          <div className="flex gap-2">
            {[
              { value: "WFO", label: "🏭 Office (WFO)" },
              { value: "WFH", label: "🏠 Home (WFH)" },
            ].map((opt) => {
              const active = form.workMode === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm({ ...form, workMode: opt.value })}
                  className={`flex-1 text-sm font-medium px-3 py-2 rounded-md border transition-colors ${
                    active
                      ? "border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-900/30 dark:text-blue-300"
                      : "border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-300"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
            Work-from-office (on-site) or work-from-home. Defaults to Office.
          </p>
        </div>

        {isEditing && (
          <div>
            <label className={labelCls}>
              Punch-clock PIN{" "}
              <span className="font-normal text-gray-400">
                {editingEmployee?.hasPin ? "· currently set" : "· not set yet"}
              </span>
            </label>
            <div className="flex items-center gap-2">
              <input
                className={`${inputCls} text-base font-mono tracking-widest`}
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pinInput}
                onChange={(e) => { setPinInput(e.target.value.replace(/\D/g, "").slice(0, 6)); setPinMsg(""); }}
                placeholder="4–6 digits"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={savePin}
                disabled={pinBusy || pinInput.length < 4}
                className="shrink-0 text-sm font-medium px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
              >
                {pinBusy ? "Saving…" : editingEmployee?.hasPin ? "Reset PIN" : "Set PIN"}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
              {pinMsg
                ? <span className={pinMsg.includes("✓") ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>{pinMsg}</span>
                : "The worker enters phone + this PIN at the punch clock. Share it with them privately."}
            </p>
          </div>
        )}

        <div>
          <label className={labelCls}>Designation</label>
          <input className={`${inputCls} text-base`} value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="e.g. Machine Operator, Packer" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Monthly salary (₹) *</label>
            <input
              className={`${inputCls} text-base`}
              type="number"
              min="0"
              step="1"
              value={form.monthlySalary}
              onChange={(e) => setForm({ ...form, monthlySalary: e.target.value })}
              required
            />
          </div>
          <div>
            <label className={labelCls}>Joining date</label>
            <input className={`${inputCls} text-base`} type="date" value={form.joiningDate} onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} />
          </div>
        </div>

        {isAdmin ? (
          <div>
            <label className={labelCls}>Reports to (manager) *</label>
            <select className={`${inputCls} text-base`} value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })}>
              <option value="">— select manager —</option>
              {factoryManagers.map((u) => (
                <option key={u.id} value={u.id}>{u.name || u.email}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">
              Only this manager (plus Admin) will see & mark this employee's attendance.
            </p>
          </div>
        ) : (
          <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/40 rounded p-2">
            This employee will report to <strong>you</strong>. Only you (and Admin) will see them.
          </div>
        )}

        <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 space-y-2">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={form.otEligible}
              onChange={(e) => setForm({ ...form, otEligible: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 accent-blue-600 cursor-pointer"
            />
            OT eligible
          </label>
          {form.otEligible && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Standard shift is 9 AM–7 PM (10 hrs). OT = hours past 7 PM × 1.5× hourly rate.
              {Number(form.monthlySalary) > 0 && (
                <>
                  {" "}At ₹{form.monthlySalary}/mo, OT rate ={" "}
                  <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                    ₹{otHourlyRate({ monthlySalary: Number(form.monthlySalary), otEligible: true }).toFixed(0)}/hr
                  </span>
                  .
                </>
              )}
            </p>
          )}
        </div>

        <div>
          <label className={labelCls}>Notes</label>
          <textarea className={`${inputCls} text-base`} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>

        {isEditing && editingEmployee && (
          <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-600 uppercase dark:text-gray-300">
                Aadhar card photos
              </label>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(e) => e.target.files?.[0] && uploadAadharPhoto(e.target.files[0])}
                disabled={photoBusy}
                className="text-xs"
              />
            </div>
            {(editingEmployee.aadharPhotos || []).length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {editingEmployee.aadharPhotos.map((p) => (
                  <div key={p.id} className="relative group">
                    <a href={p.largeUrl || p.url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.thumbnailUrl || p.url}
                        alt={p.filename}
                        className="h-16 w-16 object-cover rounded border border-gray-200 dark:border-gray-700"
                      />
                    </a>
                    <button
                      type="button"
                      onClick={() => removeAadharPhoto(p.id)}
                      disabled={photoBusy}
                      className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-5 h-5 text-[10px] leading-5 font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500 dark:text-gray-400">No photos yet. Upload Aadhar front/back.</p>
            )}
            {photoErr && (
              <div className="text-xs text-red-700 dark:text-red-300">⚠️ {photoErr}</div>
            )}
            {photoBusy && <div className="text-xs text-gray-500">Uploading…</div>}
          </div>
        )}
        {!isEditing && (
          <p className="text-xs text-gray-500 dark:text-gray-400 italic">
            💡 Register the employee first, then open them in Edit to upload Aadhar photos.
          </p>
        )}

        <button
          disabled={busy}
          className={`w-full text-white text-sm sm:text-base font-medium px-4 py-2.5 rounded-lg transition-colors ${isEditing ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"} disabled:opacity-60`}
        >
          {busy ? (isEditing ? "Saving…" : "Registering…") : isEditing ? "✓ Save changes" : "Register employee"}
        </button>
        {err && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-2 text-xs sm:text-sm text-red-700 dark:text-red-300 font-medium">
            ⚠️ {err}
          </div>
        )}
          </form>
        </div>
      )}

      {/* ===== Roster (full width) ===== */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between">
          <div className="flex-1 flex gap-2">
            <input
              className={`${inputCls} flex-1`}
              placeholder="Search name, phone, code, Aadhar, manager…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show inactive
          </label>
        </div>

        <div className="hidden md:block bg-white border border-gray-200 rounded-xl overflow-hidden dark:bg-gray-900 dark:border-gray-800">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase dark:bg-gray-800/50 dark:text-gray-400">
                <tr>
                  <th className="text-left px-4 py-2 font-medium whitespace-nowrap">Name</th>
                  <th className="text-left px-4 py-2 font-medium whitespace-nowrap">Manager</th>
                  <th className="text-right px-4 py-2 font-medium whitespace-nowrap">Salary</th>
                  <th className="text-left px-4 py-2 font-medium whitespace-nowrap">OT</th>
                  <th className="text-left px-4 py-2 font-medium whitespace-nowrap">Phone</th>
                  <th className="text-right px-4 py-2 font-medium whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.map((e) => (
                  <tr key={e.id} className={editingId === e.id ? "bg-blue-50 dark:bg-blue-900/20" : ""}>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <div className="font-medium text-gray-900 dark:text-white flex items-center gap-1">
                        {e.name}
                        {(e.aadharPhotos || []).length > 0 && (
                          <span
                            className="text-[10px] px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                            title={`Aadhar on file (${e.aadharPhotos.length} photo${e.aadharPhotos.length > 1 ? "s" : ""})`}
                          >
                            KYC✓
                          </span>
                        )}
                        {e.active && !e.hasPin && (
                          <span
                            className="text-[10px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                            title="No punch-clock PIN set — this worker can't sign in to mark attendance yet"
                          >
                            no PIN
                          </span>
                        )}
                        <span
                          className={`text-[10px] px-1 py-0.5 rounded ${
                            e.workMode === "WFH"
                              ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                              : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                          }`}
                          title={e.workMode === "WFH" ? "Works from home" : "Works from office (on-site)"}
                        >
                          {e.workMode === "WFH" ? "WFH" : "WFO"}
                        </span>
                        {!e.active && <span className="ml-2 text-xs text-gray-400">(inactive)</span>}
                      </div>
                      {e.designation && <div className="text-xs text-gray-500 dark:text-gray-400">{e.designation}</div>}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {managerMap[e.managerId]?.name || managerMap[e.managerId]?.email || "—"}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-sm text-gray-900 dark:text-white whitespace-nowrap">
                      {formatINR(e.monthlySalary)}
                    </td>
                    <td className="px-4 py-2 text-xs whitespace-nowrap">
                      {e.otEligible ? (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                          ₹{otHourlyRate(e).toFixed(0)}/hr
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">{e.phone || "—"}</td>
                    <td className="px-4 py-2 text-right space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => startEdit(e)}
                        className="text-xs px-3 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 font-medium"
                      >
                        Edit
                      </button>
                      {e.active ? (
                        <button
                          onClick={() => removeEmployee(e, false)}
                          className="text-xs px-3 py-1 rounded-md bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300 font-medium"
                        >
                          Deactivate
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => reactivate(e)}
                            className="text-xs px-3 py-1 rounded-md bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 font-medium"
                          >
                            Reactivate
                          </button>
                          <button
                            onClick={() => removeEmployee(e, true)}
                            className="text-xs px-3 py-1 rounded-md bg-red-600 text-white hover:bg-red-700 font-medium"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-sm text-gray-500 py-8 dark:text-gray-400">
                      {employees.length === 0 ? "No employees yet. Register the first one." : "No match."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="md:hidden space-y-3">
          {filtered.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-4 text-center text-sm text-gray-500 dark:bg-gray-900 dark:border-gray-800 dark:text-gray-400">
              No employees to show.
            </div>
          ) : (
            filtered.map((e) => (
              <div
                key={e.id}
                className={`bg-white border border-gray-200 rounded-lg p-4 space-y-2 dark:bg-gray-900 dark:border-gray-800 ${editingId === e.id ? "ring-2 ring-blue-500" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                      {e.name}
                      <span
                        className={`ml-2 text-[10px] px-1 py-0.5 rounded ${
                          e.workMode === "WFH"
                            ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                            : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                        }`}
                      >
                        {e.workMode === "WFH" ? "WFH" : "WFO"}
                      </span>
                      {!e.active && <span className="ml-2 text-xs text-gray-400">(inactive)</span>}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{e.designation || "—"}</p>
                  </div>
                  <div className="text-right text-xs text-gray-600 dark:text-gray-300">
                    <div className="font-mono">{formatINR(e.monthlySalary)}</div>
                    {e.otEligible && (
                      <div className="text-emerald-700 dark:text-emerald-300">OT ₹{otHourlyRate(e).toFixed(0)}/hr</div>
                    )}
                  </div>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-300">
                  Manager: {managerMap[e.managerId]?.name || managerMap[e.managerId]?.email || "—"}
                </div>
                {e.phone && <div className="text-xs text-gray-600 dark:text-gray-300">📞 {e.phone}</div>}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => startEdit(e)} className="flex-1 text-xs font-medium px-3 py-2 rounded-md bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    Edit
                  </button>
                  {e.active ? (
                    <button onClick={() => removeEmployee(e, false)} className="flex-1 text-xs font-medium px-3 py-2 rounded-md bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                      Deactivate
                    </button>
                  ) : (
                    <button onClick={() => reactivate(e)} className="flex-1 text-xs font-medium px-3 py-2 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                      Reactivate
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
