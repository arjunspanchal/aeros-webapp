import { getSession, requireInternal } from "@/lib/auth/session";
import { requireAdminStrict } from "@/lib/auth/policy";
import { getTaskEmailSettings, setTaskEmailsEnabled } from "@/lib/factoryos/taskEmails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Task tracker settings. For now one switch: email the assignee when a task
// is given to them. Anyone on the team can see it; only an admin can change it.
export async function GET() {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireInternal(session)) return new Response("Forbidden", { status: 403 });
  const s = await getTaskEmailSettings();
  return Response.json({ emailsEnabled: s.enabled, canChange: requireAdminStrict(session) });
}

export async function PATCH(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireAdminStrict(session)) return Response.json({ error: "Only an admin can change this." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.emailsEnabled !== "boolean") return Response.json({ error: "Nothing to change" }, { status: 400 });
  const enabled = await setTaskEmailsEnabled(body.emailsEnabled);
  return Response.json({ emailsEnabled: enabled, canChange: true });
}
