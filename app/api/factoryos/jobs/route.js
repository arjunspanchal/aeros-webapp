import { getSession, requireInternal, requireManager, requireRole } from "@/lib/auth/session";
import { listJobsForSession, createJob, getNextJobNumber } from "@/lib/factoryos/repo";
import { STAGES } from "@/lib/factoryos/constants";

export const runtime = "nodejs";

// Audit H3: two operators creating jobs at the same moment both got the
// same auto-computed J# (e.g. "2605002") — the second submit died with an
// opaque 500 from a PG 23505 unique-violation. j_number is UNIQUE at the
// DB so the right fix is to catch the collision, recompute the next
// sequence, and retry. After MAX_J_NUMBER_RETRIES we surface a 409 with
// a clear message instead of the 500.
const MAX_J_NUMBER_RETRIES = 3;

function isJNumberCollision(err) {
  const msg = String(err?.message || "");
  return msg.includes("23505") && msg.toLowerCase().includes("j_number");
}

async function createJobWithCollisionRetry(body) {
  // Copy body so retry's jNumber mutation doesn't surprise the caller.
  const attempt = { ...body };
  for (let i = 0; i < MAX_J_NUMBER_RETRIES; i++) {
    try {
      return await createJob({ stage: STAGES[0], ...attempt });
    } catch (e) {
      if (!isJNumberCollision(e)) throw e;
      if (i === MAX_J_NUMBER_RETRIES - 1) {
        const collision = new Error(
          "Couldn't assign a J# — another operator may be creating jobs at the same time. Please retry.",
        );
        collision.status = 409;
        collision.code = "j_number_collision";
        throw collision;
      }
      attempt.jNumber = await getNextJobNumber();
    }
  }
}

export async function GET() {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  try {
    // listJobsForSession reads .role / .userId / .clientIds. Build the
    // legacy shape inline from the unified session — keeps the helper
    // signature unchanged.
    const jobs = await listJobsForSession({
      role: session.modules?.factoryos,
      userId: session.factoryosUserId,
      clientIds: session.factoryosClientIds,
    });
    return Response.json({ jobs });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

export async function POST(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireInternal(session)) return new Response("Forbidden", { status: 403 });
  // Allow admin / factory manager / account manager to create jobs.
  // FE is shop-floor and shouldn't open new jobs; CUSTOMER is already
  // blocked by requireInternal().
  if (!requireManager(session) && !requireRole(session, "factoryos", "account_manager")) {
    return Response.json({ error: "Only admin, factory manager or account manager can create jobs" }, { status: 403 });
  }
  try {
    const body = await req.json();
    if (!body.jNumber || !body.clientId || !body.item) {
      return Response.json({ error: "J#, client, and item are required" }, { status: 400 });
    }
    // Every new job must map to a row in Aeros Products Master so FG inventory can be tracked by SKU.
    if (!body.masterSku || !String(body.masterSku).trim()) {
      return Response.json(
        { error: "Pick a product from the master catalogue — required so this job maps to an SKU." },
        { status: 400 },
      );
    }
    if (body.stage && !STAGES.includes(body.stage)) {
      return Response.json({ error: "Invalid stage" }, { status: 400 });
    }
    // Category used to be CATEGORIES.includes()-gated, but that hardcoded
    // list (Paper Bag / Paper Cups / Food Box / Tub / Other) didn't match
    // the actual catalog taxonomy (Cups / Lids / Take Out Containers / …)
    // — so any non-overlapping catalog value got rejected, forcing the UI
    // gate to silently fall back to a default. Source of truth is the
    // catalog. Just require a non-empty trimmed string up to a sane cap.
    // Audit finding C6.
    if (body.category !== undefined && body.category !== null) {
      const c = String(body.category).trim();
      if (c.length > 80) {
        return Response.json({ error: "Category too long" }, { status: 400 });
      }
      body.category = c || undefined;
    }
    const job = await createJobWithCollisionRetry(body);
    return Response.json({ job });
  } catch (e) {
    if (e instanceof Response) return e;
    // J# collision after retries → 409. Anything else is unexpected → 500.
    if (e && e.code === "j_number_collision") {
      return Response.json({ error: e.message, code: e.code }, { status: e.status || 409 });
    }
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
