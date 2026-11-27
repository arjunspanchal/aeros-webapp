// Everything the v2 screen needs to draw its forms: the bag paper catalogue
// with landed rates, and the live rate book.
import { getSession } from "@/lib/auth/session";
import { canUseV2, seesWorking, bagPapers, rateBook, listCustomers, calcSession } from "@/lib/calc-v2/server";

export const runtime = "nodejs";

export async function GET() {
  const session = calcSession(getSession());
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!canUseV2(session)) return new Response("Forbidden", { status: 403 });
  try {
    // The customer list is a convenience: the screen still works without it.
    const admin = seesWorking(session);
    const [papers, rates, customers] = await Promise.all([bagPapers(), admin ? rateBook() : [], listCustomers().catch(() => [])]);
    return Response.json({
      staff: !admin,
      // staff pick a paper by grade and GSM; its rate stays on the server
      papers: admin ? papers : papers.map(({ exMill: _e, lane: _l, landed: _r, ...p }) => p),
      rates,
      // Staff pick from our client records only: no count of how often each was
      // quoted, and no name that exists only because an admin once quoted it.
      customers: admin ? customers.map((c) => ({ name: c.name, quoted: c.quoted })) : customers.filter((c) => c.clientId).map((c) => ({ name: c.name })),
    });
  } catch (e) {
    console.error("/api/calc/v2/meta failed:", e);
    return Response.json({ error: e.message || "Failed to load calculator data" }, { status: 500 });
  }
}
