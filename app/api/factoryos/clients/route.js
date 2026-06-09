import { getSession, requireInternal, requireManager, requireRole } from "@/lib/auth/session";
import { listClients, createClient } from "@/lib/factoryos/repo";

export const runtime = "nodejs";

export async function GET() {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  try {
    const clients = await listClients();
    return Response.json({ clients });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

// Create-client is permitted for the same set that's allowed to create jobs:
// admin / factory manager / account manager. AMs in particular need this for
// the New Job form's inline "+ Create new customer" flow, where they're
// onboarding a new buyer alongside the first job. Previously this was
// requireManager-only and the AM hit a 403 in the middle of job creation.
// Audit H2. FE is shop-floor — no customer-onboarding authority.
export async function POST(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireInternal(session)) return new Response("Forbidden", { status: 403 });
  if (!requireManager(session) && !requireRole(session, "factoryos", "account_manager")) {
    return Response.json({ error: "Only admin, factory manager or account manager can create customers" }, { status: 403 });
  }
  try {
    const body = await req.json();
    if (!body.name) return Response.json({ error: "Name required" }, { status: 400 });
    const client = await createClient(body);
    return Response.json({ client });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
