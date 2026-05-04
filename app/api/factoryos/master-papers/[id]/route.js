import { getSession, requireAdminStrict } from "@/lib/auth/session";
import { updateMasterPaper } from "@/lib/paper-rm";

export const runtime = "nodejs";

// PATCH /api/factoryos/master-papers/[id]
// STRICTLY admin-only — not FM/FE/Customer. Master rates feed COGS, too
// sensitive for shop-floor. requireAdminStrict accepts hub-level isAdmin
// (password admin login) OR factoryos module 'admin' (per the PR 1.1 amend
// that broadened the helper to preserve legacy access).
export async function PATCH(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireAdminStrict(session)) {
    return Response.json({ error: "Admin only" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const masterPaper = await updateMasterPaper(params.id, body);
    return Response.json({ masterPaper });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 400 });
  }
}
