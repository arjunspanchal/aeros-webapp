import { NextResponse } from "next/server";
import { studioGuard } from "../_access";
import { canApprove, createJob, listJobs, listNeedsApproval, PRODUCT_KEYS, LIDS } from "@/lib/design/artwork-studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/design/artwork-studio/jobs[?all=1] — own jobs; approvers may ask for all.
export async function GET(request) {
  const { session, error } = await studioGuard();
  if (error) return error;
  const q = new URL(request.url).searchParams;
  const all = q.get("all") === "1" && canApprove(session);
  try {
    if (q.get("queue") === "approval" && canApprove(session)) return NextResponse.json({ jobs: await listNeedsApproval() });
    return NextResponse.json({ jobs: await listJobs(session, { all }) });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST — create a draft job. Files are added one by one via /inputs, then /run.
export async function POST(request) {
  const { session, error } = await studioGuard();
  if (error) return error;
  const b = await request.json().catch(() => ({}));
  const brand = String(b.brand || "").trim();
  if (!PRODUCT_KEYS.has(b.productKey)) return NextResponse.json({ error: "Pick a product" }, { status: 400 });
  if (!brand) return NextResponse.json({ error: "Brand / customer name is required" }, { status: 400 });
  if (!["direct", "dealer"].includes(b.channel)) return NextResponse.json({ error: "Pick direct or dealer" }, { status: 400 });
  if (!LIDS.includes(b.lid)) return NextResponse.json({ error: "Pick a lid option" }, { status: 400 });
  try {
    const job = await createJob(session, {
      productKey: b.productKey,
      brand: brand.slice(0, 120),
      channel: b.channel,
      lid: b.lid,
      inks: String(b.inks || "").slice(0, 300),
      digitalSample: !!b.digitalSample,
      brief: String(b.brief || "").slice(0, 4000),
    });
    return NextResponse.json({ job: { id: job.id } });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
