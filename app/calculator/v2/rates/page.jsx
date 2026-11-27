import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { seesWorking } from "@/lib/calc-v2/server";
import RateBook from "./RateBook";

export const metadata = { title: "Rate book · Aeros" };

export default function RateBookPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!seesWorking(session)) redirect("/calculator/v2");
  return (
    <div className="min-h-screen bg-ink-50">
      <RateBook />
    </div>
  );
}
