// Self-serve lead-capture page for NRA Show 2026 (Booth #12937, McCormick
// Place Chicago, 16-19 May 2026). Hand the phone to a visitor and they fill
// in their own details; submit writes to public.nra_leads via /api/nra/leads.
// Owner mode (5 taps on the wordmark) lets Arjun review, edit, export, or
// delete captured leads — gated server-side on the hub admin session.

import CaptureClient from "./CaptureClient";

export const metadata = {
  title: "Say hello · Aeros · NRA 2026",
  description: "Drop your details and we'll follow up after the show.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function NraCapturePage() {
  return <CaptureClient />;
}
