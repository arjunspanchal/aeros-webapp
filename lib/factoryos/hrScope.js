// HR access scoping. HR Admins (`modules.hr === "admin"`) see every employee;
// HR Managers (`modules.hr === "manager"`) see only employees who report to
// them (employees.manager_id === their user id). Used by the /hr pages + the
// /api/hr routes so the roster, attendance, payroll, and edits are all scoped
// consistently.
import { resolveFactoryosUserId } from "@/lib/hub/users";

export function isHrAdmin(session) {
  return session?.modules?.hr === "admin";
}

// Returns { isAdmin, managerUserId }. managerUserId is null for admins; for a
// manager it's their public user id, used to filter employees by manager_id.
export async function hrScope(session) {
  const admin = isHrAdmin(session);
  return { isAdmin: admin, managerUserId: admin ? null : await resolveFactoryosUserId(session) };
}

// Does this session have edit/view rights over `employee`? Admins always;
// managers only for their own reports.
export function canAccessEmployee(scope, employee) {
  if (!employee) return false;
  if (scope.isAdmin) return true;
  return !!scope.managerUserId && employee.managerId === scope.managerUserId;
}
