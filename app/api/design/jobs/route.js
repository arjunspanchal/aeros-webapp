import { getSession, requireInternal } from "@/lib/auth/session";
import { listJobsForSession } from "@/lib/factoryos/repo";
import { ROLES } from "@/lib/factoryos/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Design tool's job picker: staff only. A slim list - what is needed to find a job and name it - and never a rate.
export async function GET() {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireInternal(session)) return new Response("Forbidden", { status: 403 });
  try {
    const jobs = await listJobsForSession({ role: ROLES.ADMIN }); // every job: the page itself is staff only
    return Response.json({ jobs: jobs.slice(0, 600).map((j) => ({ id: j.id, jNumber: j.jNumber, brand: j.brand, item: j.item || j.masterProductName || "", itemSize: j.itemSize || "", stage: j.stage || "", printer: j.printingVendor || "" })) });
  } catch (e) { console.error(e); return Response.json({ error: "Could not load the jobs." }, { status: 500 }); }
}
