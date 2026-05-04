import { getSession, requireRole } from "@/lib/auth/session";
import { listMasterPapers } from "@/lib/paper-rm";

export const runtime = "nodejs";

// Admin-only read of the Paper RM Database. The cup calculator pulls baseboard
// rates (sidewall, bottom) from here so rate changes in Airtable flow through
// automatically. Clients don't see this — their rates are the CUSTOMER_DEFAULTS
// baked into the server.
export async function GET() {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireRole(session, "calculator", "admin")) return new Response("Forbidden", { status: 403 });
  try {
    const masterPapers = await listMasterPapers();
    return Response.json({ masterPapers });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
