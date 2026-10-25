import { getSession, requireManager } from "@/lib/auth/session";
import { runAssistant } from "@/lib/factoryos/assistant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Chat turn for the FactoryOS assistant. The client keeps the conversation
// (API message blocks) and sends it whole each time. Factory managers and
// admin only — the people allowed to raise and change jobs.
export async function POST(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireManager(session)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const messages = Array.isArray(body?.messages) ? body.messages : null;
  if (!messages || !messages.length || messages.length > 80) return Response.json({ error: "Invalid conversation" }, { status: 400 });
  if (messages[messages.length - 1]?.role !== "user") return Response.json({ error: "Last message must be from the user" }, { status: 400 });
  const role = session.isAdmin ? "admin" : session.modules?.factoryos;
  try {
    const out = await runAssistant({ session, role, messages });
    return Response.json(out);
  } catch (e) {
    console.error("assistant failed:", e);
    const msg = e?.status ? `Claude API error ${e.status}: ${e.message}` : e?.message || "Assistant failed";
    return Response.json({ error: msg }, { status: 502 });
  }
}
