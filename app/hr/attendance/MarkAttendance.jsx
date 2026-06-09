"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { inputCls } from "@/app/factoryos/_components/ui";
import { ATTENDANCE_STATUSES, SHIFT_END, SHIFT_START } from "@/lib/factoryos/constants";
import { otHourlyRate } from "@/lib/factoryos/hr";

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
    const payload = {
      employeeId: row.employeeId,
      date,
      status: row.status,
      inTime: row.status === "A" ? "" : row.inTime,
      outTime: row.status === "A" ? "" : row.outTime,
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
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {employee.designation || "—"} · Mgr: {manager?.name || manager?.email || "—"}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {ATTENDANCE_STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              disabled={!canMark || saving}
              onClick={() => onChange({ status: s.value })}
              className={`px-3 py-1.5 text-xs sm:text-sm rounded-md font-medium transition-colors ${
                status === s.value
                  ? s.value === "P"
                    ? "bg-emerald-600 text-white"
                    : s.value === "A"
                    ? "bg-red-600 text-white"
                    : "bg-amber-500 text-white"
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
              disabled={!canMark || saving || status === "A"}
              onChange={(e) => onChange({ inTime: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 uppercase">Out</label>
            <input
              type="time"
              className={`${inputCls} w-24 text-sm`}
              value={outTime}
              disabled={!canMark || saving || status === "A"}
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
