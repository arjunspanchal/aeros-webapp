// Reject oversized request bodies BEFORE req.json() reads the whole payload
// into memory, so a vendor (or anyone) can't exhaust server memory by POSTing a
// giant JSON body ahead of the in-handler size check (audit M1).
//
// File uploads arrive base64-encoded inside JSON: base64 inflates the raw bytes
// by ~33%, and the JSON envelope (field names, quoting) adds a little more, so
// the Content-Length ceiling is the raw-file limit × ~1.4 plus a fixed slack.
//
// Returns true when the request is definitely too large. A missing/zero
// Content-Length returns false — the handler's own decoded-size check is the
// backstop for chunked/unknown-length bodies.
export function bodyTooLarge(req, maxRawBytes) {
  const len = Number(req.headers?.get?.("content-length") || 0);
  if (!len || !Number.isFinite(len)) return false;
  return len > Math.ceil(maxRawBytes * 1.4) + 64 * 1024;
}
