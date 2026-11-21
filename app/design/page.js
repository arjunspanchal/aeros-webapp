import { redirect } from "next/navigation";
import { getSession, requireInternal } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

// The Design section is ONE tool: the staff KLD + artwork screen (21-Nov-2026, Arjun: "Fix the design section properly").
// Aeros staff only - it shows proven sizes with customer names and our printers, so vendor logins never reach it.
// The older all-styles Dieline Generator stays for admins at /design/dieline (linked from the tool).
// Removed earlier: the AI Artwork Studio (21-Nov-2026; its Supabase tables are kept) and the per-product keyline browser.
export default function DesignPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!requireInternal(session)) redirect("/hub");
  redirect("/design/dieline/staff");
}
