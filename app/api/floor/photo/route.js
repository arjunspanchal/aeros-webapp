// Public roll-photo upload for the operator page. Accepts a JSON body with a
// base64 image, stores it in the production-photos bucket, returns the storage
// path (the run row keeps the path; the bucket is public so the admin view can
// render it via publicStorageUrl). 5 MB cap, images only.
import { uploadToBucket, safeFilename } from "@/lib/db/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const { filename, contentType, fileBase64 } = body || {};
    if (!fileBase64) return Response.json({ error: "No image" }, { status: 400 });
    if (!String(contentType || "").startsWith("image/")) {
      return Response.json({ error: "Image files only" }, { status: 400 });
    }
    const approxBytes = Math.floor((fileBase64.length * 3) / 4);
    if (approxBytes > MAX_BYTES) {
      return Response.json({ error: "Image is over 5 MB" }, { status: 400 });
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const name = safeFilename(filename || "roll.jpg");
    const path = `rolls/${stamp}-${name}`;
    await uploadToBucket({ bucket: "production-photos", path, contentType, fileBase64 });
    return Response.json({ path });
  } catch (e) {
    console.error("floor photo", e);
    return Response.json({ error: e.message || "Upload failed" }, { status: 500 });
  }
}
