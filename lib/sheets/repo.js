// Team Sheets repo — online spreadsheets stored in Supabase (team_sheets).
// Saves go through the save_team_sheet RPC so two editors can't silently
// overwrite each other: the RPC compares the caller's base version and only
// writes when it matches (compare-and-swap). On a stale base it hands back
// the current row with matched=false and the API surfaces a 409.

import { dbSelect, dbInsert, dbUpdate, dbRPC } from "../db/supabase.js";

const LIST_SELECT = "id,name,version,archived,created_by,created_at,updated_by,updated_at";

export function emptySheetData() {
  return { cells: {}, rows: 100, cols: 26, colWidths: {} };
}

export async function listSheets() {
  return dbSelect("team_sheets", {
    select: LIST_SELECT,
    filter: { archived: "eq.false" },
    order: "updated_at.desc",
    limit: 200,
  });
}

export async function getSheet(id) {
  const rows = await dbSelect("team_sheets", {
    select: "*",
    filter: { id: `eq.${id}`, archived: "eq.false" },
    limit: 1,
  });
  return rows[0] || null;
}

export async function createSheet({ name, createdByEmail }) {
  return dbInsert("team_sheets", {
    name: (name || "").trim() || "Untitled sheet",
    data: emptySheetData(),
    created_by: createdByEmail || null,
    updated_by: createdByEmail || null,
  });
}

// Returns { sheet, conflict }. On conflict, `sheet` is the CURRENT server
// copy (someone else saved since the caller loaded) — the client reloads it.
export async function saveSheet({ id, baseVersion, data, name, email }) {
  const rows = await dbRPC("save_team_sheet", {
    p_id: id,
    p_base_version: baseVersion,
    p_data: data,
    p_name: name || null,
    p_email: email || null,
  });
  const row = rows[0];
  if (!row) return { sheet: null, conflict: false };
  return { sheet: row, conflict: row.matched === false };
}

export async function renameSheet(id, name, email) {
  return dbUpdate("team_sheets", "id", id, {
    name: (name || "").trim() || "Untitled sheet",
    updated_by: email || null,
    updated_at: new Date().toISOString(),
  });
}

export async function archiveSheet(id, email) {
  return dbUpdate("team_sheets", "id", id, {
    archived: true,
    updated_by: email || null,
    updated_at: new Date().toISOString(),
  });
}
