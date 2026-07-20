import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, hasModule } from "@/lib/auth/session";
import { getKitForEdit } from "@/lib/hr/internshipKit";
import KitEditor from "./KitEditor";

export const dynamic = "force-dynamic";

export default async function InternshipKitPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!hasModule(session, "hr")) redirect("/hub");

  const kit = await getKitForEdit();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/hr/hiring" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400">
          ← Hiring
        </Link>
        <div className="mt-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Internship kit</h1>
            <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
              Edit the highlight badges and FAQ shown on the public application page. Changes go live
              immediately — no redeploy.
            </p>
          </div>
          <a
            href="/internship"
            target="_blank"
            rel="noreferrer"
            className="shrink-0 mt-1 px-3 py-2 bg-white border border-gray-200 rounded-md hover:border-gray-300 text-sm dark:bg-gray-900 dark:border-gray-800"
          >
            View form ↗
          </a>
        </div>

        <KitEditor initial={kit} />
      </main>
    </div>
  );
}
