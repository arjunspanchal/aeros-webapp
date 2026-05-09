import { NextResponse } from "next/server";
import { getSession } from "@/lib/hub/session";
import {
  canAccessBrandRepo,
  listBrandFiles,
  uploadBrandFile,
} from "@/lib/brand/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = getSession();
  if (!canAccessBrandRepo(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const files = await listBrandFiles();
    return NextResponse.json({ files });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "List failed" }, { status: 500 });
  }
}

export async function POST(req) {
  const session = getSession();
  if (!canAccessBrandRepo(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  try {
    const file = await uploadBrandFile(body);
    return NextResponse.json({ file }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Upload failed" }, { status: 400 });
  }
}
