import { redirect } from "next/navigation";

// The customer-message inbox was removed with customer logins (Arjun,
// 17/18-Nov-2026). Old links land on FactoryOS home.
export default function InboxRemoved() {
  redirect("/factoryos");
}
