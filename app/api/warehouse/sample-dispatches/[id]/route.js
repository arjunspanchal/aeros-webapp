import { NextResponse } from "next/server";
import { getSession } from "@/lib/hub/session";
import {
  canManageSampleDispatch,
  getDispatch,
  updateDispatchStatus,
  softDeleteDispatch,
} from "@/lib/warehouse/sampleDispatches";

export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const session = getSession();
  if (!canManageSampleDispatch(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const dispatch = await getDispatch(params.id);
  if (!dispatch) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ dispatch });
}

export async function PATCH(req, { params }) {
  const session = getSession();
  if (!canManageSampleDispatch(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  try {
    const dispatch = await updateDispatchStatus(params.id, body, session.factoryosUserId || null);
    return NextResponse.json({ dispatch });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

export async function DELETE(_req, { params }) {
  const session = getSession();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await softDeleteDispatch(params.id);
  return NextResponse.json({ ok: true });
}
