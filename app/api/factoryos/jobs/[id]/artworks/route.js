import { getSession, requireInternal, requireRole } from "@/lib/auth/session";
import {
  getJob,
  getVendor,
  listJobArtworks,
  attachJobArtwork,
  deleteJobArtwork,
} from "@/lib/factoryos/repo";

export const runtime = "nodejs";

const ARTWORK_MAX_BYTES = 25 * 1024 * 1024; // print files (PDF/AI/EPS/ZIP) run large
const PROOF_MAX_BYTES = 15 * 1024 * 1024;
const PROOF_ALLOWED = new Set(["application/pdf", "image/jpeg", "image/png"]);
// Artwork is permissive: browsers send octet-stream for .ai/.cdr/.eps, so we
// gate on size rather than a strict allowlist for team uploads.
const ARTWORK_BLOCKED = new Set([
  "text/html",
  "application/x-msdownload",
  "application/x-sh",
]);

// Resolve the job and the caller's relationship to it.
//   access = "internal" → admin / FM / FE / AM (AM scoped to own clients)
//   access = "vendor"   → the printing vendor this job is assigned to
//   access = null       → no access
async function resolveAccess(session, jobId) {
  const job = await getJob(jobId);
  if (!job) return { job: null, access: null };

  if (requireInternal(session)) {
    if (requireRole(session, "factoryos", "account_manager")) {
      const myClients = new Set(session.factoryosClientIds || []);
      if (!job.clientIds.some((c) => myClients.has(c))) return { job, access: null };
    }
    return { job, access: "internal" };
  }

  if (requireRole(session, "factoryos", "vendor")) {
    const vendor = session.factoryosVendorId ? await getVendor(session.factoryosVendorId) : null;
    const vid = session.factoryosVendorId || null;
    const vn = (vendor?.name || "").trim().toLowerCase();
    const owns =
      (vid && job.printingVendorId === vid) ||
      (vn && (job.printingVendor || "").trim().toLowerCase() === vn);
    if (owns) return { job, access: "vendor" };
  }

  return { job, access: null };
}

// GET — list artworks + proofs for the job (internal or owning vendor).
export async function GET(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { job, access } = await resolveAccess(session, params.id);
  if (!job) return Response.json({ error: "Not found" }, { status: 404 });
  if (!access) return Response.json({ error: "Forbidden" }, { status: 403 });
  const artworks = await listJobArtworks(job.id);
  return Response.json({ artworks });
}

// POST — upload a file. Team uploads artwork; vendor (or team) uploads a proof.
export async function POST(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { job, access } = await resolveAccess(session, params.id);
  if (!job) return Response.json({ error: "Not found" }, { status: 404 });
  if (!access) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { filename, contentType, fileBase64 } = body;
  const kind = body.kind === "proof" ? "proof" : "artwork";
  if (!filename || !fileBase64) {
    return Response.json({ error: "filename and fileBase64 required" }, { status: 400 });
  }

  // Only the Aeros team posts artwork; proofs come from the vendor (team may
  // also attach one on the vendor's behalf).
  if (kind === "artwork" && access !== "internal") {
    return Response.json({ error: "Only the Aeros team can upload artwork" }, { status: 403 });
  }

  const ct = (contentType || "").toLowerCase();
  const maxBytes = kind === "proof" ? PROOF_MAX_BYTES : ARTWORK_MAX_BYTES;
  if (kind === "proof" && !PROOF_ALLOWED.has(ct)) {
    return Response.json({ error: "Proofs must be PDF, JPG, or PNG" }, { status: 400 });
  }
  if (kind === "artwork" && ARTWORK_BLOCKED.has(ct)) {
    return Response.json({ error: "Unsupported file type" }, { status: 400 });
  }
  const rawBytes = Math.floor((fileBase64.length * 3) / 4);
  if (rawBytes > maxBytes) {
    return Response.json({ error: `File too large. Max ${Math.round(maxBytes / 1024 / 1024)} MB.` }, { status: 413 });
  }

  try {
    await attachJobArtwork({
      jobId: job.id,
      kind,
      contentType,
      filename,
      fileBase64,
      uploadedByEmail: session.email || null,
      uploadedByRole: access,
    });
    const artworks = await listJobArtworks(job.id);
    return Response.json({ artworks });
  } catch (e) {
    console.error("artwork upload failed:", e);
    return Response.json({ error: e.message || "Upload failed" }, { status: 500 });
  }
}

// DELETE ?artworkId=… — remove one file. Team can delete anything on its jobs;
// a vendor can only delete its own proofs.
export async function DELETE(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { job, access } = await resolveAccess(session, params.id);
  if (!job) return Response.json({ error: "Not found" }, { status: 404 });
  if (!access) return Response.json({ error: "Forbidden" }, { status: 403 });

  const artworkId = new URL(req.url).searchParams.get("artworkId");
  if (!artworkId) return Response.json({ error: "artworkId required" }, { status: 400 });

  // Membership check via this job's own artwork list — avoids comparing the
  // job's public id (which may be a recXXX) against the row's PG uuid FK.
  const current = await listJobArtworks(job.id);
  const target = current.find((a) => a.id === artworkId);
  if (!target) return Response.json({ error: "Artwork does not belong to this job" }, { status: 404 });
  if (access === "vendor" && target.kind !== "proof") {
    return Response.json({ error: "Vendors can only remove their own proofs" }, { status: 403 });
  }

  try {
    await deleteJobArtwork(artworkId);
    const artworks = await listJobArtworks(job.id);
    return Response.json({ artworks });
  } catch (e) {
    console.error("artwork delete failed:", e);
    return Response.json({ error: e.message || "Delete failed" }, { status: 500 });
  }
}
