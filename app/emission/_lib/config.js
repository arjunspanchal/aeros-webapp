// Emission · Service OS — client config. Public values only (anon key is safe
// to ship to the browser; RLS + the emission_* DB roles are the wall).
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const REST_URL = `${SUPABASE_URL}/rest/v1`;
export const FN_URL = `${SUPABASE_URL}/functions/v1`;
export const STORAGE_URL = `${SUPABASE_URL}/storage/v1`;
export const SCHEMA = "emission";

// localStorage key for the minted session token (trusted-device persistence).
export const TOKEN_KEY = "emission_session_token";

export const BUCKETS = {
  intakePhotos: "emission-intake-photos",
  signatures: "emission-signatures",
  claimDocs: "emission-claim-docs",
};

export const isConfigured = () => Boolean(SUPABASE_URL && ANON_KEY);
