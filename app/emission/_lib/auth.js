// Emission · Service OS — PIN auth helpers (client). PINs are NEVER compared
// here — they go to the emission-verify-pin edge function, which verifies via
// in-DB bcrypt and returns a signed token. We only store/decode that token.
import { TOKEN_KEY, isConfigured } from "./config";
import { callFunction } from "./client";

// Decode a JWT payload (base64url) WITHOUT verifying — used only to read role +
// exp for UX routing. Real authorization is enforced by Postgres RLS on every
// call, so a tampered client-side role buys nothing.
export function decodeToken(token) {
  try {
    const body = token.split(".")[1];
    const json = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
    return json;
  } catch {
    return null;
  }
}

export function tokenSession(token) {
  if (!token) return null;
  const p = decodeToken(token);
  if (!p) return null;
  if (p.exp && p.exp * 1000 < Date.now()) return null; // expired -> re-prompt
  const role = p.emission_role; // 'staff' | 'admin'
  if (role !== "staff" && role !== "admin") return null;
  return { token, role, exp: p.exp, expiresAt: p.exp ? new Date(p.exp * 1000) : null };
}

export function loadSession() {
  if (typeof window === "undefined") return null;
  const token = window.localStorage.getItem(TOKEN_KEY);
  const session = tokenSession(token);
  if (!session && token) window.localStorage.removeItem(TOKEN_KEY); // clear expired/garbage
  return session;
}

export function storeToken(token) {
  if (typeof window !== "undefined") window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearSession() {
  if (typeof window !== "undefined") window.localStorage.removeItem(TOKEN_KEY);
}

// Submit a PIN. role is inferred from length by the caller (4 -> staff, 6 -> admin).
export async function verifyPin(role, pin) {
  // Client not wired up (e.g. NEXT_PUBLIC_SUPABASE_* missing on the deploy).
  if (!isConfigured()) {
    return { ok: false, error: "not_configured", message: "App not configured (Supabase URL missing). This is a setup step, not your PIN." };
  }

  let res;
  try {
    res = await callFunction("emission-verify-pin", { role, pin });
  } catch {
    return { ok: false, error: "network", message: "Can’t reach the login service. Check connection / setup — not your PIN." };
  }
  const { ok, status, data } = res;

  if (ok && data && data.token) {
    storeToken(data.token);
    return { ok: true, session: tokenSession(data.token) };
  }
  if (status === 429 || data?.error === "locked") {
    return { ok: false, error: "locked", message: data?.message || "Too many attempts. Try again in ~15 minutes." };
  }
  // Only a genuine 401 / invalid_pin is a wrong PIN. Everything else (server
  // misconfigured, schema not exposed, 404/5xx) is a SETUP issue — say so, so a
  // correct PIN isn't mistaken for a wrong one.
  if (status === 401 || data?.error === "invalid_pin") {
    return { ok: false, error: "invalid_pin", message: "Incorrect PIN." };
  }
  return {
    ok: false,
    error: data?.error || "server",
    message: "Login service isn’t ready yet (server setup pending) — not your PIN.",
  };
}
