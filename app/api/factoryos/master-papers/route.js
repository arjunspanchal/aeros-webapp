import { getSession } from "@/lib/auth/session";
import { listMasterPapers } from "@/lib/paper-rm";

export const runtime = "nodejs";

// Read-only list from the Paper RM Database base. Any logged-in user can read it —
// it's master catalogue data, not sensitive.
export async function GET() {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  try {
    const masterPapers = await listMasterPapers();
    return Response.json({ masterPapers });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
