"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STATUSES, PRIORITIES, LABELS } from "@/lib/factoryos/taskOptions";
import { STATUS_STYLE, Avatar, whatsappLink, ymd, dueInfo } from "./taskUi";
import { BoardView, ListView, CalendarView } from "./TaskViews";
import TaskPanel from "./TaskPanel";

const PREFS_KEY = "aeros.tasks.prefs.v1";
const VIEWS = [{ key: "board", label: "Board" }, { key: "list", label: "List" }, { key: "calendar", label: "Calendar" }];
const GROUPS = [{ key: "status", label: "Status" }, { key: "assignee", label: "Person" }, { key: "priority", label: "Priority" }, { key: "customer", label: "Customer" }, { key: "type", label: "Type" }];
const PRIORITY_DOT = { urgent: "bg-red-500", high: "bg-amber-500", normal: "bg-gray-400", low: "bg-gray-300" };
const pill = (on) => `rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${on ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "bg-white text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-300 dark:ring-gray-700"}`;

// Team task tracker: board, list and calendar over the same tasks.
export default function TasksClient({ initial, canDeleteAny, defaultMine }) {
  const [tasks, setTasks] = useState(initial.tasks);
  const [people, setPeople] = useState(initial.people);
  const [jobs, setJobs] = useState(initial.jobs || []);
  const [customers, setCustomers] = useState(initial.customers || []);
  // Customer and brand filters ("" = all, "none" = tasks with none).
  const [customer, setCustomer] = useState("");
  const [brand, setBrand] = useState("");
  // Type of task filter ("" = all, "none" = tasks with no type).
  const [type, setType] = useState("");
  const meId = initial.meId;
  const [view, setView] = useState("board");
  const [groupBy, setGroupBy] = useState("status");
  const [who, setWho] = useState(defaultMine && meId ? [meId] : []); // empty = everyone
  const [search, setSearch] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [openId, setOpenId] = useState("");
  const [toast, setToast] = useState(null); // { msg, action?: { href, label } }
  const [ready, setReady] = useState(false);
  // Email the assignee when a task is given to them (admin can switch it).
  const [emails, setEmails] = useState(null); // { emailsEnabled, canChange }
  useEffect(() => {
    fetch("/api/factoryos/tasks/settings").then((r) => (r.ok ? r.json() : null)).then(setEmails).catch(() => {});
  }, []);
  async function toggleEmails() {
    if (!emails?.canChange) return;
    const next = !emails.emailsEnabled;
    if (!window.confirm(next ? "Turn email alerts ON? From now, each person gets an email from factory@aeros-x.com when a task is given to them." : "Turn email alerts OFF? Nobody will be emailed about new tasks.")) return;
    const res = await fetch("/api/factoryos/tasks/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emailsEnabled: next }) });
    if (res.ok) setEmails(await res.json());
  }
  const [draft, setDraft] = useState({ title: "", assigneeId: "", dueDate: "", label: "" });
  const [adding, setAdding] = useState(false);
  const busy = useRef(0);
  const seq = useRef({});
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const peopleRef = useRef(people);
  peopleRef.current = people;
  const customersRef = useRef(customers);
  customersRef.current = customers;
  // Server sends the India date so the first paint matches; then the device's.
  const [today, setToday] = useState(initial.today || ymd());
  useEffect(() => { setToday(ymd()); }, []);

  // Remembered choices, and a task opened from a link (?task=...).
  useEffect(() => {
    try {
      const p = JSON.parse(window.localStorage.getItem(PREFS_KEY) || "null");
      if (p) {
        if (VIEWS.some((v) => v.key === p.view)) setView(p.view);
        if (GROUPS.some((g) => g.key === p.groupBy)) setGroupBy(p.groupBy);
        if (Array.isArray(p.who)) setWho(p.who.filter((id) => id === "none" || initial.people.some((x) => x.id === id)));
        setShowDone(!!p.showDone);
      }
      else if (window.innerWidth < 640) setView("list"); // phones start on the list
    } catch { /* first visit */ }
    const id = new URLSearchParams(window.location.search).get("task");
    if (id) setOpenId(id);
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!ready) return; // never overwrite saved choices before they are read
    try { window.localStorage.setItem(PREFS_KEY, JSON.stringify({ view, groupBy, who, showDone })); } catch { /* private window */ }
  }, [ready, view, groupBy, who, showDone]);

  const toastTimer = useRef(null);
  const flash = (msg, action) => {
    clearTimeout(toastTimer.current);
    setToast({ msg, action });
    toastTimer.current = setTimeout(() => setToast(null), action ? 12000 : 4000);
  };
  const meName = initial.meName || "";

  const open = useCallback((id) => {
    setOpenId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("task", id); else url.searchParams.delete("task");
    window.history.replaceState(null, "", url);
  }, []);
  const close = useCallback(() => open(""), [open]);

  // Pick up tasks other people (or a Cowork chat) added.
  const refresh = useCallback(async () => {
    if (busy.current > 0 || document.hidden) return;
    try {
      const res = await fetch("/api/factoryos/tasks");
      if (!res.ok) return;
      const data = await res.json();
      if (busy.current > 0) return;
      setTasks(data.tasks); setPeople(data.people); setJobs(data.jobs || []); if (data.customers) setCustomers(data.customers);
    } catch { /* offline; try again next time */ }
  }, []);
  useEffect(() => {
    const t = setInterval(refresh, 45000);
    window.addEventListener("focus", refresh);
    return () => { clearInterval(t); window.removeEventListener("focus", refresh); };
  }, [refresh]);

  // Save a change. The screen updates first; a failed save is put back.
  const patch = useCallback(async (id, change, localOnly) => {
    const before = tasksRef.current.find((t) => t.id === id);
    if (!before) return;
    const { jNumber, ...shown } = change;
    if (shown.status === "done" && before.status !== "done") shown.completedAt = new Date().toISOString();
    // A task with no job shows its own customer straight away.
    if (shown.clientId !== undefined && !before.job) {
      shown.customerId = shown.clientId || "";
      shown.customerName = customersRef.current.find((c) => c.id === shown.clientId)?.name || "";
    }
    delete shown.clientId;
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...shown, ...(localOnly || {}) } : t)));
    if (!Object.keys(change).length) return;
    const n = (seq.current[id] || 0) + 1;
    seq.current[id] = n;
    busy.current += 1;
    try {
      const res = await fetch(`/api/factoryos/tasks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't save the change");
      setTasks((ts) => {
        let out = seq.current[id] === n ? ts.map((t) => (t.id === id ? data.task : t)) : ts;
        if (data.spawned && !out.some((t) => t.id === data.spawned.id)) out = [...out, data.spawned];
        return out;
      });
      if (data.spawned) flash("Done. The next one is set for " + new Date(`${data.spawned.dueDate}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + ".");
    } catch (e) {
      if (seq.current[id] === n) setTasks((ts) => ts.map((t) => (t.id === id ? before : t)));
      flash(e.message);
    } finally {
      busy.current -= 1;
    }
  }, []);

  const add = useCallback(async (fields) => {
    const body = { ...fields };
    // A new task goes to the one person being looked at, if there is just one.
    if (body.assigneeId === undefined && who.length === 1 && who[0] !== "none") body.assigneeId = who[0];
    // ...and is tagged with the customer / brand being looked at.
    if (body.clientId === undefined && !body.jNumber && customer && customer !== "none") body.clientId = customer;
    if (body.brand === undefined && !body.jNumber && brand && brand !== "none") body.brand = brand;
    if (body.label === undefined && type && type !== "none") body.label = type;
    busy.current += 1;
    try {
      const res = await fetch("/api/factoryos/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't save the task");
      setTasks((ts) => [...ts, data.task]);
      // Given to someone else: offer to tell them on WhatsApp.
      const person = data.task.assigneeId && data.task.assigneeId !== meId ? peopleRef.current.find((p) => p.id === data.task.assigneeId) : null;
      if (person) flash(`Task given to ${person.name.split(" ")[0]}.`, { href: whatsappLink(data.task, person, meName), label: "Send on WhatsApp" });
      return data.task;
    } catch (e) {
      flash(e.message);
      return false;
    } finally {
      busy.current -= 1;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [who, meId, meName, customer, brand, type]);

  const remove = useCallback(async (id) => {
    const res = await fetch(`/api/factoryos/tasks/${id}`, { method: "DELETE" });
    if (!res.ok) { flash((await res.json().catch(() => ({}))).error || "Couldn't delete the task"); return; }
    setTasks((ts) => ts.filter((t) => t.id !== id));
    close();
  }, [close]);

  // ----- what is on screen -----
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (who.length && !who.includes(t.assigneeId || "none")) return false;
      if (customer && (t.customerId || "none") !== customer) return false;
      if (brand && (t.brand || "none") !== brand) return false;
      if (type && (t.label || "none") !== type) return false;
      if (!q) return true;
      return `${t.title} ${t.notes} ${t.label} ${t.customerName} ${t.brand} ${t.job ? `${t.job.jNumber} ${t.job.item}` : ""}`.toLowerCase().includes(q);
    });
  }, [tasks, who, search, customer, brand, type]);
  const openByType = useMemo(() => {
    const m = {};
    for (const t of tasks) if (t.status !== "done") m[t.label || "none"] = (m[t.label || "none"] || 0) + 1;
    return m;
  }, [tasks]);

  // What the two filter pickers offer: only customers and brands that have a
  // task, each with its count of open tasks. Brands narrow to the chosen customer.
  const customerOptions = useMemo(() => {
    const m = new Map();
    for (const t of tasks) {
      const k = t.customerId || "none";
      const cur = m.get(k) || { id: k, name: t.customerName || "No customer", open: 0 };
      if (t.status !== "done") cur.open += 1;
      m.set(k, cur);
    }
    return [...m.values()].sort((a, b) => (a.id === "none") - (b.id === "none") || a.name.localeCompare(b.name));
  }, [tasks]);
  const brandOptions = useMemo(() => {
    const m = new Map();
    for (const t of tasks) {
      if (customer && (t.customerId || "none") !== customer) continue;
      const k = t.brand || "none";
      const cur = m.get(k) || { id: k, name: t.brand || "No brand", open: 0 };
      if (t.status !== "done") cur.open += 1;
      m.set(k, cur);
    }
    return [...m.values()].sort((a, b) => (a.id === "none") - (b.id === "none") || a.name.localeCompare(b.name));
  }, [tasks, customer]);
  // A brand picked under one customer is dropped when the customer changes.
  useEffect(() => { if (brand && !brandOptions.some((b) => b.id === brand)) setBrand(""); }, [brandOptions, brand]);

  const weekAgo = Date.now() - 7 * 86400000;
  const visible = useMemo(() => filtered.filter((t) => {
    if (t.status !== "done" || showDone) return true;
    // The Done column on the status board keeps the last week in view.
    return view === "board" && groupBy === "status" && t.completedAt && new Date(t.completedAt).getTime() > weekAgo;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [filtered, showDone, view, groupBy]);

  const groups = useMemo(() => {
    if (groupBy === "assignee") {
      const ids = new Set(visible.map((t) => t.assigneeId).filter(Boolean));
      for (const id of who) if (id !== "none") ids.add(id);
      const cols = people.filter((p) => ids.has(p.id)).map((p) => ({ key: p.id, title: p.name, person: p, patch: { assigneeId: p.id } }));
      if (!who.length || who.includes("none")) cols.push({ key: "none", title: "Nobody yet", person: null, patch: { assigneeId: "" } });
      return cols;
    }
    if (groupBy === "priority") return PRIORITIES.map((p) => ({ key: p.key, title: p.label, dot: PRIORITY_DOT[p.key], patch: { priority: p.key } }));
    if (groupBy === "type") {
      return [
        ...LABELS.map((l) => ({ key: l, title: l, dot: "bg-gray-500", patch: { label: l } })),
        { key: "none", title: "No type", dot: "bg-gray-300", patch: { label: "" } },
      ];
    }
    if (groupBy === "customer") {
      // One column per customer that has a task on screen. Dropping a task
      // here tags it with that customer (a task on a job keeps its job's).
      const m = new Map();
      for (const t of visible) { const k = t.customerId || "none"; if (!m.has(k)) m.set(k, t.customerName || "No customer"); }
      return [...m.entries()]
        .sort((a, b) => (a[0] === "none") - (b[0] === "none") || a[1].localeCompare(b[1]))
        .map(([key, title]) => ({ key, title, dot: key === "none" ? "bg-gray-300" : "bg-violet-500", patch: { clientId: key === "none" ? "" : key } }));
    }
    return STATUSES.map((s) => ({ key: s.key, title: s.label, dot: STATUS_STYLE[s.key].dot, patch: { status: s.key } }));
  }, [groupBy, people, visible, who]);

  const tasksByGroup = useMemo(() => {
    const map = new Map(groups.map((g) => [g.key, []]));
    const keyOf = (t) => (groupBy === "assignee" ? t.assigneeId || "none" : groupBy === "priority" ? t.priority : groupBy === "customer" ? t.customerId || "none" : groupBy === "type" ? (LABELS.includes(t.label) ? t.label : "none") : t.status);
    for (const t of visible) map.get(keyOf(t))?.push(t);
    for (const [key, list] of map) {
      if (groupBy === "status" && key === "done") list.sort((a, b) => String(b.completedAt || "").localeCompare(String(a.completedAt || "")));
      else list.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return map;
  }, [groups, visible, groupBy]);

  // The list leaves out types that have no task (ten empty headings is noise);
  // the board keeps every column so a card can be dragged into it.
  const listGroups = groupBy === "type" ? groups.filter((g) => g.key === "none" || (tasksByGroup.get(g.key) || []).length) : groups;
  const openTasks = filtered.filter((t) => t.status !== "done");
  const lateCount = openTasks.filter((t) => dueInfo(t, today)?.late).length;
  const todayCount = openTasks.filter((t) => t.dueDate === today).length;
  const openCountBy = useMemo(() => {
    const m = {};
    for (const t of tasks) if (t.status !== "done") m[t.assigneeId || "none"] = (m[t.assigneeId || "none"] || 0) + 1;
    return m;
  }, [tasks]);
  // People shown as filter buttons: anyone holding a task, plus yourself.
  const chipPeople = people.filter((p) => openCountBy[p.id] || p.id === meId || who.includes(p.id));
  const toggleWho = (id) => setWho((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id]));
  const openTask = openId ? tasks.find((t) => t.id === openId) : null;

  async function submitDraft(e) {
    e.preventDefault();
    const title = draft.title.trim();
    if (!title || adding) return;
    setAdding(true);
    const body = { title };
    if (draft.assigneeId) body.assigneeId = draft.assigneeId;
    if (draft.dueDate) body.dueDate = draft.dueDate;
    if (draft.label) body.label = draft.label;
    const ok = await add(body);
    setAdding(false);
    if (ok) setDraft((d) => ({ ...d, title: "" }));
  }

  const field = "rounded-md border border-gray-200 bg-white px-2.5 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Tasks</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {openTasks.length} open
            {lateCount > 0 && <> · <span className="font-medium text-red-600 dark:text-red-400">{lateCount} late</span></>}
            {todayCount > 0 && <> · <span className="font-medium text-amber-700 dark:text-amber-300">{todayCount} due today</span></>}
          </p>
          {emails && (
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Email alerts to the assignee:{" "}
              {emails.canChange ? (
                <button type="button" onClick={toggleEmails} className={`font-medium underline-offset-2 hover:underline ${emails.emailsEnabled ? "text-green-700 dark:text-green-400" : "text-gray-700 dark:text-gray-200"}`}>
                  {emails.emailsEnabled ? "on" : "off"} (change)
                </button>
              ) : (
                <span className="font-medium">{emails.emailsEnabled ? "on" : "off"}</span>
              )}
              {emails.canChange && <> · <a href="/factoryos/tasks/email-preview" className="hover:underline">see the email</a></>}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
          {VIEWS.map((v) => (
            <button key={v.key} type="button" onClick={() => setView(v.key)} className={`rounded-md px-3 py-1.5 text-sm font-medium ${view === v.key ? "bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-white" : "text-gray-600 hover:text-gray-900 dark:text-gray-400"}`}>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={submitDraft} className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-gray-900">
        <input className={`${field} min-w-[200px] flex-1`} placeholder="New task: what needs doing?" value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
        <select aria-label="Who" className={field} value={draft.assigneeId} onChange={(e) => setDraft((d) => ({ ...d, assigneeId: e.target.value }))}>
          <option value="">Who?</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select aria-label="Type of task" className={field} value={draft.label} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}>
          <option value="">Type?</option>
          {LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <input aria-label="Due date" type="date" className={field} value={draft.dueDate} onChange={(e) => setDraft((d) => ({ ...d, dueDate: e.target.value }))} />
        <button type="submit" disabled={adding || !draft.title.trim()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {adding ? "Adding…" : "Add task"}
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button type="button" className={pill(who.length === 0)} onClick={() => setWho([])}>Everyone</button>
          {chipPeople.map((p) => (
            <button key={p.id} type="button" className={`${pill(who.includes(p.id))} inline-flex items-center gap-1.5`} onClick={() => toggleWho(p.id)}>
              <Avatar person={p} />
              {p.id === meId ? "Me" : p.name.split(" ")[0]}
              {openCountBy[p.id] ? <span className="opacity-60">{openCountBy[p.id]}</span> : null}
            </button>
          ))}
          {openCountBy.none ? (
            <button type="button" className={pill(who.includes("none"))} onClick={() => toggleWho("none")}>Nobody yet <span className="opacity-60">{openCountBy.none}</span></button>
          ) : null}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select aria-label="Customer" className={`max-w-[13rem] rounded-md border px-2 py-1.5 text-xs dark:bg-gray-900 dark:text-white ${customer ? "border-violet-400 bg-violet-50 font-medium text-violet-800 dark:border-violet-700" : "border-gray-200 bg-white dark:border-gray-700"}`} value={customer} onChange={(e) => setCustomer(e.target.value)}>
            <option value="">All customers</option>
            {customerOptions.map((c) => <option key={c.id} value={c.id}>{c.name}{c.open ? ` (${c.open})` : ""}</option>)}
          </select>
          <select aria-label="Brand" className={`max-w-[13rem] rounded-md border px-2 py-1.5 text-xs dark:bg-gray-900 dark:text-white ${brand ? "border-violet-400 bg-violet-50 font-medium text-violet-800 dark:border-violet-700" : "border-gray-200 bg-white dark:border-gray-700"}`} value={brand} onChange={(e) => setBrand(e.target.value)}>
            <option value="">All brands</option>
            {brandOptions.map((b) => <option key={b.id} value={b.id}>{b.name}{b.open ? ` (${b.open})` : ""}</option>)}
          </select>
          <select aria-label="Type of task" className={`max-w-[11rem] rounded-md border px-2 py-1.5 text-xs dark:bg-gray-900 dark:text-white ${type ? "border-violet-400 bg-violet-50 font-medium text-violet-800 dark:border-violet-700" : "border-gray-200 bg-white dark:border-gray-700"}`} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            {LABELS.map((l) => <option key={l} value={l}>{l}{openByType[l] ? ` (${openByType[l]})` : ""}</option>)}
            <option value="none">No type{openByType.none ? ` (${openByType.none})` : ""}</option>
          </select>
          {(customer || brand || type) && (
            <button type="button" onClick={() => { setCustomer(""); setBrand(""); setType(""); }} className="text-xs text-blue-700 hover:underline dark:text-blue-400">Clear</button>
          )}
          {view !== "calendar" && (
            <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
              Group by
              <select className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-white" value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
                {GROUPS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
              </select>
            </label>
          )}
          <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
            Show done
          </label>
          <input className="w-44 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-white" placeholder="Search tasks, J#, customer" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center dark:border-gray-700 dark:bg-gray-900">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100">No tasks yet.</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Type what needs doing in the box above, pick who and when, and press Enter.</p>
        </div>
      ) : view === "board" ? (
        <BoardView groups={groups} tasksByGroup={tasksByGroup} people={people} today={today} onOpen={open} onPatch={patch} onAdd={add} />
      ) : view === "list" ? (
        <ListView groups={listGroups} tasksByGroup={tasksByGroup} people={people} today={today} onOpen={open} onPatch={patch} onAdd={add} />
      ) : (
        <CalendarView tasks={visible} people={people} today={today} onOpen={open} onPatch={patch} onAdd={add} />
      )}

      {openTask && (
        <TaskPanel task={openTask} people={people} jobs={jobs} customers={customers} meId={meId} meName={meName} canDeleteAny={canDeleteAny} onPatch={patch} onDelete={remove} onClose={close} />
      )}
      {toast && (
        <div role="status" className="fixed bottom-20 left-1/2 z-50 flex w-max max-w-[92vw] -translate-x-1/2 items-center gap-3 md:bottom-4 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-white dark:text-gray-900">
          <span>{toast.msg}</span>
          {toast.action && (
            <a href={toast.action.href} target="_blank" rel="noopener noreferrer" onClick={() => setToast(null)} className="rounded-md bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700">
              {toast.action.label}
            </a>
          )}
          <button type="button" aria-label="Dismiss" onClick={() => setToast(null)} className="text-xs opacity-60 hover:opacity-100">✕</button>
        </div>
      )}
    </div>
  );
}
