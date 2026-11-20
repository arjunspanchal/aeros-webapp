// Email to the person a task is given to (Arjun, 19-Nov-2026: "The email
// should go to the person to which the task is directed"), sent from
// factory@aeros-x.com through Resend (the same service as the sign-in codes).
//
// How it flows: a database trigger on team_tasks adds a row to
// team_task_emails whenever a task gets, or changes, its assignee. That covers
// tasks made in FactoryOS and tasks pushed by SQL from a chat (add_task). The
// trigger then nudges /api/hooks/task-emails, which calls drainTaskEmails().
// FactoryOS also calls it straight after saving, so the email leaves at once.
//
// Nothing is sent unless team_task_settings.emails.enabled is true.

import { dbSelect, dbUpdate, dbInsert, getSupabaseUrl } from "@/lib/db/supabase";
import { PRIORITIES } from "@/lib/factoryos/taskOptions";

const FROM = process.env.TASK_FROM_EMAIL || "Aeros FactoryOS <factory@aeros-x.com>";
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://webapp.aeros-x.com";
// A reply goes to the person who gave the task only when their address is a
// company one; a personal address is never put on an email.
const COMPANY_DOMAINS = ["aeros-x.com", "theepackagingcompany.com"];
// A queued email older than this is dropped, never sent late.
const STALE_MINUTES = 60;

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "";
// "Arjun (Cowork)" → "Arjun"
const cleanActor = (name) => String(name || "").replace(/\s*\(.*?\)\s*/g, " ").trim();
const longDate = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export async function getTaskEmailSettings() {
  const rows = await dbSelect("team_task_settings", { select: "key,value", filter: { key: "in.(emails,hook)" } }).catch(() => []);
  const by = Object.fromEntries(rows.map((r) => [r.key, r.value || {}]));
  return {
    enabled: by.emails?.enabled === true,
    testTo: typeof by.emails?.test_to === "string" && by.emails.test_to.includes("@") ? by.emails.test_to : "",
    hookSecret: by.hook?.secret || "",
  };
}

export async function setTaskEmailsEnabled(enabled) {
  const cur = (await dbSelect("team_task_settings", { select: "value", filter: { key: "eq.emails" }, limit: 1 }).catch(() => []))[0]?.value || {};
  await dbInsert("team_task_settings", { key: "emails", value: { ...cur, enabled: !!enabled }, updated_at: new Date().toISOString() }, { onConflict: "key", returning: "minimal" });
  return !!enabled;
}

