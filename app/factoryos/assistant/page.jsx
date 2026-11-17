import { redirect } from "next/navigation";
import { getSession, requireManager } from "@/lib/auth/session";
import AssistantChat from "./AssistantChat";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assistant — FactoryOS" };

// Chat with the FactoryOS assistant: ask about jobs, add / change / remove
// them in plain English. Every change is confirmed with a button.
export default function AssistantPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!requireManager(session)) redirect("/factoryos");
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Assistant</h1>
        <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
          Ask about jobs or tell it what to change. Nothing changes until you press Confirm on a card.
        </p>
        <AssistantChat userName={session.name || ""} />
      </main>
    </div>
  );
}
