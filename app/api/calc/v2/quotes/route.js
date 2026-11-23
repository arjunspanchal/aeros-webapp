// Save and list calculator v2 quotes. A save re-prices the spec on the server;
// cost and price in the request are ignored.
import { getSession } from "@/lib/auth/session";
import { canUseV2, saveQuote, listQuotes } from "@/lib/calc-v2/server";

export const runtime = "nodejs";

export async function GET() {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!canUseV2(session)) return new Response("Forbidden", { status: 403 });
  try {
    return Response.json({ quotes: await listQuotes() });
  } catch (e) {
    console.error("/api/calc/v2/quotes GET failed:", e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}

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
  // One item ({ spec }) or a whole quote list ({ lines: [{ spec, ref }] }).
  const lines = Array.isArray(body?.lines) ? body.lines : body?.spec ? [{ spec: body.spec }] : [];
  if (!lines.length || lines.some((l) => !l?.spec?.family)) return Response.json({ error: "Nothing to save" }, { status: 400 });
  try {
    const out = await saveQuote(
      { lines, customer: String(body.customer || "").trim(), brand: String(body.brand || "").trim(), notes: String(body.notes || "").trim() },
      session,
    );
    return Response.json(out, { status: out.ok ? 200 : 422 });
  } catch (e) {
    console.error("/api/calc/v2/quotes POST failed:", e);
    return Response.json({ ok: false, errors: [e.message || "Save failed"] }, { status: 500 });
  }
}
