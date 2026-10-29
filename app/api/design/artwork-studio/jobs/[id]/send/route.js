import { NextResponse } from "next/server";
import { studioGuard } from "../../../_access";
import { userKey } from "@/lib/design/artwork-studio";
import { sendProofToCustomer } from "@/lib/design/artwork-studio-mail";
import { dbUpdate } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST { to, cc?, note?, version? } — email the CUSTOMER PROOF (only) to the
// customer. Staff may send proofs; the print file never goes this way.
export async function POST(request, { params }) {
  const { session, job, error } = await studioGuard(params.id);
  if (error) return error;
  const b = await request.json().catch(() => ({}));
  const to = String(b.to || "").split(/[,;\s]+/).filter(Boolean);
  const cc = String(b.cc || "").split(/[,;\s]+/).filter(Boolean);
  if (!to.length || ![...to, ...cc].every((e) => EMAIL.test(e))) {
    return NextResponse.json({ error: "Enter a valid customer email" }, { status: 400 });
  }
  const proofs = (job.outputs || []).filter((o) => o.kind === "proof");
  const output = b.version ? proofs.findLast((o) => o.version === Number(b.version)) : proofs.at(-1);
  if (!output) return NextResponse.json({ error: "No proof to send yet" }, { status: 400 });
  try {
    await sendProofToCustomer({ to, cc, job, output, note: String(b.note || "").slice(0, 2000), senderName: session.name });
  } catch (e) {
    return NextResponse.json({ error: `Could not send: ${e.message}` }, { status: 502 });
  }
  const sends = [...(job.sends || []), { to, cc, version: output.version, by: session.name || userKey(session), at: new Date().toISOString() }];
  await dbUpdate("artwork_studio_jobs", "id", job.id, { sends, updated_at: new Date().toISOString() }, { returning: "minimal" });
  return NextResponse.json({ ok: true, sends });
}
