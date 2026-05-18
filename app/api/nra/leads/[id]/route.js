// Single-lead edit + delete. Admin only.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { dbUpdate, dbDelete } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES = new Set([
  "Operator", "Distributor", "Disposables", "Packaging", "Equipment",
  "Refrigeration", "Beverage", "Smallwares", "Cleaning", "POS / Tech", "Other",
]);
const INTERESTS = new Set([
  "Marketplace", "Aeros Select", "Factory OS", "Show offer", "Just exploring",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isStaffAdmin(session) {
  if (!session) return false;
  if (session.isAdmin) return true;
  return session.modules?.factoryos === "admin";
}

function clean(value, max = 500) {
  if (typeof value !== "string") return undefined;
  return value.trim().slice(0, max);
}

function sanitizeInterests(list) {
  if (!Array.isArray(list)) return undefined;
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const v = typeof raw === "string" ? raw.trim().slice(0, 60) : "";
    if (!v || seen.has(v) || !INTERESTS.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export async function PATCH(request, { params }) {
  const session = getSession();
  if (!isStaffAdmin(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = params?.id;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch = {};
  const name = clean(body?.name, 120);
  if (name !== undefined) patch.name = name;
  const company = clean(body?.company, 160);
  if (company !== undefined) patch.company = company;
  const role = clean(body?.role, 120);
  if (role !== undefined) patch.role = role;
  const email = clean(body?.email, 200);
  if (email !== undefined) patch.email = email;
  const phone = clean(body?.phone, 60);
  if (phone !== undefined) patch.phone = phone;
  const booth = clean(body?.booth, 30);
  if (booth !== undefined) patch.booth = booth;
  const notes = clean(body?.notes, 2000);
  if (notes !== undefined) patch.notes = notes;
  const category = clean(body?.category, 60);
  if (category !== undefined) patch.category = CATEGORIES.has(category) ? category : "";
  const interests = sanitizeInterests(body?.interests);
  if (interests !== undefined) patch.interests = interests;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No editable fields supplied" }, { status: 400 });
  }

  try {
    const lead = await dbUpdate("nra_leads", "id", id, patch);
    if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ lead });
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || "Update failed" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request, { params }) {
  const session = getSession();
  if (!isStaffAdmin(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = params?.id;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    await dbDelete("nra_leads", "id", id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || "Delete failed" },
      { status: 500 },
    );
  }
}
