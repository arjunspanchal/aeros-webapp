import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isInternalRole } from "@/lib/factoryos/constants";

export default function CalculatorPickerPage() {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.calculator;
  if (!session || !role) redirect("/login");

  const isAdmin = role === "admin";
  const rolePath = isAdmin ? "admin" : "client";

  const isInternal = isInternalRole(session.modules?.factoryos);

  const products = [
    {
      href: `/calculator/${rolePath}`,
      title: "Paper Bag Rate Calculator",
      desc: "SOS, handle and V-bottom bags. Live paper + print + pasting cost breakdown.",
      accent: "from-blue-600 to-indigo-700",
    },
    {
      href: `/calculator/${rolePath}/box`,
      title: "Custom Box Rate Calculator",
      desc: "Cake, clam, boat tray and burger boxes. Die-cut + pasting + printing cost.",
      accent: "from-emerald-600 to-teal-700",
    },
    {
      href: `/calculator/${rolePath}/cup`,
      title: "Paper Cup Rate Calculator",
      desc: "Single-wall, double-wall and ripple cups with coating, printing and margin breakdown.",
      accent: "from-amber-600 to-orange-700",
    },
    {
      href: "/calculator/container-stuffing",
      title: "Container Stuffing Calculator",
      desc: "Plan exports — FCL floor, FCL pallet or LCL. Multi-item loads with a top-down stuffing diagram.",
      accent: "from-fuchsia-600 to-purple-700",
    },
    // Admin-only: AppHeader carries a PP sub-tab for admins; keep the picker
    // in sync so admins land on the same set of products from either nav.
    ...(isAdmin
      ? [
          {
            href: "/calculator/admin/pp",
            title: "PP Item Rate Calculator",
            desc: "Thermoformed PP cups and lids — RM, forming labour and packing breakdown.",
            accent: "from-cyan-600 to-sky-700",
          },
        ]
      : []),
    ...(isInternal
      ? [
          {
            href: "/calculator/import-calculator",
            title: "Import Calculator (China → India)",
            desc: "Landed cost from FOB through duty, freight, clearance, handling and margin. Multi-item LCL or FCL.",
            accent: "from-rose-600 to-red-700",
          },
          {
            href: "/calculator/express-ship",
            title: "Express Ship Calculator (India / China → USA)",
            desc: "DHL Express air landed price — product, freight on chargeable kg, US duty, MPF and margin. Single SKU per quote.",
            accent: "from-slate-700 to-gray-900",
          },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* max-w-7xl matches AppHeader so the heading and tile grid line up
          beneath the header instead of starting at a narrower gutter. */}
      <div className="max-w-7xl mx-auto px-3 sm:px-4 pt-6 pb-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-1 dark:text-white">Aeros Rate Calculators</h1>
        <p className="text-sm text-gray-500 mb-8 dark:text-gray-400">Pick a product to start a quote.</p>
        {/* 1 / 2 / 3 / 4 cols across breakpoints. With 3 tiles (client) or 4
            tiles (admin), every row stays full — no orphan card. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
          {products.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              className={`flex flex-col rounded-xl p-6 text-white shadow-sm bg-gradient-to-br ${p.accent} hover:shadow-md transition-shadow`}
            >
              <h2 className="text-lg font-semibold mb-1">{p.title}</h2>
              <p className="text-sm text-white/80 flex-1">{p.desc}</p>
              <p className="text-xs text-white/70 mt-4">Open →</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
