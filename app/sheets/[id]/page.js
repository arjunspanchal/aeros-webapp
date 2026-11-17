import { redirect, notFound } from "next/navigation";
import { getSession, requireInternal } from "@/lib/auth/session";
import { getSheet } from "@/lib/sheets/repo";
import SheetEditorClient from "./SheetEditorClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const sheet = await getSheet(params.id).catch(() => null);
  return { title: `${sheet?.name || "Sheet"} · Aeros Sheets` };
}

export default async function SheetPage({ params }) {
  const session = getSession();
  if (!session) redirect("/login");
  if (!requireInternal(session)) redirect("/hub");

  const sheet = await getSheet(params.id).catch(() => null);
  if (!sheet) notFound();

  return <SheetEditorClient initialSheet={sheet} currentEmail={session.email || ""} />;
}
