import { getSession, hasModule } from "@/lib/auth/session";
import { listEmployees, createEmployee, isDuplicateCode } from "@/lib/factoryos/repo";
import { hrScope } from "@/lib/factoryos/hrScope";

export const runtime = "nodejs";

// HR Admin sees the whole roster; HR Manager is scoped to their own reports.
export async function GET(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!hasModule(session, "hr")) return new Response("Forbidden", { status: 403 });
  try {
    const url = new URL(req.url);
    const activeOnly = url.searchParams.get("active") === "1";
    const scope = await hrScope(session);
    const employees = await listEmployees({
      activeOnly,
      managerUserId: scope.isAdmin ? undefined : scope.managerUserId,
    });
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
  if (!hasModule(session, "hr")) return new Response("Forbidden", { status: 403 });
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

    // Managers can only create employees that report to themselves; admins
    // may assign any manager (or none).
    const scope = await hrScope(session);
    const managerId = scope.isAdmin ? (body.managerId || null) : scope.managerUserId;

    const employee = await createEmployee({
      name: body.name.trim(),
      aadhar: (body.aadhar || "").replace(/\s+/g, ""),
      phone: body.phone || "",
      employeeCode: (body.employeeCode || "").trim(),
      workMode: body.workMode === "WFH" ? "WFH" : "WFO",
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
    if (isDuplicateCode(e)) {
      return Response.json({ error: "That employee code is already in use." }, { status: 409 });
    }
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
