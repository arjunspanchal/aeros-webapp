// Admin CRUD for calculator clients. Writes land in the unified Users
// directory (Orders base); this endpoint's client-facing shape is unchanged
// so the /calculator/admin/clients UI works as-is.
import { getSession, requireRole } from "@/lib/auth/session";
import { normalizeEmail } from "@/lib/hub/auth";
import {
  listCalcClients, findAnyUserByEmail, createCalcClient,
  updateCalcClient, revokeCalcClient,
} from "@/lib/calc/user-directory";

export const runtime = "nodejs";

// Phase 1.3a: every handler reads from the unified hub session. The legacy
// requireAdmin helper is replaced by inline session + role checks against
// modules.calculator === "admin".

export async function GET() {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireRole(session, "calculator", "admin")) return new Response("Forbidden", { status: 403 });
  const clients = await listCalcClients();
  return Response.json(clients);
}

export async function POST(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireRole(session, "calculator", "admin")) return new Response("Forbidden", { status: 403 });
  const body = await req.json();
  const email = normalizeEmail(body.email);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Valid email is required" }, { status: 400 });
  }
  if (body.marginPct === undefined || body.marginPct === null || body.marginPct === "") {
    return Response.json({ error: "Margin % is required" }, { status: 400 });
  }

  // Upsert semantics — if an Orders-only user already has this email, we
  // grant them calc access on the same row (no duplicates).
  const existing = await findAnyUserByEmail(email);
  if (existing && (existing.fields?.["Calculator Role"])) {
    return Response.json({ error: "A client with that email already exists" }, { status: 409 });
  }
  const client = await createCalcClient({
    email,
    name: body.name,
    company: body.company,
    country: body.country,
    marginPct: body.marginPct,
    marginCupsPct: body.marginCupsPct,
    discountPct: body.discountPct,
    preferredCurrency: body.preferredCurrency,
    preferredUnit: body.preferredUnit,
    status: body.status || "Active",
    notes: body.notes,
  });
  return Response.json(client);
}

export async function PATCH(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireRole(session, "calculator", "admin")) return new Response("Forbidden", { status: 403 });
  const body = await req.json();
  if (!body.id) return Response.json({ error: "id required" }, { status: 400 });

  if (body.email !== undefined) {
    const email = normalizeEmail(body.email);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "Invalid email" }, { status: 400 });
    }
    const clash = await findAnyUserByEmail(email);
    if (clash && clash.id !== body.id) {
      return Response.json({ error: "Another user already uses that email" }, { status: 409 });
    }
    body.email = email;
  }

  const updated = await updateCalcClient(body.id, body);
  return Response.json(updated);
}

// Revoke calc access (the Orders row stays, keeping any orders history).
export async function DELETE(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireRole(session, "calculator", "admin")) return new Response("Forbidden", { status: 403 });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  await revokeCalcClient(id);
  return Response.json({ ok: true });
}
