// HR sets / resets a worker's punch-clock PIN. Any user with the `hr` module
// has full access. The PIN is hashed in setEmployeePin — never stored in plain.
import { getSession, hasModule } from "@/lib/auth/session";
import { setEmployeePin, getEmployee } from "@/lib/factoryos/repo";
import { isValidPin } from "@/lib/factoryos/pin";
import { hrScope, canAccessEmployee } from "@/lib/factoryos/hrScope";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!hasModule(session, "hr")) return new Response("Forbidden", { status: 403 });

  const scope = await hrScope(session);
  if (!scope.isAdmin) {
    const emp = await getEmployee(params.id);
    if (!canAccessEmployee(scope, emp)) {
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
