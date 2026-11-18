import { redirect } from "next/navigation";

// The Delivery Plan board was removed (Arjun, 18-Nov-2026). Old links land on
// the Production Calendar. The job_dispatch_schedule table stays (Cowork reads it).
export default function DeliveryPlanRemoved() {
  redirect("/factoryos/delivery/calendar");
}
