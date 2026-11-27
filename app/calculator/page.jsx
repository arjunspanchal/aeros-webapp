import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isInternalRole } from "@/lib/factoryos/constants";
import { canUseCalc, seesWorking } from "@/lib/calc-v2/staff";

export const metadata = { title: "Calculators · Aeros" };

// The calculator landing page. One quote calculator prices bags, cups, tubs
// and boxes (admins see the working, staff see selling prices). The other
// tools here are planning aids. The old bag, box and cup calculators and the
// customer calculator were retired on 27-Nov-2026.
export default function CalculatorHomePage() {
  const session = getSession();
  if (!session || !session.modules?.calculator) redirect("/login");

  const team = canUseCalc(session);
  const admin = seesWorking(session);
  const internal = isInternalRole(session.modules?.factoryos);

  const quoting = team
    ? [
        { href: "/calculator/v2", title: "New quote", desc: "Paper bags, cups, tubs and boxes. Build a quote of one or many items, save it and make the customer's Excel." },
        { href: "/calculator/v2/quotes", title: "Saved quotes", desc: "Every quote saved from the calculator. Open one to change it or re-price it at today's rates." },
        ...(admin
          ? [
              { href: "/calculator/v2/rates", title: "Rate book", desc: "Every rate the calculator uses, with its source. Change one here and every new quote follows." },
              { href: "/calculator/admin/paper-rates", title: "Paper rates", desc: "Base rate and supplier discount for each paper in the master list." },
              { href: "/calculator/admin/wrap", title: "Wrap paper", desc: "Flat food-wrap sheets. Still on the old screen until it moves to the quote calculator.", old: true },
              { href: "/calculator/admin/pp", title: "PP items", desc: "Thermoformed PP cups and lids. Still on the old screen until it moves to the quote calculator.", old: true },
            ]
          : []),
      ]
    : [];

  const tools = [
    { href: "/calculator/container-stuffing", title: "Container stuffing", desc: "Plan an export load: FCL floor, FCL pallet or LCL, with a top-down stuffing diagram." },
    { href: "/calculator/gsm", title: "GSM from a sample", desc: "Weigh a cut square or a punched disc of board and read its real GSM and nearest grade." },
    { href: "/design", title: "Make a KLD", desc: "Keyline and artwork from proven templates for bags, boxes and cups, with print files." },
    ...(internal
      ? [
          { href: "/calculator/logistics", title: "Domestic freight", desc: "Shipment cost on our courier contract, from the catalogue item and delivery address." },
          { href: "/calculator/import-calculator", title: "Import landed cost", desc: "China to India: FOB through duty, freight, clearance and handling. LCL or FCL." },
          { href: "/calculator/express-ship", title: "Express air to the USA", desc: "Landed price by express air: product, freight on chargeable weight, duty and fees." },
        ]
      : []),
  ];

  const Tile = ({ t }) => (
    <Link href={t.href} className="flex flex-col rounded-md border border-ink-200 bg-white p-5 transition-colors hover:border-ink-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-royal-600">
      <span className="flex items-center gap-2 text-base font-semibold text-ink-800">
        {t.title}
        {t.old ? <span className="rounded bg-ink-50 px-1.5 py-0.5 text-xs font-medium text-ink-600">Old screen</span> : null}
      </span>
      <span className="mt-1 flex-1 text-sm text-ink-600">{t.desc}</span>
      <span className="mt-4 text-sm font-medium text-royal-600">Open</span>
    </Link>
  );

  return (
    <div className="min-h-screen bg-ink-50">
      <div className="mx-auto max-w-7xl px-4 pb-16 pt-6 text-ink-800">
        <h1 className="text-2xl font-semibold tracking-tight">Calculators</h1>
        {team ? (
          <>
            <p className="mt-1 text-sm text-ink-600">{admin ? "Quote a customer, and manage the rates behind the quotes." : "Quote a customer. Prices include packing; plates and setup are charged once."}</p>
            <h2 className="mt-6 text-sm font-semibold text-ink-800">Quoting</h2>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{quoting.map((t) => <Tile key={t.href} t={t} />)}</div>
          </>
        ) : (
          <p className="mt-3 max-w-2xl rounded-md border border-ink-200 bg-white px-5 py-4 text-sm text-ink-800">
            For a price, send us the item, size, quantity and print on WhatsApp at <a className="font-medium text-royal-600 hover:text-royal-700" href="https://wa.me/917977077571">+91 79770 77571</a>. We reply with a written quote. The planning tools below stay open to you.
          </p>
        )}
        <h2 className="mt-8 text-sm font-semibold text-ink-800">Planning tools</h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{tools.map((t) => <Tile key={t.href} t={t} />)}</div>
      </div>
    </div>
  );
}
