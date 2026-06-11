import { fetchPaperCups, USD_PER_INR_DIVISOR } from "@/lib/paper-cups";
import { Brand } from "@/app/components/ui/Brand";
import { AllRatesLink } from "@/app/components/ui/AllRatesLink";
import { CupGuide } from "./CupGuide";
import { SupplyTerms, QualityChecks, PackingVisual, PrintingAndCoverage } from "./TradeTerms";
import PaperCupsBrowser from "./PaperCupsBrowser";
import { CurrencyProvider, CurrencyToggle, UnitToggle, RateModeToggle } from "./Currency";
import { PricingBasisValue, RateBasisFootnote } from "./RateBasisCopy";

// Public, no-login rate sheet shared directly with clients. Not in the
// middleware matcher, so it renders for anyone with the link.
export const revalidate = 300;

export const metadata = {
  title: "Aeros Paper Cups — Rate Sheet",
  description:
    "Aeros paper cup range — single-wall, double-wall and ripple cups in PE, aqueous and PLA coatings. Quantity-break rates, EXW India. Food-safe.",
};

export default async function PaperCupsPage() {
  let data = null;
  let error = null;
  try {
    data = await fetchPaperCups();
  } catch (e) {
    error = e.message;
  }

  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <CurrencyProvider initialCurrency="INR" initialUnit="mm" initialOffering="plain">
      <div className="min-h-screen bg-ink-50 text-ink-800">
        {/* Masthead — sticky so the currency / unit toggles stay reachable. */}
        <header className="sticky top-0 z-20 border-b border-ink-200 bg-white">
          <div className="mx-auto max-w-5xl px-4 py-4 md:px-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Brand size="md" href="/" />
              <AllRatesLink />
            </div>
            <div className="flex items-center gap-2">
              <RateModeToggle />
              <CurrencyToggle />
              <UnitToggle />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-10 md:px-6">
          {/* Title block */}
          <div className="max-w-2xl">
            <h1 className="text-display-md font-bold text-ink-900">Paper Cups</h1>
            <p className="mt-3 text-ink-600">
              Our complete paper hot &amp; cold cup range, manufactured in Mumbai, India.
              Single-wall, double-wall and ripple cups — in white and natural brown kraft, with
              PE, water-based aqueous and compostable PLA coatings.
            </p>
          </div>

          {error ? (
            <div className="mt-8 rounded-md border border-ink-200 bg-white p-4 text-ink-600">
              <p className="font-semibold text-ink-900">Rates are temporarily unavailable.</p>
              <p className="mt-1 text-sm">
                Please contact us directly for current paper-cup pricing.
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
                  Quoted in <strong className="text-ink-900">INR (₹)</strong>. Switch the toggle for
                  indicative USD, converted at ₹{USD_PER_INR_DIVISOR}/$.
                </Term>
                <Term label="Quantity breaks">
                  Bulk cups are priced on a <strong className="text-ink-900">quantity ladder</strong> —
                  the unit rate drops as order quantity rises. Tap a row to see every break.
                </Term>
                <Term label="Customisation">
                  Custom print up to 4 colours across the range. Switch to{" "}
                  <strong className="text-ink-900">Customised</strong> for{" "}
                  <strong className="text-ink-900">indicative</strong> rates on a quantity ladder
                  from 5,000 pcs — the final price is confirmed with your artwork.
                </Term>
              </section>

              {/* Supply terms + packing visuals + quality/compliance */}
              <SupplyTerms />
              <PackingVisual />
              <QualityChecks />

              {/* Print methods + ink-coverage explainer */}
              <PrintingAndCoverage />

              {/* Educational guide */}
              <CupGuide />

              {/* Filterable rate sheet */}
              <PaperCupsBrowser
                sections={data.sections}
                plainPriced={data.plainPriced}
                printedPriced={data.printedPriced}
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
                  Customised (printed) rates are an approximate indication only — the final price
                  depends on your artwork (ink coverage, colour count and finish) and is confirmed
                  when we quote your design.
                </p>
                <p>
                  Plain: {data.plainPriced} of {data.total} sizes listed with live rates ·
                  Customised: {data.printedPriced} of {data.total}. The remainder are quoted on
                  request.
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
