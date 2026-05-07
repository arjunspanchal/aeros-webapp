import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getCard, listItems } from "@/lib/rate-cards/store";
import EditRateCard from "./EditRateCard";
import SetupNotice from "../../../_components/SetupNotice";

export const dynamic = "force-dynamic";

export default async function EditRateCardPage({ params }) {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.rate_cards;
  if (!session || !role) redirect("/login");
  if (role !== "admin") redirect("/rate-cards");

  let card = null;
  let items = [];
  let setupError = null;
  try {
    card = await getCard(params.id);
    if (!card) notFound();
    items = await listItems(card.ref);
  } catch (err) {
    if (err?.digest?.startsWith?.("NEXT_NOT_FOUND")) throw err;
    setupError = String(err?.message || err);
  }

  if (setupError) {
    return (
      <div className="max-w-5xl mx-auto px-4 pb-10 pt-4">
        <SetupNotice error={setupError} isAdmin={true} />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 pb-10 pt-4">
      <EditRateCard initialCard={card} initialItems={items} />
    </div>
  );
}
