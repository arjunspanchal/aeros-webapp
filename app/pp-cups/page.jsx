import { fetchPpCupsAndLids, USD_PER_INR_DIVISOR } from "@/lib/pp-cups";
import { Brand } from "@/app/components/ui/Brand";
import { PpGuide } from "./PpGuide";
import {
  SupplyTerms,
  QualityChecks,
  PackingVisual,
  Customisation,
  ExportReadiness,
  OrderingAndSamples,
} from "./TradeTerms";
import PpCupsBrowser from "./PpCupsBrowser";
import { CurrencyProvider, CurrencyToggle, UnitToggle, BasisToggle } from "./Currency";

// Public, no-login rate sheet shared directly with clients. Not in the
// middleware matcher, so it renders for anyone with the link.
export const revalidate = 300;

export const metadata = {
  title: "Aeros PP Cups & IM Lids — Rate Sheet",
  description:
    "Aeros polypropylene cold cup range — flat-bottom and U-shape, plain or frosted — with matching injection-molded dome, flat and sipper lids. Quantity-break rates, EXW India. Food-safe, recyclable.",
};

export default async function PpCupsPage() {
  let data = null;
  let error = null;
  try {
    data = await fetchPpCupsAndLids();
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
            <Brand size="md" href="/" />
            <div className="flex items-center gap-2">
              <BasisToggle />
              <CurrencyToggle />
              <UnitToggle />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-10 md:px-6">
          {/* Title block */}
          <div className="max-w-2xl">
            <h1 className="text-display-md font-bold text-ink-900">PP Cups &amp; IM Lids</h1>
            <p className="mt-3 text-ink-600">
              Our complete polypropylene cold-drink range, supplied from Mumbai, India. Tough,
              flexible cups in flat-bottom and U-shape profiles (Ø90 mm), translucent or frosted,
              with matching injection-molded dome, flat and sipper lids. Cups plain or
              custom-branded; lids supplied plain. Country of origin is listed and filterable
              per item.
            </p>
          </div>

          {error ? (
            <div className="mt-8 rounded-md border border-ink-200 bg-white p-4 text-ink-600">
              <p className="font-semibold text-ink-900">Rates are temporarily unavailable.</p>
              <p className="mt-1 text-sm">
                Please contact us directly for current PP cup &amp; lid pricing.
              </p>
            </div>
          ) : (
            <>
              {/* Pricing terms */}
              <section className="mt-8 grid gap-3 rounded-md border border-ink-200 bg-white p-5 text-sm text-ink-600 sm:grid-cols-2">
                <Term label="Pricing basis">
                  Per piece, for <strong className="text-ink-900">full-container (FCL)</strong> loads.
                  Toggle between <strong className="text-ink-900">Export · EXW India</strong> and{" "}
                  <strong className="text-ink-900">India · DDP</strong> (delivered duty-paid) in the
                  masthead. Part / LCL loads cost more — quoted on request.
                </Term>
                <Term label="Currency">
                  Quoted in <strong className="text-ink-900">INR (₹)</strong>. Switch the toggle for
                  indicative USD, converted at ₹{USD_PER_INR_DIVISOR}/$.
                </Term>
                <Term label="Quantity breaks">
                  Custom-branded cups and injection-molded lids are priced on a{" "}
                  <strong className="text-ink-900">quantity ladder</strong> — the unit rate drops as
                  order quantity rises. Tap a row to see every break.
                </Term>
                <Term label="Customisation">
                  Cups can be custom-printed; switch to{" "}
                  <strong className="text-ink-900">Customised</strong> for live rates. Lids are
                  supplied <strong className="text-ink-900">plain</strong> across the range.
                </Term>
              </section>

              {/* Supply terms + packing visuals + export readiness + quality */}
              <SupplyTerms />
              <PackingVisual />
              <ExportReadiness />
              <QualityChecks />

              {/* Educational guide + customisation */}
              <PpGuide />
              <Customisation />

              {/* Filterable rate sheet */}
              <PpCupsBrowser
                sections={data.sections}
                plainPriced={data.plainPriced}
                printedPriced={data.printedPriced}
                total={data.total}
                usdPerInr={USD_PER_INR_DIVISOR}
              />

              {/* Samples, ordering steps + contact CTA */}
              <OrderingAndSamples />

              {/* Footnotes */}
              <div className="mt-10 space-y-1 text-xs text-ink-400">
                <p>
                  Unit rate is per piece at the order quantity shown; case rate is the unit rate ×
                  case pack. USD is indicative only, converted from INR at ₹{USD_PER_INR_DIVISOR}/$ —
                  invoicing is in INR unless otherwise agreed.
                </p>
                <p>
                  All rates are for <strong className="text-ink-500">full-container (FCL)</strong>{" "}
                  loads. <strong className="text-ink-500">Export · EXW India</strong> is ex-works,
                  exclusive of freight, insurance, duties and GST.{" "}
                  <strong className="text-ink-500">India · DDP</strong> is delivered duty-paid within
                  India (freight included), exclusive of GST. Part / LCL loads, FOB Nhava Sheva and
                  overseas landed quotes available on request. Prices subject to change with resin
                  costs.
                </p>
                <p>
                  Plain: {data.plainPriced} of {data.total} items listed with live rates ·
                  Customised cups: {data.printedPriced} of {data.total}. The remainder are quoted on
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
