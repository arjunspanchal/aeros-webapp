import { NextResponse } from "next/server";
import { getSession } from "@/lib/hub/session";
import { canUseStudio, canApprove, getJob } from "@/lib/design/artwork-studio";

// Shared guard: staff session, and for a job — its owner or an approver.
export async function studioGuard(jobId) {
  const session = getSession();
  if (!canUseStudio(session)) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!jobId) return { session };
  const job = await getJob(jobId);
  if (!job) return { error: NextResponse.json({ error: "Job not found" }, { status: 404 }) };
  if (job.created_by_email !== session.email && !canApprove(session)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session, job };
}
