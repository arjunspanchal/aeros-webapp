import { getSession, requireInternal } from "@/lib/auth/session";
import { listTasks, listTasksForJob, listTaskPeople, listJobsForTaskPicker, createTask, sessionUser, actorName } from "@/lib/factoryos/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Team task tracker. Every internal staff member sees every task and can add
// one for anybody; vendors have no access.
// ?job=<J#> returns only that job's tasks (the job page uses it).
export async function GET(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireInternal(session)) return new Response("Forbidden", { status: 403 });
  try {
    const jobNo = new URL(req.url).searchParams.get("job");
    if (jobNo) {
      const [tasks, people, me] = await Promise.all([listTasksForJob(jobNo), listTaskPeople(), sessionUser(session)]);
      return Response.json({ tasks, people, meId: me?.id || "", meName: actorName(session, me) });
    }
    const [tasks, people, jobs, me] = await Promise.all([listTasks(), listTaskPeople(), listJobsForTaskPicker(), sessionUser(session)]);
    return Response.json({ tasks, people, jobs, meId: me?.id || "", meName: actorName(session, me) });
  } catch (e) {
    console.error("tasks list failed:", e);
    return Response.json({ error: "Couldn't load tasks" }, { status: 500 });
  }
}

export async function POST(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireInternal(session)) return new Response("Forbidden", { status: 403 });
  try {
    const body = await req.json().catch(() => ({}));
    const out = await createTask(body, session);
    if (out.error) return Response.json({ error: out.error }, { status: 400 });
    return Response.json(out);
  } catch (e) {
    console.error("task create failed:", e);
    return Response.json({ error: "Couldn't save the task" }, { status: 500 });
  }
}
