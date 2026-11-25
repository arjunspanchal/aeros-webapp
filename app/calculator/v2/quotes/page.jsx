import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canUseV2 } from "@/lib/calc-v2/server";
import SavedQuotes from "./SavedQuotes";

export const metadata = { title: "Saved quotes · Aeros" };

export default function SavedQuotesPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!canUseV2(session)) redirect("/calculator");
  return (
    <div className="min-h-screen bg-ink-50">
      <SavedQuotes />
    </div>
  );
}
