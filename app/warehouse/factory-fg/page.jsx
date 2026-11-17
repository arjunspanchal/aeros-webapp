import { redirect } from "next/navigation";

// Replaced by the dispatch queue (17-Nov-2026), which lists jobs by stage so
// nothing the factory marks ready can be missing from the warehouse's list.
export default function FactoryFgPage() {
  redirect("/warehouse/dispatch");
}
