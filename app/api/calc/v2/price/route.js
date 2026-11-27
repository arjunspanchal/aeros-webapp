// Price a spec. All pricing happens here, on the server, with the live rate book.
import { getSession } from "@/lib/auth/session";
import { canUseV2, priceFor, MAX_LINES } from "@/lib/calc-v2/server";

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
    // { specs: [...] } prices a whole quote list in one call.
    if (Array.isArray(body?.specs)) {
      if (body.specs.length > MAX_LINES) return Response.json({ error: `Up to ${MAX_LINES} lines at a time` }, { status: 400 });
      return Response.json({ results: (await priceFor(session, body.specs)).shown });
    }
    return Response.json((await priceFor(session, [body?.spec ?? {}])).shown[0]);
  } catch (e) {
    console.error("/api/calc/v2/price failed:", e);
    return Response.json({ ok: false, errors: [e.message || "Pricing failed"] }, { status: 500 });
  }
}
