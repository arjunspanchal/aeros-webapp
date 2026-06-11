"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Re-pins the customer's active client to match the job they're viewing.
// Rendered by the detail page only when the job belongs to a different
// linked client than the currently pinned one (deep link / stale tab).
//
// Why a client component: cookies can only be written in a Server Action or
// Route Handler — calling setActiveClientId() during the page's server
// render threw "Cookies can only be modified in a Server Action or Route
// Handler" and 500'd the page (audit P0). This fires the existing
// active-client route once on mount, then refreshes so the nav picker and
// back-navigation reflect the job's client.
export default function ScopeSync({ clientId }) {
  const router = useRouter();
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current || !clientId) return;
    fired.current = true;
    fetch("/api/factoryos/customer/active-client", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    })
      .then((r) => { if (r.ok) router.refresh(); })
      .catch(() => {});
  }, [clientId, router]);
  return null;
}
