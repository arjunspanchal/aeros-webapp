import { redirect } from "next/navigation";
import { getSession, requireInternal } from "@/lib/auth/session";
import { HOWTO, HOWTO_UPDATED } from "@/lib/factoryos/howto";

export const dynamic = "force-dynamic";
export const metadata = { title: "How to use FactoryOS" };

// Living guide for the floor — edit lib/factoryos/howto.js as the app changes.
export default function HowToPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!requireInternal(session)) redirect("/factoryos");
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">How to use FactoryOS</h1>
        <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">Five steps from order to warehouse. Updated {HOWTO_UPDATED}.</p>
        <div className="mt-6 space-y-4">
          {HOWTO.map((step) => (
            <section key={step.title} className="bg-white border border-gray-200 rounded-xl p-5 dark:bg-gray-900 dark:border-gray-800">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">{step.title}</h2>
                <span className="text-xs text-gray-500 dark:text-gray-400">{step.who}</span>
              </div>
              <ul className="mt-3 space-y-1.5 text-sm text-gray-700 dark:text-gray-300 list-disc pl-5">
                {step.lines.map((l, i) => <li key={i}>{l}</li>)}
              </ul>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
