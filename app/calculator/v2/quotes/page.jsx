import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canUseV2, seesWorking, calcSession } from "@/lib/calc-v2/server";
import SavedQuotes from "./SavedQuotes";

export const metadata = { title: "Saved quotes · Aeros" };

export default function SavedQuotesPage() {
  const real = getSession();
  if (!real) redirect("/login");
  const session = calcSession(real);
  if (!canUseV2(session)) redirect("/calculator");
  return (
    <div className="min-h-screen bg-ink-50">
      <SavedQuotes previewing={Boolean(session.previewingStaff)} staff={!seesWorking(session)} />
    </div>
  );
}
