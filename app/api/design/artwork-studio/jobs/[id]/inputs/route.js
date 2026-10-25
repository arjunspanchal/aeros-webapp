import { NextResponse } from "next/server";
import { studioGuard } from "../../../_access";
import { addInput, isAllowedInput } from "@/lib/design/artwork-studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 3 * 1024 * 1024; // base64 adds a third — stays under Vercel's 4.5 MB body limit
const MAX_FILES = 20;

// POST { filename, contentType, fileBase64 } — attach a logo / reference.
// Before the first run it is part of the brief; afterwards it waits (pending)
// and goes along with the next chat message.
export async function POST(request, { params }) {
  const { job, error } = await studioGuard(params.id);
  if (error) return error;
  if (job.status === "running") return NextResponse.json({ error: "Wait for the current run to finish" }, { status: 409 });
  if ((job.inputs || []).length >= MAX_FILES) return NextResponse.json({ error: `Up to ${MAX_FILES} files per job` }, { status: 400 });

  const { filename, contentType, fileBase64 } = await request.json().catch(() => ({}));
  if (!filename || !fileBase64) return NextResponse.json({ error: "Missing file" }, { status: 400 });
  if (!isAllowedInput(filename)) {
    return NextResponse.json({ error: "Allowed: PDF, AI, SVG, EPS, PNG, JPG, WEBP" }, { status: 400 });
  }
  const bytes = Buffer.from(fileBase64, "base64");
  if (bytes.byteLength > MAX_BYTES) return NextResponse.json({ error: "File too large (max 3 MB)" }, { status: 413 });
  try {
    const inputs = await addInput(job, { filename, contentType: contentType || "application/octet-stream", bytes });
    return NextResponse.json({ inputs: inputs.map((i) => ({ name: i.name, size: i.size, pending: !!i.pending })) });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
