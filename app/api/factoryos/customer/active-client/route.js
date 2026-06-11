import { getSession } from "@/lib/auth/session";
import { ROLES } from "@/lib/factoryos/constants";
import { setActiveClientId } from "@/lib/factoryos/customerScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { clientId } — pin the customer portal to a specific linked client.
// The chosen id must be one the caller is actually linked to; anything else
// is silently rejected (no info leak about whether the id exists).
export async function POST(req) {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.factoryos;
  if (!session || role !== ROLES.CUSTOMER) {
    return Response.json({ error: "Not allowed" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const clientId = typeof body.clientId === "string" ? body.clientId : "";
  const linked = new Set(session.factoryosClientIds || []);
  if (!clientId || !linked.has(clientId)) {
    return Response.json({ error: "Unknown client" }, { status: 400 });
  }
  setActiveClientId(clientId);
  return Response.json({ ok: true, clientId });
}
