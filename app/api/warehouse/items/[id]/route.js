import { NextResponse } from "next/server";
import { getSession } from "@/lib/hub/session";
import {
  canManageInventory,
  getItem,
  updateItem,
  deactivateItem,
} from "@/lib/warehouse/inventory";

export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const session = getSession();
  if (!canManageInventory(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const item = await getItem(params.id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item });
}

export async function PATCH(req, { params }) {
  const session = getSession();
  if (!canManageInventory(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const item = await updateItem(params.id, body, session.email);
    return NextResponse.json({ item });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

// Soft delete — flips is_active=false. Hard delete intentionally not exposed
// so movement history stays referentially intact.
export async function DELETE(req, { params }) {
  const session = getSession();
  if (!canManageInventory(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const item = await deactivateItem(params.id, session.email);
  return NextResponse.json({ item });
}
