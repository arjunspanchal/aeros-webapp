import { getSession, hasModule } from "@/lib/auth/session";
import { listColleges, createCollege } from "@/lib/hr/colleges";

export const runtime = "nodejs";

export async function GET() {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!hasModule(session, "hr")) return new Response("Forbidden", { status: 403 });
  try {
    const colleges = await listColleges();
    return Response.json({ colleges });
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
    const body = await req.json();
    if (!String(body?.collegeName || "").trim()) {
      return Response.json({ error: "College name is required" }, { status: 400 });
    }
    const college = await createCollege(body);
    return Response.json({ college });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 400 });
  }
}
