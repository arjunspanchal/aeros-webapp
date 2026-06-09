// Server-side reader for the employee punch-clock session. Kept apart from
// empSession.js (pure node:crypto) so the cookie sign/verify primitives stay
// importable without dragging in next/headers.
import { cookies } from "next/headers";
import { verifyEmpSession, EMP_COOKIE } from "@/lib/factoryos/empSession";

// Returns { employeeId, name, phone, exp } or null.
export function getEmpSession() {
  return verifyEmpSession(cookies().get(EMP_COOKIE)?.value);
}
