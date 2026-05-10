import { NextResponse } from "next/server";
import { getSession } from "@/lib/hub/session";
import {
  canManageSampleDispatch,
  listDispatches,
  createDispatch,
} from "@/lib/warehouse/sampleDispatches";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const session = getSession();
  if (!canManageSampleDispatch(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const dispatches = await listDispatches({
    status: searchParams.get("status") || "",
    limit:  Number(searchParams.get("limit") || 200),
  });
  return NextResponse.json({ dispatches });
}

export async function POST(req) {
  const session = getSession();
  if (!canManageSampleDispatch(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  try {
    const dispatch = await createDispatch(body, session.email);
    return NextResponse.json({ dispatch }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
