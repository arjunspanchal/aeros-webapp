import { getSession, requireInternal } from "@/lib/auth/session";
import { getSheet, saveSheet, renameSheet, archiveSheet } from "@/lib/sheets/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function guard(session) {
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireInternal(session)) return new Response("Forbidden", { status: 403 });
  return null;
}

// GET one sheet. The editor also polls this (with ?ifNotVersion=N) to pick
// up teammates' saves — when the version hasn't moved we answer 304-shaped
// JSON so the poll stays cheap.
export async function GET(req, { params }) {
  const session = getSession();
  const bad = guard(session);
  if (bad) return bad;
  try {
    const sheet = await getSheet(params.id);
    if (!sheet) return Response.json({ error: "Not found" }, { status: 404 });
    const url = new URL(req.url);
    const ifNotVersion = Number(url.searchParams.get("ifNotVersion"));
    if (ifNotVersion && sheet.version === ifNotVersion) {
      return Response.json({ unchanged: true, version: sheet.version });
    }
    return Response.json({ sheet });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

// PATCH — save cell data (compare-and-swap on baseVersion) or rename.
export async function PATCH(req, { params }) {
  const session = getSession();
  const bad = guard(session);
  if (bad) return bad;
  try {
    const body = await req.json();

    if (body.rename !== undefined && body.data === undefined) {
      const sheet = await renameSheet(params.id, body.rename, session.email);
      return Response.json({ sheet });
    }

    if (typeof body.baseVersion !== "number" || !body.data) {
      return Response.json({ error: "baseVersion and data required" }, { status: 400 });
    }
    const { sheet, conflict } = await saveSheet({
      id: params.id,
      baseVersion: body.baseVersion,
      data: body.data,
      name: body.name,
      email: session.email,
    });
    if (!sheet) return Response.json({ error: "Not found" }, { status: 404 });
    if (conflict) return Response.json({ conflict: true, sheet }, { status: 409 });
    return Response.json({ sheet });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 400 });
  }
}

// DELETE — soft archive; nothing is destroyed.
export async function DELETE(req, { params }) {
  const session = getSession();
  const bad = guard(session);
  if (bad) return bad;
  try {
    await archiveSheet(params.id, session.email);
    return Response.json({ ok: true });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 400 });
  }
}
