// PackAI rate limiting (M0 — in-memory tier).
//
// Public, free AI endpoint ⇒ needs per-caller caps before anything else.
// This tier is a token bucket per client key (IP + optional session id),
// held in module scope. On serverless each warm instance keeps its own
// bucket, so the real-world cap is (limit × instances) — acceptable as a
// first brake. M1 adds the durable tier (advisor schema counters) on top.

const BUCKETS = new Map();

const WINDOW_MS = 60_000; // 1 minute
const MAX_PER_WINDOW = 10; // chat turns per key per minute
const MAX_BODY_CHARS = 8_000; // request payload guard
const SWEEP_EVERY = 500; // keys; opportunistic GC

let opCount = 0;

function sweep(now) {
  for (const [k, b] of BUCKETS) {
    if (now - b.start > WINDOW_MS * 2) BUCKETS.delete(k);
  }
}

/**
 * Returns { ok: true } or { ok: false, retryAfterS } for a caller key.
 */
export function checkRateLimit(key) {
  const now = Date.now();
  if (++opCount % SWEEP_EVERY === 0) sweep(now);

  let b = BUCKETS.get(key);
  if (!b || now - b.start > WINDOW_MS) {
    b = { start: now, count: 0 };
    BUCKETS.set(key, b);
  }
  b.count += 1;
  if (b.count > MAX_PER_WINDOW) {
    return { ok: false, retryAfterS: Math.ceil((b.start + WINDOW_MS - now) / 1000) };
  }
  return { ok: true };
}

/** Derive the limiter key from a Next.js Request. */
export function clientKey(req) {
  const fwd = req.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0].trim() || "unknown";
  return ip;
}

export const limits = { WINDOW_MS, MAX_PER_WINDOW, MAX_BODY_CHARS };
