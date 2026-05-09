// RFQ Manager — single page for the customer to review every PDF quote
// admin / customer manager has uploaded for them. Internal users see all
// RFQs across clients (with a client filter); customers see only their
// own.

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { requireInternal } from "@/lib/auth/policy";
import { listRfqQuotes } from "@/lib/rfq/store";
import { listClients } from "@/lib/factoryos/repo";
import RfqManager from "./RfqManager";

export const dynamic = "force-dynamic";

export default async function RfqManagerPage() {
  const session = getSession();
  if (!session) redirect("/login");

  const isInternal = requireInternal(session);
  const isCustomer = session.modules?.factoryos === "customer";

  // Customers don't pick clients — they're locked to their own email.
  // Internal users get a client list for the filter dropdown.
  const [quotes, clients] = await Promise.all([
    isCustomer
      ? listRfqQuotes({ clientEmail: session.email }).catch(() => [])
      : listRfqQuotes({}).catch(() => []),
    isInternal ? listClients().catch(() => []) : Promise.resolve([]),
  ]);

  return (
    <div className="max-w-6xl mx-auto px-4 pb-10 pt-4">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">RFQ Manager</h1>
        <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
          {isCustomer
            ? "Every quote PDF Aeros has shared with you. Search, filter and download."
            : "PDF quotes you've shared with customers. Upload one against every RFQ; the customer can review them in their portal."}
        </p>
      </div>

      <RfqManager
        initialQuotes={quotes}
        clients={clients}
        canUpload={isInternal}
        currentEmail={session.email || ""}
      />
    </div>
  );
}
