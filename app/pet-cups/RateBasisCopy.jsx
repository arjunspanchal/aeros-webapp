"use client";

// Mode-aware pricing copy for the PET cup & lid rate sheet. The rate ladder
// shows either FCL/EXW (bare ex-works, export full container load) or DDP India
// (delivered within India, incl. freight + margin + GST) depending on the
// masthead RateModeToggle. The "Pricing basis" note, the loads/delivery note and
// the footnote must follow that toggle — otherwise a client viewing DDP rates
// would read a note saying they EXCLUDE GST, or that the price is for a full
// export container. These tiny client components read `rateMode` and switch
// wording to match.

import { useDisplay } from "./Currency";

export function PricingBasisValue() {
  const { rateMode } = useDisplay();
  if (rateMode === "ddp") {
    return (
      <>
        Rates are <strong className="text-ink-900">DDP India, per piece</strong> — delivered within
        India, inclusive of domestic freight, margin and GST. Toggle between{" "}
        <strong className="text-ink-900">plain</strong> and{" "}
        <strong className="text-ink-900">customised</strong> cups, or to{" "}
        <strong className="text-ink-900">FCL</strong> for the bare ex-works export rate.
      </>
    );
  }
  return (
    <>
      Rates are <strong className="text-ink-900">EXW per piece</strong> at the item&rsquo;s origin
      (India or China), for <strong className="text-ink-900">full-container-load (FCL)</strong>{" "}
      orders. Toggle between <strong className="text-ink-900">plain</strong> and{" "}
      <strong className="text-ink-900">customised</strong> cups, or to{" "}
      <strong className="text-ink-900">India DDP</strong> for delivered domestic rates. FOB quoted
      on request.
    </>
  );
}

export function LoadsDeliveryValue() {
  const { rateMode } = useDisplay();
  if (rateMode === "ddp") {
    return (
      <>
        <strong className="text-ink-900">India DDP</strong> rates are delivered duty-paid within
        India — inclusive of road freight, margin and GST. Switch to{" "}
        <strong className="text-ink-900">FCL</strong> for export (ex-works) terms.
      </>
    );
  }
  return (
    <>
      <strong className="text-ink-900">FCL</strong> rates are for full container loads — one item
      filling a 20&prime; / 40&prime; container. Part loads (LCL) or mixed-SKU containers cost more;
      ask for a specific quote.
    </>
  );
}

export function RateBasisFootnote() {
  const { rateMode } = useDisplay();
  if (rateMode === "ddp") {
    return (
      <p>
        Rates are DDP India — inclusive of domestic road freight, margin and GST, delivered within
        India. Export (EXW / FOB) quotes available on request. Prices subject to change
        with resin costs.
      </p>
    );
  }
  return (
    <p>
      Rates are EXW (at the item&rsquo;s origin — India or China) for full-container-load (FCL)
      orders, exclusive of freight, insurance, duties and GST. Part loads (LCL) and mixed-SKU
      containers are priced higher. FOB and landed quotes available on request. Prices subject to
      change with resin costs.
    </p>
  );
}
