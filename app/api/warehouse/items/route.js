import { NextResponse } from "next/server";
import { getSession } from "@/lib/hub/session";
import {
  canManageInventory,
  listItems,
  createItem,
} from "@/lib/warehouse/inventory";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const session = getSession();
  if (!canManageInventory(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const items = await listItems({
    search: searchParams.get("q") || "",
    source: searchParams.get("source") || "",
    needsReview: searchParams.get("needs_review") === "true",
    includeInactive: searchParams.get("include_inactive") === "true",
  });
  return NextResponse.json({ items });
}

export async function POST(req) {
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
    const row = await createItem(body, session.email);
    return NextResponse.json({ item: row }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
