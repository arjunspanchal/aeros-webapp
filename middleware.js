// Edge middleware. Uses Web Crypto (no node:crypto) for edge compat.
// Auth model: `/login` is the only login UI. Verifying a cookie still happens
// per-module — each module carries its own session cookie — but all three are
// minted in one go by /api/auth/*.
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

  // --- Hub: home, catalog, clearance ---
  // Public read access:
  //   • `/`               — landing page renders a public Clearance tile when
  //                         no session; logged-in users still see the full
  //                         module grid based on their entitlements.
  //   • `/clearance`      — the read-only stock list is open to anyone so
  //                         prospects can browse without signing in.
  // Auth still required for:
  //   • `/clearance/manage` — staff backend (also has its own session guard).
  //   • `/catalog`          — internal catalogue (sensitive pricing).
  if (pathname.startsWith("/clearance/manage")) {
    const token = req.cookies.get("aeros_hub_session")?.value;
    const payload = secret ? await verify(token, secret) : null;
    if (!payload) return redirectToLogin(req);
    return NextResponse.next();
  }
  if (pathname.startsWith("/catalog")) {
    const token = req.cookies.get("aeros_hub_session")?.value;
    const payload = secret ? await verify(token, secret) : null;
    if (!payload) return redirectToLogin(req);
    return NextResponse.next();
  }
  // `/` and `/clearance` fall through — page-level rendering decides what to
  // show based on the session presence.
  if (pathname === "/" || pathname === "/clearance") {
    return NextResponse.next();
  }

  // --- Calculator module ---
  if (pathname.startsWith("/api/calc/") || pathname.startsWith("/calculator")) {
    const token = req.cookies.get("aeros_session")?.value;
    const payload = secret ? await verify(token, secret) : null;
    if (!payload) return redirectToLogin(req);
    if (pathname.startsWith("/calculator/admin") && payload.role !== "admin") {
      return NextResponse.redirect(new URL("/calculator/client", req.url));
    }
    return NextResponse.next();
  }

  // --- FactoryOS module ---
  if (pathname.startsWith("/api/factoryos/") || pathname.startsWith("/factoryos")) {
    const token = req.cookies.get("aeros_factoryos_session")?.value;
    const payload = secret ? await verify(token, secret) : null;

    if (!payload) {
      // The FactoryOS landing page handles its own routing when no session.
      if (pathname === "/factoryos") return NextResponse.next();
      return redirectToLogin(req);
    }

    // Role guards for page routes.
    if (pathname.startsWith("/factoryos/admin") && payload.role !== "admin" && payload.role !== "factory_manager") {
      return NextResponse.redirect(new URL("/factoryos", req.url));
    }
    if (pathname.startsWith("/factoryos/manager") && payload.role === "customer") {
      return NextResponse.redirect(new URL("/factoryos/customer", req.url));
    }
    if (pathname.startsWith("/factoryos/customer") && payload.role !== "customer") {
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
