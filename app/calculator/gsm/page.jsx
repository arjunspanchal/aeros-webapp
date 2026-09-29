import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import GsmCalculator from "@/app/calculator/_components/GsmCalculator";

export const metadata = {
  title: "GSM Calculator — Aeros",
  description: "Board GSM from a weighed sample — 10 × 10 cm, 5 × 5 cm, a punched disc or any cut piece.",
};

// Open to every calculator role. Board purchase rates and sheet cost show for
// admins only; clients get the GSM reading and nearest grade.
export default function GsmPage() {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.calculator;
  if (!session || !role) redirect("/login");

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 pt-6 pb-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-1 dark:text-white">GSM Calculator</h1>
      <p className="text-sm text-gray-500 mb-6 dark:text-gray-400">
        Weigh a cut sample of the board and read its real GSM.
      </p>
      <GsmCalculator scope={role === "admin" ? "admin" : "client"} />
    </div>
  );
}
