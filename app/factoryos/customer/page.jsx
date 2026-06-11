import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import {
  customerArtworkPendingJobIds,
  customerUnreadJobIds,
  listClients,
  listJobsForSession,
} from "@/lib/factoryos/repo";
import { ROLES } from "@/lib/factoryos/constants";
import { getActiveClientId } from "@/lib/factoryos/customerScope";
import CustomerJobsView from "./CustomerJobsView";

export const dynamic = "force-dynamic";

export default async function CustomerPage() {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.factoryos;
  if (!session || !role) redirect("/login");
  if (role !== ROLES.CUSTOMER) redirect("/factoryos");

  // Scope every list view to the customer's *active* client. A user linked
  // to Brewbay + Wellbeing Exports sees one company at a time — no mixed
  // listing — and switches via the nav bar picker.
  const linkedIds = session.factoryosClientIds || [];
  const activeClientId = getActiveClientId(linkedIds);

  const [jobs, clients] = await Promise.all([
    listJobsForSession({
      role,
      userId: session.factoryosUserId,
      clientIds: activeClientId ? [activeClientId] : linkedIds,
    }),
    listClients(),
  ]);
  const clientMap = Object.fromEntries(clients.map((c) => [c.id, c]));
  // Narrow both lookups to the jobs this customer can actually see — we
  // never want to ask Supabase about jobs they wouldn't be allowed to read.
  const jobIds = jobs.map((j) => j.id);
  const [unreadSet, artworkPendingSet] = await Promise.all([
    customerUnreadJobIds(jobIds),
    customerArtworkPendingJobIds(jobIds),
  ]);

  const activeClient = clientMap[activeClientId] || null;

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <CustomerJobsView
        jobs={jobs}
        clientMap={clientMap}
        unreadIds={Array.from(unreadSet)}
        artworkPendingIds={Array.from(artworkPendingSet)}
        activeClient={activeClient}
      />
    </main>
  );
}
