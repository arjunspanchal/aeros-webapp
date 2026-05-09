import { NextResponse } from "next/server";
import { getSession } from "@/lib/hub/session";
import { canManageInventory } from "@/lib/warehouse/inventory";
import {
  listItemPhotos,
  uploadItemPhoto,
  reorderItemPhotos,
} from "@/lib/warehouse/itemPhotos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bucket spec (set on the bucket itself): 10 MB cap, jpeg/png/webp/heic.
// We enforce here too so we fail fast before the bucket rejects.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

// GET /api/warehouse/items/[id]/photos — list photos for one item.
export async function GET(_req, { params }) {
  const session = getSession();
  if (!canManageInventory(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!params?.id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  try {
    const photos = await listItemPhotos(params.id);
    return NextResponse.json({ photos });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "List failed" }, { status: 500 });
  }
}

// POST /api/warehouse/items/[id]/photos — upload one photo.
// Body (JSON): { filename, contentType, fileBase64 }.
export async function POST(req, { params }) {
  const session = getSession();
  if (!canManageInventory(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!params?.id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { filename, contentType, fileBase64 } = body || {};
  if (!filename || !contentType || !fileBase64) {
    return NextResponse.json(
      { error: "Missing filename, contentType, or fileBase64" },
      { status: 400 },
    );
  }
  if (!ALLOWED_TYPES.has(contentType.toLowerCase())) {
    return NextResponse.json(
      { error: `Unsupported type ${contentType}. Allowed: jpeg / png / webp / heic.` },
      { status: 415 },
    );
  }
  // Approx size from base64 length (4 chars per 3 bytes).
  const approxBytes = Math.ceil((fileBase64.length * 3) / 4);
  if (approxBytes > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File too large. Max 10 MB, got ~${(approxBytes / (1024 * 1024)).toFixed(2)} MB` },
      { status: 413 },
    );
  }

  try {
    const photo = await uploadItemPhoto({
      itemId: params.id,
      filename,
      contentType,
      fileBase64,
    });
    return NextResponse.json({ photo }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Upload failed" }, { status: 500 });
  }
}

// PATCH /api/warehouse/items/[id]/photos — reorder.
// Body (JSON): { ordered_ids: ["uuid1","uuid2", ...] }
export async function PATCH(req, { params }) {
  const session = getSession();
  if (!canManageInventory(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!params?.id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const orderedIds = body?.ordered_ids;
  if (!Array.isArray(orderedIds)) {
    return NextResponse.json({ error: "ordered_ids must be an array" }, { status: 400 });
  }

  try {
    const photos = await reorderItemPhotos(params.id, orderedIds);
    return NextResponse.json({ photos });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Reorder failed" }, { status: 400 });
  }
}
