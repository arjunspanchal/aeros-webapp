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

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Design — Aeros",
  description:
    "Download Keylines, KLDs, outlines and mockups for Aeros products.",
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
            ? "Browse products, upload and manage design assets — KLDs, keylines, outlines, mockups."
            : "Browse products and download design assets — KLDs, keylines, outlines, mockups."
        }
        itemCount={products.length}
        itemLabel="products"
      />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
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
