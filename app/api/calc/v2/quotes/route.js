// Save and list calculator v2 quotes. A save re-prices the spec on the server;
// cost and price in the request are ignored.
import { getSession } from "@/lib/auth/session";
import { canUseV2, saveQuote, listQuotes, getQuote } from "@/lib/calc-v2/server";

export const runtime = "nodejs";

// GET lists saved quotes; GET ?ref=CALC-… returns one quote with its lines' specs.
export async function GET(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!canUseV2(session)) return new Response("Forbidden", { status: 403 });
  try {
    const ref = new URL(req.url).searchParams.get("ref");
    if (ref) {
      // a reference is letters, digits and dashes; anything else is not ours
      if (!/^[A-Za-z0-9-]{6,120}$/.test(ref)) return Response.json({ error: "Not a quote reference" }, { status: 400 });
      const quote = await getQuote(ref);
      return quote ? Response.json({ quote }) : Response.json({ error: "No such quote" }, { status: 404 });
    }
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
