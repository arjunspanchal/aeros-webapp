import { NextResponse } from "next/server";
import { getSession } from "@/lib/hub/session";
import {
  canManageDesign,
  listFilesForProduct,
  uploadDesignFile,
  isAllowedFilename,
  FILE_TYPES,
} from "@/lib/design/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB cap (under Vercel's body limit)

// GET /api/design/products/[productId]/files
// Lists every design asset attached to a product. Auth: any session.
export async function GET(_request, { params }) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const productId = params?.productId;
  if (!productId) return NextResponse.json({ error: "Missing productId" }, { status: 400 });

  try {
    const files = await listFilesForProduct(productId);
    return NextResponse.json({ files });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "List failed" }, { status: 500 });
  }
}

// POST /api/design/products/[productId]/files
// Body: { filename, contentType, fileBase64, fileType?, notes? }
// Returns: { file } — the normalized newly-stored row.
// Auth: canManageDesign only (Admin / FM / FE).
export async function POST(request, { params }) {
  const session = getSession();
  if (!canManageDesign(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const productId = params?.productId;
  if (!productId) return NextResponse.json({ error: "Missing productId" }, { status: 400 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { filename, contentType, fileBase64, fileType, notes } = body || {};
  if (!filename || !fileBase64) {
    return NextResponse.json(
      { error: "Missing filename or fileBase64" },
      { status: 400 },
    );
  }

  if (!isAllowedFilename(filename)) {
    return NextResponse.json(
      { error: "Unsupported file type. Allowed: PDF, KLD, AI, EPS, SVG, DXF, DWG, ZIP, PNG, JPG, WEBP." },
      { status: 400 },
    );
  }

  // base64 → raw bytes ≈ length × 3/4. Cap server-side.
  const approxBytes = Math.ceil((fileBase64.length * 3) / 4);
  if (approxBytes > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error: `File too large. Max 8 MB, got ~${(approxBytes / (1024 * 1024)).toFixed(2)} MB`,
      },
      { status: 413 },
    );
  }

  try {
    const file = await uploadDesignFile({
      productId,
      fileType: FILE_TYPES.includes(fileType) ? fileType : "Other",
      filename,
      contentType,
      fileBase64,
      uploadedBy: session?.email || (session?.isAdmin ? "admin" : "staff"),
      notes,
    });
    return NextResponse.json({ file }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Upload failed" }, { status: 500 });
  }
}
