import { cookies } from "next/headers";
import { signSession as signHub, sessionCookie as hubCookie } from "@/lib/hub/auth";
import { findPortalVendor, verifyPassword, touchPortalLogin } from "@/lib/factoryos/printerAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { vendorId, password } -> hub session cookie with the vendor role, so
// everything already scoped to a vendor (jobs, job order PDF, milestone
// updates) works for the one-pager without a second auth system.
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const vendorId = String(body.vendorId || "");
  const password = String(body.password || "");
  if (!vendorId || !password) return Response.json({ error: "Pick your company and enter the password" }, { status: 400 });

  const v = await findPortalVendor(vendorId);
  // Same message for unknown vendor / no access / wrong password.
  if (!v || v.active === false || v.type !== "Printing" || !verifyPassword(password, v.portal_password_hash)) {
    return Response.json({ error: "Wrong password" }, { status: 401 });
  }

  cookies().set(hubCookie(signHub({
    email: null,
    name: v.name,
    isAdmin: false,
    modules: { factoryos: "vendor" },
    factoryosUserId: null,
    factoryosClientIds: [],
    factoryosVendorId: v.id,
  })));
  await touchPortalLogin(v.id);
  return Response.json({ ok: true });
}
