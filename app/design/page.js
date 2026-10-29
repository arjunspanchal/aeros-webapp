import { redirect } from "next/navigation";
import { getSession } from "@/lib/hub/session";
import AppHeader from "../components/AppHeader";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { canUseStudio } from "@/lib/design/artwork-studio";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Design — Aeros",
  description: "Dieline Generator and Artwork Studio.",
};

// The per-product keyline / mockup browser (DesignClient) is off the page
// for now (Arjun 2026-10-25: "I don't need these dielines online now") —
// its files stay in the design-files bucket and the API routes still work.
export default function DesignPage() {
  const session = getSession();
  if (!session) redirect("/login");

  const cardCls =
    "mb-6 flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-600";

  return (
    <>
      <AppHeader session={session} />
      <Header title="Design" subtitle="Make keylines and customer artwork." />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <a href="/design/dieline" className={cardCls}>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Dieline Generator</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Parametric KLD for lock-corner cake / snack boxes — any size, download PDF / SVG / DXF.
            </p>
          </div>
          <span aria-hidden className="text-gray-400">→</span>
        </a>
        {canUseStudio(session) && (
          <a href="/design/artwork-studio" className={cardCls}>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Artwork Studio</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Make customer artwork for 8 / 12 / 16 oz paper cups, U-shape PP / PET cups and deli wrap sheets — upload the logo, get a proof on the real keyline.
              </p>
            </div>
            <span aria-hidden className="text-gray-400">→</span>
          </a>
        )}
      </main>
      <Footer />
    </>
  );
}
