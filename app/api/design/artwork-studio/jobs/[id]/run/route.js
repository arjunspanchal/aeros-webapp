import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { studioGuard } from "../../../_access";
import { DAILY_CAP_INR, getLiveRules, runTurn, spentTodayInr } from "@/lib/design/artwork-studio";
import { dbUpdate } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A turn runs in the background after the 202; the runner parks itself
// (continue_pending) before this limit and the client's poll resumes it.
export const maxDuration = 800;

// POST { message? } — start the first run, send a change request, or resume
// a parked run ({ resume: true }).
export async function POST(request, { params }) {
  const { session, job, error } = await studioGuard(params.id);
  if (error) return error;
  const body = await request.json().catch(() => ({}));
  const resume = !!body.resume;
  const message = String(body.message || "").trim().slice(0, 4000);

  if (resume) {
    if (!job.continue_pending) return NextResponse.json({ ok: true, status: job.status });
  } else {
    if (job.status === "running") return NextResponse.json({ error: "Already working on it" }, { status: 409 });
    const first = (job.messages || []).length === 0;
    if (!first && !message) return NextResponse.json({ error: "Type what you want changed" }, { status: 400 });
    if (first && !job.rule_version_id && !(await getLiveRules())) {
      return NextResponse.json({ error: "The Studio rules haven't been published yet — ask Arjun." }, { status: 409 });
    }
    if (!session.isAdmin) {
      const spent = await spentTodayInr(session.email);
      if (spent >= DAILY_CAP_INR) {
        return NextResponse.json(
          { error: `Today's limit of ₹${DAILY_CAP_INR} is used up (₹${spent.toFixed(0)} spent). It resets at midnight, or ask Arjun.` },
          { status: 429 },
        );
      }
    }
  }

  // Claim the job before the background work starts so a double click 409s.
  await dbUpdate("artwork_studio_jobs", "id", job.id, {
    status: "running",
    continue_pending: false,
    progress: resume ? "Continuing…" : "Starting…",
    updated_at: new Date().toISOString(),
  }, { returning: "minimal" });

  waitUntil(
    runTurn(job.id, { userText: message || null, resume, budgetMs: (maxDuration - 120) * 1000 })
      .catch((e) => console.error("artwork-studio run", job.id, e)),
  );
  return NextResponse.json({ ok: true, status: "running" }, { status: 202 });
}
