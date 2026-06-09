import AppHeader from "@/app/components/AppHeader";
import Footer from "@/app/components/Footer";
import { getSession } from "@/lib/hub/session";
import ModuleShell from "@/app/_components/ModuleShell";
import ModuleSidebar from "@/app/_components/ModuleSidebar";

// Standalone HR module shell (split out of FactoryOS). Anyone with the `hr`
// entitlement gets the sidebar; the page guards re-check `hasModule(hr)` and
// redirect otherwise, so a stray visitor just sees the header + a bounce.
const HR_SECTIONS = [
  {
    label: "HR",
    items: [
      { href: "/hr",            label: "Overview",   exact: true },
      { href: "/hr/attendance", label: "Attendance" },
      { href: "/hr/calendar",   label: "Calendar" },
      { href: "/hr/payroll",    label: "Payroll" },
      { href: "/hr/holidays",   label: "Holidays" },
    ],
  },
];

export default function HrLayout({ children }) {
  const session = getSession();
  const showShell = !!session?.modules?.hr;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <AppHeader session={session} />
      {showShell ? (
        <ModuleShell
          label="HR"
          sidebar={<ModuleSidebar sections={HR_SECTIONS} ariaLabel="HR sections" />}
        >
          {children}
        </ModuleShell>
      ) : (
        <div className="flex-1">{children}</div>
      )}
      <Footer note="HR — roster, attendance, payroll for the Aeros team." />
    </div>
  );
}
