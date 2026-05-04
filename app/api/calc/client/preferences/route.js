// Lets the logged-in client update their own preferences (currency, units)
// without admin intervention. Mutates their row in the unified Users directory.
import { getSession, requireRole } from "@/lib/auth/session";
import { CURRENCIES } from "@/lib/calc/calculator";
import { findCalcClientByEmail, updateCalcClient } from "@/lib/calc/user-directory";

export const runtime = "nodejs";

export async function POST(req) {
  const session = getSession();
  if (!session || !requireRole(session, "calculator", "client")) {
    return new Response("Unauthorized", { status: 401 });
  }
  const body = await req.json().catch(() => ({}));

  const patch = {};
  if (body.preferredCurrency !== undefined) {
    if (!CURRENCIES[body.preferredCurrency]) {
      return Response.json({ error: "Unsupported currency" }, { status: 400 });
    }
    patch.preferredCurrency = body.preferredCurrency;
  }
  if (body.preferredUnit !== undefined) {
    if (!["mm", "cm", "in"].includes(body.preferredUnit)) {
      return Response.json({ error: "Unsupported unit" }, { status: 400 });
    }
    patch.preferredUnit = body.preferredUnit;
  }
  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }

  const client = await findCalcClientByEmail(session.email);
  if (!client) return Response.json({ error: "Client record not found" }, { status: 404 });

  await updateCalcClient(client.id, patch);
  return Response.json({ ok: true, ...patch });
}
