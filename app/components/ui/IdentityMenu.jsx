"use client";
import { useState, useRef, useEffect } from "react";
import { Badge } from "./Badge";
import { Button } from "./Button";

/**
 * Identity dropdown for the desktop top bar.
 *
 * Trigger shows the user's name (email fallback) + an optional role badge
 * for non-default roles. Menu opens on click; closes on click-outside or
 * ESC. Focus moves to the first menu item on open and returns to the
 * trigger on close. Lighter than a full focus-trap because the menu
 * has one focusable item (Sign out) — Tab from there moves to the next
 * focusable element after the menu, which is fine.
 *
 * Role badge mapping (highest-privilege wins):
 *   isAdmin || any module role === 'admin'  → "Admin"
 *   factoryos: factory_manager              → "Factory Mgr"
 *   factoryos: factory_executive            → "Factory Exec"
 *   factoryos: account_manager              → "Account Mgr"
 *   factoryos: customer / null              → no badge
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

export function IdentityMenu({ session, onSignOut }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e) {
      if (panelRef.current?.contains(e.target)) return;
      if (triggerRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    // Move focus to the first focusable item in the panel.
    const first = panelRef.current?.querySelector("button, [href], input");
    first?.focus();
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const name = session?.name || (session?.isAdmin ? "Admin" : session?.email) || "—";
  const email = session?.isAdmin ? null : session?.email;
  const badge = roleBadge(session);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-2 h-9 px-2 rounded text-sm text-ink-800 hover:bg-ink-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-royal-600 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-50"
      >
        <span className="max-w-[180px] truncate">{name}</span>
        {badge && <Badge>{badge}</Badge>}
        <ChevronDown />
      </button>
      {open && (
        <div
          ref={panelRef}
          role="menu"
          className="absolute right-0 mt-2 w-64 rounded-md border border-ink-200 bg-white shadow-sm py-2 z-50"
        >
          <div className="px-3 py-2">
            <p className="text-sm font-medium text-ink-900 truncate">{name}</p>
            {email && <p className="text-xs font-mono text-ink-400 truncate mt-0.5">{email}</p>}
            {badge && <p className="text-xs text-ink-600 mt-1">{badge}</p>}
          </div>
          <div className="border-t border-ink-200" />
          <div className="px-2 pt-2">
            <Button
              variant="tertiary"
              size="sm"
              className="w-full justify-start"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ChevronDown() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M3 4.5L6 7.5L9 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
