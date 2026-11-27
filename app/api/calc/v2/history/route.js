// What this customer was quoted before, for each line of the quote on screen.
// Read-only. POST because the lines' specs are sent in the body.
import { getSession } from "@/lib/auth/session";
import { canUseV2, customerHistory, MAX_LINES, calcSession } from "@/lib/calc-v2/server";

export const runtime = "nodejs";

export async function POST(req) {
  const session = calcSession(getSession());
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!canUseV2(session)) return new Response("Forbidden", { status: 403 });
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const customer = String(body?.customer || "").trim().slice(0, 200);
  const specs = Array.isArray(body?.specs) ? body.specs.filter((s) => s?.family).slice(0, MAX_LINES) : [];
  try {
    return Response.json(await customerHistory(customer, specs));
  } catch (e) {
    console.error("/api/calc/v2/history failed:", e);
    return Response.json({ error: e.message || "Could not load earlier quotes" }, { status: 500 });
  }
}
