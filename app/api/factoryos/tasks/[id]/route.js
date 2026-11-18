import { getSession, requireInternal, requireManager } from "@/lib/auth/session";
import { getTask, listTaskComments, updateTask, deleteTask, sessionUser } from "@/lib/factoryos/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function gate() {
  const session = getSession();
  if (!session) return { res: new Response("Unauthorized", { status: 401 }) };
  if (!requireInternal(session)) return { res: new Response("Forbidden", { status: 403 }) };
  return { session };
}

export async function GET(_req, { params }) {
  const { session, res } = gate();
  if (!session) return res;
  try {
    const task = await getTask(params.id);
    if (!task) return Response.json({ error: "Task not found" }, { status: 404 });
    return Response.json({ task, comments: await listTaskComments(task.id) });
  } catch (e) {
    console.error("task read failed:", e);
    return Response.json({ error: "Couldn't load the task" }, { status: 500 });
  }
}

export async function PATCH(req, { params }) {
  const { session, res } = gate();
  if (!session) return res;
  try {
    const body = await req.json().catch(() => ({}));
    const out = await updateTask(params.id, body, session);
    if (out.error) return Response.json({ error: out.error }, { status: out.status || 400 });
    return Response.json(out);
  } catch (e) {
    console.error("task update failed:", e);
    return Response.json({ error: "Couldn't save the change" }, { status: 500 });
  }
}

// The person who made a task, or a manager/admin, can delete it.
export async function DELETE(_req, { params }) {
  const { session, res } = gate();
  if (!session) return res;
  try {
    const task = await getTask(params.id);
    if (!task) return Response.json({ ok: true });
    const me = await sessionUser(session);
    const mine = !!me && task.createdById === me.id;
    if (!mine && !requireManager(session)) return Response.json({ error: "Only the person who made this task, or a manager, can delete it." }, { status: 403 });
    await deleteTask(task.id);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("task delete failed:", e);
    return Response.json({ error: "Couldn't delete the task" }, { status: 500 });
  }
}
