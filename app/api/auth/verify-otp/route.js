// Hub-level OTP verify. On success, mints the unified hub session cookie
// (aeros_hub_session) — the single source of auth across calc / factoryos /
// rate-cards / catalogue / clearance modules. Phase 1.5d retired minting of
// the per-module legacy cookies (aeros_session, aeros_factoryos_session);
// their readers in pages, API routes, and middleware all switched to the
// unified session in 1.5b / 1.5c / 1.5d.
import { cookies } from "next/headers";
import { airtableList, airtableUpdate, escapeFormula, TABLES as FACTORYOS_TABLES } from "@/lib/factoryos/airtable";
import { normalizeEmail, signSession as signHub, sessionCookie as hubCookie } from "@/lib/hub/auth";
import { resolveEntitlements } from "@/lib/hub/users";

export const runtime = "nodejs";

export async function POST(req) {
  const { email, code } = await req.json().catch(() => ({}));
  const cleaned = normalizeEmail(email);
  if (!cleaned || !code) return Response.json({ error: "Email and code required" }, { status: 400 });

  const otps = await airtableList(FACTORYOS_TABLES.otp(), {
    filterByFormula: `AND({Email}='${escapeFormula(cleaned)}', {Code}='${escapeFormula(code)}', NOT({Used}))`,
    sort: [{ field: "Created", direction: "desc" }],
    maxRecords: 1,
  });
  const otp = otps[0];
  if (!otp) return Response.json({ error: "Invalid or expired code" }, { status: 401 });
  const expiresAt = new Date(otp.fields["Expires At"]);
  if (expiresAt.getTime() < Date.now()) {
    return Response.json({ error: "Code expired. Request a new one." }, { status: 401 });
  }
  await airtableUpdate(FACTORYOS_TABLES.otp(), otp.id, { Used: true });

  const ents = await resolveEntitlements(cleaned);
  if (!ents) {
    return Response.json({ error: "Account not found or inactive" }, { status: 403 });
  }

  const jar = cookies();
  const hubToken = signHub({
    email: ents.email,
    name: ents.name,
    isAdmin: ents.isAdmin,
    modules: ents.modules,
    factoryosUserId: ents.factoryosUserId ?? null,
    factoryosClientIds: ents.factoryosClientIds ?? [],
    factoryosVendorId: ents.factoryosVendorId ?? null,
  });
  jar.set(hubCookie(hubToken));

  return Response.json({ ok: true, modules: ents.modules });
}
