import { redirect } from "next/navigation";
import { getSession } from "@/lib/hub/session";
import { canUseStudio } from "@/lib/design/artwork-studio";
import AppHeader from "../../../components/AppHeader";
import Header from "../../../components/Header";
import Footer from "../../../components/Footer";
import JobClient from "./JobClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "Artwork job — Aeros" };

export default function ArtworkJobPage({ params }) {
  const session = getSession();
  if (!session) redirect("/login");
  if (!canUseStudio(session)) redirect("/design");

  return (
    <>
      <AppHeader session={session} />
      <Header title="Artwork Studio" subtitle="Proof, files and changes for one artwork." />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <JobClient jobId={params.id} />
      </main>
      <Footer />
    </>
  );
}
