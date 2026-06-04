import { fetchPetCupsAndLids, USD_PER_INR_DIVISOR } from "@/lib/pet-cups";
import { Brand } from "@/app/components/ui/Brand";
import { PetGuide } from "./PetGuide";
import { SupplyTerms, QualityChecks, PackingVisual } from "./TradeTerms";
import PetCupsBrowser from "./PetCupsBrowser";
import { CurrencyProvider, CurrencyToggle, UnitToggle } from "./Currency";

// Public, no-login rate sheet shared directly with clients. Not in the
// middleware matcher, so it renders for anyone with the link.
export const revalidate = 300;

export const metadata = {
  title: "Aeros PET Cups & Lids — Rate Sheet",
  description:
    "Aeros clear PET cold cup range with matching dome, flat and sipper lids. Quantity-break rates on custom-branded cups, EXW India. Food-safe, recyclable.",
};

export default async function PetCupsPage() {
  let data = null;
  let error = null;
  try {
    data = await fetchPetCupsAndLids();
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
              <CurrencyToggle />
              <UnitToggle />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-10 md:px-6">
          {/* Title block */}
          <div className="max-w-2xl">
            <h1 className="text-display-md font-bold text-ink-900">PET Cups &amp; Lids</h1>
            <p className="mt-3 text-ink-600">
              Our complete clear PET cold-drink range, manufactured in Mumbai, India. Crystal-clear,
              rigid thermoformed cups in standard and U-shape profiles (Ø92 / Ø98 mm), with
              matching dome, flat and sipper lids. Cups plain or custom-branded; lids supplied
              clear.
            </p>
          </div>

          {error ? (
            <div className="mt-8 rounded-md border border-ink-200 bg-white p-4 text-ink-600">
              <p className="font-semibold text-ink-900">Rates are temporarily unavailable.</p>
              <p className="mt-1 text-sm">
                Please contact us directly for current PET cup &amp; lid pricing.
              </p>
            </div>
          ) : (
            <>
              {/* Pricing terms */}
              <section className="mt-8 grid gap-3 rounded-md border border-ink-200 bg-white p-5 text-sm text-ink-600 sm:grid-cols-2">
                <Term label="Pricing basis">
                  Rates are <strong className="text-ink-900">EXW India, per piece</strong>. Toggle
                  between <strong className="text-ink-900">plain</strong> and{" "}
                  <strong className="text-ink-900">customised</strong> cups in the rate sheet. FOB
                  Nhava Sheva quoted on request.
                </Term>
                <Term label="Currency">
                  Quoted in <strong className="text-ink-900">INR (₹)</strong>. Switch the toggle for
                  indicative USD, converted at ₹{USD_PER_INR_DIVISOR}/$.
                </Term>
                <Term label="Quantity breaks">
                  Custom-branded cups are priced on a{" "}
                  <strong className="text-ink-900">quantity ladder</strong> from 1,000 pcs — the unit
                  rate drops as order quantity rises. Tap a row to see every break.
                </Term>
                <Term label="Customisation">
                  Cups can be custom-printed; switch to{" "}
                  <strong className="text-ink-900">Customised</strong> for live rates. Lids are
                  supplied <strong className="text-ink-900">clear/plain</strong> across the range.
                </Term>
              </section>

              {/* Supply terms + packing visuals + quality/compliance */}
              <SupplyTerms />
              <PackingVisual />
              <QualityChecks />

              {/* Educational guide */}
              <PetGuide />

              {/* Filterable rate sheet */}
              <PetCupsBrowser
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
                  Rates are EXW India, exclusive of freight, insurance, duties and GST. FOB Nhava
                  Sheva and landed quotes available on request. Prices subject to change with resin
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
