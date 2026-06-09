// Emission · Service OS — client config. Public values only (anon key is safe
// to ship to the browser; RLS + the emission_* DB roles are the wall).
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://smcfbapcsjhxaxigcpjj.supabase.co";
export const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtY2ZiYXBjc2poeGF4aWdjcGpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczOTA2NjQsImV4cCI6MjA5Mjk2NjY2NH0.RRlwwxxTGOVSr0eXLRbrEaNqWULxiqdnTTKrkgywDa0";

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
