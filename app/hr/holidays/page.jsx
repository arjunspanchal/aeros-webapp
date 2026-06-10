import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, hasModule } from "@/lib/auth/session";
import { listHolidays } from "@/lib/factoryos/repo";
import { currentMonthKeyIST } from "@/lib/factoryos/hr";
import HolidaysAdmin from "./HolidaysAdmin";

export const dynamic = "force-dynamic";

export default async function HolidaysPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!hasModule(session, "hr")) redirect("/hub");

  const year = currentMonthKeyIST().slice(0, 4);
  // Show this year + next year so HR can plan ahead.
  const holidays = await listHolidays({ from: `${year}-01-01`, to: `${Number(year) + 1}-12-31` });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/hr" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400">
          ← HR
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-4 dark:text-white">Holidays</h1>
        <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
          Company paid holidays. These are non-working days — they&apos;re excluded from
          attendance gap reminders and are paid in full (never docked from salary).
        </p>
        <HolidaysAdmin initialHolidays={holidays} />
      </main>
    </div>
  );
}
