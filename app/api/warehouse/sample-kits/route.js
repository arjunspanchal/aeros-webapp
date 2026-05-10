import { NextResponse } from "next/server";
import { getSession } from "@/lib/hub/session";
import {
  canManageSampleKits,
  listKits,
  createKit,
} from "@/lib/warehouse/sampleKits";
import { canManageSampleDispatch } from "@/lib/warehouse/sampleDispatches";

export const dynamic = "force-dynamic";

// Read = anyone who can manage a sample dispatch (so the picker on the
// new-dispatch form works). Write = canManageSampleKits.
export async function GET(req) {
  const session = getSession();
  if (!canManageSampleDispatch(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const kits = await listKits({
    activeOnly: searchParams.get("active") === "true",
  });
  return NextResponse.json({ kits });
}

export async function POST(req) {
  const session = getSession();
  if (!canManageSampleKits(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  try {
    const kit = await createKit(body, session.email);
    return NextResponse.json({ kit }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
