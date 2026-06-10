// "Lid styles" explainer for the public PET cups & lids page. Server component
// (no interactivity). One card per lid TYPE — Flat / Dome / Sipper — with a
// single representative product photo, so a buyer instantly understands what
// each style is. Per-size availability lives in the rate sheet below; this is
// deliberately NOT a per-SKU gallery.

const TYPES = [
  {
    key: "flat",
    title: "Flat",
    img: "/pet-cups/lids/type-flat.jpg",
    body: "Low-profile lid with a straw slot — the everyday choice for iced drinks and cold takeaway.",
  },
  {
    key: "dome",
    title: "Dome",
    img: "/pet-cups/lids/type-dome.jpg",
    body: "Raised dome that clears whipped cream, fruit and tall toppings, with a straw slot.",
  },
  {
    key: "sipper",
    title: "Sipper",
    img: "/pet-cups/lids/type-sipper.jpg",
    body: "Drink-through spout — sip straight from the lid, no straw needed. Tidy and spill-resistant.",
  },
];

export function LidGallery() {
  return (
    <section id="lid-styles" className="mt-12">
      <div className="border-b border-ink-300 pb-2">
        <h2 className="text-lg font-bold text-ink-900">Lid styles</h2>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-ink-600">
        Three lid styles, all clear PET and supplied plain. Each style comes in multiple rim sizes
        — match the lid&rsquo;s Ø to your cup&rsquo;s top diameter in the rate sheet below.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {TYPES.map((t) => (
          <figure
            key={t.key}
            className="overflow-hidden rounded-md border border-ink-200 bg-white"
          >
            <div className="aspect-square w-full bg-ink-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={t.img}
                alt={`${t.title} PET lid — Aeros`}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </div>
            <figcaption className="p-3">
              <h3 className="text-sm font-bold leading-tight text-ink-900">{t.title}</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{t.body}</p>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
