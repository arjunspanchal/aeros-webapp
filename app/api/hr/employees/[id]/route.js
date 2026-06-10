import { getSession, hasModule } from "@/lib/auth/session";
import { updateEmployee, deleteEmployee, deactivateEmployee, getEmployee, isDuplicateCode } from "@/lib/factoryos/repo";
import { hrScope, canAccessEmployee } from "@/lib/factoryos/hrScope";

export const runtime = "nodejs";

// Managers may only touch their own reports; admins anyone. Returns a Response
// to bail with, or null when allowed (and strips manager reassignment for FMs).
async function guardAndScope(session, employeeId, patch) {
  const scope = await hrScope(session);
  if (scope.isAdmin) return null;
  const emp = await getEmployee(employeeId);
  if (!canAccessEmployee(scope, emp)) {
    return Response.json({ error: "Not your employee" }, { status: 403 });
  }
  if (patch) delete patch.managerId; // managers can't reassign ownership
  return null;
}

export async function PATCH(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!hasModule(session, "hr")) return new Response("Forbidden", { status: 403 });
  try {
    const body = await req.json();
    const patch = { ...body };
    const denied = await guardAndScope(session, params.id, patch);
    if (denied) return denied;
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
    if (isDuplicateCode(e)) {
      return Response.json({ error: "That employee code is already in use." }, { status: 409 });
    }
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

// DELETE deactivates by default (preserves attendance history).
// Pass ?hard=1 to cascade-delete attendance rows + the employee.
export async function DELETE(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!hasModule(session, "hr")) return new Response("Forbidden", { status: 403 });
  try {
    const denied = await guardAndScope(session, params.id, null);
    if (denied) return denied;
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
