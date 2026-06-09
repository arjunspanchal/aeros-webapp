import { getSession } from "@/lib/auth/session";
import { resolveJobAccess } from "@/lib/factoryos/jobAccess";
import { listJobThread, postJobMessage, deleteJobMessage, markThreadRead } from "@/lib/factoryos/repo";

export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024;
// Text/HTML and executables are the only hard blocks; print files (PDF/AI/EPS/
// ZIP) and images otherwise pass — browsers send octet-stream for many.
const BLOCKED = new Set(["text/html", "application/x-msdownload", "application/x-sh"]);

// GET — full thread for the job, and stamp it read for the caller's side.
export async function GET(_req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { job, access } = await resolveJobAccess(session, params.id);
  if (!job) return Response.json({ error: "Not found" }, { status: 404 });
  if (!access) return Response.json({ error: "Forbidden" }, { status: 403 });

  const thread = await listJobThread(job.id);
  await markThreadRead(job.id, access === "vendor" ? "vendor" : "team").catch(() => {});
  return Response.json({ thread });
}

// POST — add a message (text and/or a single file attachment).
export async function POST(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { job, access } = await resolveJobAccess(session, params.id);
  if (!job) return Response.json({ error: "Not found" }, { status: 404 });
  if (!access) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const text = typeof body.body === "string" ? body.body.trim() : "";
  const { filename, contentType, fileBase64 } = body;
  if (!text && !fileBase64) {
    return Response.json({ error: "Message or file required" }, { status: 400 });
  }

  const authorRole = access === "vendor" ? "vendor" : "team";
  // Default the file kind by who's posting: team artwork, vendor proof. A
  // caller can override (e.g. 'challan') but only to an allowed value.
  let kind = "message";
  if (fileBase64) {
    const requested = body.kind;
    const allowed = new Set(["artwork", "proof", "challan"]);
    kind = allowed.has(requested) ? requested : authorRole === "vendor" ? "proof" : "artwork";
    if (kind === "artwork" && authorRole !== "team") kind = "proof";
  }

  if (fileBase64) {
    if (BLOCKED.has((contentType || "").toLowerCase())) {
      return Response.json({ error: "Unsupported file type" }, { status: 400 });
    }
    const rawBytes = Math.floor((fileBase64.length * 3) / 4);
    if (rawBytes > MAX_BYTES) {
      return Response.json({ error: "File too large. Max 25 MB." }, { status: 413 });
    }
  }

  try {
    await postJobMessage({
      jobId: job.id,
      body: text,
      authorEmail: session.email || null,
      authorRole,
      kind,
      filename,
      contentType,
      fileBase64,
    });
    // Posting counts as reading everything before it.
    await markThreadRead(job.id, authorRole).catch(() => {});
    const thread = await listJobThread(job.id);
    return Response.json({ thread });
  } catch (e) {
    console.error("thread post failed:", e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

// DELETE ?messageId=… — remove one message. Team can delete any on its jobs;
// a vendor can only delete its own messages.
export async function DELETE(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { job, access } = await resolveJobAccess(session, params.id);
  if (!job) return Response.json({ error: "Not found" }, { status: 404 });
  if (!access) return Response.json({ error: "Forbidden" }, { status: 403 });

  const messageId = new URL(req.url).searchParams.get("messageId");
  if (!messageId) return Response.json({ error: "messageId required" }, { status: 400 });

  const thread = await listJobThread(job.id);
  const target = thread.find((m) => m.id === messageId);
  if (!target) return Response.json({ error: "Message not on this job" }, { status: 404 });
  if (access === "vendor" && target.authorRole !== "vendor") {
    return Response.json({ error: "You can only delete your own messages" }, { status: 403 });
  }

  try {
    await deleteJobMessage(messageId);
    const refreshed = await listJobThread(job.id);
    return Response.json({ thread: refreshed });
  } catch (e) {
    console.error("thread delete failed:", e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
