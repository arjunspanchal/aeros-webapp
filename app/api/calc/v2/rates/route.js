// The rate book: list every rate, and set or clear an override.
import { getSession } from "@/lib/auth/session";
import { dbInsert, dbDelete } from "@/lib/db/supabase";
import { canUseV2, rateBook } from "@/lib/calc-v2/server";
import { DEFAULT_RATES } from "@/lib/quote-engine/rates/defaults.js";

export const runtime = "nodejs";

const STATUSES = new Set(["confirmed", "assumed", "disputed"]);

export async function GET() {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!canUseV2(session)) return new Response("Forbidden", { status: 403 });
  return Response.json({ rates: await rateBook() });
}

// PUT { key, value, status?, source? } sets an override; PUT { key, reset: true } clears it.
export async function PUT(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!canUseV2(session)) return new Response("Forbidden", { status: 403 });
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const key = String(body?.key || "");
  if (!DEFAULT_RATES[key]) return Response.json({ error: `Unknown rate "${key}"` }, { status: 400 });
  try {
    if (body.reset) {
      await dbDelete("calc_rates", "key", key);
    } else {
      const value = Number(body.value);
      if (!Number.isFinite(value) || value < 0) return Response.json({ error: "Value must be a number, zero or more" }, { status: 400 });
      const status = STATUSES.has(body.status) ? body.status : "confirmed";
      await dbInsert("calc_rates", {
        key, value, status,
        source: String(body.source || "").trim() || `set in the rate book by ${session.name || session.email || "admin"}`,
        updated_by: session.email || session.name || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "key", returning: "minimal" });
    }
    return Response.json({ rates: await rateBook() });
  } catch (e) {
    console.error("/api/calc/v2/rates PUT failed:", e);
    return Response.json({ error: e.message || "Could not save the rate" }, { status: 500 });
  }
}
