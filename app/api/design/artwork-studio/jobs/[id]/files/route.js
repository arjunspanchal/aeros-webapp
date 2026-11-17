import { NextResponse } from "next/server";
import { studioGuard } from "../../../_access";
import { canDownload, signedOutputUrl } from "@/lib/design/artwork-studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?name=<output file name> → 302 to a short-lived signed URL.
// Print files stay locked until the version is approved.
export async function GET(request, { params }) {
  const { session, job, error } = await studioGuard(params.id);
  if (error) return error;
  const name = new URL(request.url).searchParams.get("name");
  const output = (job.outputs || []).findLast((o) => o.name === name);
  if (!output) return NextResponse.json({ error: "File not found" }, { status: 404 });
  if (!canDownload(session, job, output)) {
    return NextResponse.json({ error: "Print file is locked until Arjun or a factory manager approves it" }, { status: 403 });
  }
  const url = await signedOutputUrl(output, 600);
  return NextResponse.redirect(url, 302);
}
