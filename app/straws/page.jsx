import { fetchStraws, USD_PER_INR_DIVISOR } from "@/lib/straws";
import { Brand } from "@/app/components/ui/Brand";
import { StrawGuide } from "./StrawGuide";
import { SupplyTerms, QualityChecks, PackingVisual } from "./TradeTerms";
import StrawsBrowser from "./StrawsBrowser";
import { CurrencyProvider, CurrencyToggle, RateModeToggle } from "./Currency";
import { PricingBasisValue, RateBasisFootnote } from "./RateBasisCopy";

// Public, no-login rate sheet shared directly with clients. Not in the
// middleware matcher, so it renders for anyone with the link.
export const revalidate = 300;

export const metadata = {
  title: "Aeros Straws — Rate Sheet",
  description:
    "Aeros plastic-free straw range — food-grade paper and plant-based rice straws, bulk or individually wrapped, across all common bore sizes. Per-piece rates, EXW India. Compostable, food-safe.",
};

export default async function StrawsPage() {
  let data = null;
  let error = null;
  try {
    data = await fetchStraws();
  } catch (e) {
    error = e.message;
  }

  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <CurrencyProvider initialCurrency="INR" initialRateMode="fcl">
      <div className="min-h-screen bg-ink-50 text-ink-800">
        {/* Masthead — sticky so the currency / basis toggles stay reachable. */}
        <header className="sticky top-0 z-20 border-b border-ink-200 bg-white">
          <div className="mx-auto max-w-5xl px-4 py-4 md:px-6 flex flex-wrap items-center justify-between gap-3">
            <Brand size="md" href="/" />
            <div className="flex items-center gap-2">
              <RateModeToggle />
              <CurrencyToggle />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-10 md:px-6">
          {/* Title block */}
          <div className="max-w-2xl">
            <h1 className="text-display-md font-bold text-ink-900">Straws</h1>
            <p className="mt-3 text-ink-600">
              Our complete plastic-free straw range — food-grade <strong>paper</strong> and
              plant-based <strong>rice</strong> straws, across every common bore (Ø6 – Ø13 mm) and
              length. Supplied bulk-bagged or individually paper-wrapped. A genuine single-use-plastic
              replacement, compostable and food-safe.
            </p>
          </div>

          {error ? (
            <div className="mt-8 rounded-md border border-ink-200 bg-white p-4 text-ink-600">
              <p className="font-semibold text-ink-900">Rates are temporarily unavailable.</p>
              <p className="mt-1 text-sm">Please contact us directly for current straw pricing.</p>
            </div>
          ) : (
            <>
              {/* Pricing terms */}
              <section className="mt-8 grid gap-3 rounded-md border border-ink-200 bg-white p-5 text-sm text-ink-600 sm:grid-cols-2">
                <Term label="Pricing basis">
                  <PricingBasisValue />
                </Term>
                <Term label="Currency">
                  Quoted in <strong className="text-ink-900">INR (₹)</strong>. Switch the toggle for
                  indicative USD, converted at ₹{USD_PER_INR_DIVISOR}/$.
                </Term>
                <Term label="Minimum order">
                  Priced <strong className="text-ink-900">per piece</strong> against the MOQ listed per
                  item (typically 5,000 – 10,000 pcs). Case rate is the unit rate × case pack.
                </Term>
                <Term label="Customisation">
                  Straws are supplied <strong className="text-ink-900">plain</strong>. Custom-printed
                  wrappers (for individually-wrapped straws) are available on request.
                </Term>
              </section>

              {/* Supply terms + packing visuals + quality/compliance */}
              <SupplyTerms />
              <PackingVisual />
              <QualityChecks />

              {/* Educational guide */}
              <StrawGuide />

              {/* Filterable rate sheet */}
              <StrawsBrowser
                sections={data.sections}
                plainPriced={data.plainPriced}
                total={data.total}
                usdPerInr={USD_PER_INR_DIVISOR}
              />

              {/* Footnotes */}
              <div className="mt-10 space-y-1 text-xs text-ink-400">
                <p>
                  Unit rate is per piece at the order quantity shown; case rate is the unit rate ×
                  case pack. USD is indicative only, converted from INR at ₹{USD_PER_INR_DIVISOR}/$ —
                  invoicing is in INR unless otherwise agreed.
                </p>
                <RateBasisFootnote />
                <p>
                  {data.plainPriced} of {data.total} sizes listed with live rates. The remainder —
                  including the rice range — are quoted on request.
                </p>
              </div>
            </>
          )}
        </main>

        <footer className="border-t border-ink-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 md:px-6">
            <p className="text-sm text-ink-600">Aeros — Mumbai, India</p>
            <p className="font-mono text-xs text-ink-400">Updated {today}</p>
          </div>
        </footer>
      </div>
    </CurrencyProvider>
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
