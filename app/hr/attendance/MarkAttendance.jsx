"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { inputCls } from "@/app/factoryos/_components/ui";
import { MANUAL_ATTENDANCE_STATUSES, SHIFT_END, SHIFT_START } from "@/lib/factoryos/constants";
import { otHourlyRate, isWorkingDay, isLate, pad2 } from "@/lib/factoryos/hr";

// Enumerate calendar dates from..to inclusive (both "YYYY-MM-DD").
function datesBetween(from, to) {
  const out = [];
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  let cur = Date.UTC(fy, fm - 1, fd);
  const end = Date.UTC(ty, tm - 1, td);
  while (cur <= end) {
    const dt = new Date(cur);
    out.push(`${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`);
    cur += 86400000;
  }
  return out;
}

// Only P / Half-day involve working hours; A / Paid-Leave / Unpaid-Leave don't.
const isWorkStatus = (s) => s === "P" || s === "H";

const STATUS_BTN = {
  P:  "bg-emerald-600 text-white",
  H:  "bg-amber-500 text-white",
  A:  "bg-red-600 text-white",
  PL: "bg-sky-600 text-white",
  UL: "bg-orange-600 text-white",
};

function computeOtPreview(outTime, shiftEnd = SHIFT_END) {
  const parse = (t) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || "").trim());
    if (!m) return null;
    return Number(m[1]) + Number(m[2]) / 60;
  };
  const a = parse(shiftEnd);
  const b = parse(outTime);
  if (a == null || b == null) return 0;
  return Math.max(0, Number((b - a).toFixed(2)));
}

