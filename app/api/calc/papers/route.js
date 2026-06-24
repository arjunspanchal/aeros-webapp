// Role-aware paper catalogue for the bag calculators. Source of truth is the
// Supabase `master_papers` RM database — adding/editing a paper there flows
// straight into the calculator dropdowns with no code change.
//
// Bag-relevant types only (cup Cupstock / MG Bleached Kraft etc. are excluded).
// Unpriceable rows (null base/effective rate) are dropped so a user can never
// select a grade we can't quote. Admins get the rate fields; clients never do
// (margins stay server-side).
import { getSession, requireRole } from "@/lib/auth/session";
import { listMasterPapers } from "@/lib/paper-rm";

export const runtime = "nodejs";

const BAG_TYPES = new Set(["Brown Kraft", "Bleach Kraft White", "OGR", "MG"]);

export async function GET() {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const isAdmin = requireRole(session, "calculator", "admin");
  const isClient = requireRole(session, "calculator", "client");
  if (!isAdmin && !isClient) return new Response("Forbidden", { status: 403 });

  try {
    const all = await listMasterPapers();
    const papers = all
      .filter((p) => BAG_TYPES.has(p.type) && p.effectiveRate != null)
      .map((p) => {
        const base = {
          id: p.id,
          materialName: p.materialName,
          type: p.type,
          supplier: p.supplier,
          gsm: p.gsm ?? null,
          bf: p.bf ?? null,
          form: p.form || "",
        };
        // Clients never receive rate fields.
        return isAdmin
          ? { ...base, baseRate: p.baseRate, discount: p.discount ?? 0, effectiveRate: p.effectiveRate }
          : base;
      });
    return Response.json({ papers, role: isAdmin ? "admin" : "client" });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("/api/calc/papers failed:", e);
    return Response.json({ error: e.message || "Failed to load paper catalogue" }, { status: 500 });
  }
}
