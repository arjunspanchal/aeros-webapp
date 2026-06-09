import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isInternalRole } from "@/lib/factoryos/constants";
import { dbSelect } from "@/lib/db/supabase";

export const dynamic = "force-dynamic";

// PR-E: "Resume — recent quotes" strip above the picker tile grid. Audit
// finding #12: the picker was a wall of identical gradient cards; operators
// stop reading the descriptions after 2 weeks and click by colour memory.
// Resume gives them the most-likely next action (continue the quote they
// were already on) and breaks the visual sameness.
//
// One quotes_v2 round-trip — clients are scoped to their email; admin and
// internal staff see everything across types. Worst-case 5 rows × small
// payload, well under PostgREST's default page. Fetched server-side so the
// landing page stays a single SSR roundtrip.
function quoteRouteFor(quoteType, role) {
  const adminPath = role === "admin";
  if (quoteType === "bag")          return `/calculator/${adminPath ? "admin" : "client"}?quote=`;
  if (quoteType === "box")          return `/calculator/${adminPath ? "admin" : "client"}/box?quote=`;
  if (quoteType === "cup")          return `/calculator/${adminPath ? "admin" : "client"}/cup?quote=`;
  if (quoteType === "pp")           return "/calculator/admin/pp?quote=";
  if (quoteType === "express_ship") return "/calculator/express-ship?quote=";
  if (quoteType === "import")       return "/calculator/import-calculator?quote=";
  return null;
}

function quoteTypeLabel(t) {
  if (t === "bag")          return "Bag";
  if (t === "box")          return "Box";
  if (t === "cup")          return "Cup";
  if (t === "pp")           return "PP";
  if (t === "express_ship") return "Express";
  if (t === "import")       return "Import";
  return t || "Quote";
}

function quoteTypeColor(t) {
  if (t === "bag")          return "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
  if (t === "box")          return "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
  if (t === "cup")          return "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
  if (t === "pp")           return "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300";
  if (t === "express_ship") return "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300";
  if (t === "import")       return "bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300";
  return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300";
}

function shortSummary(type, p) {
  if (type === "bag") {
    const dims = [p.width_mm, p.gusset_mm, p.height_mm].filter(Boolean).join("×");
    return dims ? `${dims}mm` : (p.bag_type || "");
  }
  if (type === "box") {
    const o = [p.open_length_mm, p.open_width_mm].filter(Boolean).join("×");
    return o ? `${o}mm` : (p.box_type || "");
  }
  if (type === "cup") {
    return [p.size_label, p.wall_type].filter(Boolean).join(" · ");
  }
  if (type === "pp") return p.item_name || "";
  if (type === "express_ship") return [p.origin, p.destination_zip].filter(Boolean).join(" → ");
  if (type === "import") return p.vendor_name || "";
  return "";
}

async function fetchRecentQuotes(session, role, isInternal) {
  try {
    const allowedTypes = isInternal || role === "admin"
      ? ["bag", "box", "cup", "pp", "express_ship", "import"]
      : ["bag", "box", "cup"]; // clients save bag + box + cup
    const filter = {
      quote_type: `in.(${allowedTypes.join(",")})`,
    };
    if (role === "client") {
      filter.client_email = `eq.${(session.email || "").toLowerCase()}`;
    }
    const rows = await dbSelect("quotes_v2", {
      select: "id,quote_type,quote_ref,quote_date,payload,airtable_id",
      filter,
      order: "quote_date.desc,created_at.desc",
      limit: 3,
    });
    return rows.map((r) => ({
      id: r.airtable_id || r.id,
      type: r.quote_type,
      ref: r.quote_ref || "",
      date: r.quote_date || "",
      summary: shortSummary(r.quote_type, r.payload || {}),
    }));
  } catch {
    // If the DB call fails we hide the strip — landing tile grid still
    // renders. Absence is honest.
    return [];
  }
}

export default async function CalculatorPickerPage() {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.calculator;
  if (!session || !role) redirect("/login");

  const isAdmin = role === "admin";
  const rolePath = isAdmin ? "admin" : "client";

  const isInternal = isInternalRole(session.modules?.factoryos);
  const recentQuotes = await fetchRecentQuotes(session, role, isInternal);

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
      href: `/calculator/${rolePath}/wrap`,
      title: "Wrap Paper Rate Calculator",
      desc: "Flat food-wrap sheets — paper from Master (Pudumjee / BILT), Flexo or Offset, per-sheet cost ladder.",
      accent: "from-lime-600 to-green-700",
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
        <p className="text-sm text-gray-500 mb-6 dark:text-gray-400">Pick a product to start a quote.</p>

        {/* Resume strip — only renders when the viewer has saved quotes. Lets
            an admin or client jump straight back to the most recent N
            without remembering which calculator they were in. Each card
            reuses the existing ?quote=<id> loader on the target calculator
            page; no new wiring needed downstream. */}
        {recentQuotes.length > 0 && (
          <div className="mb-8">
            <div className="flex items-baseline justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Resume — recent quotes</h2>
              <Link
                href={isAdmin ? "/calculator/admin/history" : "/calculator/client/quotes"}
                className="text-xs text-blue-600 hover:underline dark:text-blue-400"
              >
                See all →
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {recentQuotes.map((q) => {
                const base = quoteRouteFor(q.type, role);
                if (!base) return null;
                return (
                  <Link
                    key={`${q.type}-${q.id}`}
                    href={`${base}${q.id}`}
                    className="block rounded-lg border border-gray-200 bg-white px-3 py-2.5 hover:border-blue-400 dark:bg-gray-900 dark:border-gray-800 dark:hover:border-blue-500 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded ${quoteTypeColor(q.type)}`}>
                        {quoteTypeLabel(q.type)}
                      </span>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">{q.date || "—"}</span>
                    </div>
                    <p className="text-sm font-medium text-gray-900 truncate dark:text-white">{q.ref || "Untitled quote"}</p>
                    {q.summary && (
                      <p className="text-xs text-gray-500 truncate dark:text-gray-400 mt-0.5">{q.summary}</p>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

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
