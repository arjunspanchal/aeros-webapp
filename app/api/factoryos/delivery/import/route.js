import { getSession, requireInternal } from "@/lib/auth/session";
import { importPoLines } from "@/lib/factoryos/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { clientId, rows: [{ poNumber, poDate, sku, ordered, received, rate }] }
// Reconciles open-PO lines into jobs (update existing by PO#+SKU, create
// missing). Internal staff only — this writes/creates jobs.
export async function POST(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireInternal(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const clientId = body.clientId;
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!clientId) return Response.json({ error: "clientId required" }, { status: 400 });
  if (!rows.length) return Response.json({ error: "No rows to import" }, { status: 400 });
  if (rows.length > 1000) return Response.json({ error: "Too many rows (max 1000)" }, { status: 413 });

  try {
    const results = await importPoLines(clientId, rows, { email: session.email || null });
    const summary = results.reduce(
      (acc, r) => {
        acc[r.action] = (acc[r.action] || 0) + 1;
        return acc;
      },
      { created: 0, updated: 0, skipped: 0, error: 0 },
    );
    return Response.json({ results, summary });
  } catch (e) {
    console.error("delivery import failed:", e);
    return Response.json({ error: e?.message || "Import failed" }, { status: 500 });
  }
}
