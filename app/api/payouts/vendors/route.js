import { getSession, hasModule } from "@/lib/auth/session";
import { listPayoutVendors, createPayoutVendor } from "@/lib/payouts/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function guard(session) {
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!hasModule(session, "payouts")) return new Response("Forbidden", { status: 403 });
  return null;
}

export async function GET() {
  const session = getSession();
  const bad = guard(session);
  if (bad) return bad;
  try {
    const vendors = await listPayoutVendors();
    return Response.json({ vendors });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

// Add a vendor to the shared directory so it's reusable across the system.
export async function POST(req) {
  const session = getSession();
  const bad = guard(session);
  if (bad) return bad;
  try {
    const body = await req.json();
    const vendor = await createPayoutVendor({ name: body.name, type: body.type });
    return Response.json({ vendor });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 400 });
  }
}
