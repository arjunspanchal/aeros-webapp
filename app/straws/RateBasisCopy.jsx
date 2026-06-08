"use client";

// Mode-aware pricing copy for the straw rate sheet. The rate ladder shows either
// FCL/EXW (bare ex-works) or DDP India (delivered, incl. freight + margin + GST)
// depending on the masthead RateModeToggle. The "Pricing basis" note and the EXW
// footnote must follow that toggle, otherwise a client viewing DDP rates would
// read a note saying they EXCLUDE GST. These tiny client components read
// `rateMode` and switch wording to match.

import { useDisplay } from "./Currency";

export function PricingBasisValue() {
  const { rateMode } = useDisplay();
  if (rateMode === "ddp") {
    return (
      <>
        Rates are <strong className="text-ink-900">DDP India, per piece</strong> — delivered within
        India, inclusive of domestic freight, margin and GST. Toggle to{" "}
        <strong className="text-ink-900">FCL</strong> for the bare ex-works rate.
      </>
    );
  }
  return (
    <>
      Rates are <strong className="text-ink-900">EXW India, per piece</strong> (full container load)
      — exclusive of freight &amp; GST. FOB Nhava Sheva quoted on request.
    </>
  );
}

export function RateBasisFootnote() {
  const { rateMode } = useDisplay();
  if (rateMode === "ddp") {
    return (
      <p>
        Rates are DDP India — inclusive of domestic freight, margin and GST, delivered within India.
        FOB Nhava Sheva and export quotes available on request. Prices subject to change with paper
        &amp; resin costs.
      </p>
    );
  }
  return (
    <p>
      Rates are EXW India, exclusive of freight, insurance, duties and GST. FOB Nhava Sheva and
      landed quotes available on request. Prices subject to change with paper &amp; resin costs.
    </p>
  );
}
