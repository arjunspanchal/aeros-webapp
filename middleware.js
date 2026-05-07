// Edge middleware. Uses Web Crypto (no node:crypto) for edge compat.
// Auth model: `/login` is the only login UI. Phase 1.5d retired the
// per-module legacy cookies; the unified hub cookie (aeros_hub_session) is
// now the single source of auth across every gated route. Module-level role
// lives at payload.modules.{calculator,factoryos,rate_cards}; entitlement is
// "module key is set on the payload".
import { NextResponse } from "next/server";

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

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  const secret = process.env.SESSION_SECRET;

  // Legacy URL shim — redirect any old /orders or /api/orders paths to /factoryos.
  const legacy = legacyOrdersRedirect(req);
  if (legacy) return legacy;

  // --- Hub: landing, dashboard, catalog, clearance ---
  // Public read access (no gate):
  //   • `/`                 — public marketing landing page
  //   • `/clearance`        — read-only stock list, open to prospects
  //   • `/catalog`          — public product catalogue
  // Auth required:
  //   • `/hub`              — authed module-picker (replaces old `/`)
  //   • `/clearance/manage` — staff backend (also has its own session guard)
  //   • `/catalog/manage`   — staff backend (also has its own session guard)
  if (pathname === "/hub" || pathname.startsWith("/catalog/manage") || pathname.startsWith("/clearance/manage")) {
    const token = req.cookies.get("aeros_hub_session")?.value;
    const payload = secret ? await verify(token, secret) : null;
    if (!payload) return redirectToLogin(req);
    return NextResponse.next();
  }
  // `/`, `/clearance`, `/catalog` fall through — page renders based on session.
  if (pathname === "/" || pathname === "/clearance" || pathname === "/catalog") {
    return NextResponse.next();
  }

  // --- Calculator module ---
  if (pathname.startsWith("/api/calc/") || pathname.startsWith("/calculator")) {
    const token = req.cookies.get("aeros_hub_session")?.value;
    const payload = secret ? await verify(token, secret) : null;
    if (!payload || !payload.modules?.calculator) return redirectToLogin(req);
    if (pathname.startsWith("/calculator/admin") && payload.modules.calculator !== "admin") {
      return NextResponse.redirect(new URL("/calculator/client", req.url));
    }
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

    const role = payload.modules.factoryos;

    // Role guards for page routes.
    if (pathname.startsWith("/factoryos/admin") && role !== "admin" && role !== "factory_manager") {
      return NextResponse.redirect(new URL("/factoryos", req.url));
    }
    if (pathname.startsWith("/factoryos/manager") && role === "customer") {
      return NextResponse.redirect(new URL("/factoryos/customer", req.url));
    }
    if (pathname.startsWith("/factoryos/customer") && role !== "customer") {
      return NextResponse.redirect(new URL("/factoryos/manager", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/hub",
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
