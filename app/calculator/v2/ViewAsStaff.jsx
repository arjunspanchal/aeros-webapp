"use client";
// An admin's switch to look at the calculator the way staff see it, and the
// banner that says so while it is on. The switch is a cookie the server reads:
// with it set, an admin is sent exactly what a staff login is sent (no cost,
// margin or rates), on every calculator page and request. It only ever lowers
// what an admin sees, and does nothing for anyone who is not an admin.

const COOKIE = "calc_view";

function setView(on) {
  document.cookie = on ? `${COOKIE}=staff; path=/; max-age=7200; samesite=lax` : `${COOKIE}=; path=/; max-age=0; samesite=lax`;
  window.location.reload();
}

export function ViewAsStaffLink() {
  return (
    <button type="button" onClick={() => setView(true)} className="text-ink-600 hover:text-ink-800">
      View as staff
    </button>
  );
}

export function StaffPreviewBanner() {
  return (
    // Fixed to the bottom of the window so it is always in sight, whatever the scroll.
    <div role="status" className="fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center justify-between gap-3 border-t border-amber-500 bg-amber-50 px-4 py-2 text-sm text-amber-800 shadow-[0_-2px_8px_rgba(0,0,0,0.08)]">
      <span>You are seeing the calculator as staff see it: selling prices only, standard rates and margin. A quote saved now is saved that way.</span>
      <button type="button" onClick={() => setView(false)} className="rounded border border-amber-500 bg-white px-3 py-1 font-medium text-amber-800 hover:bg-amber-50">
        Back to admin view
      </button>
    </div>
  );
}
