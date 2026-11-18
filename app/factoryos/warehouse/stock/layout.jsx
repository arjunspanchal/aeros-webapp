import { redirect } from "next/navigation";
import { getSession } from "@/lib/hub/session";
import { canSeeStock, canWorkWarehouse } from "@/lib/warehouse/access";
import StockNav from "./_components/StockNav";

export default function StockLayout({ children }) {
  const session = getSession();
  if (!canSeeStock(session)) redirect("/factoryos/warehouse");
  return (
    <>
      <StockNav canWork={canWorkWarehouse(session)} />
      {children}
    </>
  );
}
