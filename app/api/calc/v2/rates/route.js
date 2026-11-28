// The rate book: list every rate, and set or clear an override.
import { getSession } from "@/lib/auth/session";
import { dbInsert, dbDelete } from "@/lib/db/supabase";
import { seesWorking, rateBook } from "@/lib/calc-v2/server";
import { DEFAULT_RATES } from "@/lib/quote-engine/rates/defaults.js";

export const runtime = "nodejs";

const STATUSES = new Set(["confirmed", "assumed", "disputed"]);
// Rates the engine divides by, or uses as a limit: zero would break every quote.
const MUST_BE_POSITIVE = /^(cup\.fleet\.|cup\.cpm\.|cup\.overhead\.|export\.fx\.|export\.container\.40hc|box\.min_sheets|box\.locked_min_sheets|bag\.moq|bag\.gusset\.|bag\.case\.|bag\.bale\.pack|bag\.wastage\.long_run_qty|cup\.print\.offset_max_qty|wrap\.offset\.bundle_sheets|wrap\.offset\.min_sheets|wrap\.case\.max_kg|pp\.shift\.|pp\.mould\.life_shots|pp\.pack\.units_per_sleeve|pp\.pack\.case_pack)/;

export async function GET() {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!seesWorking(session)) return new Response("Forbidden", { status: 403 });
  return Response.json({ rates: await rateBook() });
}

// PUT { key, value, status?, source? } sets an override; PUT { key, reset: true } clears it.
export async function PUT(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!seesWorking(session)) return new Response("Forbidden", { status: 403 });
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
      // Number("") is 0, so a blank box must be refused before the conversion.
      if (body.value === "" || body.value === null || body.value === undefined) return Response.json({ error: "Enter a value" }, { status: 400 });
      const value = Number(body.value);
      if (!Number.isFinite(value) || value < 0) return Response.json({ error: "Value must be a number, zero or more" }, { status: 400 });
      if (value === 0 && MUST_BE_POSITIVE.test(key)) return Response.json({ error: "This rate is divided into every quote, so it cannot be zero" }, { status: 400 });
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
