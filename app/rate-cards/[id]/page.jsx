import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getCard, listItems } from "@/lib/rate-cards/store";
import { priceAll } from "@/lib/rate-cards/pricing";
import RateCardView from "../_components/RateCardView";
import SetupNotice from "../_components/SetupNotice";

export const dynamic = "force-dynamic";

export default async function RateCardDetailPage({ params }) {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.rate_cards;
  if (!session || !role) redirect("/login");

  const isAdmin = role === "admin";

  // Soft-fail Airtable so missing env / tables shows a notice not a 500.
  let card = null;
  let items = [];
  let setupError = null;
  try {
    card = await getCard(params.id);
    if (!card) notFound();
    if (!isAdmin && card.clientEmail !== session.email) {
      // Don't leak existence of other clients' cards.
      notFound();
    }
    items = await listItems(card.ref);
  } catch (err) {
    if (err?.digest?.startsWith?.("NEXT_NOT_FOUND")) throw err;
    setupError = String(err?.message || err);
  }

  if (setupError) {
    return (
      <div className="max-w-5xl mx-auto px-4 pb-10 pt-4">
        <SetupNotice error={setupError} isAdmin={isAdmin} />
      </div>
    );
  }

  const priced = priceAll(items);

  return (
    <div className="max-w-5xl mx-auto px-4 pb-10 pt-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            <Link href="/rate-cards" className="hover:text-blue-600 dark:hover:text-blue-400">Rate Cards</Link>
            {" · "}{card.ref}
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {card.title || card.brand || card.ref}
          </h1>
          <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
            {card.brand && <span>Brand: <strong>{card.brand}</strong> · </span>}
            {isAdmin && card.clientEmail && <span>Customer: <strong>{card.clientName || card.clientEmail}</strong> · </span>}
            Status: <strong>{card.status || "Draft"}</strong>
          </p>
        </div>
        {isAdmin && (
          <Link
            href={`/rate-cards/admin/${card.id}/edit`}
            className="shrink-0 text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
          >
            Edit
          </Link>
        )}
      </div>

      <RateCardView items={priced} />

      {card.terms && (
        <div className="mt-6 text-sm text-gray-600 whitespace-pre-wrap dark:text-gray-300">
          <h2 className="text-sm font-semibold text-gray-700 mb-2 dark:text-gray-200">Terms & notes</h2>
          {card.terms}
        </div>
      )}
    </div>
  );
}
