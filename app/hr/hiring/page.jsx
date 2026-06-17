import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, hasModule } from "@/lib/auth/session";
import { listCandidates } from "@/lib/factoryos/repo";
import HiringBoard from "./HiringBoard";

export const dynamic = "force-dynamic";

export default async function HiringPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!hasModule(session, "hr")) redirect("/hub");

  const candidates = await listCandidates();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/hr" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400">
          ← HR
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-4 dark:text-white">Hiring</h1>
        <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
          Candidate pipeline across WorkIndia, Internshala, referrals and walk-ins. Drag a card to move it
          through the stages; mark Hired to add them to the employee roster.
        </p>
        <HiringBoard initial={candidates} />
      </main>
    </div>
  );
}
