// Edge middleware. Uses Web Crypto (no node:crypto) for edge compat.
// Auth model: `/login` is the only login UI. Phase 1.5d retired the
// per-module legacy cookies; the unified hub cookie (aeros_hub_session) is
// now the single source of auth across every gated route. Module-level role
// lives at payload.modules.{calculator,factoryos,rate_cards}; entitlement is
// "module key is set on the payload".
import { NextResponse } from "next/server";
import { isSessionStale } from "@/lib/auth/freshness";

async function verify(token, secret) {
  if (!token || typeof token !== "string") return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const sigBytes = Uint8Array.from(atob(sig.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const ok = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(body));
  if (!ok) return null;
  try {
    const json = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
    if (json.exp && json.exp * 1000 < Date.now()) return null;
    return json;
  } catch { return null; }
}

function redirectToLogin(req) {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

// Build a redirect/401 that ALSO clears the stale cookie so the browser
// stops sending it on subsequent requests. Used when the cookie itself is
// valid (not tampered, not expired) but the underlying user has had their
// session revoked via /admin/access.
function redirectStaleSession(req) {
  const isApi = req.nextUrl.pathname.startsWith("/api/");
  const res = isApi
    ? NextResponse.json({ error: "Session expired — please sign in again" }, { status: 401 })
    : redirectToLogin(req);
  res.cookies.set({
    name: "aeros_hub_session",
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}

// Old URLs redirected to new ones so bookmarks keep working after the
// Orders → FactoryOS rename.
function legacyOrdersRedirect(req) {
  const { pathname, search } = req.nextUrl;
  if (pathname === "/orders" || pathname.startsWith("/orders/") ||
      pathname === "/api/orders" || pathname.startsWith("/api/orders/")) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.replace(/^\/orders/, "/factoryos").replace(/^\/api\/orders/, "/api/factoryos");
    url.search = search;
    return NextResponse.redirect(url, 308);
  }
  return null;
}

// HR moved out of FactoryOS into its own top-level module. Redirect old
// /factoryos/admin/hr pages + the relocated employee/attendance APIs so
// bookmarks and any cached clients keep working. 308 preserves method + body.
function legacyHrRedirect(req) {
  const { pathname, search } = req.nextUrl;
  let next = null;
  if (pathname === "/factoryos/admin/hr" || pathname.startsWith("/factoryos/admin/hr/")) {
    next = pathname.replace(/^\/factoryos\/admin\/hr/, "/hr");
  } else if (pathname === "/api/factoryos/employees" || pathname.startsWith("/api/factoryos/employees/")) {
    next = pathname.replace(/^\/api\/factoryos\/employees/, "/api/hr/employees");
  } else if (pathname === "/api/factoryos/attendance" || pathname.startsWith("/api/factoryos/attendance/")) {
    next = pathname.replace(/^\/api\/factoryos\/attendance/, "/api/hr/attendance");
  } else if (pathname === "/factoryos/clock" || pathname.startsWith("/factoryos/clock/")) {
    next = pathname.replace(/^\/factoryos\/clock/, "/hr/clock");
  } else if (pathname === "/api/factoryos/clock" || pathname.startsWith("/api/factoryos/clock/")) {
    next = pathname.replace(/^\/api\/factoryos\/clock/, "/api/hr/clock");
  }
  if (!next) return null;
  const url = req.nextUrl.clone();
  url.pathname = next;
  url.search = search;
  return NextResponse.redirect(url, 308);
}

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  const secret = process.env.SESSION_SECRET;

  // Legacy URL shim — redirect any old /orders or /api/orders paths to /factoryos.
  const legacy = legacyOrdersRedirect(req);
  if (legacy) return legacy;

  // HR-moved-out-of-FactoryOS shim — old /factoryos/admin/hr + HR API paths.
  const hrLegacy = legacyHrRedirect(req);
  if (hrLegacy) return hrLegacy;

  // The public clearance stock site was removed on 18-Nov-2026; old links
  // (/clearance, /warehouse/clearance and their manage pages) go home.
  if (pathname === "/clearance" || pathname.startsWith("/clearance/") || pathname === "/warehouse/clearance" || pathname.startsWith("/warehouse/clearance/")) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // WarehouseOS moved inside FactoryOS on 18-Nov-2026 (/factoryos/warehouse).
  // Old bookmarks land on the matching new screen.
  if (pathname === "/warehouse" || pathname.startsWith("/warehouse/")) {
    const to = pathname.startsWith("/warehouse/inventory/inward") ? "/factoryos/warehouse/inward"
      : pathname.startsWith("/warehouse/inventory/outward") || pathname.startsWith("/warehouse/invoices") || pathname.startsWith("/warehouse/dispatch") ? "/factoryos/warehouse/outward"
      : pathname.startsWith("/warehouse/inventory") ? "/factoryos/warehouse/stock"
      : "/factoryos/warehouse";
    return NextResponse.redirect(new URL(to, req.url));
  }

  // --- Hub: landing, dashboard, catalog ---
  // Public read access (no gate):
  //   • `/`                              — public marketing landing page
  //   • `/warehouse`                     — WarehouseOS hub (tiles render based on session)
  //   • `/catalog`                       — public product catalogue
  // Auth required:
  //   • `/hub`                           — authed module-picker (replaces old `/`)
  //   • `/catalog/manage`                — staff backend (also has its own session guard)
  if (
    pathname === "/hub" ||
    pathname.startsWith("/catalog/manage") ||
    pathname.startsWith("/api/warehouse/") ||
    pathname === "/brand" ||
    pathname.startsWith("/brand/") ||
    pathname.startsWith("/api/brand/")
  ) {
    const token = req.cookies.get("aeros_hub_session")?.value;
    const payload = secret ? await verify(token, secret) : null;
    if (!payload) {
      // API routes return JSON 401 instead of HTML redirect.
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return redirectToLogin(req);
    }
    if (await isSessionStale(payload)) return redirectStaleSession(req);
    return NextResponse.next();
  }
  // Public + legacy fall through — page renders based on session (or 308 redirects).
  if (
    pathname === "/" ||
    pathname === "/catalog"
  ) {
    return NextResponse.next();
  }

  // --- Calculator module ---
  if (pathname.startsWith("/api/calc/") || pathname.startsWith("/calculator")) {
    const token = req.cookies.get("aeros_hub_session")?.value;
    const payload = secret ? await verify(token, secret) : null;
    if (!payload || !payload.modules?.calculator) return redirectToLogin(req);
    if (await isSessionStale(payload)) return redirectStaleSession(req);
    if (pathname.startsWith("/calculator/admin") && payload.modules.calculator !== "admin") {
      return NextResponse.redirect(new URL("/calculator", req.url));
    }
    return NextResponse.next();
  }

  // --- Punch clock (factory-worker self-service attendance) ---
  // Workers sign in with phone + a PIN and carry their own employee session
  // (aeros_emp_session), NOT the hub session — they are employees, not users.
  // This MUST come BEFORE the HR gate below so workers (who have no hub session
  // and no `hr` module) aren't bounced to login. The page + every
  // /api/hr/clock/* route verify the employee session themselves. Old
  // /factoryos/clock paths 308-redirect here via legacyHrRedirect.
  if (
    pathname === "/hr/clock" ||
    pathname.startsWith("/hr/clock/") ||
    pathname.startsWith("/api/hr/clock/")
  ) {
    return NextResponse.next();
  }

  // --- HR module (standalone, gated by the independent `hr` entitlement) ---
  if (pathname.startsWith("/api/hr/") || pathname.startsWith("/hr")) {
    const token = req.cookies.get("aeros_hub_session")?.value;
    const payload = secret ? await verify(token, secret) : null;
    if (!payload || !payload.modules?.hr) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return redirectToLogin(req);
    }
    if (await isSessionStale(payload)) return redirectStaleSession(req);
    return NextResponse.next();
  }

  // --- Payouts module (standalone, gated by the `payouts` entitlement) ---
  // Accountants (Aarti, Kadambari) plus admins / factory managers (derived).
  if (pathname.startsWith("/api/payouts/") || pathname.startsWith("/payouts")) {
    const token = req.cookies.get("aeros_hub_session")?.value;
    const payload = secret ? await verify(token, secret) : null;
    if (!payload || !payload.modules?.payouts) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return redirectToLogin(req);
    }
    if (await isSessionStale(payload)) return redirectStaleSession(req);
    return NextResponse.next();
  }

  // --- Sheets module (internal team spreadsheets) ---
  // Aeros staff only: hub admin, or an internal factoryos role. Customers
  // and vendors never see sheets. Route handlers re-check with
  // requireInternal(); middleware adds the stale-cookie defence.
  if (pathname.startsWith("/api/sheets") || pathname.startsWith("/sheets")) {
    const token = req.cookies.get("aeros_hub_session")?.value;
    const payload = secret ? await verify(token, secret) : null;
    const internal =
      payload &&
      (payload.isAdmin ||
        ["admin", "factory_manager", "factory_executive", "warehouse", "account_manager"].includes(
          payload.modules?.factoryos
        ));
    if (!internal) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return redirectToLogin(req);
    }
    if (await isSessionStale(payload)) return redirectStaleSession(req);
    return NextResponse.next();
  }

  // --- FactoryOS module ---
  if (pathname.startsWith("/api/factoryos/") || pathname.startsWith("/factoryos")) {
    const token = req.cookies.get("aeros_hub_session")?.value;
    const payload = secret ? await verify(token, secret) : null;

    if (!payload || !payload.modules?.factoryos) {
      // The FactoryOS landing page handles its own routing when no session.
      if (pathname === "/factoryos") return NextResponse.next();
      return redirectToLogin(req);
    }
    if (await isSessionStale(payload)) return redirectStaleSession(req);

    const role = payload.modules.factoryos;

    // FactoryOS is not given to customers (17-Nov-2026). A cookie still
    // carrying the old customer role gets nothing here.
    if (role === "customer") {
      if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      return NextResponse.redirect(new URL("/hub", req.url));
    }

    // An outside printer's login opens the vendor portal and nothing else
    // (audit, 27-Nov-2026). Stopping it here matters: a page that loads its
    // data before its own role check still sends that data inside the
    // redirect, which is how the warehouse Stock and In transit pages handed
    // a printer customer names and the stock list.
    if (
      role === "vendor" &&
      !pathname.startsWith("/api/") &&
      pathname !== "/factoryos" &&
      !pathname.startsWith("/factoryos/vendor")
    ) {
      return NextResponse.redirect(new URL("/factoryos", req.url));
    }
    // Sales do not see warehouse stock; same reason for stopping it here.
    if (role === "account_manager" && pathname.startsWith("/factoryos/warehouse/stock")) {
      return NextResponse.redirect(new URL("/factoryos/warehouse", req.url));
    }

    // Role guards for page routes. Each portal tree is fenced to its role(s);
    // mismatches bounce to /factoryos, whose landing page re-routes by role.
    //
    if (pathname.startsWith("/factoryos/vendor")) {
      if (role !== "vendor") return NextResponse.redirect(new URL("/factoryos", req.url));
    } else if (
      pathname.startsWith("/factoryos/admin") &&
      role !== "admin" &&
      role !== "factory_manager"
    ) {
      return NextResponse.redirect(new URL("/factoryos", req.url));
    } else if (pathname.startsWith("/factoryos/manager") && (role === "customer" || role === "vendor")) {
      return NextResponse.redirect(new URL("/factoryos", req.url));
    } else if (pathname.startsWith("/factoryos/customer")) {
      // The customer portal was removed on 17-Nov-2026; old links go home.
      return NextResponse.redirect(new URL("/factoryos", req.url));
    }
  }

  // --- Admin + RFQ Tracker: any auth-gated route in these trees gets the
  // same freshness check so a revoked session can't peek at /admin/access
  // or /rate-cards/* via cookie cache. Page-level guards still enforce
  // role checks; middleware just rejects stale cookies up-front.
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/admin/") ||
    pathname.startsWith("/rate-cards") ||
    pathname.startsWith("/api/rate-cards/") ||
    pathname.startsWith("/rfq-manager") ||
    pathname.startsWith("/api/rfq-manager/")
  ) {
    const token = req.cookies.get("aeros_hub_session")?.value;
    const payload = secret ? await verify(token, secret) : null;
    if (!payload) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return redirectToLogin(req);
    }
    if (await isSessionStale(payload)) return redirectStaleSession(req);
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/hub",
    "/catalog/:path*",
    "/clearance/:path*",
    "/warehouse/:path*",
    "/api/warehouse/:path*",
    "/brand",
    "/brand/:path*",
    "/api/brand/:path*",
    "/calculator/:path*",
    "/api/calc/:path*",
    "/factoryos/:path*",
    "/api/factoryos/:path*",
    "/hr/:path*",
    "/api/hr/:path*",
    "/payouts/:path*",
    "/api/payouts/:path*",
    "/sheets",
    "/sheets/:path*",
    "/api/sheets",
    "/api/sheets/:path*",
    "/orders/:path*",
    "/api/orders/:path*",
    "/admin/:path*",
    "/api/admin/:path*",
    "/rate-cards/:path*",
    "/api/rate-cards/:path*",
    "/rfq-manager/:path*",
    "/api/rfq-manager/:path*",
  ],
};
