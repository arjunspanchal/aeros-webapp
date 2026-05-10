import { NextResponse } from "next/server";
import { getSession } from "@/lib/hub/session";
import {
  canManageSampleKits,
  getKit,
  updateKit,
  softDeleteKit,
} from "@/lib/warehouse/sampleKits";
import { canManageSampleDispatch } from "@/lib/warehouse/sampleDispatches";

export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const session = getSession();
  if (!canManageSampleDispatch(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const kit = await getKit(params.id);
  if (!kit) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ kit });
}

export async function PATCH(req, { params }) {
  const session = getSession();
  if (!canManageSampleKits(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  try {
    const kit = await updateKit(params.id, body);
    return NextResponse.json({ kit });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

export async function DELETE(_req, { params }) {
  const session = getSession();
  if (!canManageSampleKits(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await softDeleteKit(params.id);
  return NextResponse.json({ ok: true });
}
