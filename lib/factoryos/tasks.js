// Team task tracker (Arjun, 18-Nov-2026). Tables team_tasks and
// team_task_comments. Tasks are also pushed from Cowork chats with the SQL
// function add_task(...), so everything here reads plain rows and never
// assumes a task was created in the app.

import { dbSelect, dbInsert, dbUpdate, dbDelete } from "@/lib/db/supabase";
import { STATUSES, PRIORITIES, LABELS, RECURRENCES } from "@/lib/factoryos/taskOptions";
import { waitUntil } from "@vercel/functions";
import { drainTaskEmails, noteTaskEmailActor } from "@/lib/factoryos/taskEmails";

export { STATUSES, PRIORITIES, LABELS, RECURRENCES };

const STATUS_KEYS = new Set(STATUSES.map((s) => s.key));
const PRIORITY_KEYS = new Set(PRIORITIES.map((s) => s.key));
const RECURRENCE_KEYS = new Set(RECURRENCES.map((s) => s.key));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ROLE_LABEL = {
  admin: "Admin", factory_manager: "Factory", factory_executive: "Factory",
  account_manager: "Sales", warehouse: "Warehouse",
};

// A task's customer and brand come from its job when it has one; a task with
// no job can carry its own (team_tasks.client_id / brand).
const SELECT = "*,jobs(id,airtable_id,j_number,item,brand,stage,client_id,clients(name)),clients(id,name)";

