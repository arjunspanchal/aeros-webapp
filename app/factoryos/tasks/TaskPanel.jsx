"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { STATUSES, PRIORITIES, LABELS, RECURRENCES } from "@/lib/factoryos/taskOptions";
import { STATUS_STYLE, Avatar, WhatsAppButton, ymd, addDays, timeAgo, dueInfo } from "./taskUi";

const fieldCls = "w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white";

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-[92px_1fr] items-center gap-2">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// Side panel for one task: every field saves as soon as you leave it.
export default function TaskPanel({ task, people, jobs = [], customers = [], meId, meName, canDeleteAny, onPatch, onDelete, onClose }) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const [items, setItems] = useState(task.checklist);
  const [newItem, setNewItem] = useState("");
  const [comments, setComments] = useState(null);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [jobQuery, setJobQuery] = useState("");
  const [jobOpen, setJobOpen] = useState(false);
  const titleRef = useRef(null);

  // Reset drafts when a different task opens.
  useEffect(() => {
    setTitle(task.title); setNotes(task.notes); setItems(task.checklist); setNewItem(""); setComment(""); setJobOpen(false); setJobQuery("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);
  useEffect(() => { setItems(task.checklist); }, [task.checklist]);

  async function loadComments() {
    const res = await fetch(`/api/factoryos/tasks/${task.id}`);
    if (!res.ok) { setComments([]); return; }
    const data = await res.json();
    setComments(data.comments || []);
  }
  useEffect(() => { setComments(null); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [task.id]);
  useEffect(() => { loadComments(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [task.id, task.updatedAt]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const el = titleRef.current;
    if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; }
  }, [title]);

  const saveItems = (next) => { setItems(next); onPatch(task.id, { checklist: next }); };
  const doneCount = items.filter((c) => c.done).length;
  const today = ymd();
  const due = dueInfo(task, today);
  const canDelete = canDeleteAny || (meId && task.createdById === meId);
  const assignees = (task.assigneeIds || []).map((id) => people.find((p) => p.id === id)).filter(Boolean);
  // Brands to suggest: those on this customer's jobs, else every brand on a job.
  const brandChoices = useMemo(() => {
    const mine = jobs.filter((j) => j.brand && (!task.customerId || j.clientId === task.customerId)).map((j) => j.brand);
    const all = jobs.filter((j) => j.brand).map((j) => j.brand);
    return [...new Set(mine.length ? mine : all)].sort((a, b) => a.localeCompare(b));
  }, [jobs, task.customerId]);

  const jobMatches = useMemo(() => {
    const q = jobQuery.trim().toLowerCase();
    const list = q ? jobs.filter((j) => `${j.jNumber} ${j.client} ${j.brand} ${j.item}`.toLowerCase().includes(q)) : jobs;
    return list.slice(0, 30);
  }, [jobs, jobQuery]);

  async function sendComment() {
    const body = comment.trim();
    if (!body || sending) return;
    setSending(true);
    const res = await fetch(`/api/factoryos/tasks/${task.id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
    setSending(false);
    if (!res.ok) return;
    const data = await res.json();
    setComments((c) => [...(c || []), data.comment]);
    setComment("");
    onPatch(task.id, {}, { commentCount: task.commentCount + 1 });
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} aria-hidden />
      <aside className="relative flex h-full w-full flex-col bg-white shadow-xl sm:max-w-[500px] dark:bg-gray-900" role="dialog" aria-label="Task details">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5 dark:border-gray-800">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Added by {task.createdByName || "someone"}{task.source === "cowork" ? " from a chat" : ""} · {timeAgo(task.createdAt)}
          </div>
          <div className="flex items-center gap-3">
            {canDelete && (
              <button type="button" onClick={() => { if (window.confirm("Delete this task? It can't be brought back.")) onDelete(task.id); }} className="text-xs text-red-600 hover:underline dark:text-red-400">
                Delete
              </button>
            )}
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-md px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">✕</button>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <textarea
            ref={titleRef}
            rows={1}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => { const t = title.trim(); if (!t) setTitle(task.title); else if (t !== task.title) onPatch(task.id, { title: t }); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
            className={`w-full resize-none bg-transparent text-xl font-semibold outline-none ${task.status === "done" ? "text-gray-400 line-through" : "text-gray-900 dark:text-white"}`}
          />

          <div className="space-y-2.5">
            <Row label="Status">
              <div className="flex flex-wrap gap-1.5">
                {STATUSES.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => onPatch(task.id, { status: s.key })}
                    className={`rounded-md px-2 py-1 text-xs font-medium ${task.status === s.key ? STATUS_STYLE[s.key].chip + " ring-1 ring-inset ring-current" : "bg-gray-50 text-gray-500 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-400"}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </Row>
            <Row label="Who">
              <div className="space-y-1.5">
                {assignees.map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <Avatar person={p} />
                    <span className="min-w-0 flex-1 truncate text-sm text-gray-900 dark:text-white">{p.name}{p.role ? <span className="text-gray-400"> · {p.role}</span> : null}</span>
                    {task.status !== "done" && <WhatsAppButton task={task} person={p} fromName={meName} compact />}
                    <button type="button" aria-label={`Take ${p.name} off this task`} title={`Take ${p.name} off this task`} onClick={() => onPatch(task.id, { assigneeIds: task.assigneeIds.filter((x) => x !== p.id) })} className="shrink-0 rounded px-1.5 py-0.5 text-xs text-gray-400 hover:bg-gray-100 hover:text-red-600 dark:hover:bg-gray-800">✕</button>
                  </div>
                ))}
                <select
                  aria-label="Add a person"
                  className={fieldCls}
                  value=""
                  onChange={(e) => { if (e.target.value) onPatch(task.id, { assigneeIds: [...task.assigneeIds, e.target.value] }); }}
                >
                  <option value="">{assignees.length ? "+ Add another person" : "Nobody yet: pick a person"}</option>
                  {people.filter((p) => !task.assigneeIds.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}{p.role ? ` (${p.role})` : ""}</option>)}
                </select>
                {assignees.some((p) => !p.wa) && task.status !== "done" && (
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">No number saved for {assignees.filter((p) => !p.wa).map((p) => p.name.split(" ")[0]).join(", ")}; WhatsApp will ask who to send to.</p>
                )}
              </div>
            </Row>
            <Row label="Due">
              <div className="flex flex-wrap items-center gap-1.5">
                <input type="date" className={`${fieldCls} w-auto`} value={task.dueDate} onChange={(e) => onPatch(task.id, { dueDate: e.target.value })} />
                <button type="button" onClick={() => onPatch(task.id, { dueDate: today })} className="rounded px-1.5 py-1 text-xs text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30">Today</button>
                <button type="button" onClick={() => onPatch(task.id, { dueDate: addDays(today, 1) })} className="rounded px-1.5 py-1 text-xs text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30">Tomorrow</button>
                {task.dueDate && <button type="button" onClick={() => onPatch(task.id, { dueDate: "" })} className="rounded px-1.5 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">Clear</button>}
                {due?.late && <span className="text-xs font-medium text-red-600 dark:text-red-400">late</span>}
              </div>
            </Row>
            <Row label="Priority">
              <select className={fieldCls} value={task.priority} onChange={(e) => onPatch(task.id, { priority: e.target.value })}>
                {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </Row>
            <Row label="Job">
              {task.job ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-gray-200 px-2 py-1.5 dark:border-gray-700">
                  <Link href={`/factoryos/manager/${task.job.id}`} className="min-w-0 text-sm text-blue-700 hover:underline dark:text-blue-400">
                    <span className="font-mono">J# {task.job.jNumber}</span>
                    <span className="block truncate text-xs text-gray-600 dark:text-gray-300">{[task.job.client, task.job.item].filter(Boolean).join(" · ")}{task.job.stage ? ` · ${task.job.stage}` : ""}</span>
                  </Link>
                  <button type="button" onClick={() => onPatch(task.id, { jNumber: "" })} className="shrink-0 text-xs text-gray-500 hover:text-red-600">Remove</button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    className={fieldCls}
                    value={jobQuery}
                    placeholder="Link a job: type J#, customer or item"
                    onFocus={() => setJobOpen(true)}
                    onChange={(e) => { setJobQuery(e.target.value); setJobOpen(true); }}
                    onBlur={() => setTimeout(() => setJobOpen(false), 150)}
                  />
                  {jobOpen && (
                    <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
                      {jobMatches.length === 0 && <li className="px-2 py-2 text-xs text-gray-500">No open job matches.</li>}
                      {jobMatches.map((j) => (
                        <li key={j.jNumber}>
                          <button
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); onPatch(task.id, { jNumber: j.jNumber }); setJobOpen(false); setJobQuery(""); }}
                            className="block w-full px-2 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
                          >
                            <span className="font-mono text-xs text-gray-900 dark:text-white">J# {j.jNumber}</span>
                            <span className="ml-2 text-xs text-gray-600 dark:text-gray-300">{[j.client, j.item].filter(Boolean).join(" · ")}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </Row>
            <Row label="Customer">
              {task.job ? (
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  {[task.customerName, task.brand].filter(Boolean).join(" · ") || "—"}
                  <span className="ml-1 text-xs text-gray-400">(from the job)</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  <select aria-label="Customer" className={fieldCls} value={task.customerId} onChange={(e) => onPatch(task.id, { clientId: e.target.value })}>
                    <option value="">No customer</option>
                    {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <input
                    aria-label="Brand"
                    className={fieldCls}
                    list={`brands-${task.id}`}
                    defaultValue={task.brand}
                    key={`${task.id}-${task.brand}`}
                    placeholder="Brand (optional)"
                    onBlur={(e) => { const v = e.target.value.trim(); if (v !== (task.brand || "")) onPatch(task.id, { brand: v }); }}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                  />
                  <datalist id={`brands-${task.id}`}>
                    {brandChoices.map((b) => <option key={b} value={b} />)}
                  </datalist>
                </div>
              )}
            </Row>
            <Row label="Type">
              <select className={fieldCls} value={task.label} onChange={(e) => onPatch(task.id, { label: e.target.value })}>
                <option value="">None</option>
                {LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </Row>
            <Row label="Repeat">
              <select className={fieldCls} value={task.recurrence} onChange={(e) => onPatch(task.id, { recurrence: e.target.value })}>
                {RECURRENCES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </Row>
          </div>

          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Notes</div>
            <textarea
              rows={4}
              value={notes}
              placeholder="Details, measurements, phone numbers, anything the person needs…"
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => { if (notes !== task.notes) onPatch(task.id, { notes }); }}
              className={`${fieldCls} leading-relaxed`}
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Checklist</div>
              {items.length > 0 && <div className="text-xs text-gray-500 dark:text-gray-400">{doneCount} of {items.length} done</div>}
            </div>
            {items.length > 0 && (
              <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                <div className="h-full bg-green-500 transition-all" style={{ width: `${(doneCount / items.length) * 100}%` }} />
              </div>
            )}
            <ul className="space-y-1">
              {items.map((it) => (
                <li key={it.id} className="group flex items-center gap-2">
                  <input type="checkbox" checked={it.done} onChange={() => saveItems(items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)))} className="h-4 w-4 rounded border-gray-300" />
                  <input
                    defaultValue={it.text}
                    onBlur={(e) => { const t = e.target.value.trim(); if (!t) saveItems(items.filter((x) => x.id !== it.id)); else if (t !== it.text) saveItems(items.map((x) => (x.id === it.id ? { ...x, text: t } : x))); }}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                    className={`flex-1 bg-transparent py-0.5 text-sm outline-none ${it.done ? "text-gray-400 line-through" : "text-gray-900 dark:text-white"}`}
                  />
                  <button type="button" aria-label="Remove step" onClick={() => saveItems(items.filter((x) => x.id !== it.id))} className="text-xs text-gray-300 hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100">✕</button>
                </li>
              ))}
            </ul>
            <input
              value={newItem}
              placeholder="+ Add a step, then Enter"
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                const t = newItem.trim();
                if (!t) return;
                saveItems([...items, { id: `c${Date.now()}`, text: t, done: false }]);
                setNewItem("");
              }}
              className="mt-1 w-full bg-transparent py-1 text-sm text-gray-700 outline-none placeholder:text-gray-400 dark:text-gray-200"
            />
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Comments and history</div>
            {comments === null && <p className="text-xs text-gray-400">Loading…</p>}
            <ul className="space-y-2.5">
              {(comments || []).map((c) => (
                c.kind === "activity" ? (
                  <li key={c.id} className="text-xs text-gray-500 dark:text-gray-400">
                    <span className="font-medium text-gray-700 dark:text-gray-300">{c.authorName}</span> {c.body} · {timeAgo(c.createdAt)}
                  </li>
                ) : (
                  <li key={c.id} className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800">
                    <div className="text-xs text-gray-500 dark:text-gray-400"><span className="font-medium text-gray-800 dark:text-gray-200">{c.authorName}</span> · {timeAgo(c.createdAt)}</div>
                    <div className="mt-0.5 whitespace-pre-wrap text-sm text-gray-900 dark:text-white">{c.body}</div>
                  </li>
                )
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-100 px-4 py-3 dark:border-gray-800">
          <div className="flex items-end gap-2">
            <textarea
              rows={1}
              value={comment}
              placeholder="Write a comment…"
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendComment(); } }}
              className={`${fieldCls} resize-none`}
            />
            <button type="button" disabled={sending || !comment.trim()} onClick={sendComment} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              Send
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
