import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { customerUnreadJobIds, listClients, listJobsForSession } from "@/lib/factoryos/repo";
import { ROLES } from "@/lib/factoryos/constants";
import { getActiveClientId } from "@/lib/factoryos/customerScope";
import CustomerNavBar from "./_components/CustomerNavBar";

// Customer-only sub-shell that wraps every /factoryos/customer/* page.
// Renders a single sticky nav bar (replaces the older welcome-strip +
// tabs combo) — see CustomerNavBar for the affordances.
//
// We also compute the unread-message badge once here so every page in the
// customer module shows a consistent count, no matter where you land.
export default async function CustomerSectionLayout({ children }) {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.factoryos;
  if (!session || !role) redirect("/login");
  if (role !== ROLES.CUSTOMER) redirect("/factoryos");

  const linkedIds = session.factoryosClientIds || [];
  const clientsAll = await listClients();
  const linkedClients = linkedIds
    .map((id) => clientsAll.find((c) => c.id === id))
    .filter(Boolean)
    .map((c) => ({ id: c.id, name: c.name }));

  // Active-client picker: stored on cookie, defaults to first linked. Future
  // pages can read it via getActiveClientId(session.factoryosClientIds).
  const activeClientId = getActiveClientId(linkedIds);

  // Unread-from-Aeros count — pulled across the customer's jobs so the
  // Inbox tab badge is right on first paint of any customer page. Cheap to
  // compute (single Supabase round-trip) and decays to zero on a clean
  // account.
  let unreadCount = 0;
  try {
    const jobs = await listJobsForSession({
      role,
      userId: session.factoryosUserId,
      clientIds: activeClientId ? [activeClientId] : linkedIds,
    });
    const ids = await customerUnreadJobIds(jobs.map((j) => j.id));
    unreadCount = ids.size;
  } catch {
    // Don't fail the entire layout on a transient stats error; show a 0.
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gray-50 dark:bg-gray-950">
      <CustomerNavBar
        clients={linkedClients}
        activeClientId={activeClientId}
        badges={{ unread: unreadCount }}
      />
      {children}
    </div>
  );
}
