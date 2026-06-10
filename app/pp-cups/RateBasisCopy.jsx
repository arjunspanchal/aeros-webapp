"use client";

// Basis-aware pricing copy for the PP cup & IM lid rate sheet. The rate ladder
// shows either FCL (bare ex-works at origin, full-container export) or
// India DDP (delivered within India, incl. domestic road freight) depending
// on the masthead BasisToggle. The "Pricing basis" note and the footnote must
// follow that toggle — otherwise a client viewing DDP rates would read a note
// saying the price is ex-works and excludes freight. These tiny client
// components read `basis` and switch wording to match.
//
// Note on GST: per the Aeros pricing waterfall, GST (18%) is a separate line —
// neither EXW nor the India-landed (DDP) figure bakes it in. So both modes say
// GST is extra; we never claim a rate is GST-inclusive.

import { useDisplay } from "./Currency";

export function PricingBasisValue() {
  const { basis } = useDisplay();
  if (basis === "ddp") {
    return (
      <>
        Rates are <strong className="text-ink-900">DDP India, per piece</strong> — delivered
        within India, inclusive of domestic road freight, for{" "}
        <strong className="text-ink-900">full-container (FCL)</strong> loads. GST extra as
        applicable. Toggle between <strong className="text-ink-900">plain</strong> and{" "}
        <strong className="text-ink-900">customised</strong> cups, or to{" "}
        <strong className="text-ink-900">FCL</strong> for the bare ex-works rate.
      </>
    );
  }
  return (
    <>
      Rates are <strong className="text-ink-900">EXW per piece</strong> at the item&rsquo;s origin
      (China or India), for <strong className="text-ink-900">full-container (FCL)</strong> loads —
      exclusive of freight, duties and GST. Toggle between{" "}
      <strong className="text-ink-900">plain</strong> and{" "}
      <strong className="text-ink-900">customised</strong> cups, or to{" "}
      <strong className="text-ink-900">India DDP</strong> for delivered domestic rates. Part /
      LCL loads cost more — quoted on request.
    </>
  );
}

export function RateBasisFootnote() {
  const { basis } = useDisplay();
  if (basis === "ddp") {
    return (
      <p>
        India DDP rates are delivered duty-paid within India — inclusive of domestic road
        freight, for full-container (FCL) loads; GST extra as applicable. Part / LCL loads and
        export (EXW / FOB) terms quoted on request. Prices subject to change with resin costs.
      </p>
    );
  }
  return (
    <p>
      FCL rates are ex-works at the item&rsquo;s origin (China or India) for full-container loads,
      exclusive of freight, insurance, duties and GST. Part / LCL loads
      and mixed-SKU containers are priced higher. FOB Nhava Sheva and overseas landed quotes
      available on request. Prices subject to change with resin costs.
    </p>
  );
}
