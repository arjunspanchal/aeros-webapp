import { getSession, requireInternal, requireManager, requireAdminStrict, requireRole } from "@/lib/auth/session";
import { resolveFactoryosUserId } from "@/lib/hub/users";
import { listEmployees, createEmployee } from "@/lib/factoryos/repo";

export const runtime = "nodejs";

// Admin sees everyone. Factory Manager sees only employees assigned to them.
// Other internal roles don't have HR visibility at all (blocked by middleware).
export async function GET(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireInternal(session)) return new Response("Forbidden", { status: 403 });
  try {
    const url = new URL(req.url);
    const activeOnly = url.searchParams.get("active") === "1";
    const managerUserId = requireAdminStrict(session)
      ? url.searchParams.get("managerUserId") || undefined
      : (await resolveFactoryosUserId(session)); // FM is force-scoped to themselves.
    const employees = await listEmployees({ activeOnly, managerUserId });
    return Response.json({ employees });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

export async function POST(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireManager(session)) return new Response("Forbidden", { status: 403 });
  try {
    const body = await req.json();
    if (!body.name || !body.name.trim()) {
      return Response.json({ error: "Name required" }, { status: 400 });
    }
    if (body.aadhar && !/^\d{12}$/.test(String(body.aadhar).replace(/\s+/g, ""))) {
      return Response.json({ error: "Aadhar must be 12 digits" }, { status: 400 });
    }
    const monthlySalary = Number(body.monthlySalary);
    if (!Number.isFinite(monthlySalary) || monthlySalary < 0) {
      return Response.json({ error: "Valid monthly salary required" }, { status: 400 });
    }

    // Factory Manager can only create employees reporting to themselves —
    // ignore any managerId they send and bind ownership to their userId.
    // Admin can assign any manager (or none).
    const managerId = requireRole(session, "factoryos", "factory_manager")
      ? (await resolveFactoryosUserId(session))
      : body.managerId || null;

    const employee = await createEmployee({
      name: body.name.trim(),
      aadhar: (body.aadhar || "").replace(/\s+/g, ""),
      phone: body.phone || "",
      monthlySalary,
      joiningDate: body.joiningDate || null,
      managerId,
      otEligible: !!body.otEligible,
      designation: body.designation || "",
      notes: body.notes || "",
      active: true,
    });
    return Response.json({ employee });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