export default function MarkAttendance({
  date,
  employees,
  attendanceByEmployee,
  managerMap,
  holidays = [],
  canViewAll,
  showingAll,
  currentUserId,
}) {
  const router = useRouter();

  // Local rows mirror the displayed employees. Each row holds draft values
  // until the user saves. Pre-fill from existing attendance when available.
  const initialRows = useMemo(
    () =>
      employees.map((e) => {
        const existing = attendanceByEmployee[e.id];
        return {
          employeeId: e.id,
          employee: e,
          status: existing?.status || "P",
          inTime: existing?.inTime || SHIFT_START,
          outTime: existing?.outTime || SHIFT_END,
          notes: existing?.notes || "",
          // Was this row last recorded by the worker via the punch clock?
          // (vs. a manager on this page.) Lets managers spot self-marked days.
          selfMarked: existing?.markedByName === "self",
          saved: !!existing,
          dirty: false,
          saving: false,
          error: "",
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [date, employees.length],
  );

  const [rows, setRows] = useState(initialRows);

  function updateRow(id, patch) {
    setRows((prev) =>
      prev.map((r) => (r.employeeId === id ? { ...r, ...patch, dirty: true, error: "" } : r)),
    );
  }

  async function saveRow(row) {
    setRows((prev) =>
      prev.map((r) => (r.employeeId === row.employeeId ? { ...r, saving: true, error: "" } : r)),
    );
    const work = isWorkStatus(row.status);
    const payload = {
      employeeId: row.employeeId,
      date,
      status: row.status,
      inTime: work ? row.inTime : "",
      outTime: work ? row.outTime : "",
      notes: row.notes,
    };
    const res = await fetch("/api/hr/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({}));
      setRows((prev) =>
        prev.map((r) =>
          r.employeeId === row.employeeId ? { ...r, saving: false, error: error || "Save failed" } : r,
        ),
      );
      return;
    }
    setRows((prev) =>
      prev.map((r) =>
        r.employeeId === row.employeeId ? { ...r, saving: false, dirty: false, saved: true, selfMarked: false } : r,
      ),
    );
    router.refresh();
  }

  async function saveAll() {
    for (const row of rows) {
      if (!row.dirty) continue;
      // eslint-disable-next-line no-await-in-loop
      await saveRow(row);
    }
  }

  const dirtyCount = rows.filter((r) => r.dirty && !r.saving).length;
  const savedCount = rows.filter((r) => r.saved && !r.dirty).length;

  function goToDate(next) {
    const url = new URL(window.location.href);
    url.searchParams.set("date", next);
    if (showingAll) url.searchParams.set("scope", "all");
    router.push(url.pathname + "?" + url.searchParams.toString());
  }

  function toggleScope() {
    const url = new URL(window.location.href);
    if (showingAll) url.searchParams.delete("scope");
    else url.searchParams.set("scope", "all");
    router.push(url.pathname + "?" + url.searchParams.toString());
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between bg-white border border-gray-200 rounded-xl p-3 dark:bg-gray-900 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600 dark:text-gray-300">Date</label>
          <input
            type="date"
            className={`${inputCls} w-auto`}
            value={date}
            onChange={(e) => e.target.value && goToDate(e.target.value)}
          />
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {savedCount} saved · {rows.length} employees
          </span>
        </div>
        <div className="flex items-center gap-2">
          {canViewAll && (
            <button
              type="button"
              onClick={toggleScope}
              className="text-xs px-3 py-1.5 rounded-md border border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              {showingAll ? "View: all reports" : "View: my reports only"}
            </button>
          )}
          <button
            type="button"
            onClick={saveAll}
            disabled={dirtyCount === 0}
            className="text-sm font-medium px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
          >
            Save {dirtyCount > 0 ? `(${dirtyCount})` : "all"}
          </button>
        </div>
      </div>

      <LeaveApplier employees={employees} holidays={holidays} onApplied={() => router.refresh()} />

      {rows.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-500 dark:bg-gray-900 dark:border-gray-800 dark:text-gray-400">
          No active employees are assigned to you.
          {!showingAll && canViewAll && (
            <>
              {" "}
              <button onClick={toggleScope} className="text-blue-600 hover:underline dark:text-blue-400">
                View all →
              </button>
            </>
          )}
        </div>
      )}

      <div className="space-y-2">
        {rows.map((row) => (
          <AttendanceRow
            key={row.employeeId}
            row={row}
            managerMap={managerMap}
            canMark={canViewAll || row.employee.managerId === currentUserId}
            onChange={(patch) => updateRow(row.employeeId, patch)}
            onSave={() => saveRow(row)}
          />
        ))}
      </div>
    </div>
  );
}

function AttendanceRow({ row, managerMap, canMark, onChange, onSave }) {
  const { employee, status, inTime, outTime, dirty, saving, saved, selfMarked, error } = row;
  const otPreview = employee.otEligible && status === "P" ? computeOtPreview(outTime) : 0;
  const otRate = otHourlyRate(employee);
  const otEarn = otPreview * otRate;
  const manager = managerMap[employee.managerId];

  return (
    <div
      className={`bg-white border rounded-xl p-3 sm:p-4 dark:bg-gray-900 ${
        error
          ? "border-red-300 dark:border-red-800"
          : dirty
          ? "border-amber-300 dark:border-amber-700/60"
          : saved
          ? "border-emerald-300 dark:border-emerald-800"
          : "border-gray-200 dark:border-gray-800"
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 dark:text-white truncate">{employee.name}</span>
            {!canMark && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                read-only
              </span>
            )}
            {selfMarked && (
              <span
                title="Recorded by the employee via the punch clock"
                className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
              >
                self
              </span>
            )}
            {employee.otEligible && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                OT
              </span>
            )}
            {isWorkStatus(status) && isLate(inTime) && (
              <span title="Checked in after the grace period" className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                Late
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {employee.designation || "—"} · Mgr: {manager?.name || manager?.email || "—"}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {MANUAL_ATTENDANCE_STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              disabled={!canMark || saving}
              title={s.label}
              onClick={() => onChange({ status: s.value })}
              className={`px-2.5 py-1.5 text-xs sm:text-sm rounded-md font-medium transition-colors ${
                status === s.value
                  ? STATUS_BTN[s.value] || "bg-gray-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
              } disabled:opacity-50`}
            >
              {s.value}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div>
            <label className="block text-[10px] text-gray-500 uppercase">In</label>
            <input
              type="time"
              className={`${inputCls} w-24 text-sm`}
              value={inTime}
              disabled={!canMark || saving || !isWorkStatus(status)}
              onChange={(e) => onChange({ inTime: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 uppercase">Out</label>
            <input
              type="time"
              className={`${inputCls} w-24 text-sm`}
              value={outTime}
              disabled={!canMark || saving || !isWorkStatus(status)}
              onChange={(e) => onChange({ outTime: e.target.value })}
            />
          </div>
        </div>

        <div className="text-right text-xs min-w-[92px]">
          {employee.otEligible && status === "P" ? (
            otPreview > 0 ? (
              <div>
                <div className="font-semibold text-emerald-700 dark:text-emerald-300">{otPreview}h OT</div>
                <div className="text-gray-500 dark:text-gray-400">≈ ₹{otEarn.toFixed(0)}</div>
              </div>
            ) : (
              <div className="text-gray-400">no OT</div>
            )
          ) : null}
        </div>

        <button
          type="button"
          disabled={!canMark || !dirty || saving}
          onClick={onSave}
          className="text-xs font-medium px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {saving ? "…" : dirty ? "Save" : saved ? "Saved" : "Save"}
        </button>
      </div>
      {error && (
        <div className="mt-2 text-xs text-red-700 dark:text-red-300">⚠️ {error}</div>
      )}
    </div>
  );
}

// Apply Paid/Unpaid leave across a date range in one go. Writes a PL/UL
// attendance row for every WORKING day in the range (skips the employee's
// weekly-off days + company holidays, which are already paid/non-working).
function LeaveApplier({ employees, holidays, onApplied }) {
  const [open, setOpen] = useState(false);
  const [empId, setEmpId] = useState("");
  const [type, setType] = useState("PL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const holidaySet = useMemo(() => new Set(holidays || []), [holidays]);

  async function apply() {
    setMsg("");
    const emp = employees.find((e) => e.id === empId);
    if (!emp || !from || !to) { setMsg("Pick an employee and a date range."); return; }
    if (to < from) { setMsg("End date is before the start date."); return; }
    const all = datesBetween(from, to);
    const working = all.filter((iso) => isWorkingDay(iso, emp.weeklyOffDays, holidaySet));
    if (!working.length) { setMsg("No working days in that range (all off / holiday)."); return; }
    setBusy(true);
    let ok = 0;
    for (const iso of working) {
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch("/api/hr/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: empId, date: iso, status: type, notes: type === "PL" ? "Paid leave" : "Unpaid leave" }),
      });
      if (res.ok) ok += 1;
    }
    setBusy(false);
    const skipped = all.length - working.length;
    setMsg(`Applied ${type} to ${ok} day${ok === 1 ? "" : "s"}${skipped ? ` · ${skipped} off/holiday skipped` : ""}.`);
    setFrom(""); setTo("");
    onApplied?.();
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl dark:bg-gray-900 dark:border-gray-800">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-800 dark:text-gray-200">
        <span>🏖️ Apply leave (date range)</span>
        <span className="text-gray-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-end">
          <div>
            <label className="block text-[10px] text-gray-500 uppercase">Employee</label>
            <select className={inputCls} value={empId} onChange={(e) => setEmpId(e.target.value)}>
              <option value="">— select —</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 uppercase">Type</label>
            <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="PL">Paid leave</option>
              <option value="UL">Unpaid leave</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 uppercase">From</label>
            <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 uppercase">To</label>
            <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <button type="button" onClick={apply} disabled={busy} className="h-[42px] px-4 rounded-md bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 disabled:opacity-40">
            {busy ? "Applying…" : "Apply"}
          </button>
          {msg && <p className="sm:col-span-5 text-xs text-gray-600 dark:text-gray-300">{msg}</p>}
        </div>
      )}
    </div>
  );
}
