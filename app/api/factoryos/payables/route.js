import { getSession, requireInternal } from "@/lib/auth/session";
import { listPayables } from "@/lib/factoryos/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/factoryos/payables?status= — all vendor invoices with job + vendor
// context, for the team payables view. Internal staff only.
export async function GET(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireInternal(session)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const status = new URL(req.url).searchParams.get("status") || null;
  try {
    const invoices = await listPayables({ status });
    return Response.json({ invoices });
  } catch (e) {
    console.error("payables list failed:", e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
