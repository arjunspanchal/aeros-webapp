// Brand repository — internal-only reference for the Aeros team.
//
// URL: /brand. No nav links anywhere on the website (clients/visitors
// won't discover it through the app). Auth-gated to staff
// (FE/FM/AM/Admin); customers and clients are bounced. The URL
// itself is shareable inside the team — once authed, anyone with
// the link gets in.

import { redirect } from "next/navigation";
import { getSession } from "@/lib/hub/session";
import { canAccessBrandRepo, listBrandFiles } from "@/lib/brand/files";
import AppHeader from "@/app/components/AppHeader";
import Footer from "@/app/components/Footer";
import BrandKitClient from "./BrandKitClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Brand — Aeros internal",
  // Discourage indexing on the off chance the URL leaks.
  robots: { index: false, follow: false, nocache: true },
  description: "Internal brand repository — logos, colors, typography, voice, and assets.",
};

export default async function BrandRepoPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!canAccessBrandRepo(session)) {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <AppHeader session={session} />
        <main className="flex-1 mx-auto w-full max-w-2xl px-4 py-16">
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-800">
            <p className="text-lg font-semibold">Access denied</p>
            <p className="mt-2 text-sm">
              The brand repository is restricted to Aeros staff. If you should
              have access, ask Admin / FM to grant a staff role.
            </p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  let files = [];
  let loadError = null;
  try {
    files = await listBrandFiles();
  } catch (e) {
    loadError = e?.message || "Could not list assets";
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader session={session} />
      <main className="flex-1">
        <BrandKitClient initialFiles={files} loadError={loadError} />
      </main>
      <Footer />
    </div>
  );
}
