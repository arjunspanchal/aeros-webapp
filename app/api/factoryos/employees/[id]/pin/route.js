// Manager sets / resets a worker's punch-clock PIN. Same access rules as
// editing the employee (Admin = anyone; Factory Manager = own reports only).
// The PIN is hashed in setEmployeePin — it is never stored or logged in plain.
import { getSession, requireManager, requireAdminStrict } from "@/lib/auth/session";
import { resolveFactoryosUserId } from "@/lib/hub/users";
import { getEmployee, setEmployeePin } from "@/lib/factoryos/repo";
import { isValidPin } from "@/lib/factoryos/pin";
import { ROLES } from "@/lib/factoryos/constants";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireManager(session)) return new Response("Forbidden", { status: 403 });

  // Scope check — FMs may only touch their own reports.
  if (!requireAdminStrict(session)) {
    const emp = await getEmployee(params.id);
    if (!emp) return Response.json({ error: "Not found" }, { status: 404 });
    const myUserId = await resolveFactoryosUserId(session);
    if (emp.managerId !== myUserId) {
      return Response.json({ error: "Not your employee" }, { status: 403 });
    }
  }

  const { pin } = await req.json().catch(() => ({}));
  if (!isValidPin(pin)) {
    return Response.json({ error: "PIN must be 4–6 digits" }, { status: 400 });
  }

  await setEmployeePin(params.id, pin);
  return Response.json({ ok: true });
}
