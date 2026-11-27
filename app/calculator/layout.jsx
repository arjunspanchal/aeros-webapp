import AppHeader from "@/app/components/AppHeader";
import { getSession } from "@/lib/hub/session";
import { calcSession } from "@/lib/calc-v2/server";

// Wraps every /calculator page with the shared AppHeader. Child pages render
// inside {children} and should no longer render their own NavBar.
export default function CalculatorLayout({ children }) {
  // An admin who switched on "View as staff" also gets the staff tabs.
  const session = calcSession(getSession());
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <AppHeader session={session} />
      <div>{children}</div>
    </div>
  );
}
