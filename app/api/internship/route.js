// PUBLIC endpoint — the /internship application form posts here. Not listed in
// middleware's matcher, so it's open (no session required). Uses the
// service-role Supabase key server-side to insert the row + upload the resume;
// RLS + the anon key keep applicants from reading each other's data.
import { bodyTooLarge } from "@/lib/factoryos/requestLimits";
import {
  validateApplication,
  uploadResume,
  createApplication,
  RESUME_MAX_BYTES,
} from "@/lib/hr/internships";

export const runtime = "nodejs";

// Honeypot: a hidden field real users never fill. Bots that autofill it get a
// silent 200 (looks like success) so they don't retry, but nothing is stored.
const HONEYPOT_FIELD = "company_website";

export async function POST(req) {
  // Reject oversized bodies before reading them into memory (resume is base64).
  if (bodyTooLarge(req, RESUME_MAX_BYTES)) {
    return Response.json({ error: "Attachment too large (max 5 MB)." }, { status: 413 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (String(body?.[HONEYPOT_FIELD] || "").trim()) {
    return Response.json({ ok: true }); // silently drop bots
  }

  const { data, error } = validateApplication(body);
  if (error) return Response.json({ error }, { status: 400 });

  try {
    let resumePath = null;
    if (body.resumeBase64) {
      resumePath = await uploadResume({
        fileBase64: body.resumeBase64,
        contentType: body.resumeContentType,
        filename: body.resumeFilename,
      });
    }
    await createApplication(data, resumePath);
    return Response.json({ ok: true });
  } catch (e) {
    const msg = String(e?.message || "");
    // Surface the validation-style messages (resume type/size); hide internals.
    const safe = /resume|max 5 MB|PDF|Word/i.test(msg)
      ? msg
      : "Something went wrong submitting your application. Please try again.";
    return Response.json({ error: safe }, { status: 400 });
  }
}
