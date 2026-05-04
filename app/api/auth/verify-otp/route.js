// Hub-level OTP verify. On success, mints THREE cookies:
//   - aeros_hub_session         — unified entitlements (home-page gating)
//   - aeros_session             — calculator-compatible (if user has calc access)
//   - aeros_factoryos_session   — FactoryOS-compatible (if user has factoryos access)
// Per-module cookies let each module keep trusting its own session format.
import { cookies } from "next/headers";
import { airtableList, airtableUpdate, escapeFormula, TABLES as FACTORYOS_TABLES } from "@/lib/factoryos/airtable";
import { normalizeEmail, signSession as signHub, sessionCookie as hubCookie } from "@/lib/hub/auth";
import { resolveEntitlements } from "@/lib/hub/users";
import { signSession as signCalc, sessionCookie as calcCookie } from "@/lib/calc/auth";
import { signSession as signFactoryos, sessionCookie as factoryosCookie } from "@/lib/factoryos/auth";

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

  // Mint hub cookie (always).
  // factoryosUserId + factoryosClientIds are added in PR 1.5a so the unified
  // session can serve everything 8 factoryos API routes from PR 1.3b
  // currently get from the per-module factoryos cookie. Empty/null on users
  // with no factoryos entitlement — same as a no-data state on the legacy
  // factoryos cookie. PR 1.5b retires the redundant cookies entirely.
  const jar = cookies();
  const hubToken = signHub({
    email: ents.email,
    name: ents.name,
    isAdmin: ents.isAdmin,
    modules: ents.modules,
    factoryosUserId: ents.factoryosUserId ?? null,
    factoryosClientIds: ents.factoryosClientIds ?? [],
  });
  jar.set(hubCookie(hubToken));

  // Mint calc cookie if the user has calc access. Payload matches the shape
  // the calculator module expects: { role, email, marginPct }.
  if (ents.modules.calculator) {
    const calcToken = signCalc({
      role: ents.modules.calculator,
      email: ents.email,
      marginPct: ents.calcMarginPct ?? undefined,
    });
    jar.set(calcCookie(calcToken));
  }

  // Mint factoryos cookie if the user has factoryos access. Payload matches
  // the module's expected shape: { role, email, name, userId, clientIds }.
  if (ents.modules.factoryos) {
    const factoryosToken = signFactoryos({
      role: ents.modules.factoryos,
      email: ents.email,
      name: ents.name,
      userId: ents.factoryosUserId,
      clientIds: ents.factoryosClientIds,
    });
    jar.set(factoryosCookie(factoryosToken));
  }

  return Response.json({ ok: true, modules: ents.modules });
}
