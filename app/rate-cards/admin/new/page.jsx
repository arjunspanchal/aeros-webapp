import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import NewRateCardForm from "./NewRateCardForm";

export default function NewRateCardPage() {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.rate_cards;
  if (!session || !role) redirect("/login");
  if (role !== "admin") redirect("/rate-cards");

  return (
    <div className="max-w-3xl mx-auto px-4 pb-10 pt-4">
      <h1 className="text-2xl font-bold text-gray-900 mb-1 dark:text-white">New rate card</h1>
      <p className="text-sm text-gray-500 mb-6 dark:text-gray-400">
        Pick a customer, give the card a title. You can add line items on the next screen.
      </p>
      <NewRateCardForm />
    </div>
  );
}
