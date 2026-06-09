"use client";
import Link from "next/link";
import { useState } from "react";

export default function AttendanceGapsWidget({ gaps, employeeNameById, monthKey }) {
  const [expanded, setExpanded] = useState(false);
  const totalGaps = gaps.reduce((sum, g) => sum + g.missingEmployeeIds.length, 0);
  const shown = expanded ? gaps : gaps.slice(0, 5);
  const [y, m] = monthKey.split("-").map(Number);
  const monthLabel = new Date(y, m - 1, 1).toLocaleString("en-IN", { month: "short", year: "numeric" });

  return (
    <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 dark:bg-amber-900/20 dark:border-amber-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            ⚠️ Attendance gaps this month ({monthLabel})
          </h2>
          <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
            {gaps.length} {gaps.length === 1 ? "day has" : "days have"} missing marks
            {totalGaps !== gaps.length && ` · ${totalGaps} employee-days total`}
          </p>
        </div>
      </div>

      <ul className="mt-3 space-y-1.5">
        {shown.map((g) => {
          const names = g.missingEmployeeIds
            .map((id) => employeeNameById[id])
            .filter(Boolean);
          const nameList = names.slice(0, 3).join(", ") + (names.length > 3 ? ` +${names.length - 3} more` : "");
          return (
            <li key={g.date} className="flex items-center justify-between gap-2 text-sm">
              <Link
                href={`/hr/attendance?date=${g.date}`}
                className="font-mono text-amber-900 dark:text-amber-200 hover:underline"
              >
                {g.date}
              </Link>
              <span className="text-xs text-amber-800 dark:text-amber-300 flex-1 ml-3 truncate text-right">
                {names.length} missing: {nameList}
              </span>
            </li>
          );
        })}
      </ul>

      {gaps.length > 5 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs font-medium text-amber-900 hover:underline dark:text-amber-200"
        >
          {expanded ? "Show less" : `Show all ${gaps.length} days →`}
        </button>
      )}
    </div>
  );
}
