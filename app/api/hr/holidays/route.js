// Company holiday calendar — list / add / remove. HR module access (full).
import { getSession, hasModule } from "@/lib/auth/session";
import { listHolidays, createHoliday, deleteHoliday } from "@/lib/factoryos/repo";

export const runtime = "nodejs";

export async function GET(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!hasModule(session, "hr")) return new Response("Forbidden", { status: 403 });
  try {
    const url = new URL(req.url);
    const from = url.searchParams.get("from") || undefined;
    const to = url.searchParams.get("to") || undefined;
    const holidays = await listHolidays({ from, to });
    return Response.json({ holidays });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

export async function POST(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!hasModule(session, "hr")) return new Response("Forbidden", { status: 403 });
  try {
    const { date, name } = await req.json().catch(() => ({}));
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
      return Response.json({ error: "Valid date (YYYY-MM-DD) required" }, { status: 400 });
    }
    if (!name || !String(name).trim()) {
      return Response.json({ error: "Holiday name required" }, { status: 400 });
    }
    const holiday = await createHoliday({ date, name });
    return Response.json({ holiday });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

export async function DELETE(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!hasModule(session, "hr")) return new Response("Forbidden", { status: 403 });
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return Response.json({ error: "id required" }, { status: 400 });
    await deleteHoliday(id);
    return Response.json({ ok: true });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
