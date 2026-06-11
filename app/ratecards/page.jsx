import Link from "next/link";
import { Brand } from "@/app/components/ui/Brand";

// Public, no-login hub for every public rate sheet. Like the sheets it links
// to, it's not in the middleware matcher, so it renders for anyone with the
// link. Share this URL instead of six separate ones. NOTE: /rate-cards (with
// the hyphen) is the auth-gated internal module — this route is deliberately
// unhyphenated so the middleware matcher doesn't catch it.

export const metadata = {
  title: "Aeros Rate Sheets — Food Packaging Rates",
  description:
    "Live rate sheets across the Aeros food-packaging range — paper cups, PP & PET cold cups with lids, paper bags, take-out containers and straws. Plain and custom-branded, quoted in INR, ex-works India.",
};

const SHEETS = [
  {
    href: "/paper-cups",
    eyebrow: "Hot & cold cups",
    title: "Paper Cups",
    description:
      "Single-wall, double-wall and ripple cups in PE, aqueous and PLA coatings. Plain or custom-printed, with quantity-break rates.",
  },
  {
    href: "/pp-cups",
    eyebrow: "Cold cups",
    title: "PP Cups & IM Lids",
    description:
      "Polypropylene cold cups in F-Bottom and U-Bottom profiles, clear or frosted, with matching injection-molded dome and sipper lids.",
  },
  {
    href: "/pet-cups",
    eyebrow: "Cold cups",
    title: "PET Cups & Lids",
    description:
      "Crystal-clear PET cold cups with matching dome, flat and sipper lids. Plain and custom-branded rates on a quantity ladder.",
  },
  {
    href: "/paper-bags",
    eyebrow: "Carry bags",
    title: "Paper Bags",
    description:
      "Plain kraft range — SOS sacks, twisted-handle, flat-handle and bottle bags. FSC-certified, food-safe, per-piece rates.",
  },
  {
    href: "/take-out-containers",
    eyebrow: "Containers",
    title: "Take Out Containers",
    description:
      "Paper tubs, ice cream tubs and round, rectangular & square salad bowls with matching lids. White & kraft, plain or custom-printed.",
  },
  {
    href: "/straws",
    eyebrow: "Straws",
    title: "Paper & Rice Straws",
    description:
      "Plastic-free straws — food-grade paper and plant-based rice, bulk or individually wrapped, across all common bore sizes.",
  },
];

export default function RateCardsHubPage() {
  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-ink-50 text-ink-800">
      <header className="sticky top-0 z-20 border-b border-ink-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-4 md:px-6">
          <Brand size="md" href="/" />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 md:px-6">
        {/* Title block */}
        <div className="max-w-2xl">
          <h1 className="text-display-md font-bold text-ink-900">Rate Sheets</h1>
          <p className="mt-3 text-ink-600">
            Live, always-current rates across the Aeros food-packaging range. Every sheet is
            public — no login needed — so feel free to share the links directly with your team.
          </p>
        </div>

        {/* Sheet directory */}
        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          {SHEETS.map((sheet) => (
            <Link
              key={sheet.href}
              href={sheet.href}
              className="group flex flex-col rounded-md border border-ink-200 bg-white p-5 transition-colors hover:border-ink-400"
            >
              <p className="text-xs uppercase tracking-wide text-ink-400">{sheet.eyebrow}</p>
              <h2 className="mt-1 text-lg font-bold text-ink-900">{sheet.title}</h2>
              <p className="mt-2 flex-1 text-sm text-ink-600">{sheet.description}</p>
              <p className="mt-4 text-sm font-semibold text-ink-900 group-hover:underline">
                View rates &rarr;
              </p>
            </Link>
          ))}
        </section>

        {/* Shared terms */}
        <section className="mt-8 grid gap-3 rounded-md border border-ink-200 bg-white p-5 text-sm text-ink-600 sm:grid-cols-2">
          <Term label="Currency">
            All rates are quoted in <strong className="text-ink-900">INR (₹)</strong>; each sheet
            has a toggle for indicative USD.
          </Term>
          <Term label="Order basis">
            Rates are for <strong className="text-ink-900">full container loads</strong>. Part /
            LCL loads are quoted separately and cost more — ask us for a quote.
          </Term>
        </section>
      </main>

      <footer className="border-t border-ink-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 md:px-6">
          <p className="text-sm text-ink-600">Aeros — Mumbai, India</p>
          <p className="font-mono text-xs text-ink-400">Updated {today}</p>
        </div>
      </footer>
    </div>
  );
}

function Term({ label, children }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
