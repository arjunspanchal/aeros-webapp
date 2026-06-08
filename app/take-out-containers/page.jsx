import { fetchTakeOutContainers, USD_PER_INR_DIVISOR } from "@/lib/take-out-containers";
import { Brand } from "@/app/components/ui/Brand";
import TakeOutBrowser from "./TakeOutBrowser";
import { CurrencyProvider, CurrencyToggle, UnitToggle, OfferingToggle } from "./Currency";

// Public, no-login rate sheet shared directly with clients. Not in the
// middleware matcher, so it renders for anyone with the link.
export const revalidate = 300;

export const metadata = {
  title: "Aeros Take Out Containers — Rate Sheet",
  description:
    "Aeros paper take-out container range — paper tubs, ice cream tubs and round, rectangular & square salad bowls, plus matching lids. Quantity-break rates, EXW India. White & kraft, plain or custom-printed.",
};

export default async function TakeOutContainersPage() {
  let data = null;
  let error = null;
  try {
    data = await fetchTakeOutContainers();
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
        {/* Masthead — sticky so the toggles stay reachable. */}
        <header className="sticky top-0 z-20 border-b border-ink-200 bg-white">
          <div className="mx-auto max-w-5xl px-4 py-4 md:px-6 flex flex-wrap items-center justify-between gap-3">
            <Brand size="md" href="/" />
            <div className="flex items-center gap-2">
              <OfferingToggle />
              <CurrencyToggle />
              <UnitToggle />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-10 md:px-6">
          {/* Title block */}
          <div className="max-w-2xl">
            <h1 className="text-display-md font-bold text-ink-900">Take Out Containers</h1>
            <p className="mt-3 text-ink-600">
              Our paper take-out vessel range, manufactured in Mumbai, India — round{" "}
              <strong className="text-ink-900">paper tubs</strong>,{" "}
              <strong className="text-ink-900">ice cream tubs</strong>, and{" "}
              <strong className="text-ink-900">salad bowls</strong> in round, rectangular and square
              shapes. White or kraft board, plain or custom-printed. Matching flat &amp; dome lids —
              paper, PP and PET — are listed in their own section below.
            </p>
          </div>

          {error ? (
            <div className="mt-8 rounded-md border border-ink-200 bg-white p-4 text-ink-600">
              <p className="font-semibold text-ink-900">Rates are temporarily unavailable.</p>
              <p className="mt-1 text-sm">
                Please contact us directly for current take-out container pricing.
              </p>
            </div>
          ) : (
            <>
              {/* Pricing terms */}
              <section className="mt-8 grid gap-3 rounded-md border border-ink-200 bg-white p-5 text-sm text-ink-600 sm:grid-cols-2">
                <Term label="Pricing basis">
                  Rates are <strong className="text-ink-900">EXW India, per piece</strong>. FOB Nhava
                  Sheva and landed quotes available on request.
                </Term>
                <Term label="Currency">
                  Quoted in <strong className="text-ink-900">INR (₹)</strong>. Switch the toggle for
                  indicative USD, converted at ₹{USD_PER_INR_DIVISOR}/$.
                </Term>
                <Term label="Quantity breaks">
                  Most items are priced on a{" "}
                  <strong className="text-ink-900">quantity ladder</strong> — the unit rate drops as
                  order quantity rises. Tap a row to see every break.
                </Term>
                <Term label="Plain vs custom">
                  Toggle the rate sheet between{" "}
                  <strong className="text-ink-900">Plain</strong> and{" "}
                  <strong className="text-ink-900">Customised</strong>. Under Customised, items with
                  a printed rate show their ladder and the rest show <em>on request</em>; printing
                  adds a one-time plate charge, billed separately.
                </Term>
              </section>

              {/* Full-container-load disclaimer */}
              <p className="mt-4 rounded-md border border-ink-200 bg-white px-4 py-3 text-xs text-ink-500">
                Rates assume <strong className="text-ink-700">full-container-load (FCL)</strong>{" "}
                quantities. Part / LCL loads carry higher per-piece costs — ask us for an LCL quote.
              </p>

              {/* Filterable rate sheet */}
              <TakeOutBrowser
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
                <p>
                  Rates are EXW India, exclusive of freight, insurance, duties and GST, and assume
                  full-container-load quantities. Prices subject to change with board costs.
                </p>
                <p>
                  Plain rates live for {data.plainPriced} of {data.total} items
                  {data.printedPriced ? `; customised rates for ${data.printedPriced}` : ""}
                  {data.lidCount ? ` (incl. ${data.lidCount} matching lids)` : ""}. The remainder
                  are quoted on request. Lids fit by rim diameter (round) or footprint (square /
                  rectangular).
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
