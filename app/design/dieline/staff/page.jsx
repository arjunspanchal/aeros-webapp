import { redirect } from "next/navigation";
import { getSession } from "@/lib/hub/session";
import AppHeader from "../../../components/AppHeader";
import Header from "../../../components/Header";
import Footer from "../../../components/Footer";
import StaffDielineClient from "./StaffDielineClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Make a KLD — Aeros",
  description: "Staff keyline maker: proven Aeros templates only, every die checked for print and production limits before download.",
};

export default function StaffDielinePage() {
  const session = getSession();
  if (!session) redirect("/login");

  return (
    <>
      <AppHeader session={session} />
      <Header
        title="Make a KLD"
        subtitle="Pick a proven template, enter the size, board and colours. The die is checked against our printing and making limits; downloads open only when every check passes."
      />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <StaffDielineClient />
      </main>
      <Footer />
    </>
  );
}
