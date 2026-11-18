"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Avatar, DoneTick, TaskMeta, ymd } from "./taskUi";

const field = "rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white";

// Tasks tied to one job, shown on the job page. Adding one here links it to
// the job; a task opens in the task tracker.
export default function JobTasksCard({ jNumber }) {
  const [tasks, setTasks] = useState(null);
  const [people, setPeople] = useState([]);
  const [draft, setDraft] = useState({ title: "", assigneeId: "", dueDate: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const today = ymd();

  useEffect(() => {
    let alive = true;
    fetch(`/api/factoryos/tasks?job=${encodeURIComponent(jNumber)}`)
      .then((r) => (r.ok ? r.json() : { tasks: [], people: [] }))
      .then((d) => { if (alive) { setTasks(d.tasks || []); setPeople(d.people || []); } })
      .catch(() => { if (alive) setTasks([]); });
    return () => { alive = false; };
  }, [jNumber]);

  async function add(e) {
    e.preventDefault();
    const title = draft.title.trim();
    if (!title || busy) return;
    setBusy(true); setErr("");
    const body = { title, jNumber };
    if (draft.assigneeId) body.assigneeId = draft.assigneeId;
    if (draft.dueDate) body.dueDate = draft.dueDate;
    const res = await fetch("/api/factoryos/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error || "Couldn't save the task"); return; }
    setTasks((ts) => [...(ts || []), data.task]);
    setDraft((d) => ({ ...d, title: "" }));
  }

  async function toggle(t) {
    const status = t.status === "done" ? "todo" : "done";
    setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, status } : x)));
    const res = await fetch(`/api/factoryos/tasks/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setTasks((ts) => ts.map((x) => (x.id === t.id ? t : x))); setErr(data.error || "Couldn't save the change"); return; }
    setTasks((ts) => ts.map((x) => (x.id === t.id ? data.task : x)));
  }

  const list = [...(tasks || [])].sort((a, b) => (a.status === "done") - (b.status === "done") || (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
  const openCount = list.filter((t) => t.status !== "done").length;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 dark:bg-gray-900 dark:border-gray-800">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
          Tasks on this job{tasks ? <span className="ml-2 font-normal text-gray-500 dark:text-gray-400">{openCount} open</span> : null}
        </h2>
        <Link href="/factoryos/tasks" className="text-xs text-blue-600 hover:underline dark:text-blue-400">All tasks →</Link>
      </div>
      {tasks === null ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Nothing pending on this job. Add a task below and it shows up in the person&apos;s task list.</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {list.map((t) => (
            <li key={t.id} className="flex items-start gap-2 py-2">
              <span className="mt-0.5"><DoneTick done={t.status === "done"} onToggle={() => toggle(t)} /></span>
              <Link href={`/factoryos/tasks?task=${t.id}`} className="min-w-0 flex-1">
                <span className={`block text-sm ${t.status === "done" ? "text-gray-400 line-through" : "text-gray-900 hover:text-blue-700 dark:text-white"}`}>{t.title}</span>
                <TaskMeta task={t} today={today} showJob={false} />
              </Link>
              <Avatar person={people.find((p) => p.id === t.assigneeId)} />
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="mt-3 flex flex-wrap items-center gap-2">
        <input className={`${field} min-w-[180px] flex-1`} placeholder="New task for this job" value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
        <select aria-label="Who" className={field} value={draft.assigneeId} onChange={(e) => setDraft((d) => ({ ...d, assigneeId: e.target.value }))}>
          <option value="">Who?</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input aria-label="Due date" type="date" className={field} value={draft.dueDate} onChange={(e) => setDraft((d) => ({ ...d, dueDate: e.target.value }))} />
        <button type="submit" disabled={busy || !draft.title.trim()} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {busy ? "Adding…" : "Add"}
        </button>
      </form>
      {err && <p className="mt-2 text-xs text-red-500">{err}</p>}
    </div>
  );
}
