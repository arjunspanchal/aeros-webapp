"use client";
import { useRef, useState } from "react";
import Link from "next/link";

// Small shared pieces for the task tracker screens.

export const STATUS_STYLE = {
  todo: { dot: "bg-gray-400", chip: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  doing: { dot: "bg-blue-500", chip: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200" },
  stuck: { dot: "bg-red-500", chip: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" },
  done: { dot: "bg-green-500", chip: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200" },
};
export const PRIORITY_STYLE = {
  urgent: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  high: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  normal: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  low: "bg-gray-50 text-gray-500 dark:bg-gray-800/60 dark:text-gray-500",
};
export const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 };

// Local calendar date as YYYY-MM-DD (the team works in one time zone).
export function ymd(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + n);
  return ymd(d);
}
export function shortDate(dateStr) {
  if (!dateStr) return "";
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
export function timeAgo(iso) {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// How a due date reads on a card, and whether it needs attention.
export function dueInfo(task, today = ymd()) {
  if (!task.dueDate) return null;
  const days = Math.round((new Date(`${task.dueDate}T12:00:00`) - new Date(`${today}T12:00:00`)) / 86400000);
  if (task.status === "done") return { text: shortDate(task.dueDate), cls: "text-gray-400 dark:text-gray-500", late: false };
  if (days < 0) return { text: `${shortDate(task.dueDate)} · ${-days} d late`, cls: "text-red-600 font-medium dark:text-red-400", late: true };
  if (days === 0) return { text: "Today", cls: "text-amber-700 font-medium dark:text-amber-300", late: false };
  if (days === 1) return { text: "Tomorrow", cls: "text-gray-700 dark:text-gray-300", late: false };
  return { text: shortDate(task.dueDate), cls: "text-gray-500 dark:text-gray-400", late: false };
}

const AVATAR_COLORS = [
  "bg-blue-600", "bg-emerald-600", "bg-amber-600", "bg-purple-600", "bg-rose-600", "bg-teal-600", "bg-indigo-600", "bg-orange-600",
];
export function Avatar({ person, size = "sm", title }) {
  const dim = size === "lg" ? "h-7 w-7 text-xs" : "h-5 w-5 text-[10px]";
  if (!person) {
    return <span title={title || "Nobody yet"} className={`inline-flex ${dim} shrink-0 items-center justify-center rounded-full border border-dashed border-gray-300 text-gray-400 dark:border-gray-600`}>?</span>;
  }
  const parts = person.name.trim().split(/\s+/);
  const initials = ((parts[0]?.[0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  let h = 0;
  for (const ch of person.id) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return (
    <span title={title || person.name} className={`inline-flex ${dim} shrink-0 items-center justify-center rounded-full font-semibold text-white ${AVATAR_COLORS[h % AVATAR_COLORS.length]}`}>
      {initials}
    </span>
  );
}

// Round tick that finishes (or reopens) a task.
export function DoneTick({ done, onToggle, size = "h-4 w-4" }) {
  return (
    <button
      type="button"
      aria-label={done ? "Mark as not done" : "Mark as done"}
      title={done ? "Mark as not done" : "Mark as done"}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className={`${size} shrink-0 rounded-full border flex items-center justify-center transition-colors ${
        done ? "border-green-600 bg-green-600 text-white" : "border-gray-300 hover:border-green-600 dark:border-gray-600"
      }`}
    >
      {done && <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2.5 6.5l2.5 2.5 4.5-5" /></svg>}
    </button>
  );
}

export function JobChip({ job, link = true }) {
  if (!job) return null;
  const cls = "inline-flex items-center rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300";
  const title = [job.client, job.brand, job.item].filter(Boolean).join(" · ");
  if (!link) return <span className={cls} title={title}>J# {job.jNumber}</span>;
  return (
    <Link href={`/factoryos/manager/${job.id}`} onClick={(e) => e.stopPropagation()} className={`${cls} hover:underline`} title={title}>
      J# {job.jNumber}
    </Link>
  );
}

// The line of small facts under a task title.
export function TaskMeta({ task, today, showJob = true }) {
  const due = dueInfo(task, today);
  const done = task.checklist.filter((c) => c.done).length;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
      {task.priority !== "normal" && (
        <span className={`rounded px-1.5 py-0.5 font-medium capitalize ${PRIORITY_STYLE[task.priority]}`}>{task.priority}</span>
      )}
      {due && <span className={due.cls}>{due.text}</span>}
      {showJob && <JobChip job={task.job} />}
      {task.label && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600 dark:bg-gray-800 dark:text-gray-400">{task.label}</span>}
      {task.checklist.length > 0 && <span className="text-gray-500 dark:text-gray-400">☑ {done}/{task.checklist.length}</span>}
      {task.commentCount > 0 && <span className="text-gray-500 dark:text-gray-400">💬 {task.commentCount}</span>}
      {task.recurrence !== "none" && <span className="text-gray-500 dark:text-gray-400" title={`Repeats ${task.recurrence}`}>↻ {task.recurrence}</span>}
    </div>
  );
}

// "+ Add task" that turns into a text box; Enter saves and stays open for
// the next one, Esc closes.
export function QuickAdd({ onAdd, placeholder = "Task name, then Enter", label = "+ Add task", className = "" }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  async function submit() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    const ok = await onAdd(t);
    setBusy(false);
    if (ok !== false) setText("");
    ref.current?.focus();
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 ${className}`}>
        {label}
      </button>
    );
  }
  return (
    <input
      ref={ref}
      autoFocus
      value={text}
      disabled={busy}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); submit(); }
        if (e.key === "Escape") { setText(""); setOpen(false); }
      }}
      onBlur={() => { if (!text.trim()) setOpen(false); }}
      className={`w-full rounded-md border border-blue-400 bg-white px-2 py-1.5 text-sm text-gray-900 outline-none ring-2 ring-blue-100 dark:bg-gray-900 dark:text-white dark:ring-blue-900/40 ${className}`}
    />
  );
}
