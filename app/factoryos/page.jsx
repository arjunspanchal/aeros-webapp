import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { ROLES } from "@/lib/factoryos/constants";

export const dynamic = "force-dynamic";

export default function OrdersRoot() {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.factoryos;
  if (!session || !role) redirect("/login");
  if (role === ROLES.CUSTOMER) redirect("/hub"); // customer portal removed 17-Nov-2026
  if (role === ROLES.ADMIN) redirect("/factoryos/admin");
  if (role === ROLES.VENDOR) redirect("/factoryos/vendor");
  if (role === ROLES.WAREHOUSE) redirect("/warehouse/dispatch");
  redirect("/factoryos/manager");
}
