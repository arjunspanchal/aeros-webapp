// Brand Managers — the list comes from the Users table filtered to the
// `account_manager` role. Every Aeros brand manager is also an Orders account
// manager, so this endpoint avoids a parallel table and keeps the Users
// directory the single source of truth.

import { getSession, requireManager } from "@/lib/auth/session";
import { airtableList, airtableCreate, escapeFormula, TABLES } from "@/lib/factoryos/airtable";
import { normalizeEmail } from "@/lib/hub/auth";
import { ROLES } from "@/lib/factoryos/constants";

export const runtime = "nodejs";

export async function GET() {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  try {
    const rows = await airtableList(TABLES.users(), {
      filterByFormula: `AND(LOWER({Role})='${ROLES.ACCOUNT_MANAGER}', {Active})`,
      sort: [{ field: "Name", direction: "asc" }],
    });
    const brandManagers = rows
      .map((r) => ({ id: r.id, name: r.fields.Name || "", email: r.fields.Email || "" }))
      .filter((bm) => bm.email);
    return Response.json({ brandManagers });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

export async function POST(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireManager(session)) return new Response("Forbidden", { status: 403 });
  try {
    const body = await req.json();
    const name = String(body.name || "").trim();
    const email = normalizeEmail(body.email || "");
    if (!name) return Response.json({ error: "Name required" }, { status: 400 });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "Valid email required" }, { status: 400 });
    }

    // Dedup by email — someone with this email may already be in the Users
    // table under another role. In that case the admin should promote them
    // via /admin/access rather than quietly overwriting the role.
    const existing = await airtableList(TABLES.users(), {
      filterByFormula: `LOWER({Email})='${escapeFormula(email)}'`,
      maxRecords: 1,
    });
    if (existing[0]) {
      const row = existing[0];
      const currentRole = (row.fields.Role || "").toLowerCase();
      if (currentRole && currentRole !== ROLES.ACCOUNT_MANAGER) {
        return Response.json(
          { error: `${email} already exists as "${currentRole}". Change their role via /admin/access first.` },
          { status: 409 }
        );
      }
      return Response.json({
        brandManager: { id: row.id, name: row.fields.Name || name, email: row.fields.Email || email },
      });
    }

    const created = await airtableCreate(TABLES.users(), {
      Email: email,
      Name: name,
      Role: ROLES.ACCOUNT_MANAGER,
      Active: true,
      Created: new Date().toISOString(),
    });
    return Response.json({
      brandManager: {
        id: created.id,
        name: created.fields.Name || name,
        email: created.fields.Email || email,
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
