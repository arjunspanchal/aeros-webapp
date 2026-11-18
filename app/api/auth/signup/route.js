// Self-service sign-up for a new rate-calculator client.
//
// Creates a Users row with Calculator Role = "Client", upserts a Clients row
// for their Company (so the same business also appears as a FactoryOS client
// for jobs, POs, etc.), links the two, then sends an OTP. The caller then
// POSTs to /api/auth/verify-otp to finish the login — no session is minted
// here.
//
// Guard-rails:
//  - refuse if an Active Users row already exists for that email
//  - revive an Inactive row in place (so re-inviting a lapsed client works)
//  - match Clients by case-insensitive Name so we don't spawn duplicate
//    "Acme" / "ACME" rows for the same company
//  - never grants Admin or FactoryOS roles

import { airtableCreate, airtableList, airtableUpdate, escapeFormula, TABLES } from "@/lib/factoryos/airtable";
import { generateOtp, normalizeEmail, sendOtpEmail } from "@/lib/hub/auth";

export const runtime = "nodejs";

const OTP_TTL_MINUTES = 10;

// Margin to seed on a brand-new self-service client. The runtime calc fallback
// already returns 15 when Margin % is null, but writing it onto the row makes
// the value visible to admins in /calculator/admin/clients (and survives any
// future change to the env-default). Same value covers bags / boxes / cups so
// the new client is consistent across calculators on day one.
const DEFAULT_SIGNUP_MARGIN_PCT = Number(process.env.DEFAULT_CLIENT_MARGIN || 15);

function validPhone(s) {
  if (!s) return true; // phone optional
  const digits = String(s).replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

// Ensure a Clients row exists for this company name; return its id. Matches
// by case-insensitive Name to avoid duplicates. New clients get Contact
// Person / Email / Phone populated from the signing-up user — an admin can
// later reassign the Brand Manager.
async function upsertClientForCompany({ company, contactPerson, contactEmail, contactPhone }) {
  const nameLc = company.trim().toLowerCase();
  const existing = await airtableList(TABLES.clients(), {
    filterByFormula: `LOWER({Name})='${escapeFormula(nameLc)}'`,
    maxRecords: 1,
  });
  if (existing[0]) return existing[0].id;
  const created = await airtableCreate(TABLES.clients(), {
    Name: company.trim(),
    "Contact Person": contactPerson || "",
    "Contact Email": contactEmail || "",
    "Contact Phone": contactPhone || "",
    Created: new Date().toISOString(),
  });
  return created.id;
}

// Self sign-up is closed: the app is for the Aeros team only (Arjun,
// 18-Nov-2026: "strictly for internal use only"). People are added by an admin
// under User Access. The old flow below is kept for reference but unreachable.
const SIGNUP_OPEN = false;

export async function POST(req) {
  if (!SIGNUP_OPEN) {
    return Response.json({ error: "Sign-up is closed. Ask an Aeros admin to add you." }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const company = String(body.company || "").trim();
  const location = String(body.location || "").trim();
  const email = normalizeEmail(body.email || "");
  const phone = String(body.phone || "").trim();

  if (!name) return Response.json({ error: "Name is required" }, { status: 400 });
  if (!company) return Response.json({ error: "Company name is required" }, { status: 400 });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Valid email is required" }, { status: 400 });
  }
  if (!validPhone(phone)) return Response.json({ error: "Phone looks invalid" }, { status: 400 });

  // 1. Ensure the Clients row exists (shared by FactoryOS + calc admin UI).
  const clientId = await upsertClientForCompany({
    company,
    contactPerson: name,
    contactEmail: email,
    contactPhone: phone,
  });

  // 2. Create / revive the Users row and link it to the Clients row.
  const existing = await airtableList(TABLES.users(), {
    filterByFormula: `LOWER({Email})='${escapeFormula(email)}'`,
    maxRecords: 1,
  });

  if (existing[0]) {
    const row = existing[0];
    const f = row.fields || {};
    const active = f.Active !== false;
    if (active) {
      return Response.json(
        { error: "An account with this email already exists. Use the Email tab to sign in." },
        { status: 409 },
      );
    }
    // Append the new client link while preserving any existing links.
    const existingClientIds = Array.isArray(f.Client) ? f.Client : [];
    const mergedClientIds = existingClientIds.includes(clientId)
      ? existingClientIds
      : [...existingClientIds, clientId];
    // Only seed the default margin if the row doesn't already have one — a
    // re-activated client that an admin already priced shouldn't get reset.
    const reviveFields = {
      Name: f.Name || name,
      Company: company,
      Country: location || undefined,
      Phone: phone || undefined,
      Active: true,
      "Calculator Role": "Client",
      Client: mergedClientIds,
    };
    if (typeof f["Margin %"] !== "number") reviveFields["Margin %"] = DEFAULT_SIGNUP_MARGIN_PCT;
    if (typeof f["Margin % Cups"] !== "number") reviveFields["Margin % Cups"] = DEFAULT_SIGNUP_MARGIN_PCT;
    await airtableUpdate(TABLES.users(), row.id, reviveFields);
  } else {
    await airtableCreate(TABLES.users(), {
      Email: email,
      Name: name,
      Company: company,
      Country: location || undefined,
      Phone: phone || undefined,
      Active: true,
      "Calculator Role": "Client",
      Client: [clientId],
      // Default margin so bag / box / cup quotes all use the same starting point
      // for a brand-new client. Admin can override per-row in /calculator/admin/clients.
      "Margin %": DEFAULT_SIGNUP_MARGIN_PCT,
      "Margin % Cups": DEFAULT_SIGNUP_MARGIN_PCT,
      Created: new Date().toISOString(),
    });
  }

  // 3. Mint + send OTP so the caller can proceed to /api/auth/verify-otp.
  const code = generateOtp();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60_000);
  await airtableCreate(TABLES.otp(), {
    Email: email,
    Code: code,
    "Expires At": expiresAt.toISOString(),
    Used: false,
    Created: now.toISOString(),
  });

  try {
    await sendOtpEmail({
      to: email,
      code,
      subjectPrefix: "Aeros — confirm your sign-up",
      ttlMinutes: OTP_TTL_MINUTES,
    });
  } catch (err) {
    console.error("Sign-up OTP email failed:", err);
    return Response.json({ error: "Could not send verification email. Try again." }, { status: 500 });
  }

  return Response.json({ ok: true });
}
