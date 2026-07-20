import { getSession, hasModule } from "@/lib/auth/session";
import { updateApplicationStatus, INTERNSHIP_STATUSES } from "@/lib/hr/internships";

export const runtime = "nodejs";

// Internal — gated by the `hr` module (middleware also guards /api/hr/*).
// The only mutation HR needs from the review view is moving status along the
// pipeline; everything else is applicant-supplied and read-only.
export async function PATCH(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!hasModule(session, "hr")) return new Response("Forbidden", { status: 403 });
  try {
    const body = await req.json();
    const status = String(body?.status || "");
    if (!INTERNSHIP_STATUSES.includes(status)) {
      return Response.json({ error: "Invalid status" }, { status: 400 });
    }
    const application = await updateApplicationStatus(params.id, status);
    return Response.json({ application });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
