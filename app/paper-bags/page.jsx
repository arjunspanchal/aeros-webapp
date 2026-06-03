import { fetchPaperBags, USD_PER_INR_DIVISOR } from "@/lib/paper-bags";
import { Brand } from "@/app/components/ui/Brand";

// Public, no-login rate sheet shared directly with clients. Not in the
// middleware matcher, so it renders for anyone with the link.
export const revalidate = 300;

export const metadata = {
  title: "Aeros Paper Bags — Rate Sheet",
  description:
    "Aeros plain kraft paper bag range — SOS sacks, twisted-handle, flat-handle and bottle bags. Per-piece rates, EXW India.",
};

const fmtInr = (v) =>
  v == null ? null : `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtUsd = (v) =>
  v == null ? null : `$${v.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;

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
    <div className="min-h-screen bg-ink-50 text-ink-800">
      {/* Masthead */}
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-5 md:px-6 flex items-center justify-between">
          <Brand size="md" href="/" />
          <span className="font-mono text-xs uppercase tracking-wider text-ink-400">
            Rate Sheet
          </span>
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
                Rates are <strong className="text-ink-900">EXW India, per piece</strong>, for
                plain (unprinted) bags. FOB Nhava Sheva quoted on request.
              </Term>
              <Term label="Currency">
                Priced in <strong className="text-ink-900">INR (₹)</strong>. USD shown is
                indicative, converted at ₹{USD_PER_INR_DIVISOR}/$.
              </Term>
              <Term label="Minimum order">
                Sold by the case. Case pack (pieces/carton) is listed per bag.
              </Term>
              <Term label="Customisation">
                Custom print, sizes and white-kraft options available — ask for a quote.
              </Term>
            </section>

            {/* Sections */}
            {data.sections.map((section) => (
              <section key={section.key} className="mt-10">
                <div className="flex items-baseline justify-between border-b border-ink-300 pb-2">
                  <h2 className="text-lg font-bold text-ink-900">{section.label}</h2>
                  <span className="font-mono text-xs text-ink-400">
                    {section.rows.length} sizes
                  </span>
                </div>
                {section.blurb && (
                  <p className="mt-2 text-sm text-ink-600">{section.blurb}</p>
                )}

                {/* Desktop table */}
                <div className="mt-4 hidden overflow-hidden rounded-md border border-ink-200 bg-white md:block">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-ink-200 bg-ink-100 text-left text-xs uppercase tracking-wide text-ink-400">
                        <th className="px-3 py-2 font-medium">Code</th>
                        <th className="px-3 py-2 font-medium">Bag</th>
                        <th className="px-3 py-2 font-medium">Size (W×G×H mm)</th>
                        <th className="px-3 py-2 font-medium">Material</th>
                        <th className="px-3 py-2 text-right font-medium">GSM</th>
                        <th className="px-3 py-2 text-right font-medium">Case</th>
                        <th className="px-3 py-2 text-right font-medium">Rate (EXW)</th>
                        <th className="px-3 py-2 text-right font-medium">USD*</th>
                      </tr>
                    </thead>
                    <tbody>
                      {section.rows.map((r) => (
                        <tr key={r.sku} className="border-b border-ink-100 last:border-0">
                          <td className="px-3 py-2 font-mono text-xs text-ink-600">{r.sku}</td>
                          <td className="px-3 py-2 text-ink-900">{r.name}</td>
                          <td className="px-3 py-2 text-ink-600">{stripUnit(r.size)}</td>
                          <td className="px-3 py-2 text-ink-600">{materialLabel(r)}</td>
                          <td className="px-3 py-2 text-right text-ink-600">{r.gsm ?? "—"}</td>
                          <td className="px-3 py-2 text-right text-ink-600">
                            {r.casePack ? r.casePack.toLocaleString("en-IN") : "—"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {r.priceInr != null ? (
                              <span className="font-medium text-ink-900">{fmtInr(r.priceInr)}</span>
                            ) : (
                              <span className="text-ink-400">On request</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-ink-400">
                            {r.priceUsd != null ? fmtUsd(r.priceUsd) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="mt-4 space-y-2 md:hidden">
                  {section.rows.map((r) => (
                    <div key={r.sku} className="rounded-md border border-ink-200 bg-white p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono text-xs text-ink-400">{r.sku}</p>
                          <p className="mt-0.5 font-medium text-ink-900">{r.name}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          {r.priceInr != null ? (
                            <>
                              <p className="font-semibold text-ink-900">{fmtInr(r.priceInr)}</p>
                              <p className="text-xs text-ink-400">{fmtUsd(r.priceUsd)}</p>
                            </>
                          ) : (
                            <p className="text-sm text-ink-400">On request</p>
                          )}
                        </div>
                      </div>
                      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-600">
                        <Spec label="Size">{stripUnit(r.size) || "—"}</Spec>
                        <Spec label="Material">{materialLabel(r)}</Spec>
                        <Spec label="GSM">{r.gsm ?? "—"}</Spec>
                        <Spec label="Case pack">
                          {r.casePack ? `${r.casePack.toLocaleString("en-IN")} pcs` : "—"}
                        </Spec>
                      </dl>
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {/* Footnotes */}
            <div className="mt-10 space-y-1 text-xs text-ink-400">
              <p>
                * USD is indicative only, converted from INR at ₹{USD_PER_INR_DIVISOR}/$ for
                reference. Invoicing is in INR unless otherwise agreed.
              </p>
              <p>
                Rates are EXW India, exclusive of freight, insurance, duties and GST. FOB
                Nhava Sheva and landed quotes available on request. Prices subject to change
                with paper costs.
              </p>
              <p>
                {data.priced} of {data.total} sizes are listed with live rates; the remainder
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

function Spec({ label, children }) {
  return (
    <div>
      <dt className="text-ink-400">{label}</dt>
      <dd className="text-ink-800">{children}</dd>
    </div>
  );
}

// "102 x 32 x 254 mm (W x G x H)" → "102 × 32 × 254"
function stripUnit(size) {
  if (!size) return null;
  return size
    .replace(/\s*mm\b.*$/i, "")
    .replace(/\s*\(.*\)\s*$/, "")
    .replace(/\s*x\s*/gi, " × ")
    .trim();
}

function materialLabel(r) {
  const mat = r.material || "";
  const colour = r.colour;
  if (/bleached/i.test(mat)) return "White kraft";
  if (/ogr/i.test(mat)) return "OGR recycled";
  if (/kraft/i.test(mat)) return colour === "White" ? "White kraft" : "Brown kraft";
  return mat || (colour ?? "—");
}
