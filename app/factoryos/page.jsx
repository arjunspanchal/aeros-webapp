import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { ROLES } from "@/lib/factoryos/constants";

export const dynamic = "force-dynamic";

export default function OrdersRoot() {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.factoryos;
  if (!session || !role) redirect("/login");
  if (role === ROLES.ADMIN) redirect("/factoryos/admin");
  if (role === ROLES.CUSTOMER) redirect("/factoryos/customer");
  if (role === ROLES.VENDOR) redirect("/factoryos/vendor");
  redirect("/factoryos/manager");
}
