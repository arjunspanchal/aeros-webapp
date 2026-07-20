// Internship applications — public intake + internal HR review.
// The public form (/internship) writes here via the service-role key; the HR
// view (/hr/internships) reads/updates. Resumes live in the private `resumes`
// Storage bucket; we store the object path in `resume_url` and hand HR a
// short-lived signed URL on read (never a public link).
import { dbSelect, dbInsert, dbUpdate } from "@/lib/db/supabase.js";
import { uploadToBucket, signStorageUrl, safeFilename } from "@/lib/db/storage.js";

export const RESUME_BUCKET = "resumes";

// Enum-like values, mirrored from the table's CHECK constraints. Keeping them
// here lets the form + HR filters share one source of truth.
export const INTERNSHIP_TRACKS = [
  "Supply Chain & Operations",
  "Management",
  "E-commerce Sales",
];

export const INTERNSHIP_STATUSES = [
  "new",
  "shortlisted",
  "interviewing",
  "offered",
  "rejected",
];

// Resume upload limits (raw decoded bytes).
export const RESUME_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const RESUME_CONTENT_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const RESUME_EXT = { "application/pdf": "pdf", "application/msword": "doc", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx" };

function normApplication(row) {
  return {
    id: row.id,
    createdAt: row.created_at || null,
    fullName: row.full_name || "",
    email: row.email || "",
    phone: row.phone || "",
    college: row.college || "",
    degreeSpecialization: row.degree_specialization || "",
    graduationYear: row.graduation_year != null ? Number(row.graduation_year) : null,
    preferredTrack: row.preferred_track || "",
    availableStartDate: row.available_start_date || null,
    canCommit6Months: row.can_commit_6_months,
    canWorkBhiwandiOffice: row.can_work_bhiwandi_office,
    resumeUrl: row.resume_url || null, // storage path (not a browser-usable URL)
    linkedinUrl: row.linkedin_url || "",
    note: row.note || "",
    source: row.source || "",
    status: row.status || "new",
  };
}

// Validate + normalise the public form payload. Returns { data } or { error }.
// Pure — no I/O — so both the API route and any tests can reuse it.
export function validateApplication(input = {}) {
  const s = (v) => String(v == null ? "" : v).trim();
  const fullName = s(input.fullName);
  const email = s(input.email);
  const phone = s(input.phone);
  const college = s(input.college);
  const degreeSpecialization = s(input.degreeSpecialization);
  const preferredTrack = s(input.preferredTrack);
  const gradRaw = s(input.graduationYear);

  const missing = [];
  if (!fullName) missing.push("full name");
  if (!email) missing.push("email");
  if (!phone) missing.push("phone");
  if (!college) missing.push("college");
  if (!degreeSpecialization) missing.push("degree / specialization");
  if (!gradRaw) missing.push("graduation year");
  if (!preferredTrack) missing.push("preferred track");
  if (missing.length) return { error: `Please fill in: ${missing.join(", ")}.` };

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Please enter a valid email address." };

  const graduationYear = Number(gradRaw);
  if (!Number.isInteger(graduationYear) || graduationYear < 1990 || graduationYear > 2100) {
    return { error: "Please enter a valid graduation year." };
  }
  if (!INTERNSHIP_TRACKS.includes(preferredTrack)) return { error: "Please pick a valid track." };

  const availableStartDate = s(input.availableStartDate) || null;
  if (availableStartDate && !/^\d{4}-\d{2}-\d{2}$/.test(availableStartDate)) {
    return { error: "Available start date is invalid." };
  }

  const boolOrNull = (v) => (v === true || v === "true" || v === "yes" ? true : v === false || v === "false" || v === "no" ? false : null);

  return {
    data: {
      full_name: fullName,
      email,
      phone,
      college,
      degree_specialization: degreeSpecialization,
      graduation_year: graduationYear,
      preferred_track: preferredTrack,
      available_start_date: availableStartDate,
      can_commit_6_months: boolOrNull(input.canCommit6Months),
      can_work_bhiwandi_office: boolOrNull(input.canWorkBhiwandiOffice),
      linkedin_url: s(input.linkedinUrl) || null,
      note: s(input.note) || null,
      source: s(input.source) || null,
    },
  };
}

// Upload a resume (base64) to the private bucket. Returns the object path, or
// null if no file was provided. Throws on an unsupported type / oversized file.
export async function uploadResume({ fileBase64, contentType, filename }) {
  if (!fileBase64) return null;
  if (!RESUME_CONTENT_TYPES.includes(contentType)) {
    throw new Error("Resume must be a PDF or Word document.");
  }
  const bytes = Buffer.from(fileBase64, "base64");
  if (bytes.byteLength > RESUME_MAX_BYTES) throw new Error("Resume is too large (max 5 MB).");
  const ext = RESUME_EXT[contentType] || "bin";
  const stem = safeFilename((filename || "resume").replace(/\.[^.]+$/, "")).slice(0, 60) || "resume";
  const path = `${new Date().getFullYear()}/${Date.now()}-${stem}.${ext}`;
  const up = await uploadToBucket({ bucket: RESUME_BUCKET, path, contentType, bytes });
  return up.path;
}

// Insert a validated application. `resumePath` is the storage object path.
export async function createApplication(data, resumePath = null) {
  const row = await dbInsert(
    "internship_applications",
    { ...data, resume_url: resumePath, status: "new" },
    { returning: "representation" },
  );
  return normApplication(Array.isArray(row) ? row[0] : row);
}

// List for the HR view, with optional track/status filters. Signs each resume
// path into a short-lived download URL.
export async function listApplications({ track, status } = {}) {
  const filter = {};
  if (track && INTERNSHIP_TRACKS.includes(track)) filter.preferred_track = `eq.${track}`;
  if (status && INTERNSHIP_STATUSES.includes(status)) filter.status = `eq.${status}`;
  const rows = await dbSelect("internship_applications", {
    select: "*",
    filter,
    order: "created_at.desc",
  });
  return Promise.all(
    rows.map(async (r) => {
      const app = normApplication(r);
      app.resumeUrl = r.resume_url ? await signStorageUrl(RESUME_BUCKET, r.resume_url, 3600).catch(() => null) : null;
      return app;
    }),
  );
}

export async function updateApplicationStatus(id, status) {
  if (!INTERNSHIP_STATUSES.includes(status)) throw new Error("Invalid status.");
  const row = await dbUpdate("internship_applications", "id", id, { status }, { returning: "representation" });
  return normApplication(Array.isArray(row) ? row[0] : row);
}

// Count by status — small badge for the HR overview.
export async function countApplications(filter = {}) {
  const rows = await dbSelect("internship_applications", { select: "id", filter });
  return rows.length;
}
