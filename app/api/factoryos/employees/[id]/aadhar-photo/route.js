import { getSession, requireManager } from "@/lib/auth/session";
import { resolveFactoryosUserId } from "@/lib/hub/users";
import {
  attachEmployeeAadhar,
  getEmployee,
  removeEmployeeAadharPhoto,
} from "@/lib/factoryos/repo";
import { ROLES } from "@/lib/factoryos/constants";

export const runtime = "nodejs";

const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

async function assertCanEdit(session, employeeId) {
  const emp = await getEmployee(employeeId);
  if (!emp) throw new Response("Not found", { status: 404 });
  if (session.modules?.factoryos === ROLES.ADMIN) return emp;
  const myUserId = await resolveFactoryosUserId(session);
  if (emp.managerId !== myUserId) {
    throw new Response("Not your employee", { status: 403 });
  }
  return emp;
}

export async function POST(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireManager(session)) return new Response("Forbidden", { status: 403 });
  try {
    await assertCanEdit(session, params.id);
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
  if (!requireManager(session)) return new Response("Forbidden", { status: 403 });
  try {
    await assertCanEdit(session, params.id);
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
