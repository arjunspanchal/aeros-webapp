import { NextResponse } from "next/server";
import { studioGuard } from "../../../_access";
import { DAILY_CAP_INR, getLiveRules, startTurn, spentTodayInr, userKey } from "@/lib/design/artwork-studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Only starts the turn (uploads + session + message); the work runs on
// Anthropic's hosted agent and the job page's poll syncs it.
export const maxDuration = 60;

// POST { message? } — start the first run, or send a change request / answer.
export async function POST(request, { params }) {
  const { session, job, error } = await studioGuard(params.id);
  if (error) return error;
  const body = await request.json().catch(() => ({}));
  const message = String(body.message || "").trim().slice(0, 4000);

  if (job.status === "running") return NextResponse.json({ error: "Already working on it" }, { status: 409 });
  const first = !job.session_id;
  if (!first && !message) return NextResponse.json({ error: "Type what you want changed" }, { status: 400 });
  if (first && !job.rule_version_id && !(await getLiveRules())) {
    return NextResponse.json({ error: "The Studio rules haven't been published yet — ask Arjun." }, { status: 409 });
  }
  let allowanceInr = null;                 // admins: a fixed per-session cap instead
  if (!session.isAdmin) {
    const spent = await spentTodayInr(userKey(session));
    allowanceInr = DAILY_CAP_INR - spent;
    if (allowanceInr <= 0) {
      return NextResponse.json(
        { error: `Today's limit of ₹${DAILY_CAP_INR} is used up (₹${spent.toFixed(0)} spent). It resets at midnight, or ask Arjun.` },
        { status: 429 },
      );
    }
  }
  const r = await startTurn(job.id, { userText: message || null, allowanceInr });
  if (r.status === "failed") return NextResponse.json({ error: r.error || "Could not start" }, { status: 500 });
  return NextResponse.json({ ok: true, status: "running" }, { status: 202 });
}
