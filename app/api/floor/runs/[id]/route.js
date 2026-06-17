// Public — pause / resume / finish a running job from the operator page.
// PATCH body: { action: "pause" | "resume" | "finish", ...finish fields }.
import { pauseRun, resumeRun, finishRun, getRunById } from "@/lib/factoryos/floor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  try {
    const run = await getRunById(params.id);
    if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
    return Response.json({ run });
  } catch (e) {
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

export async function PATCH(req, { params }) {
  try {
    const b = await req.json().catch(() => ({}));
    const action = b.action;
    let run;
    if (action === "pause") {
      run = await pauseRun(params.id);
    } else if (action === "resume") {
      run = await resumeRun(params.id);
    } else if (action === "finish") {
      run = await finishRun({
        runId: params.id,
        goodPcs: b.goodPcs,
        wastePcs: b.wastePcs,
        consumedKg: b.consumedKg,
      });
    } else {
      return Response.json({ error: "Unknown action" }, { status: 400 });
    }
    return Response.json({ run });
  } catch (e) {
    console.error("floor run patch", e);
    return Response.json({ error: e.message || "Failed" }, { status: 400 });
  }
}
