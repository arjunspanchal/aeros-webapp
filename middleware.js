// Edge middleware. Reads the unified hub session via the shared edge-safe
// helper from lib/auth/edge.js (PR 1.4a). All role logic flows through the
// same policy helpers (requireManager, requireRole) that server routes use
// — single source of truth across runtimes.
//
// Phase 1.4b of auth unification: replaces the inline web-crypto verify()
// + per-cookie reads + raw role-string literals with one shared verify
// path against one cookie. The legacy per-module cookies are still minted
// at sign-in but no longer consulted in middleware — the hub session's
// modules.{calculator,factoryos} carries the same role data. PR 1.5
// retires the redundant cookies.

import { NextResponse } from "next/server";
import {
  getSessionFromRequest,
  requireManager,
  requireRole,
  ROLES,
  MODULES,
} from "@/lib/auth/edge";

function redirectToLogin(req) {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

// Old URLs redirected to new ones so bookmarks keep working after the
// Orders → FactoryOS rename. No auth check — pure path rewrite.
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

export async function middleware(req) {
  const { pathname } = req.nextUrl;

  const legacy = legacyOrdersRedirect(req);
  if (legacy) return legacy;

  // Single read, single verify. Same payload shape lib/auth/session.js
  // returns on the Node side. SESSION_SECRET picked up from process.env.
  const session = await getSessionFromRequest(req);

  // --- Hub: home, catalog, clearance ---
  // Path predicates kept identical to legacy: bare `/catalog` and
  // `/clearance` (no trailing slash) match too.
  if (pathname === "/" || pathname.startsWith("/catalog") || pathname.startsWith("/clearance")) {
    if (!session) return redirectToLogin(req);
    return NextResponse.next();
  }

  // --- Calculator ---
  if (pathname.startsWith("/api/calc/") || pathname.startsWith("/calculator")) {
    if (!session) return redirectToLogin(req);
    // /calculator/admin → calc admin role; clients redirect to /calculator/client.
    if (pathname.startsWith("/calculator/admin") && !requireRole(session, MODULES.CALCULATOR, "admin")) {
      return NextResponse.redirect(new URL("/calculator/client", req.url));
    }
    return NextResponse.next();
  }

  // --- FactoryOS ---
  if (pathname.startsWith("/api/factoryos/") || pathname.startsWith("/factoryos")) {
    if (!session) {
      // /factoryos is a router stub that handles its own role-based
      // redirect server-side; allowed through unauthenticated.
      if (pathname === "/factoryos") return NextResponse.next();
      return redirectToLogin(req);
    }
    // /factoryos/admin → admin or factory_manager. requireManager covers
    // hub isAdmin OR modules.factoryos ∈ {admin, factory_manager}.
    if (pathname.startsWith("/factoryos/admin") && !requireManager(session)) {
      return NextResponse.redirect(new URL("/factoryos", req.url));
    }
    if (pathname.startsWith("/factoryos/manager") && session.modules?.factoryos === ROLES.CUSTOMER) {
      return NextResponse.redirect(new URL("/factoryos/customer", req.url));
    }
    if (pathname.startsWith("/factoryos/customer") && session.modules?.factoryos !== ROLES.CUSTOMER) {
      return NextResponse.redirect(new URL("/factoryos/manager", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/catalog/:path*",
    "/clearance/:path*",
    "/calculator/:path*",
    "/api/calc/:path*",
    "/factoryos/:path*",
    "/api/factoryos/:path*",
    "/orders/:path*",
    "/api/orders/:path*",
  ],
};
