// Single-lead edit + delete. Admin only.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { dbUpdate, dbDelete } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES = new Set([
  "Operator", "Distributor", "Disposables", "Packaging", "Equipment",
  "Refrigeration", "Beverage", "Smallwares", "Cleaning", "POS / Tech",
  "Other Vendor", "Other Customer",
]);
const INTERESTS = new Set([
  "Marketplace", "Aeros Select", "Factory OS", "Show offer", "Just exploring",
]);
const RECORD_TYPES = new Set(["exhibitor", "visitor"]);
const PRIORITIES = new Set(["P0", "P1", "P2"]);

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

// Only accept URLs from our own Supabase Storage bucket. Empty string is
// also valid (admin clearing the image).
function cleanCardUrl(value) {
  if (typeof value !== "string") return undefined;
  const s = value.trim();
  if (s === "") return "";
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const allowedPrefix = `${supabaseUrl}/storage/v1/object/public/nra-card-images/`;
  if (!s.startsWith(allowedPrefix)) return undefined;
  return s.slice(0, 500);
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

// Categories is multi-select. Accept an array OR a legacy single string.
// Returns undefined if neither was supplied (so the PATCH leaves it alone).
function sanitizeCategories(input) {
  if (input === undefined) return undefined;
  const list = Array.isArray(input)
    ? input
    : typeof input === "string" && input.trim()
      ? [input]
      : [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const v = typeof raw === "string" ? raw.trim().slice(0, 60) : "";
    if (!v || seen.has(v) || !CATEGORIES.has(v)) continue;
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
  // Categories: array since 2026-05-19. Accepts either `categories` (new)
  // or `category` (legacy) on input.
  const categoriesInput = body?.categories !== undefined ? body.categories : body?.category;
  const categories = sanitizeCategories(categoriesInput);
  if (categories !== undefined) patch.categories = categories;
  const interests = sanitizeInterests(body?.interests);
  if (interests !== undefined) patch.interests = interests;
  const recordTypeRaw = clean(body?.record_type, 12);
  if (recordTypeRaw !== undefined) {
    const v = recordTypeRaw.toLowerCase();
    patch.record_type = RECORD_TYPES.has(v) ? v : "exhibitor";
  }
  const priorityRaw = clean(body?.priority, 4);
  if (priorityRaw !== undefined) {
    const v = priorityRaw.toUpperCase();
    patch.priority = PRIORITIES.has(v) ? v : "P2";
  }
  const country = clean(body?.country, 60);
  if (country !== undefined) patch.country = country;
  const cardUrl = cleanCardUrl(body?.card_image_url);
  if (cardUrl !== undefined) patch.card_image_url = cardUrl;

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
