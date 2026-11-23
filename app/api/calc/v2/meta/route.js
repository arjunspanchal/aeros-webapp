// Everything the v2 screen needs to draw its forms: the bag paper catalogue
// with landed rates, and the live rate book.
import { getSession } from "@/lib/auth/session";
import { canUseV2, bagPapers, rateBook } from "@/lib/calc-v2/server";

export const runtime = "nodejs";

export async function GET() {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!canUseV2(session)) return new Response("Forbidden", { status: 403 });
  try {
    const [papers, rates] = await Promise.all([bagPapers(), rateBook()]);
    return Response.json({ papers, rates });
  } catch (e) {
    console.error("/api/calc/v2/meta failed:", e);
    return Response.json({ error: e.message || "Failed to load calculator data" }, { status: 500 });
  }
}
