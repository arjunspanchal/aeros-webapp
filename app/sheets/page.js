import { redirect } from "next/navigation";
import { getSession, requireInternal } from "@/lib/auth/session";
import { listSheets } from "@/lib/sheets/repo";
import SheetsListClient from "./SheetsListClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sheets · Aeros",
  description: "Team spreadsheets — shared, autosaved, online.",
};

export default async function SheetsPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!requireInternal(session)) redirect("/hub");

  const sheets = await listSheets().catch(() => []);

  return <SheetsListClient initialSheets={sheets} currentEmail={session.email || ""} />;
}
