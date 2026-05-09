"use client";
// Persistent sidebar for the RFQs module — covers both /rate-cards and
// /rfq-manager. Three sections:
//   1. RFQs nav — RFQ Manager (the customer-facing PDF archive).
//   2. Rate Cards nav — All Cards / Past Quotes / + New Card (admin only).
//   3. Card list — every card the user can see; jumps to detail.
//
// Layout-side: only rendered on md+ (mobile uses the AppHeader sub-tabs).

import Link from "next/link";
import { usePathname } from "next/navigation";

function NavRow({ href, active, children }) {
  return (
    <Link
      href={href}
      className={`block px-3 py-2 rounded-md text-sm transition-colors ${
        active
          ? "bg-blue-50 text-blue-700 font-medium dark:bg-blue-900/40 dark:text-blue-300"
          : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
      }`}
    >
      {children}
    </Link>
  );
}

export default function RateCardsSidebar({ role, cards = [], clientLabel = "" }) {
  const pathname = usePathname();
  const isAdmin = role === "admin";

  const onRfqManager = pathname === "/rfq-manager" || pathname.startsWith("/rfq-manager/");
  const onAllCards = pathname === "/rate-cards";
  const onPastQuotes = pathname === "/rate-cards/quotes";
  const onNewCard = pathname === "/rate-cards/admin/new";

  return (
    <nav aria-label="RFQs navigation" className="space-y-6">
      {/* RFQs primary surface */}
      <div className="space-y-1">
        <div className="px-3 mb-2 text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
          RFQs
        </div>
        <NavRow href="/rfq-manager" active={onRfqManager}>
          RFQ Manager
        </NavRow>
      </div>

      {/* Rate Cards sub-section */}
      <div className="space-y-1">
        <div className="px-3 mb-2 text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
          Rate Cards
        </div>
        <NavRow href="/rate-cards" active={onAllCards}>
          {isAdmin ? "All Cards" : "My Rate Cards"}
        </NavRow>
        <NavRow href="/rate-cards/quotes" active={onPastQuotes}>
          Past Quotes
        </NavRow>
        {isAdmin && (
          <NavRow href="/rate-cards/admin/new" active={onNewCard}>
            <span className="text-blue-600 dark:text-blue-400">+ New Card</span>
          </NavRow>
        )}
      </div>

      {/* Card list — jump straight to a specific card's detail. */}
      {cards.length > 0 && (
        <div className="space-y-1">
          <div className="px-3 mb-2 flex items-center justify-between text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
            <span>{isAdmin ? "All cards" : "Your cards"}</span>
            <span className="font-mono normal-case text-gray-300 dark:text-gray-600">
              {cards.length}
            </span>
          </div>
          <div className="max-h-[60vh] overflow-y-auto pr-1 space-y-0.5">
            {cards.map((c) => {
              const active = pathname === `/rate-cards/${c.id}`;
              const subtitle = isAdmin
                ? c.clientName || c.clientEmail
                : c.brand || c.ref;
              return (
                <Link
                  key={c.id}
                  href={`/rate-cards/${c.id}`}
                  className={`block px-3 py-2 rounded-md text-sm transition-colors ${
                    active
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                      : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                  }`}
                >
                  <div className="font-medium truncate">
                    {c.title || c.brand || c.ref}
                  </div>
                  {subtitle && (
                    <div className="text-[11px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
                      {subtitle}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Identity footer — soft reminder of who's signed in. */}
      {clientLabel && (
        <div className="px-3 pt-4 mt-2 border-t border-gray-200 dark:border-gray-800 text-[11px] text-gray-400 dark:text-gray-500 truncate">
          {clientLabel}
        </div>
      )}
    </nav>
  );
}
