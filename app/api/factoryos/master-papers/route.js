import { getSession, requireAdminStrict } from "@/lib/auth/session";
import { listMasterPapers } from "@/lib/paper-rm";

export const runtime = "nodejs";

// Read-only list from the Paper RM Database. ADMIN ONLY (audit, 27-Nov-2026):
// every row carries the base rate, supplier discount and effective rate, and
// FactoryOS shows no rates to factory, sales or warehouse staff. The FactoryOS
// screens that need paper names read them on the server and pass on a
// rate-free subset; nothing in the app fetches this route.
export async function GET() {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireAdminStrict(session)) return new Response("Forbidden", { status: 403 });
  try {
    const masterPapers = await listMasterPapers();
    return Response.json({ masterPapers });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
