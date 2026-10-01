// Password login for the printer one-pager (/printer). Printing vendors
// (Blue Line, Viana) get a single shared password per vendor, set by an
// Aeros admin; no email OTP, no accounts. Hashing = Node scrypt.

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { dbSelect, dbUpdate } from "@/lib/db/supabase";

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const test = scryptSync(String(password), salt, 64);
  const ref = Buffer.from(hash, "hex");
  return test.length === ref.length && timingSafeEqual(test, ref);
}

// Printing vendors that have portal access (a password set) — for the login
// dropdown. Never returns the hash.
export async function listPortalVendors() {
  const rows = await dbSelect("vendors", {
    select: "id,name",
    filter: { type: "eq.Printing", active: "eq.true", portal_password_hash: "not.is.null" },
    order: "name.asc",
  });
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

export async function findPortalVendor(vendorId) {
  const rows = await dbSelect("vendors", {
    select: "id,name,portal_password_hash,active,type",
    filter: { id: `eq.${vendorId}` },
    limit: 1,
  });
  return rows[0] || null;
}

export async function setPortalPassword(vendorId, password) {
  const p = String(password || "");
  if (p.length < 6) throw new Error("Password must be at least 6 characters");
  await dbUpdate("vendors", "id", vendorId, { portal_password_hash: hashPassword(p) }, { returning: "minimal" });
}

export async function clearPortalPassword(vendorId) {
  await dbUpdate("vendors", "id", vendorId, { portal_password_hash: null }, { returning: "minimal" });
}

export async function touchPortalLogin(vendorId) {
  await dbUpdate("vendors", "id", vendorId, { portal_last_login: new Date().toISOString() }, { returning: "minimal" }).catch(() => {});
}
