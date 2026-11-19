import { getTaskEmailSettings } from "@/lib/factoryos/taskEmails";
import { drainTaskEmailsNow } from "@/lib/factoryos/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Called by the database (trigger on team_tasks, and a five-minute sweep) to
// say "there are task emails waiting". It carries a shared secret kept in
// team_task_settings. It takes no input: all it can do is send what is
// already queued, so a stray call can't make it send anything else.
export async function POST(req) {
  const settings = await getTaskEmailSettings();
  const given = req.headers.get("x-hook-secret") || "";
  if (!settings.hookSecret || given !== settings.hookSecret) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    return Response.json({ ok: true, ...(await drainTaskEmailsNow()) });
  } catch (e) {
    console.error("task email hook failed:", e?.message || e);
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}
