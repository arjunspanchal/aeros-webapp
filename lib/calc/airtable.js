// Backward-compatible Calculator-base client over Supabase. Same surface as
// the legacy Airtable wrapper; underneath everything is Supabase via
// lib/db/airtableShim.js.

export { airtableList, airtableCreate, airtableUpdate, airtableDelete } from "../db/airtableShim.js";

export const TABLES = {
  bagSpecs: () => "Bag Specs",
  // The five legacy quote tables (Quotes / Box / Cup / PP / Import) were
  // removed once each calculator finished cutting over to quotes_v2. New
  // routes hit dbInsert/dbUpdate("quotes_v2", …) directly — no shim needed.
  clients: () => "Clients", // legacy — calc clients now live in unified Users table
  otp: () => "OTP Codes",
};

export function escapeFormula(v) {
  return String(v).replace(/'/g, "\\'");
}
