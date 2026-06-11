"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Plain sign-out button — mirrors the AppHeader identity menu behaviour but
// surfaces it directly on the profile page so mobile customers (where the
// identity menu lives behind a hamburger) can find it without hunting.
export default function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
  }
  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      className="inline-flex items-center px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
