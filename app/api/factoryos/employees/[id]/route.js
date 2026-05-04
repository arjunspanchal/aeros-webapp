import { getSession as getFactoryosSession } from "@/lib/factoryos/session";
import { getSession, requireManager, requireAdminStrict } from "@/lib/auth/session";
import { updateEmployee, deleteEmployee, deactivateEmployee, getEmployee } from "@/lib/factoryos/repo";
import { ROLES } from "@/lib/factoryos/constants";

export const runtime = "nodejs";

// Factory Manager may only edit employees assigned to them, and may not
// re-assign ownership (to prevent bypassing the roster scope).
// Receives the LEGACY factoryos session for backwards compatibility — the
// helper still reads .role / .userId, which only exist on that shape.
// PR 1.5 collapses this when the unified session carries userId too.
async function assertCanEdit(session, employeeId) {
  if (session.role === ROLES.ADMIN) return;
  const emp = await getEmployee(employeeId);
  if (!emp) throw new Response("Not found", { status: 404 });
  if (emp.managerId !== session.userId) {
    throw new Response("Not your employee", { status: 403 });
  }
}

export async function PATCH(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireManager(session)) return new Response("Forbidden", { status: 403 });
  const s = getFactoryosSession();
  try {
    await assertCanEdit(s, params.id);
    const body = await req.json();
    const patch = { ...body };
    // FMs can't reassign ownership — silently drop any managerId attempt.
    if (!requireAdminStrict(session)) delete patch.managerId;
    if (patch.name !== undefined) {
      if (!String(patch.name).trim()) {
        return Response.json({ error: "Name cannot be empty" }, { status: 400 });
      }
      patch.name = patch.name.trim();
    }
    if (patch.aadhar !== undefined && patch.aadhar) {
      const cleaned = String(patch.aadhar).replace(/\s+/g, "");
      if (!/^\d{12}$/.test(cleaned)) {
        return Response.json({ error: "Aadhar must be 12 digits" }, { status: 400 });
      }
      patch.aadhar = cleaned;
    }
    if (patch.monthlySalary !== undefined) {
      const n = Number(patch.monthlySalary);
      if (!Number.isFinite(n) || n < 0) {
        return Response.json({ error: "Valid monthly salary required" }, { status: 400 });
      }
      patch.monthlySalary = n;
    }
    // OT rate is computed from salary + OT_MULTIPLIER — not stored.
    delete patch.otRate;
    const employee = await updateEmployee(params.id, patch);
    return Response.json({ employee });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

// DELETE deactivates by default (preserves attendance history).
// Pass ?hard=1 to cascade-delete attendance rows + the employee.
export async function DELETE(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireManager(session)) return new Response("Forbidden", { status: 403 });
  const s = getFactoryosSession();
  try {
    await assertCanEdit(s, params.id);
    const url = new URL(req.url);
    if (url.searchParams.get("hard") === "1") {
      const result = await deleteEmployee(params.id);
      return Response.json(result);
    }
    const employee = await deactivateEmployee(params.id);
    return Response.json({ employee });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
