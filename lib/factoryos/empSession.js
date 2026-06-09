// HMAC-signed session cookie for the factory-worker punch clock (/hr/clock).
//
// This is deliberately SEPARATE from the hub session (aeros_hub_session) and
// the legacy per-module cookies. Employees are rows in the `employees` table,
// not `users`, so they have no email/entitlements and never get a hub session.
// They authenticate with phone + a PIN and carry only enough identity to
// punch their own attendance: { employeeId, name, phone }.
//
// Signed with the same SESSION_SECRET (HMAC-SHA256) as the other cookies, but
// under a distinct cookie name so the two auth worlds never collide. A worker
// holding this cookie can reach ONLY the clock surface — middleware lets the
// /hr/clock tree through, and every clock API route re-verifies this
// cookie itself.

import crypto from "node:crypto";

const COOKIE_NAME = "aeros_emp_session";
// Shorter than the 30-day hub session — a punch-clock device is shared and a
// worker who leaves should not stay signed in for a month. One week balances
// "don't re-OTP every shift" against "don't linger forever".
const SESSION_DAYS = 7;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET must be set and at least 16 chars");
  return s;
}

function b64url(buf) { return Buffer.from(buf).toString("base64url"); }
function b64urlDecode(s) { return Buffer.from(s, "base64url"); }

export function signEmpSession(payload) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  const body = b64url(JSON.stringify({ ...payload, exp }));
  const sig = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyEmpSession(token) {
  if (!token || typeof token !== "string") return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  // timingSafeEqual throws on length mismatch — guard so a malformed cookie
  // returns null instead of 500ing the route.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(b64urlDecode(body).toString("utf8"));
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function empSessionCookie(token) {
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  };
}

export function clearEmpCookie() {
  return {
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };
}

export const EMP_COOKIE = COOKIE_NAME;
