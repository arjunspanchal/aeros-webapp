import { fetchPaperBags, USD_PER_INR_DIVISOR } from "@/lib/paper-bags";
import { Brand } from "@/app/components/ui/Brand";
import { BagGuide } from "./BagGuide";
import {
  SupplyTerms,
  QualityChecks,
  PackingVisual,
  Customisation,
  ExportReadiness,
  OrderingAndSamples,
} from "./TradeTerms";
import PaperBagsBrowser from "./PaperBagsBrowser";
import { CurrencyProvider, CurrencyToggle, UnitToggle, MarketToggle, RateModeToggle } from "./Currency";
import { PricingBasisValue, RateBasisFootnote } from "./RateBasisCopy";

// Public, no-login rate sheet shared directly with clients. Not in the
// middleware matcher, so it renders for anyone with the link.
export const revalidate = 300;

export const metadata = {
  title: "Aeros Paper Bags — Rate Sheet",
  description:
    "Aeros plain kraft paper bag range — SOS sacks, twisted-handle, flat-handle and bottle bags. Per-piece rates, EXW India. FSC-certified, food-safe.",
};

export default async function PaperBagsPage() {
  let data = null;
  let error = null;
  try {
    data = await fetchPaperBags();
  } catch (e) {
    error = e.message;
  }

  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <CurrencyProvider initialCurrency="INR" initialUnit="mm" initialMarket="Exports">
      <div className="min-h-screen bg-ink-50 text-ink-800">
        {/* Masthead — sticky so the currency / unit toggles stay reachable. */}
        <header className="sticky top-0 z-20 border-b border-ink-200 bg-white">
          <div className="mx-auto max-w-5xl px-4 py-4 md:px-6 flex flex-wrap items-center justify-between gap-3">
            <Brand size="md" href="/" />
            <div className="flex items-center gap-2">
              <RateModeToggle />
              <MarketToggle />
              <CurrencyToggle />
              <UnitToggle />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-10 md:px-6">
          {/* Title block */}
          <div className="max-w-2xl">
            <h1 className="text-display-md font-bold text-ink-900">Paper Bags</h1>
            <p className="mt-3 text-ink-600">
              Our complete plain kraft paper-bag range, manufactured in Mumbai, India.
              Self-opening sacks, twisted-handle carry bags, flat-handle and bottle bags —
              available in natural brown and bleached white kraft.
            </p>
          </div>

          {error ? (
            <div className="mt-8 rounded-md border border-ink-200 bg-white p-4 text-ink-600">
              <p className="font-semibold text-ink-900">Rates are temporarily unavailable.</p>
              <p className="mt-1 text-sm">
                Please contact us directly for current paper-bag pricing.
              </p>
            </div>
          ) : (
            <>
              {/* Pricing terms */}
              <section className="mt-8 grid gap-3 rounded-md border border-ink-200 bg-white p-5 text-sm text-ink-600 sm:grid-cols-2">
                <Term label="Pricing basis">
                  <PricingBasisValue />
                </Term>
                <Term label="Currency">
                  Quoted in <strong className="text-ink-900">INR (₹)</strong>. Switch the toggle
                  for indicative USD, converted at ₹{USD_PER_INR_DIVISOR}/$.
                </Term>
                <Term label="Minimum order">
                  Sold by the case. Case pack (pieces/carton) and case rate are listed per bag.
                </Term>
                <Term label="Customisation">
                  Custom print, sizes and white-kraft options available — ask for a quote.
                </Term>
              </section>

              {/* Supply terms + packing visuals + export readiness + quality */}
              <SupplyTerms />
              <PackingVisual />
              <ExportReadiness />
              <QualityChecks />

              {/* Educational guide + customisation */}
              <BagGuide />
              <Customisation />

              {/* Filterable rate sheet */}
              <PaperBagsBrowser
                sections={data.sections}
                printedSections={data.printedSections}
                priced={data.priced}
                total={data.total}
                printedTotal={data.printedTotal}
                usdPerInr={USD_PER_INR_DIVISOR}
              />

              {/* Samples, ordering steps + contact CTA */}
              <OrderingAndSamples />

              {/* Footnotes */}
              <div className="mt-10 space-y-1 text-xs text-ink-400">
                <p>
                  Unit rate is per piece; case rate is the unit rate × case pack. USD is
                  indicative only, converted from INR at ₹{USD_PER_INR_DIVISOR}/$ — invoicing is in
                  INR unless otherwise agreed.
                </p>
                <RateBasisFootnote />
                <p>
                  {data.priced} of {data.total} sizes are listed with live rates; the remainder
                  are quoted on request.
                </p>
                <p>
                  Carton CBM is the volume of one shipping carton (case pack). Values marked
                  with ~ are estimated from the bag size where a carton spec isn&apos;t yet on
                  file — confirmed on order.
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