// The email itself. `task` is the shape from lib/factoryos/tasks.js.
export function buildTaskEmail({ task, assigneeName, actorName, reason = "assigned", alsoWith = [] }) {
  const hi = firstName(assigneeName);
  const actor = cleanActor(actorName);
  const url = `${SITE}/factoryos/tasks?task=${task.id}`;
  const priority = PRIORITIES.find((p) => p.key === task.priority)?.label || "";
  const intro = actor
    ? `${actor} ${reason === "reassigned" ? "passed a task to you" : "gave you a task"} on FactoryOS.`
    : `You have a ${reason === "reassigned" ? "task passed to you" : "new task"} on FactoryOS.`;
  const rows = [];
  if (alsoWith.length) rows.push(["With", alsoWith.join(", ")]);
  if (task.dueDate) rows.push(["Due", longDate(task.dueDate)]);
  if (task.priority === "urgent" || task.priority === "high") rows.push(["Priority", priority]);
  if (task.job) rows.push(["Job", `J# ${task.job.jNumber}${task.job.brand ? ` · ${task.job.brand}` : ""}${task.job.item ? ` · ${task.job.item}` : ""}`]);
  if (!task.job && (task.customerName || task.brand)) rows.push(["Customer", [task.customerName, task.brand].filter(Boolean).join(" · ")]);
  if (task.label) rows.push(["Type", task.label]);
  const steps = (task.checklist || []).filter((c) => c.text);
  const notes = String(task.notes || "").trim();
  const shortNotes = notes.length > 900 ? `${notes.slice(0, 900)}…` : notes;

  const subject = `${task.priority === "urgent" ? "Urgent task" : "New task"}: ${task.title}${task.dueDate ? ` (due ${new Date(`${task.dueDate}T12:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" })})` : ""}`;

  const text = [
    hi ? `Hi ${hi},` : "Hi,",
    "",
    intro,
    "",
    task.title,
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ...(shortNotes ? ["", "Notes:", shortNotes] : []),
    ...(steps.length ? ["", "Steps:", ...steps.map((s) => `- ${s.text}`)] : []),
    "",
    `Open the task: ${url}`,
    "",
    "Mark it done in FactoryOS when it is finished.",
    "Aeros FactoryOS",
  ].join("\n");

  const cell = "padding:6px 0;font-size:14px;line-height:20px;vertical-align:top;";
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f4f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#111111;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e5e2;border-radius:12px;">
<tr><td style="padding:22px 24px 6px 24px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#6b6b68;">Aeros FactoryOS · ${reason === "reassigned" ? "Task passed to you" : "New task"}</td></tr>
<tr><td style="padding:0 24px;font-size:15px;line-height:22px;color:#333333;">${hi ? `Hi ${esc(hi)},` : "Hi,"}<br>${esc(intro)}</td></tr>
<tr><td style="padding:16px 24px 4px 24px;font-size:20px;line-height:27px;font-weight:700;color:#111111;">${esc(task.title)}</td></tr>
${rows.length ? `<tr><td style="padding:6px 24px 0 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eeeeeb;">
${rows.map(([k, v]) => `<tr><td width="84" style="${cell}color:#6b6b68;">${esc(k)}</td><td style="${cell}color:#111111;${k === "Priority" ? "font-weight:700;" : ""}">${esc(v)}</td></tr>`).join("\n")}
</table></td></tr>` : ""}
${shortNotes ? `<tr><td style="padding:12px 24px 0 24px;"><div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#6b6b68;padding-bottom:4px;">Notes</div><div style="font-size:14px;line-height:21px;color:#333333;white-space:pre-wrap;">${esc(shortNotes)}</div></td></tr>` : ""}
${steps.length ? `<tr><td style="padding:12px 24px 0 24px;"><div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#6b6b68;padding-bottom:4px;">Steps</div>${steps.map((s) => `<div style="font-size:14px;line-height:21px;color:#333333;">&#9744; ${esc(s.text)}</div>`).join("")}</td></tr>` : ""}
<tr><td style="padding:22px 24px 8px 24px;"><a href="${esc(url)}" style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:8px;">Open the task</a></td></tr>
<tr><td style="padding:6px 24px 22px 24px;font-size:12px;line-height:18px;color:#8a8a86;">Mark it done in FactoryOS when it is finished. This email was sent to you because the task is in your name.</td></tr>
</table>
</td></tr></table>
</body></html>`;
  return { subject, text, html };
}

async function logOnTask(taskId, body) {
  await dbInsert("team_task_comments", { task_id: taskId, kind: "activity", author_name: "FactoryOS", body }, { returning: "minimal" })
    .catch((e) => console.error("task email log failed:", e?.message || e));
}

async function finish(id, patch) {
  await dbUpdate("team_task_emails", "id", id, patch, { returning: "minimal" }).catch((e) => console.error("task email finish failed:", e?.message || e));
}

// Claim one queued row so two callers can never both send it.
async function claim(id) {
  const url = new URL(`${getSupabaseUrl()}/rest/v1/team_task_emails`);
  url.searchParams.set("id", `eq.${id}`);
  url.searchParams.set("status", "eq.pending");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ status: "sending" }),
    cache: "no-store",
  });
  if (!res.ok) return false;
  const rows = await res.json().catch(() => []);
  return rows.length === 1;
}

// Send everything that is waiting. Safe to call as often as you like.
// getTask is passed in to avoid a circular import with tasks.js.
export async function drainTaskEmails({ getTask, limit = 25 } = {}) {
  const out = { sent: 0, skipped: 0, failed: 0 };
  const pending = await dbSelect("team_task_emails", {
    select: "id,task_id,assignee_id,reason,actor_id,actor_name,created_at",
    filter: { status: "eq.pending" },
    order: "created_at.asc",
    limit,
  }).catch(() => []);
  if (!pending.length) return out;
  const settings = await getTaskEmailSettings();

  for (const row of pending) {
    if (!(await claim(row.id))) continue;
    const skip = async (detail) => { out.skipped += 1; await finish(row.id, { status: "skipped", detail }); };
    try {
      if (!settings.enabled) { await skip("email alerts are switched off"); continue; }
      if (Date.now() - new Date(row.created_at).getTime() > STALE_MINUTES * 60_000) { await skip("too old to send"); continue; }
      if (row.actor_id && row.actor_id === row.assignee_id) { await skip("assigned to themselves"); continue; }
      const task = await getTask(row.task_id);
      if (!task) { await skip("task no longer exists"); continue; }
      if (task.status === "done") { await skip("task already done"); continue; }
      if (!(task.assigneeIds || []).includes(row.assignee_id)) { await skip("task has moved to someone else"); continue; }
      const person = (await dbSelect("users", { select: "id,name,email,active", filter: { id: `eq.${row.assignee_id}` }, limit: 1 }))[0];
      if (!person || person.active === false || !person.email) { await skip("no active email address for this person"); continue; }

      let replyTo;
      if (row.actor_id) {
        const actor = (await dbSelect("users", { select: "email", filter: { id: `eq.${row.actor_id}` }, limit: 1 }).catch(() => []))[0];
        const domain = String(actor?.email || "").split("@")[1]?.toLowerCase();
        if (domain && COMPANY_DOMAINS.includes(domain)) replyTo = actor.email;
      }
      // Who else is on the task, so each person knows it is shared.
      const otherIds = (task.assigneeIds || []).filter((x) => x !== row.assignee_id);
      const others = otherIds.length
        ? (await dbSelect("users", { select: "name", filter: { id: `in.(${otherIds.join(",")})` } }).catch(() => [])).map((u) => u.name).filter(Boolean)
        : [];
      const mail = buildTaskEmail({ task, assigneeName: person.name || "", actorName: row.actor_name || "", reason: row.reason, alsoWith: others });
      const to = settings.testTo || person.email;
      const subject = settings.testTo ? `[TEST, would go to ${person.name || person.email}] ${mail.subject}` : mail.subject;

      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        console.log(`[dev] task email to ${to}: ${subject}`);
        await finish(row.id, { status: "skipped", detail: "no email service on this machine", to_email: to });
        out.skipped += 1;
        continue;
      }
      const { Resend } = await import("resend");
      const resend = new Resend(apiKey);
      const res = await resend.emails.send({ from: FROM, to, subject, text: mail.text, html: mail.html, ...(replyTo ? { replyTo } : {}) });
      if (res?.error) throw new Error(res.error.message || "email service refused it");
      await finish(row.id, { status: "sent", sent_at: new Date().toISOString(), to_email: to });
      await logOnTask(row.task_id, `emailed ${person.name || "the assignee"} about this task`);
      out.sent += 1;
    } catch (e) {
      out.failed += 1;
      console.error("task email failed:", e?.message || e);
      await finish(row.id, { status: "failed", detail: String(e?.message || e).slice(0, 300) });
    }
  }
  return out;
}

// Called by FactoryOS right after it changes who a task is for: record who
// did it, so the email can say so and a self-assignment is not emailed.
export async function noteTaskEmailActor(taskId, who) {
  if (!who?.name) return;
  const url = new URL(`${getSupabaseUrl()}/rest/v1/team_task_emails`);
  url.searchParams.set("task_id", `eq.${taskId}`);
  url.searchParams.set("status", "eq.pending");
  url.searchParams.set("actor_name", "is.null");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  await fetch(url, {
    method: "PATCH",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ actor_id: who.id || null, actor_name: who.name }),
    cache: "no-store",
  }).catch(() => {});
}
