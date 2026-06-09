// Punch-clock PIN hashing. PINs are short (4–6 digits) so they MUST be stored
// hashed + salted and never logged. scrypt (node:crypto) is deliberately slow,
// which — together with the login route's lockout after repeated failures —
// keeps a 4-digit space (10k combos) from being trivially brute-forced.
//
// Stored format: "<saltHex>:<hashHex>". verifyPin is constant-time.
import crypto from "node:crypto";

const SCRYPT_KEYLEN = 32;

export function isValidPin(pin) {
  return /^\d{4,6}$/.test(String(pin || ""));
}

export function hashPin(pin) {
  if (!isValidPin(pin)) throw new Error("PIN must be 4–6 digits");
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pin), salt, SCRYPT_KEYLEN);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPin(pin, stored) {
  if (!stored || typeof stored !== "string" || !stored.includes(":")) return false;
  if (!isValidPin(pin)) return false;
  const [saltHex, hashHex] = stored.split(":");
  let salt, expected;
  try {
    salt = Buffer.from(saltHex, "hex");
    expected = Buffer.from(hashHex, "hex");
  } catch {
    return false;
  }
  if (expected.length !== SCRYPT_KEYLEN) return false;
  const actual = crypto.scryptSync(String(pin), salt, SCRYPT_KEYLEN);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
