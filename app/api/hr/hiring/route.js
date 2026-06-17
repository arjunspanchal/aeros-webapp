// Hiring pipeline: list + create candidates. Any HR user (admin or manager)
// can manage candidates — the pipeline is company-wide, not manager-scoped.
import { getSession, hasModule } from "@/lib/auth/session";
import { listCandidates, createCandidate } from "@/lib/factoryos/repo";

export const runtime = "nodejs";

export async function GET() {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!hasModule(session, "hr")) return new Response("Forbidden", { status: 403 });
  try {
    return Response.json({ candidates: await listCandidates() });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

export async function POST(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!hasModule(session, "hr")) return new Response("Forbidden", { status: 403 });
  try {
    const body = await req.json().catch(() => ({}));
    if (!String(body.name || "").trim()) {
      return Response.json({ error: "Candidate name is required" }, { status: 400 });
    }
    const candidate = await createCandidate({
      ...body,
      addedByName: session.name || session.email || "",
    });
    return Response.json({ candidate });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
