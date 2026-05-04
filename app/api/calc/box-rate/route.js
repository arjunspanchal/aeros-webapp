// Server-side box rate calculation. Mirrors /api/calc/rate for bags. For
// clients, margin + discount are read from the Clients table and applied
// server-side; the paper rate is taken from a conservative default env
// until per-paper rates are wired up (the bag calc's Jodhani/Om Shivaay
// tables are mill-specific and do not apply to box stocks).
import { calculate, computeRateCurve, optimizationTips, isCorrugated, defaultCorrugatedLayers } from "@/lib/calc/box-calculator";
import { getSession, requireRole } from "@/lib/auth/session";
import { currentClientPricing } from "@/lib/calc/user-directory";

export const runtime = "nodejs";

export async function POST(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const body = await req.json();
  const isClient = requireRole(session, "calculator", "client");
  const isAdmin = requireRole(session, "calculator", "admin");

  const corrugated = isCorrugated(body.boxType);

  // Clients don't supply paper rate, conversion rates, or wastage overrides.
  const paperRate = isClient
    ? Number(process.env.DEFAULT_BOX_PAPER_RATE || 70)
    : Number(body.paperRate) || 0;
  const corrugationRate = isClient
    ? Number(process.env.DEFAULT_CORRUGATION_RATE || 25)
    : Number(body.corrugationRate) || 0;
  const stitchingPerCarton = isClient
    ? Number(process.env.DEFAULT_STITCHING_PER_CARTON || 1.5)
    : Number(body.stitchingPerCarton) || 0;

  // For clients, seed layers server-side from defaults so they don't have to
  // supply a full BOM. Admin sends the full layers array from the form.
  let layers = Array.isArray(body.layers) ? body.layers : [];
  if (corrugated && isClient) {
    const defaultPaperRate = Number(process.env.DEFAULT_BOX_PAPER_RATE || 70);
    layers = defaultCorrugatedLayers(Number(body.ply) || 3).map((l) => ({
      ...l,
      paperRate: defaultPaperRate * (l.kind === "flute" ? 0.9 : 1),
    }));
  }

  // The legacy calc cookie carried the user's margin_pct as a fallback.
  // The unified hub session doesn't currently expose that field, so the
  // fallback chain falls through to env / 15. The live
  // currentClientPricing(email) lookup wins in practice — same Users table
  // that minted the cookie value.
  const fallbackMargin = Number(process.env.DEFAULT_CLIENT_MARGIN ?? 15);
  const { marginPct, discountPct } = isClient
    ? await currentClientPricing(session.email, fallbackMargin)
    : { marginPct: Number(body.profitPercent) || 10, discountPct: Number(body.discountPct) || 0 };

  const inputs = {
    boxType: body.boxType,
    openLength: Number(body.openLength) || 0,
    openWidth: Number(body.openWidth) || 0,
    gsm: Number(body.gsm) || 0,
    paperRate,
    ply: Number(body.ply) || 3,
    flute: body.flute || "B",
    layers,
    corrugationRate,
    stitchingPerCarton,
    qty: Number(body.qty) || 10000,
    printing: !!body.printing,
    colours: Number(body.colours) || 1,
    coverage: Number(body.coverage) || 30,
    punching: !!body.punching,
    punchingDieCost: Number(body.punchingDieCost) || 0,
    punchingPerPiece: Number(body.punchingPerPiece) || 0,
    innerPackRate: Number(body.innerPackRate) || 0,
    innerPackQty: Number(body.innerPackQty) || 0,
    outerCartonRate: Number(body.outerCartonRate) || 0,
    boxesPerCarton: Number(body.boxesPerCarton) || 0,
    customWastage: isClient ? "" : (body.customWastage ?? ""),
    profitPercent: marginPct,
  };

  if (inputs.openLength <= 0 || inputs.openWidth <= 0) {
    return Response.json({ error: "Open size is required." }, { status: 400 });
  }
  if (corrugated) {
    if (!inputs.layers.length) return Response.json({ error: "Corrugated layers are required." }, { status: 400 });
    if (inputs.layers.some((l) => !Number(l.gsm) || !Number(l.paperRate))) {
      return Response.json({ error: "Each layer needs a GSM and rate." }, { status: 400 });
    }
  } else if (inputs.gsm <= 0 || inputs.paperRate <= 0) {
    return Response.json({ error: "GSM and paper rate are required." }, { status: 400 });
  }

  const rawResult = calculate(inputs);
  const rawCurve = computeRateCurve(inputs);

  // Apply client discount to the selling price across all qty tiers (mirrors /api/calc/rate).
  const discountFactor = discountPct ? (1 - discountPct / 100) : 1;
  const result = discountPct
    ? { ...rawResult, sellingPrice: Math.round(rawResult.sellingPrice * discountFactor * 10000) / 10000 }
    : rawResult;
  const curve = discountPct
    ? rawCurve.map((c) => ({
        ...c,
        ratePerBox: Math.round(c.ratePerBox * discountFactor * 10000) / 10000,
        orderTotal: Math.round(c.ratePerBox * discountFactor * c.qty * 100) / 100,
      }))
    : rawCurve;

  // `role` in the response payload preserves the legacy calc-cookie shape
  // (the box UI reads this to decide which fields to render).
  const payload = { result, curve, role: session.modules.calculator ?? null, discountPct };
  if (isAdmin) {
    payload.tips = optimizationTips(inputs, result);
  } else {
    // Strip internal cost breakdown for clients.
    payload.result = { sellingPrice: result.sellingPrice, wkg: result.wkg };
  }
  return Response.json(payload);
}
