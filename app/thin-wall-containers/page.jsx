import { fetchThinWallContainers, USD_PER_INR_DIVISOR } from "@/lib/thin-wall-containers";
import { Brand } from "@/app/components/ui/Brand";
import { AllRatesLink } from "@/app/components/ui/AllRatesLink";
import ThinWallBrowser from "./ThinWallBrowser";
import { CurrencyProvider, CurrencyToggle, UnitToggle, ColourToggle } from "./Currency";

// Public, no-login rate sheet shared directly with clients. Not in the
// middleware matcher, so it renders for anyone with the link.
export const revalidate = 300;

export const metadata = {
  title: "Aeros PP Thin-Wall Containers — Rate Sheet",
  description:
    "Aeros injection-moulded polypropylene container range — round & rectangular containers, compartment meal trays, thalis, bowls, buckets, lockable tamper-evident tubs, sauce cups and sweet boxes, each with a matching clear lid. Clear or black base, quantity rates, EXW India. Microwave-safe, freezer-safe, recyclable.",
};

export default async function ThinWallContainersPage() {
  let data = null;
  let error = null;
  try {
    data = await fetchThinWallContainers();
  } catch (e) {
    error = e.message;
  }

  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <CurrencyProvider initialCurrency="INR" initialUnit="mm" initialColour="all">
      <div className="min-h-screen bg-ink-50 text-ink-800">
        {/* Masthead — sticky so the toggles stay reachable. */}
        <header className="sticky top-0 z-20 border-b border-ink-200 bg-white">
          <div className="mx-auto max-w-5xl px-4 py-4 md:px-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Brand size="md" href="/" />
              <AllRatesLink />
            </div>
            <div className="flex items-center gap-2">
              <ColourToggle />
              <CurrencyToggle />
              <UnitToggle />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-10 md:px-6">
          {/* Title block */}
          <div className="max-w-2xl">
            <h1 className="text-display-md font-bold text-ink-900">PP Thin-Wall Containers</h1>
            <p className="mt-3 text-ink-600">
              Our injection-moulded polypropylene container range, manufactured in Mumbai, India —{" "}
              <strong className="text-ink-900">round</strong> and{" "}
              <strong className="text-ink-900">rectangular</strong> containers,{" "}
              <strong className="text-ink-900">compartment meal trays &amp; thalis</strong>,{" "}
              <strong className="text-ink-900">bowls</strong>,{" "}
              <strong className="text-ink-900">buckets</strong>,{" "}
              <strong className="text-ink-900">lockable tamper-evident</strong> tubs,{" "}
              <strong className="text-ink-900">sauce cups</strong> and{" "}
              <strong className="text-ink-900">sweet boxes</strong>. Every item is supplied as a set
              with a matching clear lid, in a clear or black base. Microwave-safe, freezer-safe,
              leak-resistant and recyclable.
            </p>
          </div>

          {error ? (
            <div className="mt-8 rounded-md border border-ink-200 bg-white p-4 text-ink-600">
              <p className="font-semibold text-ink-900">Rates are temporarily unavailable.</p>
              <p className="mt-1 text-sm">
                Please contact us directly for current PP thin-wall container pricing.
              </p>
            </div>
          ) : (
            <>
              {/* Pricing terms */}
              <section className="mt-8 grid gap-3 rounded-md border border-ink-200 bg-white p-5 text-sm text-ink-600 sm:grid-cols-2">
                <Term label="Pricing basis">
                  Rates are <strong className="text-ink-900">EXW India, per piece</strong>, and
                  include the matching clear lid. FOB Nhava Sheva and landed quotes available on
                  request.
                </Term>
                <Term label="Currency">
                  Quoted in <strong className="text-ink-900">INR (₹)</strong>. Switch the toggle for
                  indicative USD, converted at ₹{USD_PER_INR_DIVISOR}/$.
                </Term>
                <Term label="Base colour">
                  Each size ships in a <strong className="text-ink-900">clear</strong> or{" "}
                  <strong className="text-ink-900">black</strong> base at the same rate — the lid is
                  always clear. Use the colour toggle to narrow the sheet.
                </Term>
                <Term label="Forming &amp; print">
                  Injection-moulded PP is supplied{" "}
                  <strong className="text-ink-900">plain</strong> — the range takes no print. Add
                  branding with an in-mould label (IML) or a sleeve, quoted separately.
                </Term>
              </section>

              {/* Full-container-load disclaimer */}
              <p className="mt-4 rounded-md border border-ink-200 bg-white px-4 py-3 text-xs text-ink-500">
                Rates assume <strong className="text-ink-700">full-container-load (FCL)</strong>{" "}
                quantities. Part / LCL loads carry higher per-piece costs — ask us for an LCL quote.
              </p>

              {/* Filterable rate sheet */}
              <ThinWallBrowser
                sections={data.sections}
                priced={data.priced}
                total={data.total}
                usdPerInr={USD_PER_INR_DIVISOR}
              />

              {/* Footnotes */}
              <div className="mt-10 space-y-1 text-xs text-ink-400">
                <p>
                  Unit rate is per piece (container + clear lid) at the minimum order quantity shown;
                  case rate is the unit rate × case pack. USD is indicative only, converted from INR
                  at ₹{USD_PER_INR_DIVISOR}/$ — invoicing is in INR unless otherwise agreed.
                </p>
                <p>
                  Rates are EXW India, exclusive of freight, insurance, duties and GST, and assume
                  full-container-load quantities. Prices subject to change with resin costs.
                </p>
                <p>
                  Live rates for {data.priced} of {data.total} sizes, each available in clear and
                  black base. Dimensions marked pending are supplied on confirmation; the remainder
                  are quoted on request.
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
