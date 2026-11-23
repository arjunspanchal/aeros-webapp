// Price a spec. All pricing happens here, on the server, with the live rate book.
import { getSession } from "@/lib/auth/session";
import { canUseV2, priceSpec } from "@/lib/calc-v2/server";

export const runtime = "nodejs";

export async function POST(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!canUseV2(session)) return new Response("Forbidden", { status: 403 });
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    return Response.json(await priceSpec(body?.spec ?? {}));
  } catch (e) {
    console.error("/api/calc/v2/price failed:", e);
    return Response.json({ ok: false, errors: [e.message || "Pricing failed"] }, { status: 500 });
  }
}
