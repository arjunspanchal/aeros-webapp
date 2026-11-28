import { redirect } from "next/navigation";

// Paper rates moved out of FactoryOS on 17-Nov-2026 (no rates in FactoryOS).
// Old links land on the Calculator admin page.
export default function MasterPapersMoved() {
  redirect("/calculator/v2/papers");
}
