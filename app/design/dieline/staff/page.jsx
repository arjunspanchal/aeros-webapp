import { redirect } from "next/navigation";
import { getSession, requireInternal, requireAdminStrict } from "@/lib/auth/session";
import AppHeader from "../../../components/AppHeader";
import Header from "../../../components/Header";
import Footer from "../../../components/Footer";
import StaffDielineClient from "./StaffDielineClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Design — Aeros",
  description: "KLD and artwork: proven Aeros templates only, every die and artwork checked for print and production limits before download.",
};

export default function StaffDielinePage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!requireInternal(session)) redirect("/hub"); // staff only: proven sizes carry customer names and our printers
  const isAdmin = requireAdminStrict(session);

  return (
    <>
      <AppHeader session={session} />
      <Header
        title="Design: KLD and artwork"
        subtitle="Pick a proven template, enter the size, board and colours, place the artwork. Everything is checked against our printing and making limits; files open only when every check passes."
      />
      <main className="mx-auto max-w-[2000px] px-4 py-6 sm:px-6">
        <StaffDielineClient />
        {isAdmin && (
          <p className="mt-8 text-xs text-gray-500 dark:text-gray-400">
            Admin: a die style that is not a template yet (cartons, pizza and gable boxes, sleeves, trays, carriers, non-woven bags) is in the{" "}
            <a href="/design/dieline" className="underline">all-styles generator</a>. Its output is not checked like this screen.
          </p>
        )}
      </main>
      <Footer />
    </>
  );
}
