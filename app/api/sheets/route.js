import { getSession, requireInternal } from "@/lib/auth/session";
import { listSheets, createSheet } from "@/lib/sheets/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sheets are an internal team surface — customers and vendors never see them.
function guard(session) {
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireInternal(session)) return new Response("Forbidden", { status: 403 });
  return null;
}

export async function GET() {
  const session = getSession();
  const bad = guard(session);
  if (bad) return bad;
  try {
    const sheets = await listSheets();
    return Response.json({ sheets });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

export async function POST(req) {
  const session = getSession();
  const bad = guard(session);
  if (bad) return bad;
  try {
    const body = await req.json().catch(() => ({}));
    const sheet = await createSheet({
      name: body.name || "",
      createdByEmail: session.email || null,
    });
    return Response.json({ sheet });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 400 });
  }
}
