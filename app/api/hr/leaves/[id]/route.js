// Approve or reject a leave request. Admin any; Manager only their reports.
// On approval, write a PL/UL attendance row for every working day in the range
// so the leave flows into attendance + payroll.
import { getSession, hasModule } from "@/lib/auth/session";
import { resolveFactoryosUserId } from "@/lib/hub/users";
import { hrScope, canAccessEmployee } from "@/lib/factoryos/hrScope";
import {
  getLeaveRequest,
  decideLeaveRequest,
  getEmployee,
  upsertAttendance,
  listHolidays,
} from "@/lib/factoryos/repo";
import { isWorkingDay, pad2 } from "@/lib/factoryos/hr";

export const runtime = "nodejs";

function datesBetween(from, to) {
  const out = [];
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  let cur = Date.UTC(fy, fm - 1, fd);
  const end = Date.UTC(ty, tm - 1, td);
  while (cur <= end) {
    const dt = new Date(cur);
    out.push(`${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`);
    cur += 86400000;
  }
  return out;
}

export async function POST(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!hasModule(session, "hr")) return new Response("Forbidden", { status: 403 });
  try {
    const { decision, note } = await req.json().catch(() => ({}));
    if (decision !== "approved" && decision !== "rejected") {
      return Response.json({ error: "decision must be 'approved' or 'rejected'" }, { status: 400 });
    }

    const lr = await getLeaveRequest(params.id);
    if (!lr) return Response.json({ error: "Request not found" }, { status: 404 });
    if (lr.status !== "pending") {
      return Response.json({ error: `Already ${lr.status}.` }, { status: 409 });
    }

    const employee = await getEmployee(lr.employeePublicId);
    const scope = await hrScope(session);
    if (!canAccessEmployee(scope, employee)) {
      return Response.json({ error: "Not your employee" }, { status: 403 });
    }

    const myUserId = await resolveFactoryosUserId(session);

    // On approval, stamp the leave onto attendance for each working day.
    if (decision === "approved") {
      const holidays = await listHolidays();
      const holidaySet = new Set(holidays.map((h) => h.date));
      const workingDays = datesBetween(lr.fromDate, lr.toDate).filter((iso) =>
        isWorkingDay(iso, employee?.weeklyOffDays, holidaySet),
      );
      for (const iso of workingDays) {
        // eslint-disable-next-line no-await-in-loop
        await upsertAttendance({
          employeeId: lr.employeePublicId,
          date: iso,
          status: lr.type, // PL or UL
          inTime: "",
          outTime: "",
          otHours: 0,
          markedByUserId: myUserId,
          markedByEmail: session.email,
          markedByName: session.name || "",
          notes: lr.type === "PL" ? "Paid leave (approved)" : "Unpaid leave (approved)",
        });
      }
    }

    const updated = await decideLeaveRequest(params.id, {
      status: decision,
      decidedByUserId: myUserId,
      decidedByName: session.name || "",
      note: (note || "").trim(),
    });
    return Response.json({ ok: true, request: updated });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
