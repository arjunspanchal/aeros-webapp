"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";

/**
 * Mobile right-side sheet. Hamburger trigger in the top bar opens an
 * 80vw-max sheet with module nav and an identity panel pinned to the
 * bottom. Backdrop click closes; ESC closes; body scroll locks while open;
 * focus restores to the trigger on close.
 *
 * Sub-tabs are NOT in the sheet — they render inline below the top bar on
 * all viewports (Shell prompt 2 override). The sheet is for cross-module
 * switching only, which is rare.
 *
 * Animation: the sheet is always-mounted with class toggling (translate-x
 * + opacity) so the slide-in animates both directions. The backdrop only
 * intercepts pointer events when open.
 *
 * Role badge mapping mirrors IdentityMenu: highest-privilege wins.
 */

const FACTORYOS_LABEL = {
  factory_manager: "Factory Mgr",
  factory_executive: "Factory Exec",
  account_manager: "Account Mgr",
  customer: null,
};

function roleBadge(session) {
  if (!session) return null;
  if (session.isAdmin) return "Admin";
  const fos = session.modules?.factoryos;
  const calc = session.modules?.calculator;
  const rcs = session.modules?.rate_cards;
  if (fos === "admin" || calc === "admin" || rcs === "admin") return "Admin";
  return FACTORYOS_LABEL[fos] ?? null;
}

export function MobileNav({ modules, activeKey, currentPath, session, onSignOut }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const sheetRef = useRef(null);
  const lastActive = useRef(null);

  // Body scroll lock + ESC + focus restore. Only active while the sheet is open.
  useEffect(() => {
    if (!open) return;
    lastActive.current = document.activeElement;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
      // Restore focus on close.
      if (lastActive.current instanceof HTMLElement) {
        lastActive.current.focus();
      } else {
        triggerRef.current?.focus();
      }
    };
  }, [open]);

  // Close on route change so a tap on a module link dismisses the sheet.
  useEffect(() => {
    setOpen(false);
  }, [currentPath]);

  const name = session?.name || (session?.isAdmin ? "Admin" : session?.email) || "—";
  const email = session?.isAdmin ? null : session?.email;
  const badge = roleBadge(session);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="mobile-nav-sheet"
        className="h-9 w-9 inline-flex items-center justify-center rounded text-ink-700 hover:bg-ink-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-royal-600"
      >
        <Hamburger />
      </button>

      {/* Backdrop + sheet — always mounted so transitions animate both ways. */}
      <div
        className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`}
        aria-hidden={!open}
      >
        {/* Backdrop */}
        <div
          onClick={() => setOpen(false)}
          className={`absolute inset-0 bg-ink-900/40 backdrop-blur-sm transition-opacity duration-200 ease-out ${
            open ? "opacity-100" : "opacity-0"
          }`}
        />
        {/* Sheet */}
        <aside
          id="mobile-nav-sheet"
          ref={sheetRef}
          role="dialog"
          aria-modal={open}
          aria-label="Menu"
          className={`absolute right-0 top-0 h-full w-80 max-w-[85vw] bg-ink-50 border-l border-ink-200 flex flex-col transition-transform duration-200 ease-out ${
            open ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="h-14 flex items-center justify-end px-4 border-b border-ink-200">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="h-9 w-9 inline-flex items-center justify-center rounded text-ink-700 hover:bg-ink-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-royal-600"
            >
              <Close />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto py-2">
            {modules.map((m) => {
              const isActive = activeKey === m.key;
              return (
                <Link
                  key={m.key}
                  href={m.href}
                  className={`flex items-center h-12 px-4 text-base transition-colors ${
                    isActive
                      ? "bg-ink-100 text-ink-900 border-l-2 border-royal-600 font-medium"
                      : "text-ink-700 hover:bg-ink-100 border-l-2 border-transparent"
                  }`}
                >
                  {m.label}
                </Link>
              );
            })}
            {modules.length === 0 && (
              <p className="px-4 py-3 text-sm text-ink-400">No modules available.</p>
            )}
          </nav>

          {/* Identity panel pinned to bottom. Anonymous visitors see a
              Sign-in link instead of the user block + Sign-out button. */}
          <div className="border-t border-ink-200 px-4 py-4 bg-white">
            {session ? (
              <>
                <p className="text-sm font-medium text-ink-900 truncate">{name}</p>
                {email && <p className="text-xs font-mono text-ink-400 truncate mt-0.5">{email}</p>}
                {badge && <p className="text-xs text-ink-600 mt-1">{badge}</p>}
                <Link
                  href="/profile"
                  onClick={() => setOpen(false)}
                  className="mt-3 inline-flex items-center justify-center h-9 px-3 rounded text-sm text-ink-800 hover:bg-ink-50 transition-colors w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-royal-600"
                >
                  Edit profile
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onSignOut();
                  }}
                  className="mt-2 inline-flex items-center justify-center h-9 px-3 rounded text-sm text-ink-600 hover:bg-ink-50 hover:text-ink-800 transition-colors w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-royal-600"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="inline-flex items-center justify-center h-10 px-3 rounded text-sm font-medium text-white bg-royal-600 hover:bg-royal-700 transition-colors w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-royal-600 focus-visible:ring-offset-2"
              >
                Sign in
              </Link>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

function Hamburger() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function Close() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
