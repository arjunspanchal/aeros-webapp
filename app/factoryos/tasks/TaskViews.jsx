"use client";
import { useMemo, useState } from "react";
import { PRIORITIES } from "@/lib/factoryos/taskOptions";
import { STATUS_STYLE, PRIORITY_RANK, Avatar, AvatarStack, DoneTick, JobChip, BrandChip, TaskMeta, QuickAdd, ymd, dueInfo } from "./taskUi";

const byDue = (a, b) =>
  (a.dueDate || "9999").localeCompare(b.dueDate || "9999")
  || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  || a.sortOrder - b.sortOrder;

// ---------- Board: columns you drag cards between ----------
export function BoardView({ groups, tasksByGroup, people, today, onOpen, onPatch, onAdd }) {
  const [dragId, setDragId] = useState("");
  const [over, setOver] = useState({ group: "", card: "" });
  const person = (id) => people.find((p) => p.id === id);

  function drop(group) {
    const id = dragId;
    setDragId(""); setOver({ group: "", card: "" });
    if (!id) return;
    const list = (tasksByGroup.get(group.key) || []).filter((t) => t.id !== id);
    const i = over.group === group.key && over.card ? list.findIndex((t) => t.id === over.card) : -1;
    let sortOrder;
    if (i >= 0) sortOrder = i > 0 ? (list[i - 1].sortOrder + list[i].sortOrder) / 2 : list[i].sortOrder - 1;
    else sortOrder = list.length ? list[list.length - 1].sortOrder + 1 : Date.now() / 1000;
    onPatch(id, { ...group.patch, sortOrder });
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {groups.map((g) => {
        const list = tasksByGroup.get(g.key) || [];
        const active = over.group === g.key && dragId;
        return (
          <section
            key={g.key}
            onDragOver={(e) => { e.preventDefault(); if (over.group !== g.key) setOver({ group: g.key, card: "" }); }}
            onDrop={(e) => { e.preventDefault(); drop(g); }}
            className={`flex w-72 shrink-0 flex-col rounded-xl p-2 lg:w-auto lg:min-w-[240px] lg:flex-1 lg:shrink ${active ? "bg-blue-50 ring-2 ring-blue-200 dark:bg-blue-900/20 dark:ring-blue-800" : "bg-gray-100/70 dark:bg-gray-900"}`}
          >
            <header className="flex items-center gap-2 px-1.5 py-1.5">
              {g.person !== undefined ? <Avatar person={g.person} /> : <span className={`h-2.5 w-2.5 rounded-full ${g.dot || "bg-gray-400"}`} />}
              <h3 className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{g.title}</h3>
              <span className="text-xs text-gray-500 dark:text-gray-400">{list.length}</span>
            </header>
            <div className="flex min-h-[40px] flex-col gap-2">
              {list.map((t) => (
                <article
                  key={t.id}
                  draggable
                  onDragStart={(e) => { setDragId(t.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", t.id); }}
                  onDragEnd={() => { setDragId(""); setOver({ group: "", card: "" }); }}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (over.card !== t.id || over.group !== g.key) setOver({ group: g.key, card: t.id }); }}
                  onClick={() => onOpen(t.id)}
                  className={`cursor-pointer rounded-lg border bg-white p-2.5 shadow-sm transition hover:shadow dark:bg-gray-800 ${
                    over.card === t.id && dragId && dragId !== t.id ? "border-t-2 border-blue-500" : "border-gray-200 dark:border-gray-700"
                  } ${dragId === t.id ? "opacity-40" : ""}`}
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5"><DoneTick done={t.status === "done"} onToggle={() => onPatch(t.id, { status: t.status === "done" ? "todo" : "done" })} /></span>
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm leading-snug ${t.status === "done" ? "text-gray-400 line-through" : "text-gray-900 dark:text-white"}`}>{t.title}</div>
                      <TaskMeta task={t} today={today} />
                    </div>
                    {g.person === undefined
                      ? <AvatarStack people={t.assigneeIds.map(person)} />
                      : t.assigneeIds.length > 1 && <span className="shrink-0 text-[10px] text-gray-500 dark:text-gray-400" title={t.assigneeIds.map((id) => person(id)?.name).filter(Boolean).join(", ")}>+{t.assigneeIds.length - 1}</span>}
                  </div>
                </article>
              ))}
            </div>
            <div className="mt-2"><QuickAdd onAdd={(title) => onAdd({ title, ...g.patch })} /></div>
          </section>
        );
      })}
    </div>
  );
}

// ---------- List: one line per task, edited in place ----------
const cellSelect = "max-w-full rounded border border-transparent bg-transparent px-1 py-1 text-xs text-gray-700 hover:border-gray-200 focus:border-blue-500 focus:outline-none dark:text-gray-300 dark:hover:border-gray-700";

export function ListView({ groups, tasksByGroup, people, today, onOpen, onPatch, onAdd }) {
  const [closed, setClosed] = useState({});
  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const list = [...(tasksByGroup.get(g.key) || [])].sort(byDue);
        const isClosed = !!closed[g.key];
        return (
          <section key={g.key} className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
            <button type="button" onClick={() => setClosed((c) => ({ ...c, [g.key]: !c[g.key] }))} className="flex w-full items-center gap-2 px-3 py-2 text-left">
              <span className="w-3 text-xs text-gray-400">{isClosed ? "▸" : "▾"}</span>
              {g.person !== undefined ? <Avatar person={g.person} /> : <span className={`h-2.5 w-2.5 rounded-full ${g.dot || "bg-gray-400"}`} />}
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{g.title}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">{list.length}</span>
            </button>
            {!isClosed && (
              <>
                <ul className="divide-y divide-gray-100 border-t border-gray-100 dark:divide-gray-800 dark:border-gray-800">
                  {list.map((t) => {
                    const due = dueInfo(t, today);
                    return (
                      <li key={t.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <DoneTick done={t.status === "done"} onToggle={() => onPatch(t.id, { status: t.status === "done" ? "todo" : "done" })} />
                        <button type="button" onClick={() => onOpen(t.id)} className="min-w-0 flex-1 py-0.5 text-left">
                          <span className={`block truncate text-sm ${t.status === "done" ? "text-gray-400 line-through" : "text-gray-900 dark:text-white"}`}>{t.title}</span>
                          <span className="sm:hidden"><TaskMeta task={t} today={today} /></span>
                        </button>
                        <span className="hidden shrink-0 items-center gap-2 sm:flex">
                          {t.label && g.patch.label === undefined && <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600 dark:bg-gray-800 dark:text-gray-400">{t.label}</span>}
                          <BrandChip task={t} />
                          <JobChip job={t.job} />
                          {t.checklist.length > 0 && <span className="text-[11px] text-gray-500">☑ {t.checklist.filter((c) => c.done).length}/{t.checklist.length}</span>}
                          {t.commentCount > 0 && <span className="text-[11px] text-gray-500">💬 {t.commentCount}</span>}
                          {g.patch.priority === undefined && (
                            <select aria-label="Priority" className={`${cellSelect} w-20 capitalize`} value={t.priority} onChange={(e) => onPatch(t.id, { priority: e.target.value })}>
                              {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                            </select>
                          )}
                          <span className="relative">
                            <input aria-label="Due date" type="date" className={`${cellSelect} w-[118px] ${due?.late ? "!text-red-600 font-medium" : ""}`} value={t.dueDate} onChange={(e) => onPatch(t.id, { dueDate: e.target.value })} />
                          </span>
                          {g.patch.assigneeId === undefined && t.assigneeIds.length > 1 && (
                            <button type="button" onClick={() => onOpen(t.id)} className="w-28 truncate px-1 py-1 text-left text-xs text-gray-700 hover:underline dark:text-gray-300" title={t.assigneeIds.map((id) => people.find((p) => p.id === id)?.name).filter(Boolean).join(", ")}>
                              {(people.find((p) => p.id === t.assigneeIds[0])?.name || "").split(" ")[0]} +{t.assigneeIds.length - 1}
                            </button>
                          )}
                          {g.patch.assigneeId === undefined && t.assigneeIds.length <= 1 && (
                            <select aria-label="Who" className={`${cellSelect} w-28`} value={t.assigneeId} onChange={(e) => onPatch(t.id, { assigneeId: e.target.value })}>
                              <option value="">Nobody yet</option>
                              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          )}
                        </span>
                        <span className="sm:hidden"><AvatarStack people={t.assigneeIds.map((id) => people.find((p) => p.id === id))} /></span>
                      </li>
                    );
                  })}
                </ul>
                <div className="border-t border-gray-100 px-2 py-1 dark:border-gray-800"><QuickAdd onAdd={(title) => onAdd({ title, ...g.patch })} /></div>
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}

// ---------- Calendar: tasks on their due date, drag to move ----------
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function CalChip({ t, people, today, onOpen, setDragId, setOverDay }) {
  const names = t.assigneeIds.map((id) => people.find((p) => p.id === id)?.name).filter(Boolean).join(", ");
  const who = names ? { name: names } : null;
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => { setDragId(t.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", t.id); }}
      onDragEnd={() => { setDragId(""); setOverDay(""); }}
      onClick={(e) => { e.stopPropagation(); onOpen(t.id); }}
      title={`${t.title}${who ? " · " + who.name : ""}`}
      className={`flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-left text-[11px] leading-tight ${STATUS_STYLE[t.status].chip} ${dueInfo(t, today)?.late ? "ring-1 ring-red-400" : ""}`}
    >
      <span className={`truncate ${t.status === "done" ? "line-through opacity-70" : ""}`}>{t.title}</span>
    </button>
  );
}

export function CalendarView({ tasks, people, today, onOpen, onPatch, onAdd }) {
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [dragId, setDragId] = useState("");
  const [overDay, setOverDay] = useState("");
  const [addDay, setAddDay] = useState("");

  const days = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const start = new Date(first);
    start.setDate(1 - ((first.getDay() + 6) % 7)); // back to Monday
    const out = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      out.push({ date: ymd(d), inMonth: d.getMonth() === m - 1, n: d.getDate() });
    }
    return out.slice(0, out[35].inMonth ? 42 : 35);
  }, [month]);

  const byDay = useMemo(() => {
    const map = new Map();
    for (const t of tasks) {
      if (!t.dueDate) continue;
      if (!map.has(t.dueDate)) map.set(t.dueDate, []);
      map.get(t.dueDate).push(t);
    }
    for (const list of map.values()) list.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.sortOrder - b.sortOrder);
    return map;
  }, [tasks]);
  const undated = tasks.filter((t) => !t.dueDate && t.status !== "done");

  const shift = (n) => {
    const [y, m] = month.split("-").map(Number);
    setMonth(ymd(new Date(y, m - 1 + n, 1)).slice(0, 7));
  };
  const title = new Date(`${month}-01T12:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  const chipProps = { people, today, onOpen, setDragId, setOverDay };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="rounded-md border border-gray-200 px-2 py-1 text-sm hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">‹</button>
        <div className="w-36 text-center text-sm font-semibold text-gray-900 dark:text-white">{title}</div>
        <button type="button" onClick={() => shift(1)} aria-label="Next month" className="rounded-md border border-gray-200 px-2 py-1 text-sm hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">›</button>
        <button type="button" onClick={() => setMonth(today.slice(0, 7))} className="rounded-md px-2 py-1 text-xs text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30">This month</button>
        <span className="text-xs text-gray-500 dark:text-gray-400">Drag a task to another day to move its due date.</span>
      </div>

      {undated.length > 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 p-2 dark:border-gray-700">
          <div className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">No due date ({undated.length}): drag onto a day</div>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-6">{undated.slice(0, 24).map((t) => <CalChip key={t.id} t={t} {...chipProps} />)}</div>
        </div>
      )}

      <div className="overflow-x-auto">
        <div className="min-w-[700px] overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:bg-gray-800/60 dark:text-gray-400">
            {DOW.map((d) => <div key={d} className="py-1.5">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const list = byDay.get(d.date) || [];
              return (
                <div
                  key={d.date}
                  onDragOver={(e) => { e.preventDefault(); if (overDay !== d.date) setOverDay(d.date); }}
                  onDrop={(e) => { e.preventDefault(); const id = dragId; setDragId(""); setOverDay(""); if (id) onPatch(id, { dueDate: d.date }); }}
                  onClick={() => setAddDay(d.date)}
                  className={`group min-h-[104px] border-b border-r border-gray-100 p-1 dark:border-gray-800 ${d.inMonth ? "" : "bg-gray-50/70 dark:bg-gray-950/40"} ${overDay === d.date && dragId ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[11px] ${d.date === today ? "bg-blue-600 font-semibold text-white" : d.inMonth ? "text-gray-700 dark:text-gray-300" : "text-gray-400 dark:text-gray-600"}`}>{d.n}</span>
                    <span className="text-xs text-gray-300 opacity-0 group-hover:opacity-100">+</span>
                  </div>
                  <div className="space-y-0.5">
                    {list.slice(0, 4).map((t) => <CalChip key={t.id} t={t} {...chipProps} />)}
                    {list.length > 4 && <div className="px-1 text-[10px] text-gray-500">+ {list.length - 4} more</div>}
                    {addDay === d.date && (
                      <input
                        autoFocus
                        placeholder="Task, then Enter"
                        onClick={(e) => e.stopPropagation()}
                        onBlur={() => setAddDay("")}
                        onKeyDown={async (e) => {
                          if (e.key === "Escape") setAddDay("");
                          if (e.key !== "Enter") return;
                          const v = e.currentTarget.value.trim();
                          if (!v) return;
                          e.currentTarget.value = "";
                          await onAdd({ title: v, dueDate: d.date });
                        }}
                        className="w-full rounded border border-blue-400 bg-white px-1 py-0.5 text-[11px] text-gray-900 outline-none dark:bg-gray-900 dark:text-white"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
