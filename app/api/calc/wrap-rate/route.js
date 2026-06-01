// Server-side wrap-paper rate calculation. Paper rate is always pulled from
// the master_papers Master (mills Pudumjee / BILT, stocks OGR or Bleach Kraft
// White) via the shared rmRates helpers — same source the bag calculator uses.
// For clients, margin + discount come from their Users record and never from
// the body; admins supply margin in the body and may override the paper rate.

import { computeWrapRateCurve, WRAP_MILLS, WRAP_PAPER_TYPES } from "@/lib/calc/wrap-paper-calculator";
import { getSession, requireRole } from "@/lib/auth/session";
import { currentClientPricing } from "@/lib/calc/user-directory";
import { fetchPaperRMTables, lookupRMPaperRate } from "@/lib/calc/rmRates";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    return await handle(req);
  } catch (err) {
    console.error("/api/calc/wrap-rate failed:", err);
    return Response.json({ error: err?.message || "Calculator error" }, { status: 500 });
  }
}

async function handle(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({}));
  const isClient = requireRole(session, "calculator", "client");
  const isAdmin = requireRole(session, "calculator", "admin");

  const mill = WRAP_MILLS.includes(body.mill) ? body.mill : WRAP_MILLS[0];
  const paperType = WRAP_PAPER_TYPES.includes(body.paperType) ? body.paperType : WRAP_PAPER_TYPES[0];
  const width = Number(body.width) || 0;
  const length = Number(body.length) || 0;
  const gsm = Number(body.gsm) || 0;

  if (width <= 0 || length <= 0 || gsm <= 0) {
    return Response.json({ error: "Sheet width, length and GSM are required." }, { status: 400 });
  }

  // Paper rate: always from Master. rmRates adds transport (₹5). Admin may pass
  // an explicit paperRate override as an escape hatch.
  let paperRate = isAdmin && Number(body.paperRate) > 0 ? Number(body.paperRate) : 0;
  let rateSource = paperRate ? "manual override" : null;
  if (!paperRate) {
    let rmTables = null;
    try {
      rmTables = await fetchPaperRMTables();
    } catch (err) {
      console.error("fetchPaperRMTables failed:", err);
    }
    paperRate = lookupRMPaperRate(rmTables, { paperType, mill, gsm, bf: null }) || 0;
    rateSource = "master";
  }

  if (paperRate <= 0) {
    return Response.json({
      error: `No Master rate for ${mill} / ${paperType}. Add the row to master_papers (or set its base rate).`,
    }, { status: 400 });
  }

  // Margin + discount: client's record wins; admin supplies via body.
  const fallbackMargin = Number(process.env.DEFAULT_CLIENT_MARGIN ?? 15);
  let marginPct, discountPct;
  if (isClient) {
    try {
      ({ marginPct, discountPct } = await currentClientPricing(session.email, fallbackMargin));
    } catch (err) {
      console.error("currentClientPricing failed, using fallback:", err);
      marginPct = fallbackMargin;
      discountPct = 0;
    }
  } else {
    marginPct = Number(body.margin) || fallbackMargin;
    discountPct = Number(body.discountPct) || 0;
  }

  const printing = ["Flexo", "Offset"].includes(body.printing) ? body.printing : "Plain";
  const colours = Math.max(0, Math.min(8, Number(body.colours) || (printing === "Plain" ? 0 : 1)));
  const coverage = [10, 30, 100].includes(Number(body.coverage)) ? Number(body.coverage) : 30;
  const casePack = [1000, 5000].includes(Number(body.casePack)) ? Number(body.casePack) : 1000;
  const orderQty = Math.max(1000, Number(body.orderQty) || 100000);

  const inputs = {
    width, length, gsm, paperRate,
    printing, colours, coverage,
    casePack, margin: marginPct,
  };

  const result = computeWrapRateCurve(inputs);

  // Apply client discount across all qty tiers.
  const factor = discountPct ? 1 - discountPct / 100 : 1;
  const curve = discountPct
    ? result.curve.map((c) => ({
        ...c,
        ratePerSheet: Math.round(c.ratePerSheet * factor * 10000) / 10000,
        ratePerCase: Math.round(c.ratePerSheet * factor * casePack * 100) / 100,
        orderTotal: Math.round(c.ratePerSheet * factor * c.qty * 100) / 100,
      }))
    : result.curve;

  const payload = {
    mill, paperType, width, length, gsm,
    printing: result.printing, colours: result.colours, coverage,
    casePack, orderQty,
    paperRate: result.paperRate, rateSource,
    weightG: result.weightG,
    marginPct: result.marginPct,
    discountPct,
    mfgPerSheet: result.mfgPerSheetBase,
    plateDieTotal: result.plateDieTotal,
    runSetup: result.runSetup,
    curve,
    role: session.modules?.calculator ?? (isAdmin ? "admin" : "client"),
  };

  // Clients see final rates + weight only; no internal cost breakdown.
  if (isClient) {
    payload.mfgPerSheet = undefined;
  }

  return Response.json(payload);
}
