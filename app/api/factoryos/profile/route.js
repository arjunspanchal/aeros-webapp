import { getSession } from "@/lib/auth/session";
import { findUserByEmail, updateUser, attachUserPhoto, getUser } from "@/lib/factoryos/repo";

export const runtime = "nodejs";

const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// Self-service profile update for any logged-in non-admin user.
export async function PATCH(req) {
  const s = getSession();
  if (!s) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!s.email) return Response.json({ error: "Admin profile is not editable here" }, { status: 400 });

  const user = await findUserByEmail(s.email);
  if (!user) return Response.json({ error: "User not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const allowed = {};
  if (body.name !== undefined) allowed.name = body.name;
  if (body.designation !== undefined) allowed.designation = body.designation;
  if (body.phone !== undefined) allowed.phone = body.phone;

  let updated = Object.keys(allowed).length ? await updateUser(user.id, allowed) : user;

  // Optional photo upload alongside the text fields.
  if (body.photoBase64 && body.photoFilename && body.photoContentType) {
    if (!PHOTO_TYPES.has(body.photoContentType.toLowerCase())) {
      return Response.json({ error: "Photo must be JPG, PNG, WebP, or GIF" }, { status: 400 });
    }
    const rawBytes = Math.floor((body.photoBase64.length * 3) / 4);
    if (rawBytes > PHOTO_MAX_BYTES) {
      return Response.json({ error: "Photo too large. Max 5 MB." }, { status: 413 });
    }
    try {
      await attachUserPhoto({
        userId: user.id,
        contentType: body.photoContentType,
        filename: body.photoFilename,
        fileBase64: body.photoBase64,
      });
      // Re-fetch so the photoUrl is populated.
      updated = await getUser(user.id) || updated;
    } catch (e) {
      console.error(e);
      return Response.json({ error: e.message || "Photo upload failed" }, { status: 500 });
    }
  }

  return Response.json({ user: updated });
}

export async function GET() {
  const s = getSession();
  if (!s) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!s.email) return Response.json({ profile: null });
  const user = await findUserByEmail(s.email);
  if (!user) return Response.json({ error: "User not found" }, { status: 404 });
  return Response.json({
    profile: {
      email: user.email,
      name: user.name,
      designation: user.designation,
      phone: user.phone,
      role: user.role,
    },
  });
}