function shape(r) {
  return {
    id: r.id,
    title: r.title,
    notes: r.notes || "",
    status: r.status,
    priority: r.priority,
    label: r.label || "",
    // Everyone the task is given to; assigneeId is the first of them.
    assigneeIds: Array.isArray(r.assignee_ids) && r.assignee_ids.length ? r.assignee_ids : (r.assignee_id ? [r.assignee_id] : []),
    assigneeId: (Array.isArray(r.assignee_ids) && r.assignee_ids[0]) || r.assignee_id || "",
    createdById: r.created_by_id || "",
    createdByName: r.created_by_name || "",
    source: r.source || "app",
    dueDate: r.due_date || "",
    job: r.jobs ? {
      id: r.jobs.airtable_id || r.jobs.id, jNumber: r.jobs.j_number, item: r.jobs.item || "",
      brand: r.jobs.brand || "", stage: r.jobs.stage || "", client: r.jobs.clients?.name || "",
    } : null,
    customerId: (r.jobs ? r.jobs.client_id : r.client_id) || "",
    customerName: (r.jobs ? r.jobs.clients?.name : r.clients?.name) || "",
    brand: (r.jobs ? r.jobs.brand : r.brand) || "",
    checklist: Array.isArray(r.checklist) ? r.checklist : [],
    recurrence: r.recurrence || "none",
    sortOrder: Number(r.sort_order) || 0,
    commentCount: r.comment_count || 0,
    completedAt: r.completed_at || null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// Staff who can hold a task: every active internal FactoryOS user.
export async function listTaskPeople() {
  const rows = await dbSelect("users", {
    select: "id,name,email,phone,factoryos_role,active",
    filter: { factoryos_role: "in.(admin,factory_manager,factory_executive,account_manager,warehouse)" },
    order: "name.asc",
    limit: 200,
  });
  return rows.filter((u) => u.active !== false).map((u) => ({
    id: u.id,
    name: u.name || u.email,
    email: u.email || "",
    role: ROLE_LABEL[u.factoryos_role] || "",
    wa: waNumber(u.phone),
  }));
}

// A saved phone number as WhatsApp wants it: digits only, with country code.
// Indian 10-digit numbers get 91. Anything that doesn't look like a phone
// number gives "" (the button then lets the sender pick the contact).
function waNumber(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = `91${d}`;
  return d.length >= 11 && d.length <= 15 ? d : "";
}

// The users row behind a session. Password-admin sessions have no email and
// resolve to null (they act as "Admin").
const idCache = new Map();
export async function sessionUser(session) {
  if (!session) return null;
  const key = (session.email || session.factoryosUserId || "").toLowerCase();
  if (!key) return null;
  if (idCache.has(key)) return idCache.get(key);
  let rows = [];
  if (session.email) rows = await dbSelect("users", { select: "id,name,email", filter: { email: `eq.${session.email.toLowerCase()}` }, limit: 1 }).catch(() => []);
  if (!rows.length && session.factoryosUserId) {
    const col = UUID.test(session.factoryosUserId) ? "id" : "airtable_id";
    rows = await dbSelect("users", { select: "id,name,email", filter: { [col]: `eq.${session.factoryosUserId}` }, limit: 1 }).catch(() => []);
  }
  const user = rows[0] ? { id: rows[0].id, name: rows[0].name || rows[0].email, email: rows[0].email } : null;
  if (user) idCache.set(key, user);
  return user;
}

export function actorName(session, user) {
  return user?.name || session?.name || (session?.isAdmin ? "Admin" : session?.email || "Someone");
}

// Open tasks plus anything finished in the last 30 days.
export async function listTasks() {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [open, done] = await Promise.all([
    dbSelect("team_tasks", { select: SELECT, filter: { status: "neq.done" }, order: "sort_order.asc", limit: 1000 }),
    dbSelect("team_tasks", { select: SELECT, filter: { status: "eq.done", completed_at: `gte.${since}` }, order: "completed_at.desc", limit: 300 }),
  ]);
  return [...open, ...done].map(shape);
}

// Every task tied to one job (open and done), for the job page.
export async function listTasksForJob(jNumber) {
  const job = await resolveJob(jNumber);
  if (!job.id) return [];
  const rows = await dbSelect("team_tasks", { select: SELECT, filter: { job_id: `eq.${job.id}` }, order: "sort_order.asc", limit: 300 });
  return rows.map(shape);
}

// Open jobs for the "link to a job" picker on a task.
export async function listJobsForTaskPicker() {
  const rows = await dbSelect("jobs", {
    select: "j_number,item,brand,stage,client_id,clients(name)",
    filter: { stage: "not.in.(Dispatched,Delivered)" },
    order: "j_number.desc",
    limit: 500,
  });
  return rows.map((j) => ({ jNumber: j.j_number, item: j.item || "", brand: j.brand || "", stage: j.stage || "", client: j.clients?.name || "", clientId: j.client_id || "" }));
}

// Customers a task can be tagged with (when it has no job to take one from).
export async function listTaskCustomers() {
  const rows = await dbSelect("clients", { select: "id,name", order: "name.asc", limit: 2000 });
  return rows.filter((c) => c.name).map((c) => ({ id: c.id, name: c.name }));
}

export async function getTask(id) {
  if (!UUID.test(String(id))) return null;
  const rows = await dbSelect("team_tasks", { select: SELECT, filter: { id: `eq.${id}` }, limit: 1 });
  return rows[0] ? shape(rows[0]) : null;
}

export async function listTaskComments(taskId) {
  const rows = await dbSelect("team_task_comments", {
    select: "id,kind,author_id,author_name,body,created_at",
    filter: { task_id: `eq.${taskId}` },
    order: "created_at.asc",
    limit: 500,
  });
  return rows.map((c) => ({ id: c.id, kind: c.kind, authorId: c.author_id || "", authorName: c.author_name || "", body: c.body, createdAt: c.created_at }));
}

export async function myOpenTaskCount(session) {
  try {
    const user = await sessionUser(session);
    if (!user) return 0;
    const rows = await dbSelect("team_tasks", { select: "id", filter: { assignee_ids: `cs.{${user.id}}`, status: "neq.done" }, limit: 200 });
    return rows.length;
  } catch (e) {
    console.error("myOpenTaskCount failed:", e?.message || e);
    return 0;
  }
}

async function logActivity(taskId, who, body) {
  await dbInsert("team_task_comments", { task_id: taskId, kind: "activity", author_id: who.id || null, author_name: who.name, body }, { returning: "minimal" })
    .catch((e) => console.error("task activity log failed:", e?.message || e));
}

function cleanChecklist(v) {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 100).map((it, i) => ({
    id: String(it?.id || `c${Date.now()}${i}`).slice(0, 40),
    text: String(it?.text || "").slice(0, 300),
    done: !!it?.done,
  })).filter((it) => it.text.trim());
}

async function resolveJob(jNumber) {
  const j = String(jNumber || "").trim().replace(/^J#?\s*/i, "");
  if (!j) return { id: null };
  const rows = await dbSelect("jobs", { select: "id,j_number", filter: { j_number: `eq.${j}` }, limit: 1 });
  if (!rows[0]) return { error: `No job with J# ${j}` };
  return { id: rows[0].id, jNumber: rows[0].j_number };
}

// Turns a client patch into DB columns. Returns { cols } or { error }.
async function toColumns(body, people) {
  const cols = {};
  if (body.title !== undefined) {
    const t = String(body.title || "").trim();
    if (!t) return { error: "A task needs a title." };
    cols.title = t.slice(0, 300);
  }
  if (body.notes !== undefined) cols.notes = String(body.notes || "").slice(0, 20000);
  if (body.status !== undefined) {
    if (!STATUS_KEYS.has(body.status)) return { error: "Unknown status" };
    cols.status = body.status;
  }
  if (body.priority !== undefined) {
    if (!PRIORITY_KEYS.has(body.priority)) return { error: "Unknown priority" };
    cols.priority = body.priority;
  }
  if (body.recurrence !== undefined) {
    if (!RECURRENCE_KEYS.has(body.recurrence)) return { error: "Unknown repeat setting" };
    cols.recurrence = body.recurrence;
  }
  if (body.label !== undefined) cols.label = LABELS.includes(body.label) ? body.label : null;
  // A task can be given to several people (assigneeIds). assigneeId is the
  // one-person form (the add bar, dragging to a person's column): it replaces
  // the list. The database keeps assignee_id as the first of assignee_ids.
  if (body.assigneeIds !== undefined || body.assigneeId !== undefined) {
    const raw = body.assigneeIds !== undefined ? (Array.isArray(body.assigneeIds) ? body.assigneeIds : []) : [body.assigneeId];
    const ids = [...new Set(raw.filter(Boolean).map(String))].slice(0, 8);
    if (ids.some((id) => !people.some((p) => p.id === id))) return { error: "That person can't be given tasks." };
    cols.assignee_ids = ids;
  }
  if (body.dueDate !== undefined) {
    if (body.dueDate && !DATE.test(String(body.dueDate))) return { error: "Due date isn't a valid date" };
    cols.due_date = body.dueDate || null;
  }
  if (body.checklist !== undefined) cols.checklist = cleanChecklist(body.checklist);
  if (body.sortOrder !== undefined && Number.isFinite(Number(body.sortOrder))) cols.sort_order = Number(body.sortOrder);
  if (body.jNumber !== undefined) {
    const job = await resolveJob(body.jNumber);
    if (job.error) return { error: job.error };
    cols.job_id = job.id;
  }
  if (body.clientId !== undefined) {
    if (body.clientId) {
      if (!UUID.test(String(body.clientId))) return { error: "Unknown customer" };
      const hit = await dbSelect("clients", { select: "id", filter: { id: `eq.${body.clientId}` }, limit: 1 }).catch(() => []);
      if (!hit[0]) return { error: "Unknown customer" };
    }
    cols.client_id = body.clientId || null;
  }
  if (body.brand !== undefined) cols.brand = String(body.brand || "").trim().slice(0, 120) || null;
  return { cols };
}

// Send any waiting "task given to you" emails without holding up the reply.
// The database trigger also nudges the web app, so a miss here is picked up.
function sendTaskEmailsSoon() {
  const run = drainTaskEmails({ getTask }).catch((e) => console.error("task emails failed:", e?.message || e));
  try { waitUntil(run); } catch { /* not on Vercel (local run): the promise still completes */ }
}

// For the hook and the settings screen.
export function drainTaskEmailsNow() {
  return drainTaskEmails({ getTask });
}

export async function createTask(body, session) {
  const [people, user] = await Promise.all([listTaskPeople(), sessionUser(session)]);
  const { cols, error } = await toColumns(body, people);
  if (error) return { error };
  if (!cols.title) return { error: "A task needs a title." };
  const who = { id: user?.id || null, name: actorName(session, user) };
  const row = await dbInsert("team_tasks", { ...cols, created_by_id: who.id, created_by_name: who.name, source: "app" });
  await logActivity(row.id, who, "created this task");
  if ((row.assignee_ids || []).length || row.assignee_id) sendTaskEmailsSoon();
  return { task: await getTask(row.id) };
}

function nextDue(from, recurrence) {
  const d = new Date(`${from}T00:00:00Z`);
  if (recurrence === "daily") d.setUTCDate(d.getUTCDate() + 1);
  else if (recurrence === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else if (recurrence === "monthly") d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}
const todayIST = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const fmt = (d) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" }) : "no date");

export async function updateTask(id, body, session) {
  const before = await getTask(id);
  if (!before) return { error: "Task not found", status: 404 };
  const [people, user] = await Promise.all([listTaskPeople(), sessionUser(session)]);
  const { cols, error } = await toColumns(body, people);
  if (error) return { error };
  if (!Object.keys(cols).length) return { task: before };
  await dbUpdate("team_tasks", "id", id, cols, { returning: "minimal" });

  const who = { id: user?.id || null, name: actorName(session, user) };
  const name = (pid) => people.find((p) => p.id === pid)?.name || "nobody";
  const label = (k) => STATUSES.find((s) => s.key === k)?.label || k;
  const notes = [];
  if (cols.status !== undefined && cols.status !== before.status) notes.push(`moved this to ${label(cols.status)}`);
  const added = cols.assignee_ids ? cols.assignee_ids.filter((x) => !before.assigneeIds.includes(x)) : [];
  const removed = cols.assignee_ids ? before.assigneeIds.filter((x) => !cols.assignee_ids.includes(x)) : [];
  const names = (ids) => ids.map(name).join(" and ");
  if (added.length) notes.push(`gave this to ${names(added)}`);
  if (removed.length) notes.push(cols.assignee_ids.length ? `took ${names(removed)} off this task` : "removed the assignee");
  if (cols.due_date !== undefined && (cols.due_date || "") !== before.dueDate) notes.push(`changed the due date ${fmt(before.dueDate)} → ${fmt(cols.due_date)}`);
  if (cols.priority !== undefined && cols.priority !== before.priority) notes.push(`set priority to ${cols.priority}`);
  if (cols.title !== undefined && cols.title !== before.title) notes.push(`renamed this from "${before.title.slice(0, 80)}"`);
  for (const n of notes) await logActivity(id, who, n);
  if (added.length) {
    await noteTaskEmailActor(id, who);
    sendTaskEmailsSoon();
  }

  // A repeating task that is finished makes its next one.
  let spawned = null;
  const recurrence = cols.recurrence ?? before.recurrence;
  if (cols.status === "done" && before.status !== "done" && recurrence !== "none") {
    const base = before.dueDate && before.dueDate > todayIST() ? before.dueDate : todayIST();
    const row = await dbInsert("team_tasks", {
      title: cols.title ?? before.title,
      notes: cols.notes ?? before.notes,
      priority: cols.priority ?? before.priority,
      label: (cols.label !== undefined ? cols.label : before.label) || null,
      assignee_ids: cols.assignee_ids ?? before.assigneeIds,
      created_by_id: before.createdById || null,
      created_by_name: before.createdByName,
      source: before.source,
      due_date: nextDue(base, recurrence),
      job_id: null,
      checklist: (cols.checklist ?? before.checklist).map((c) => ({ ...c, done: false })),
      recurrence,
    });
    await logActivity(row.id, who, "repeats from the task finished just now");
    spawned = await getTask(row.id);
  }
  return { task: await getTask(id), spawned };
}

export async function deleteTask(id) {
  await dbDelete("team_tasks", "id", id);
}

export async function addTaskComment(taskId, text, session) {
  const body = String(text || "").trim();
  if (!body) return { error: "Write a comment first." };
  const task = await getTask(taskId);
  if (!task) return { error: "Task not found", status: 404 };
  const user = await sessionUser(session);
  const row = await dbInsert("team_task_comments", {
    task_id: taskId, kind: "comment", author_id: user?.id || null, author_name: actorName(session, user), body: body.slice(0, 4000),
  });
  await dbUpdate("team_tasks", "id", taskId, { comment_count: task.commentCount + 1 }, { returning: "minimal" }).catch(() => {});
  return { comment: { id: row.id, kind: "comment", authorId: row.author_id || "", authorName: row.author_name, body: row.body, createdAt: row.created_at } };
}
