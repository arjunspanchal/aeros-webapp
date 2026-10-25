import { redirect } from "next/navigation";
import { getSession } from "@/lib/hub/session";
import {
  canManageDesign,
  listProductsWithDesignSummary,
} from "@/lib/design/files";
import AppHeader from "../components/AppHeader";
import Header from "../components/Header";
import Footer from "../components/Footer";
import DesignClient from "./DesignClient";
import { canUseStudio } from "@/lib/design/artwork-studio";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Design — Aeros",
  description:
    "Download keylines and mockups for Aeros products. Keyline = KLD = outline (same file).",
};

export default async function DesignPage() {
  const session = getSession();
  if (!session) redirect("/login");

  let products = [];
  let error = null;
  try {
    products = await listProductsWithDesignSummary();
  } catch (e) {
    error = e.message;
  }

  const canManage = canManageDesign(session);

  return (
    <>
      <AppHeader session={session} />
      <Header
        title="Design"
        subtitle={
          canManage
            ? "Browse products, upload and manage keylines (KLD / outline) and mockups."
            : "Browse products and download keylines (KLD / outline) and mockups."
        }
        itemCount={products.length}
        itemLabel="products"
      />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <a
          href="/design/dieline"
          className="mb-6 flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-600"
        >
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Dieline Generator</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Parametric KLD for lock-corner cake / snack boxes — any size, download PDF / SVG / DXF.
            </p>
          </div>
          <span aria-hidden className="text-gray-400">→</span>
        </a>
        {canUseStudio(session) && (
          <a
            href="/design/artwork-studio"
            className="mb-6 flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-600"
          >
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Artwork Studio</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Make customer artwork for 8 / 12 / 16 oz paper cups and U-shape PP / PET cups — upload the logo, get a proof on the real keyline.
              </p>
            </div>
            <span aria-hidden className="text-gray-400">→</span>
          </a>
        )}
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            <p className="font-semibold">Could not load products.</p>
            <p className="mt-1 text-sm">{error}</p>
          </div>
        ) : (
          <DesignClient initialProducts={products} canManage={canManage} />
        )}
      </main>
      <Footer />
    </>
  );
}
