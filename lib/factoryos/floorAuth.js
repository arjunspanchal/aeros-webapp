// Server-side employee-session check for the public /floor APIs. The floor
// routes sit outside the middleware matcher, so each one calls this to confirm
// a valid employee session (the SAME aeros_emp_session cookie the punch clock
// mints — workers log in once for both). Node runtime only (uses next/headers).
import { cookies } from "next/headers";
import { verifyEmpSession, EMP_COOKIE } from "./empSession";

// Returns the employee session payload { employeeId, name, phone } or null.
export function currentEmployee() {
  const token = cookies().get(EMP_COOKIE)?.value;
  return verifyEmpSession(token);
}
