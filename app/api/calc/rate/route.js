// Server-side rate calculation. For clients, the profit % is taken from
// their users record (live lookup via currentClientPricing) and never from
// the request body. This keeps the margin hidden from the front-end.
import { calculate, computeRateCurve, optimizationTips, lookupPaperRate } from "@/lib/calc/calculator";
import { getSession, requireRole } from "@/lib/auth/session";
import { currentClientPricing } from "@/lib/calc/user-directory";
import { fetchPaperRMTables, lookupRMPaperRate } from "@/lib/calc/rmRates";

function applyDiscount(curve, discountPct) {
  if (!discountPct) return curve;
  const factor = 1 - discountPct / 100;
  return curve.map((c) => ({
    ...c,
    ratePerBag: Math.round(c.ratePerBag * factor * 10000) / 10000,
    orderTotal: Math.round(c.ratePerBag * factor * c.qty * 100) / 100,
    costPerCase: Math.round(c.ratePerBag * factor * (c.orderTotal && c.qty ? c.orderTotal / c.qty / c.ratePerBag : 1) * 100) / 100,
  }));
}

export const runtime = "nodejs";

export async function POST(req) {
  try {
    return await handle(req);
  } catch (err) {
    console.error("/api/calc/rate failed:", err);
    return Response.json({ error: err?.message || "Calculator error" }, { status: 500 });
  }
}

async function handle(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const body = await req.json();
  const isClient = requireRole(session, "calculator", "client");
  const isAdmin = requireRole(session, "calculator", "admin");

  // Clients never supply paper rate or wastage — both are derived server-side.
  // Try live RM Master first, fall back to the static tables in calculator.js.
  let paperRate = Number(body.paperRate) || 0;
  if (isClient) {
    let rmTables = null;
    try {
      rmTables = await fetchPaperRMTables();
    } catch (err) {
      console.error("fetchPaperRMTables failed, using static fallback:", err);
    }
    const live = lookupRMPaperRate(rmTables, {
      paperType: body.paperType, mill: body.mill,
      gsm: Number(body.gsm), bf: body.bf ? Number(body.bf) : null,
    });
    paperRate = live ?? lookupPaperRate({
      paperType: body.paperType, mill: body.mill,
      gsm: Number(body.gsm), bf: body.bf,
    });
  }

  // Hub session no longer carries margin_pct directly. The live
  // currentClientPricing(email) lookup is the source of truth; this
  // fallback is only reached when that lookup throws (Airtable shim
  // can't translate a filter, Supabase mis-config, etc.) — guard so a
  // directory hiccup doesn't 500 the whole calc.
  const fallbackMargin = Number(process.env.DEFAULT_CLIENT_MARGIN ?? 15);
  let marginPct, discountPct;
  if (isClient) {
    try {
      ({ marginPct, discountPct } = await currentClientPricing(session.email, fallbackMargin));
    } catch (err) {
      console.error("currentClientPricing failed, using fallback margin:", err);
      marginPct = fallbackMargin;
      discountPct = 0;
    }
  } else {
    marginPct = Number(body.profitPercent) || 10;
    discountPct = Number(body.discountPct) || 0;
  }

  const inputs = {
    bagType: body.bagType,
    width: Number(body.width) || 0,
    gusset: Number(body.gusset) || 0,
    height: Number(body.height) || 0,
    gsm: Number(body.gsm) || 0,
    paperRate,
    casePack: Number(body.casePack) || 1,
    orderQty: Number(body.orderQty) || 15000,
    // Admin may override; otherwise calculate.js applies rope=0.85 / flat=1.00 defaults.
    handleCost: body.handleCost !== undefined && body.handleCost !== "" ? Number(body.handleCost) : undefined,
    customWastage: isClient ? "" : (body.customWastage ?? ""),
    profitPercent: marginPct,
    printing: !!body.printing,
    colours: Number(body.colours) || 1,
    coverage: Number(body.coverage) || 30,
  };

  if (inputs.width <= 0 || inputs.height <= 0 || inputs.gsm <= 0 || inputs.paperRate <= 0) {
    return Response.json({ error: "Width, height, and GSM are required." }, { status: 400 });
  }

  // Compute raw result + curve (margin applied, discount not yet).
  const rawResult = calculate(inputs);
  const rawCurve = computeRateCurve(inputs);

  // Apply client discount to the selling price across all qty tiers.
  const discountFactor = discountPct ? (1 - discountPct / 100) : 1;
  const result = discountPct
    ? { ...rawResult, sellingPrice: Math.round(rawResult.sellingPrice * discountFactor * 10000) / 10000 }
    : rawResult;
  const curve = discountPct
    ? rawCurve.map((c) => ({
        ...c,
        ratePerBag: Math.round(c.ratePerBag * discountFactor * 10000) / 10000,
        costPerCase: Math.round(c.ratePerBag * discountFactor * inputs.casePack * 100) / 100,
        orderTotal: Math.round(c.ratePerBag * discountFactor * c.qty * 100) / 100,
      }))
    : rawCurve;

  // `role` in the response payload preserves the legacy calc-cookie shape
  // (the bag UI reads this to decide which fields to render). Sourcing it
  // from modules.calculator gives the same string ("admin" | "client").
  const payload = { result, curve, role: session.modules.calculator ?? null, discountPct };
  if (isAdmin) {
    payload.tips = optimizationTips(inputs, result);
  } else {
    // Strip internal cost breakdown for clients. They see final rates, weight, + box only.
    payload.result = {
      sellingPrice: result.sellingPrice,
      wkg: result.wkg,
      handleWeight: result.handleWeight,
      totalWeight: result.totalWeight,
      plateCost: result.plateCost,
      box: result.box,
    };
  }
  return Response.json(payload);
}
