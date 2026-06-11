import { getSession } from "@/lib/auth/session";
import { resolveJobAccess } from "@/lib/factoryos/jobAccess";
import { bodyTooLarge } from "@/lib/factoryos/requestLimits";
import { listJobThread, postJobMessage, deleteJobMessage, markThreadRead } from "@/lib/factoryos/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024;
// Text/HTML and executables are the only hard blocks; print files (PDF/AI/EPS/
// ZIP) and images otherwise pass — browsers send octet-stream for many.
const BLOCKED = new Set(["text/html", "application/x-msdownload", "application/x-sh"]);

// GET — full thread for the job, and stamp it read for the caller's side.
export async function GET(_req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { job, access } = await resolveJobAccess(session, params.id);
  if (!job || !access) return Response.json({ error: "Not found" }, { status: 404 });

  const thread = await listJobThread(job.id);
  await markThreadRead(job.id, access).catch(() => {});
  return Response.json({ thread });
}

// POST — add a message (text and/or a single file attachment).
export async function POST(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  // Reject an oversized body before parsing it into memory (audit M1).
  if (bodyTooLarge(req, MAX_BYTES)) {
    return Response.json({ error: "File too large. Max 25 MB." }, { status: 413 });
  }
  const { job, access } = await resolveJobAccess(session, params.id);
  if (!job || !access) return Response.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const text = typeof body.body === "string" ? body.body.trim() : "";
  const { filename, contentType, fileBase64 } = body;
  if (!text && !fileBase64) {
    return Response.json({ error: "Message or file required" }, { status: 400 });
  }

  // access values: 'internal' | 'vendor' | 'customer'. Internal users post as
  // the Aeros team (single bubble identity on the thread).
  const authorRole =
    access === "vendor" ? "vendor" : access === "customer" ? "customer" : "team";
  // Default the file kind by who's posting: team artwork, vendor proof, customer
  // anything-they-attach as a plain message file. A caller can override (e.g.
  // 'challan') but only to an allowed value AND only the team can mark a file
  // as 'artwork' (the customer-approval workflow keys off team artwork posts).
  let kind = "message";
  if (fileBase64) {
    const requested = body.kind;
    const allowed = new Set(["artwork", "proof", "challan", "message"]);
    if (allowed.has(requested)) {
      kind = requested;
    } else {
      kind = authorRole === "vendor" ? "proof" : authorRole === "team" ? "artwork" : "message";
    }
    if (kind === "artwork" && authorRole !== "team") kind = "message";
    if (kind === "proof" && authorRole === "customer") kind = "message";
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
    return Response.json({ error: "Could not send message" }, { status: 500 });
  }
}

// DELETE ?messageId=… — remove one message. Team can delete any on its jobs;
// a vendor or customer can only delete their own messages.
export async function DELETE(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { job, access } = await resolveJobAccess(session, params.id);
  if (!job || !access) return Response.json({ error: "Not found" }, { status: 404 });

  const messageId = new URL(req.url).searchParams.get("messageId");
  if (!messageId) return Response.json({ error: "messageId required" }, { status: 400 });

  const thread = await listJobThread(job.id);
  const target = thread.find((m) => m.id === messageId);
  if (!target) return Response.json({ error: "Message not on this job" }, { status: 404 });
  if (access === "vendor" && target.authorRole !== "vendor") {
    return Response.json({ error: "You can only delete your own messages" }, { status: 403 });
  }
  if (access === "customer" && target.authorRole !== "customer") {
    return Response.json({ error: "You can only delete your own messages" }, { status: 403 });
  }

  try {
    await deleteJobMessage(messageId);
    const refreshed = await listJobThread(job.id);
    return Response.json({ thread: refreshed });
  } catch (e) {
    console.error("thread delete failed:", e);
    return Response.json({ error: "Could not delete message" }, { status: 500 });
  }
}
