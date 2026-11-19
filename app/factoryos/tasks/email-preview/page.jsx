import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, requireManager } from "@/lib/auth/session";
import { dbSelect } from "@/lib/db/supabase";
import { getTask, listTasks } from "@/lib/factoryos/tasks";
import { buildTaskEmail, getTaskEmailSettings } from "@/lib/factoryos/taskEmails";

export const dynamic = "force-dynamic";
export const metadata = { title: "Task email preview — FactoryOS" };

// Shows exactly what the "task given to you" email looks like, without
// sending anything. ?task=<id> picks a task; otherwise the newest open one
// that has someone's name on it.
export default async function TaskEmailPreviewPage({ searchParams }) {
  const session = getSession();
  if (!session) redirect("/login");
  if (!requireManager(session)) redirect("/factoryos/tasks");

  let task = typeof searchParams?.task === "string" ? await getTask(searchParams.task) : null;
  if (!task) {
    const all = await listTasks();
    task = all.filter((t) => t.status !== "done" && t.assigneeId).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null;
  }
  const settings = await getTaskEmailSettings();
  if (!task) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-2xl font-bold text-gray-900">Task email preview</h1>
        <p className="mt-2 text-sm text-gray-600">There is no open task with someone&apos;s name on it to preview.</p>
      </main>
    );
  }
  const person = task.assigneeId ? (await dbSelect("users", { select: "name,email", filter: { id: `eq.${task.assigneeId}` }, limit: 1 }))[0] : null;
  const mail = buildTaskEmail({ task, assigneeName: person?.name || "", actorName: task.createdByName, reason: "assigned" });
  const row = "grid grid-cols-[72px_1fr] gap-2 py-1 text-sm";
  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <Link href="/factoryos/tasks" className="inline-block py-2 -my-2 text-xs text-gray-500 hover:text-blue-700">← Tasks</Link>
      <h1 className="mt-2 text-2xl font-bold text-gray-900">Task email preview</h1>
      <p className="mt-1 text-sm text-gray-600">
        This is what the person gets when a task is given to them. Nothing is sent from this page.
        Email alerts are currently <b>{settings.enabled ? "on" : "off"}</b>.
      </p>
      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
        <div className={row}><span className="text-gray-500">From</span><span>Aeros FactoryOS &lt;factory@aeros-x.com&gt;</span></div>
        <div className={row}><span className="text-gray-500">To</span><span>{person ? `${person.name} <${person.email}>` : "nobody (task has no assignee)"}</span></div>
        <div className={row}><span className="text-gray-500">Subject</span><span className="font-medium">{mail.subject}</span></div>
      </div>
      <iframe title="Email as the person sees it" srcDoc={mail.html} className="mt-3 h-[640px] w-full rounded-xl border border-gray-200 bg-white" />
    </main>
  );
}
