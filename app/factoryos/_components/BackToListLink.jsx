"use client";
// Back-to-list helper for job detail pages (PR_F context-preservation).
//
// The job-detail "← All jobs" / "← Back to admin" link historically pushed
// the user to a fresh /factoryos/manager (or /admin) — which lost whatever
// filter state they had just used to find this job. With ManagerJobsView
// now mirroring filter state to the URL, the browser back button correctly
// restores the filtered list — but only when the user actually CAME from
// that list in the same tab.
//
// This component uses router.back() to take that path when possible. If
// there's no in-app history (shared link, refresh, opened in new tab), it
// falls back to the provided href so the user still has somewhere to go.
//
// The "is there history?" heuristic is `window.history.length > 1`, which
// catches the common cases. Edge case: navigating away from a different
// tab in this same window can cause length > 1 even without an in-app
// referrer, but the worst case there is one extra back press — acceptable
// trade-off for the common-case win.
import { useRouter } from "next/navigation";

export default function BackToListLink({ href, label = "← Back", className = "" }) {
  const router = useRouter();
  const baseClass = "text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400";
  function go(e) {
    e.preventDefault();
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(href);
    }
  }
  return (
    <a
      href={href}
      onClick={go}
      className={className ? `${baseClass} ${className}` : baseClass}
    >
      {label}
    </a>
  );
}
