import { getSession, hasModule } from "@/lib/auth/session";
import { listEmployees, createEmployee, isDuplicateCode } from "@/lib/factoryos/repo";

export const runtime = "nodejs";

// HR is a single-level module — anyone with `modules.hr` has full access to the
// whole roster (no per-manager scoping). Gated by middleware too.
export async function GET(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!hasModule(session, "hr")) return new Response("Forbidden", { status: 403 });
  try {
    const url = new URL(req.url);
    const activeOnly = url.searchParams.get("active") === "1";
    const employees = await listEmployees({ activeOnly });
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

    const managerId = body.managerId || null;

    const employee = await createEmployee({
      name: body.name.trim(),
      aadhar: (body.aadhar || "").replace(/\s+/g, ""),
      phone: body.phone || "",
      employeeCode: (body.employeeCode || "").trim(),
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
