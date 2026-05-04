// Returns Paper Cup SKUs from Aeros Products Master, bucketed by wall type
// and oz bucket. Used by the client cup calculator to populate the Dimensions
// dropdown with real SKU-backed options instead of hardcoded defaults.

import { getSession } from "@/lib/auth/session";
import { fetchCupDimOptions } from "@/lib/calc/cup-products";

export const runtime = "nodejs";

export async function GET() {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  try {
    const options = await fetchCupDimOptions();
    return Response.json(options);
  } catch (err) {
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
