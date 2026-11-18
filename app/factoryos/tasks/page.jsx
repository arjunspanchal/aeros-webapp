import { redirect } from "next/navigation";
import { getSession, requireInternal, requireManager } from "@/lib/auth/session";
import { listTasks, listTaskPeople, listJobsForTaskPicker, sessionUser } from "@/lib/factoryos/tasks";
import TasksClient from "./TasksClient";

export const dynamic = "force-dynamic";

// Team task tracker (Arjun, 18-Nov-2026): everyone on the team sees every
// task, can add one for anybody, and can tie it to a job. Tasks pushed from
// Cowork chats (SQL add_task) land here too.
export default async function TasksPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!requireInternal(session)) redirect("/factoryos");

  const [tasks, people, jobs, me] = await Promise.all([
    listTasks(), listTaskPeople(), listJobsForTaskPicker(), sessionUser(session),
  ]);
  const isAdmin = session.isAdmin || session.modules?.factoryos === "admin";
  const today = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      <TasksClient
        initial={{ tasks, people, jobs, meId: me?.id || "", today }}
        canDeleteAny={requireManager(session)}
        defaultMine={!isAdmin}
      />
    </main>
  );
}
