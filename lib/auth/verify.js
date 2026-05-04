// Runtime-agnostic hub-cookie verifier — uses only WebCrypto + atob +
// TextEncoder. Safe in both the Node and edge runtimes.
//
// Phase 1.4a of auth unification: extracted so middleware (edge) and
// the lib/auth/edge.js adapter can import a verify path that doesn't
// pull in node:crypto. PR 1.4a does NOT migrate lib/auth/session.js
// to this async verifyToken — getSession remains synchronous and uses
// the existing lib/hub/auth.js#verifySession (Node, sync) so the ~50
// existing consumers from PRs 1.2 / 1.3a / 1.3b / 1.3c don't have to
// add `await` and risk silent regressions. Both verifiers operate on
// the same wire format and same SESSION_SECRET, so they validate the
// same cookies — they're functionally interchangeable, just on
// different runtimes.
//
// This module must NOT import next/headers, node:crypto, or Buffer.
//
// Wire format (unchanged from lib/hub/auth.js#signSession):
//   token = base64url(JSON.stringify(payload)) + "." + base64url(HMAC-SHA256(body))
//   payload includes an `exp` claim (unix seconds); expired tokens reject.

export const COOKIE_NAME = "aeros_hub_session";

// SESSION_SECRET is captured at module load. Same env var lib/hub/auth.js
// reads. Edge runtime supports `process.env` reads at module scope in
// Next.js 14, so this works in middleware. (If we ever want per-request
// override — e.g. for a key-rotation tier — pass `secret` explicitly to
// verifyToken; the default parameter re-reads `process.env.SESSION_SECRET`
// at call time as a fallback.)
export const SESSION_SECRET = process.env.SESSION_SECRET;

// URL-safe base64 → Uint8Array, no Buffer.
function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  // Pad to multiple of 4 — atob is strict on some runtimes.
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// URL-safe base64 → JSON-decoded payload object, no Buffer.
function b64urlToJson(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return JSON.parse(atob(padded));
}

// Verify the HMAC-SHA256 signature on a session token and return the
// decoded payload, or null on any failure. Async because WebCrypto's
// `subtle.verify` is Promise-based.
//
// `secret` defaults to the env var at call time (re-read each invocation
// so a late-set env doesn't get baked into a stale capture).
export async function verifyToken(token, secret = process.env.SESSION_SECRET || SESSION_SECRET) {
  if (!token || typeof token !== "string") return null;
  if (!secret) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;

  let key;
  try {
    key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
  } catch {
    return null;
  }

  let sigBytes;
  try {
    sigBytes = b64urlToBytes(sig);
  } catch {
    return null;
  }

  let ok = false;
  try {
    ok = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      new TextEncoder().encode(body),
    );
  } catch {
    return null;
  }
  if (!ok) return null;

  let payload;
  try {
    payload = b64urlToJson(body);
  } catch {
    return null;
  }

  if (payload && payload.exp && payload.exp * 1000 < Date.now()) return null;
  return payload;
}
