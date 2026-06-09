// Punch-clock login: phone + PIN. Replaces the SMS-OTP flow (DLT made SMS
// impractical for internal attendance). On success, mints the employee
// session cookie.
//
// Public route (middleware lets /api/factoryos/clock/* through). Errors are
// deliberately generic ("Invalid phone or PIN") so the endpoint can't be used
// to discover which numbers are staff — except the two genuinely actionable
// cases (no PIN set yet, account locked), which a worker needs to act on.
import { cookies } from "next/headers";
import {
  getEmployeeAuthByPhone,
  recordPinFailure,
  resetPinAttempts,
} from "@/lib/factoryos/repo";
import { verifyPin, isValidPin } from "@/lib/factoryos/pin";
import { signEmpSession, empSessionCookie } from "@/lib/factoryos/empSession";

export const runtime = "nodejs";

const GENERIC = "Invalid phone or PIN.";

export async function POST(req) {
  const { phone, pin } = await req.json().catch(() => ({}));
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 10 || !isValidPin(pin)) {
    return Response.json({ error: GENERIC }, { status: 401 });
  }

  const found = await getEmployeeAuthByPhone(phone);
  if (found.error === "ambiguous") {
    return Response.json(
      { error: "This number is on more than one employee. Ask your manager to fix it." },
      { status: 409 },
    );
  }
  // No match → same generic 401 as a wrong PIN (anti-enumeration).
  if (!found.auth) {
    return Response.json({ error: GENERIC }, { status: 401 });
  }

  const a = found.auth;

  // Locked out from prior failures?
  if (a.lockedUntil && new Date(a.lockedUntil).getTime() > Date.now()) {
    return Response.json(
      { error: "Too many wrong attempts. Try again in a few minutes." },
      { status: 429 },
    );
  }

  // No PIN configured yet — actionable, distinct message.
  if (!a.pinHash) {
    return Response.json(
      { error: "No PIN set for this number yet. Ask your manager to set one." },
      { status: 403 },
    );
  }

  if (!verifyPin(pin, a.pinHash)) {
    const { locked } = await recordPinFailure(a.id, { failCount: a.failCount });
    return Response.json(
      { error: locked ? "Too many wrong attempts. Try again in a few minutes." : GENERIC },
      { status: locked ? 429 : 401 },
    );
  }

  // Success — clear any accumulated failures and sign in.
  await resetPinAttempts(a.id);
  const token = signEmpSession({ employeeId: a.publicId, name: a.name, phone: a.phone });
  cookies().set(empSessionCookie(token));
  return Response.json({ ok: true, employee: { name: a.name } });
}
