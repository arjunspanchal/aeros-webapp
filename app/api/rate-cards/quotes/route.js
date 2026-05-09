// Unified quote-history feed for the rate-cards "Past Quotes" tab. Reads
// quotes_v2 across every client-facing quote_type (bag + cup) so the
// customer sees one chronological list of every rate they've ever been
// quoted — auto-synced, no manual import.
//
// Auth model:
//   • client → always scoped to their own email
//   • admin  → optional ?clientEmail=… filter; omit for the firm-wide feed

import { requireRateCardSession } from "@/lib/rate-cards/auth";
import { listClientQuoteHistory } from "@/lib/rate-cards/quote-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  let session;
  try { session = requireRateCardSession(); } catch (r) { return r; }

  const isAdmin = session.rateCardRole === "admin";
  const requestedEmail = new URL(req.url).searchParams.get("clientEmail");

  // Clients are always scoped to their own email; admin can pivot or omit.
  const clientEmail = isAdmin
    ? (requestedEmail || null)
    : session.email;

  try {
    const quotes = await listClientQuoteHistory({ clientEmail });
    return Response.json(quotes);
  } catch (err) {
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
