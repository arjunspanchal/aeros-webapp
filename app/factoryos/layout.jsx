import AppHeader from "@/app/components/AppHeader";
import Footer from "@/app/components/Footer";
import { getSession } from "@/lib/hub/session";
import ModuleShell from "@/app/_components/ModuleShell";
import ModuleSidebar from "@/app/_components/ModuleSidebar";
import { buildFactoryosSections } from "./_components/factoryosSections";

// Wraps every /factoryos page with the shared AppHeader + Footer. For
// internal staff (FE/FM/AM/Admin), also wraps the page content in the
// ModuleShell — left sidebar (md+) + main content. Customers don't see
// the shell; their pages render flush like before.
export default function FactoryosLayout({ children }) {
  const session = getSession();
  const role = session?.modules?.factoryos;
  const sections = buildFactoryosSections(role, !!session?.isAdmin);
  const showShell = sections.length > 0;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <AppHeader session={session} />
      {showShell ? (
        <ModuleShell
          label="FactoryOS"
          sidebar={<ModuleSidebar sections={sections} ariaLabel="FactoryOS sections" />}
        >
          {children}
        </ModuleShell>
      ) : (
        <div className="flex-1">{children}</div>
      )}
      <Footer note="FactoryOS — operations for the Aeros team." />
    </div>
  );
}
