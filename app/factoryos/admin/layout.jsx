// Live role re-validation guard for the entire /factoryos/admin/* tree.
//
// Background: the factoryos session cookie is signed at OTP-login time and
// trusted for 30 days. It carries the user's role in its payload, so when a
// user is downgraded in the users table (e.g. factory_manager → customer)
// they keep admin access until cookie expiry. Middleware can't fix this
// because it runs on the edge and we have no edge-friendly DB call. Per-page
// guards already use requireManager(session) but that ALSO trusts the cookie.
//
// This layout wraps every page under /factoryos/admin and re-queries the
// users table once per request. If the live role no longer grants manager
// access, we clear the stale factoryos + hub cookies and bounce to /login.
// The user re-authenticates and the next OTP-verify mints cookies that
// reflect their current role.
//
// Cost: one extra Supabase round-trip per /factoryos/admin/* page load. The
// admin tree is ~22 users × low traffic, so this is fine.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getCurrentFactoryosRole } from "@/lib/hub/users";
import { clearCookie as clearHubCookie } from "@/lib/hub/auth";
import { clearCookie as clearFactoryosCookie } from "@/lib/factoryos/auth";

const ALLOWED = new Set(["admin", "factory_manager"]);

export const dynamic = "force-dynamic";

export default async function FactoryosAdminLayout({ children }) {
  const session = getSession();
  if (!session) {
    // Middleware should have caught this, but stay defensive.
    redirect("/login");
  }

  // Hub admins (password admin login) bypass the DB lookup — they don't have
  // a row in the users table, so the lookup would return null and lock them
  // out of their own admin pages. Their session.email is intentionally null;
  // session.isAdmin = true is the signal to trust the cookie's role payload.
  if (!session.isAdmin) {
    if (!session.email) {
      // Non-admin session with no identity to re-validate. Burn the cookies
      // and bounce so the user re-authenticates.
      const jar = cookies();
      jar.set(clearHubCookie());
      jar.set(clearFactoryosCookie());
      redirect("/login");
    }
    const liveRole = await getCurrentFactoryosRole(session.email);
    if (!liveRole || !ALLOWED.has(liveRole)) {
      // Stale cookie. Burn both cookies so /factoryos and /login don't
      // keep ping-ponging the user back here on the cached role.
      const jar = cookies();
      jar.set(clearHubCookie());
      jar.set(clearFactoryosCookie());
      redirect("/login");
    }
  }

  return children;
}
