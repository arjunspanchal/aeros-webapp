// College placement-cell outreach tracker. Sits above the Hiring board and
// feeds the internship funnel — each college's applicant count is matched on
// internship_applications.source (case-insensitive), and active colleges
// populate the public form's "how did you hear" picker.
import { dbSelect, dbInsert, dbUpdate, dbDelete } from "@/lib/db/supabase.js";

export const COLLEGE_STATUSES = ["to_contact", "contacted", "in_talks", "active", "declined"];

export const COLLEGE_STATUS_LABEL = {
  to_contact: "To contact",
  contacted: "Contacted",
  in_talks: "In talks",
  active: "Active",
  declined: "Declined",
};

function norm(row) {
  return {
    id: row.id,
    createdAt: row.created_at || null,
    collegeName: row.college_name || "",
    course: row.course || "",
    contactName: row.contact_name || "",
    contactEmail: row.contact_email || "",
    contactPhone: row.contact_phone || "",
    city: row.city || "",
    status: row.status || "to_contact",
    lastContacted: row.last_contacted || null,
    owner: row.owner || "",
    notes: row.notes || "",
    applicantCount: 0, // filled in by listColleges
  };
}

// Field mapping shared by create + update. Only keys present in `data` are
// written, so PATCH is a true partial update.
function toRow(data, { partial } = {}) {
  const out = {};
  const map = {
    collegeName: "college_name",
    course: "course",
    contactName: "contact_name",
    contactEmail: "contact_email",
    contactPhone: "contact_phone",
    city: "city",
    status: "status",
    lastContacted: "last_contacted",
    owner: "owner",
    notes: "notes",
  };
  for (const [k, col] of Object.entries(map)) {
    if (!partial || k in data) {
      const v = data[k];
      out[col] = v === "" || v === undefined ? null : v;
    }
  }
  if ("collegeName" in out && out.college_name) out.college_name = String(out.college_name).trim();
  return out;
}

// List colleges with a per-college internship applicant count. One extra query
// tallies application sources, matched case-insensitively to college names.
export async function listColleges() {
  const rows = await dbSelect("college_outreach", { select: "*", order: "created_at.asc" });
  const colleges = rows.map(norm);

  let apps = [];
  try {
    apps = await dbSelect("internship_applications", { select: "source" });
  } catch {
    apps = [];
  }
  const counts = new Map();
  for (const a of apps) {
    const key = String(a.source || "").trim().toLowerCase();
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }
  for (const c of colleges) {
    c.applicantCount = counts.get(c.collegeName.trim().toLowerCase()) || 0;
  }
  return colleges;
}

export async function createCollege(data) {
  if (!String(data.collegeName || "").trim()) throw new Error("College name is required");
  const row = await dbInsert("college_outreach", toRow(data), { returning: "representation" });
  return norm(Array.isArray(row) ? row[0] : row);
}

export async function updateCollege(id, patch) {
  const out = toRow(patch, { partial: true });
  out.updated_at = new Date().toISOString();
  if ("status" in out && out.status && !COLLEGE_STATUSES.includes(out.status)) {
    throw new Error("Invalid status");
  }
  const row = await dbUpdate("college_outreach", "id", id, out, { returning: "representation" });
  return norm(Array.isArray(row) ? row[0] : row);
}

export async function deleteCollege(id) {
  await dbDelete("college_outreach", "id", id);
  return { ok: true };
}

// Active college names for the public form's source picker. Safe: returns [] on
// any error so the public /internship page never breaks if this table/creds
// are unavailable. Excludes declined so stale targets don't clutter the list.
export async function listCollegeNamesSafe() {
  try {
    const rows = await dbSelect("college_outreach", {
      select: "college_name,status",
      order: "college_name.asc",
    });
    return rows
      .filter((r) => r.status !== "declined" && String(r.college_name || "").trim())
      .map((r) => r.college_name.trim());
  } catch {
    return [];
  }
}
