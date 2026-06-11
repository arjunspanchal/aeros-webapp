import { getSession } from "@/lib/auth/session";
import { resolveJobAccess } from "@/lib/factoryos/jobAccess";
import { postJobMessage } from "@/lib/factoryos/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — customer presses "Reorder this item" on a past job. We don't have a
// self-service RFQ flow yet, so this just drops a system message in the
// thread so the Aeros team picks it up like any other request. Optional
// `qty` and `note` come through if the customer overrode them.
export async function POST(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { job, access } = await resolveJobAccess(session, params.id);
  if (!job || !access) return Response.json({ error: "Not found" }, { status: 404 });
  if (access !== "customer") {
    return Response.json({ error: "Only the customer can request a reorder." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const qty = Number.isFinite(body.qty) && body.qty > 0 ? Math.floor(body.qty) : job.qty;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";

  const lines = [
    `Customer requested a reorder of J# ${job.jNumber} — ${job.item}${job.brand ? ` (${job.brand})` : ""}.`,
    qty ? `Quantity: ${qty.toLocaleString("en-IN")} pcs.` : null,
    note ? `Customer note: ${note}` : null,
    "Same specs as the original unless told otherwise.",
  ].filter(Boolean);

  try {
    await postJobMessage({
      jobId: job.id,
      body: lines.join("\n"),
      authorEmail: session.email || null,
      authorRole: "customer",
      kind: "system",
    });
    return Response.json({ ok: true });
  } catch (e) {
    console.error("customer reorder failed:", e);
    return Response.json({ error: "Could not submit reorder request" }, { status: 500 });
  }
}
