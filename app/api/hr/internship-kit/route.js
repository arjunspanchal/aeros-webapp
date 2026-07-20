import { getSession, hasModule } from "@/lib/auth/session";
import { getKitForEdit, updateKit } from "@/lib/hr/internshipKit";

export const runtime = "nodejs";

export async function GET() {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!hasModule(session, "hr")) return new Response("Forbidden", { status: 403 });
  try {
    const kit = await getKitForEdit();
    return Response.json({ kit });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

export async function PATCH(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!hasModule(session, "hr")) return new Response("Forbidden", { status: 403 });
  try {
    const body = await req.json();
    const kit = await updateKit({
      intro: body.intro,
      contactName: body.contactName,
      contactPhone: body.contactPhone,
      contactEmail: body.contactEmail,
      highlights: body.highlights,
      faqs: body.faqs,
    });
    return Response.json({ kit });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 400 });
  }
}
