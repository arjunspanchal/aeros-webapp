import { redirect } from "next/navigation";
import { getSession } from "@/lib/hub/session";
import {
  canAdminStudio,
  canApprove,
  canUseStudio,
  DAILY_CAP_INR,
  getLiveRules,
  PRODUCTS,
  spentTodayInr,
  userKey,
} from "@/lib/design/artwork-studio";
import AppHeader from "../../components/AppHeader";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import StudioClient from "./StudioClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Artwork Studio — Aeros",
  description: "Make paper cup, PP and PET cup artworks on Aeros keylines.",
};

export default async function ArtworkStudioPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!canUseStudio(session)) redirect("/design");

  let live = null;
  let spent = 0;
  let error = null;
  try {
    [live, spent] = await Promise.all([getLiveRules(), spentTodayInr(userKey(session))]);
  } catch (e) {
    error = e.message;
  }

  return (
    <>
      <AppHeader session={session} />
      <Header
        title="Artwork Studio"
        subtitle="Upload the customer's logo, describe the design, and get a customer proof on the real Aeros keyline. Paper cups 8 / 12 / 16 oz and U-shape PP / PET cups only."
      />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        ) : (
          <StudioClient
            products={PRODUCTS}
            liveRules={live ? { version: live.version_no, publishedAt: live.published_at } : null}
            me={{
              email: userKey(session),
              isAdmin: canAdminStudio(session),
              canApprove: canApprove(session),
              spentTodayInr: spent,
              capInr: session.isAdmin ? null : DAILY_CAP_INR,
            }}
          />
        )}
      </main>
      <Footer />
    </>
  );
}
