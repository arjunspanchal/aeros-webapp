// Admin-only lead-capture tool for NRA Show 2026 (Booth #12937, McCormick
// Place Chicago, 16-19 May 2026). Arjun walks the floor scanning business
// cards and logging exhibitors; the page is locked to staff admins. No
// public form, no visitor self-registration — that experiment is gone.

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import CaptureClient from "./CaptureClient";

export const metadata = {
  title: "NRA list · Aeros · NRA 2026",
  description: "Lead capture for NRA Show 2026 — internal use.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function isStaffAdmin(session) {
  if (!session) return false;
  if (session.isAdmin) return true;
  return session.modules?.factoryos === "admin";
}

export default function NraCapturePage() {
  const session = getSession();
  if (!session) redirect("/login?next=/nra/capture");
  if (!isStaffAdmin(session)) redirect("/hub");
  return <CaptureClient session={session} />;
}
