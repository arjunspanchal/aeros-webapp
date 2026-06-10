import { getSession, hasModule } from "@/lib/auth/session";
import {
  attachEmployeeAadhar,
  getEmployee,
  removeEmployeeAadharPhoto,
} from "@/lib/factoryos/repo";
import { hrScope, canAccessEmployee } from "@/lib/factoryos/hrScope";

export const runtime = "nodejs";

const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// Managers may only touch their own reports' KYC photos.
async function guard(session, employeeId) {
  const scope = await hrScope(session);
  if (scope.isAdmin) return null;
  const emp = await getEmployee(employeeId);
  if (!canAccessEmployee(scope, emp)) {
    return Response.json({ error: "Not your employee" }, { status: 403 });
  }
  return null;
}

export async function POST(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!hasModule(session, "hr")) return new Response("Forbidden", { status: 403 });
  try {
    const denied = await guard(session, params.id);
    if (denied) return denied;
    const body = await req.json();
    const { contentType, filename, fileBase64 } = body || {};
    if (!contentType || !filename || !fileBase64) {
      return Response.json({ error: "Missing file data" }, { status: 400 });
    }
    if (!PHOTO_TYPES.has(contentType.toLowerCase())) {
      return Response.json({ error: "Photo must be JPG, PNG, WebP, or GIF" }, { status: 400 });
    }
    const rawBytes = Math.floor((fileBase64.length * 3) / 4);
    if (rawBytes > PHOTO_MAX_BYTES) {
      return Response.json({ error: "Photo too large. Max 5 MB." }, { status: 413 });
    }
    await attachEmployeeAadhar({
      employeeId: params.id,
      contentType,
      filename,
      fileBase64,
    });
    const employee = await getEmployee(params.id);
    return Response.json({ employee });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!hasModule(session, "hr")) return new Response("Forbidden", { status: 403 });
  try {
    const denied = await guard(session, params.id);
    if (denied) return denied;
    const url = new URL(req.url);
    const attachmentId = url.searchParams.get("attachmentId");
    if (!attachmentId) {
      return Response.json({ error: "attachmentId required" }, { status: 400 });
    }
    const employee = await removeEmployeeAadharPhoto(params.id, attachmentId);
    return Response.json({ employee });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
