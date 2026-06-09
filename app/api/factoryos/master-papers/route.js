import { getSession, requireInternal } from "@/lib/auth/session";
import { listMasterPapers } from "@/lib/paper-rm";

export const runtime = "nodejs";

// Read-only list from the Paper RM Database. Internal-only: rows carry mill
// names, GSM, BF, and supplier identifiers — confidential per Aeros sourcing
// policy. Customers and external vendors must not see this. (Earlier comment
// said this was "not sensitive" — that was wrong, fixed in PR1 of the jobs
// audit.) Internal = admin / FM / FE / AM, plus hub-level isAdmin.
export async function GET() {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireInternal(session)) return new Response("Forbidden", { status: 403 });
  try {
    const masterPapers = await listMasterPapers();
    return Response.json({ masterPapers });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
