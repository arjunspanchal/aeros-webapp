import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, hasModule } from "@/lib/auth/session";
import { listCandidates } from "@/lib/factoryos/repo";
import { listApplications } from "@/lib/hr/internships";
import { listColleges } from "@/lib/hr/colleges";
import HiringBoard from "./HiringBoard";
import CollegeOutreach from "./CollegeOutreach";

export const dynamic = "force-dynamic";

export default async function HiringPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!hasModule(session, "hr")) redirect("/hub");

  // Two intake streams share one board: full-time candidates (hiring_candidates)
  // and internship applications from the public /internship form. College
  // outreach (placement cells we're contacting) sits above them as the funnel's
  // top.
  const [candidates, internships, colleges] = await Promise.all([
    listCandidates(),
    listApplications(),
    listColleges(),
  ]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Link href="/hr" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400">
              ← HR
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 mt-4 dark:text-white">Hiring</h1>
            <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
              Full-time candidates (WorkIndia, Internshala, referrals, walk-ins) and internship
              applications from the public form, in one pipeline. Drag a card to move it through the
              stages; mark a full-timer Hired to add them to the roster.
            </p>
          </div>
          <div className="shrink-0 mt-1 flex flex-wrap gap-2">
            <Link
              href="/hr/internship-kit"
              title="Edit the highlights + FAQ on the public application form"
              className="px-3 py-2 bg-white border border-gray-200 rounded-md hover:border-gray-300 text-sm dark:bg-gray-900 dark:border-gray-800"
            >
              Edit internship kit
            </Link>
            <a
              href="/internship"
              target="_blank"
              rel="noreferrer"
              title="Public internship application form — share this link with candidates"
              className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
            >
              Internship form ↗
            </a>
          </div>
        </div>
        <CollegeOutreach initial={colleges} />
        <HiringBoard initial={candidates} internships={internships} />
      </main>
    </div>
  );
}
