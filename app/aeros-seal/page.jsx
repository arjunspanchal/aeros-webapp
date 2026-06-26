import { fetchSealMachines, USD_PER_INR_DIVISOR } from "@/lib/seal-machines";
import { Brand } from "@/app/components/ui/Brand";
import { AllRatesLink } from "@/app/components/ui/AllRatesLink";
import SealBrowser from "./SealBrowser";
import { CurrencyProvider, CurrencyToggle } from "./Currency";

// Public, no-login rate sheet shared directly with clients. Not in the
// middleware matcher, so it renders for anyone with the link.
export const revalidate = 300;

export const metadata = {
  title: "AeroSeal Sealer Machines — Rate Sheet",
  description:
    "AeroSeal manual cup, tub and universal sealing machines — heat-seal film lids onto PP, PET and paper cups and tubs. Four cup-sealer control tiers plus tub and universal models. Per-unit rates, delivered India.",
};

export default async function AerosSealPage() {
  let data = null;
  let error = null;
  try {
    data = await fetchSealMachines();
  } catch (e) {
    error = e.message;
  }

  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <CurrencyProvider initialCurrency="INR">
      <div className="min-h-screen bg-ink-50 text-ink-800">
        {/* Masthead — sticky so the currency toggle stays reachable. */}
        <header className="sticky top-0 z-20 border-b border-ink-200 bg-white">
          <div className="mx-auto max-w-5xl px-4 py-4 md:px-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Brand size="md" href="/" />
              <AllRatesLink />
            </div>
            <div className="flex items-center gap-2">
              <CurrencyToggle />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-10 md:px-6">
          {/* Title block */}
          <div className="max-w-2xl">
            <h1 className="text-display-md font-bold text-ink-900">AeroSeal Sealing Machines</h1>
            <p className="mt-3 text-ink-600">
              Manual heat-seal machines that bond a pre-cut film lid onto{" "}
              <strong>PP, PET and paper cups and tubs</strong> — a spill-proof closure for bubble
              tea, juices, coffee, curd and ready meals. A four-tier{" "}
              <strong>cup-sealer</strong> ladder from a basic energy-controlled frame up to an
              export-grade CE build, plus dedicated <strong>tub</strong> and{" "}
              <strong>universal</strong> models. Pairs with our pre-cut sealing foils.
            </p>
          </div>

          {error ? (
            <div className="mt-8 rounded-md border border-ink-200 bg-white p-4 text-ink-600">
              <p className="font-semibold text-ink-900">Rates are temporarily unavailable.</p>
              <p className="mt-1 text-sm">Please contact us directly for current machine pricing.</p>
            </div>
          ) : (
            <>
              {/* Pricing terms */}
              <section className="mt-8 grid gap-3 rounded-md border border-ink-200 bg-white p-5 text-sm text-ink-600 sm:grid-cols-2">
                <Term label="Pricing basis">
                  Rates are <strong className="text-ink-900">delivered anywhere in India</strong>{" "}
                  (DDP, freight included), <strong className="text-ink-900">ex-GST</strong>. 18% GST
                  applies on invoice.
                </Term>
                <Term label="Currency">
                  Quoted in <strong className="text-ink-900">INR (₹)</strong>. Switch the toggle for
                  indicative USD, converted at ₹{USD_PER_INR_DIVISOR}/$.
                </Term>
                <Term label="Order basis">
                  Priced <strong className="text-ink-900">per machine</strong>. Payment 30 days;
                  lead time confirmed at order. Installation &amp; operator training on request.
                </Term>
                <Term label="Consumables">
                  Sealing machines need matching{" "}
                  <strong className="text-ink-900">pre-cut film/foil lids</strong> — quoted
                  separately per cup diameter.
                </Term>
              </section>

              {/* Rate cards */}
              <SealBrowser
                sections={data.sections}
                total={data.total}
                priced={data.priced}
                usdPerInr={USD_PER_INR_DIVISOR}
              />

              {/* Footnotes */}
              <div className="mt-10 space-y-1 text-xs text-ink-400">
                <p>
                  Rate is per machine, delivered within India and excluding GST; 18% GST applies on
                  invoice. USD is indicative only, converted from INR at ₹{USD_PER_INR_DIVISOR}/$ —
                  invoicing is in INR unless otherwise agreed.
                </p>
                <p>
                  {data.priced} of {data.total} models listed with live rates; the rest are quoted
                  on request. Specifications may be refined without notice as builds are improved.
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
