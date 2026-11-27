"use client";
import { BAG_TYPES, PRINT_SLABS, HANDLE_KINDS } from "@/lib/quote-engine/families/bag.js";
import { Num, Select, Segmented, Toggle, Text, Section, Advanced, full } from "../fields";

const opts = (map) => Object.entries(map).map(([value, v]) => ({ value, label: v.label }));
const bySupplier = (papers) => papers.reduce((m, p) => ({ ...m, [p.supplier || "Other"]: [...(m[p.supplier || "Other"] ?? []), p] }), {});

export default function BagForm({ s, set, papers, staff = false }) {
  const handleBag = s.type === "twisted" || s.type === "flat";
  const printed = s.slab !== "none";

  const paperOptions = [
    { value: "", label: staff ? "Pick a paper" : "Type the rate by hand" },
    ...Object.entries(bySupplier(papers)).map(([group, list]) => ({
      group,
      options: list.map((p) => ({ value: p.id, label: `${p.type} ${p.gsm ? `${p.gsm} GSM` : "any GSM"}${p.bf ? ` ${p.bf} BF` : ""} ${staff ? "" : ` · ₹${p.landed} landed`}` })),
    })),
  ];
  const pickPaper = (id) => {
    const p = papers.find((x) => x.id === id);
    if (!p) return set({ paperId: "", supplier: "", paperLabel: "" });
    // A row with no GSM is one rate for the whole grade: keep the GSM already typed.
    set({ paperId: id, ...(p.gsm ? { gsm: String(p.gsm) } : {}), paperRate: p.landed != null ? String(p.landed) : "", colour: p.colour, supplier: p.supplier, paperLabel: p.label, paperType: p.type });
  };
  const setExtra = (i, patch) => set({ extras: s.extras.map((e, j) => (j === i ? { ...e, ...patch } : e)) });

  return (
    <>
      <Section title="Bag" aside="Width × gusset × height, exactly as the customer gave it">
        {/* A handle picked for one bag type must not follow the bag to another. */}
        <Segmented className={full} value={s.type} onChange={(type) => set({ type, handleKind: "" })} options={opts(BAG_TYPES)} />
        <Num label="Width" value={s.W} onChange={(W) => set({ W })} suffix={s.unit} />
        <Num label="Gusset" value={s.G} onChange={(G) => set({ G })} suffix={s.unit} hint={s.type === "vbottom" ? "0 for a flat pouch" : undefined} />
        <Num label="Height" value={s.H} onChange={(H) => set({ H })} suffix={s.unit} />
        <Segmented label="Size given in" value={s.unit} onChange={(unit) => set({ unit })} options={[{ value: "mm", label: "mm" }, { value: "cm", label: "cm" }, { value: "in", label: "inch" }]} />
      </Section>

      <Section title="Paper" aside={staff ? undefined : "Landed rate = ex-mill + lane"}>
        <Select className={full} label="Paper" value={s.paperId} onChange={pickPaper} options={paperOptions} />
        <Num label="GSM" value={s.gsm} onChange={(gsm) => set({ gsm })} />
        {/* A hand-typed rate is no longer the mill's rate, so the mill is dropped with it. */}
        {staff ? null : <Num label="Landed rate" value={s.paperRate} onChange={(paperRate) => set({ paperRate, paperId: "", supplier: "", paperLabel: "" })} suffix="₹/kg" />}
        <Segmented label="Colour" value={s.colour} onChange={(colour) => set({ colour, ...(s.paperId ? {} : { paperType: colour === "white" ? "Bleach Kraft White" : "Brown Kraft" }) })} options={[{ value: "brown", label: "Brown" }, { value: "white", label: "White" }]} />
      </Section>

      <Section title="Printing" aside="Read the artwork: coverage sets the rate, not the colour count">
        <Select className="col-span-2" label="Coverage" value={s.slab} onChange={(slab) => set({ slab })} options={opts(PRINT_SLABS)} />
        {printed ? <Num label="Colours" value={s.colours} onChange={(colours) => set({ colours })} min="1" max="6" hint="For the plate count" /> : null}
        {printed ? <div className={full}><Toggle label="CMYK process artwork, not Pantone" hint="Only changes a hand-made bag: process work runs on the cheaper offset card" checked={Boolean(s.process)} onChange={(process) => set({ process })} /></div> : null}
      </Section>

      {handleBag ? (
        <Section title="Handle">
          <Select className="col-span-2" label="Handle" value={s.handleKind} onChange={(handleKind) => set({ handleKind })}
            options={s.type === "flat"
              ? [{ value: "", label: "Flat paper handle" }]
              : [{ value: "", label: "Twisted rope, matching the paper colour" }, ...opts(HANDLE_KINDS).filter((o) => o.value !== "flat")]} />
          <Num label="Handle size" value={s.handleSize} onChange={(handleSize) => set({ handleSize })} suffix="mm" hint="Sets the carton length" />
        </Section>
      ) : null}

      <Section title="Order">
        <Num label="Quantity" value={s.qty} onChange={(qty) => set({ qty })} suffix="pcs" hint="Under 15,000 is hand-made" />
        <Num label="Case pack" value={s.casePack} onChange={(casePack) => set({ casePack })} placeholder="standard" suffix="pcs" />
        {staff ? null : <Num label="Margin" value={s.marginPct} onChange={(marginPct) => set({ marginPct })} placeholder="10" suffix="% on cost" />}
        <Select label="Going to" value={s.destination} onChange={(destination) => set({ destination })}
          options={[{ value: "domestic", label: "India" }, { value: "usa", label: "USA" }, { value: "export", label: "Other export" }]} />
        {s.destination !== "domestic" ? (
          <div className="col-span-2 self-end"><Toggle label="Show FOB price" hint="Adds port charges per full container" checked={s.fob} onChange={(fob) => set({ fob })} /></div>
        ) : null}
        {s.fob && s.destination !== "domestic" ? (
          <>
            {staff ? null : <Num label="Exchange rate" value={s.fx} onChange={(fx) => set({ fx })} placeholder="98" suffix="₹/USD" />}
            <Num label="Bags per container" value={s.unitsPerContainer} onChange={(unitsPerContainer) => set({ unitsPerContainer })} placeholder="from carton" hint="Blank = worked out from the carton" />
          </>
        ) : null}
      </Section>

      {staff ? null : <Advanced>
        <Num label="Print rate" value={s.printRate} onChange={(printRate) => set({ printRate })} suffix="₹/kg" />
        <Num label="Conversion" value={s.conversion} onChange={(conversion) => set({ conversion })} suffix="₹/kg" />
        <Num label="Wastage" value={s.wastagePct} onChange={(wastagePct) => set({ wastagePct })} suffix="%" />
        <Select label="Wastage is a % of" value={s.wastageBase} onChange={(wastageBase) => set({ wastageBase })}
          options={[{ value: "paper_print_conv", label: "Paper + print + conversion" }, { value: "paper", label: "Paper only" }]} />
        {handleBag ? <Num label="Handle material" value={s.handleMaterial} onChange={(handleMaterial) => set({ handleMaterial })} suffix="₹/bag" /> : null}
        {handleBag ? <Num label="Handle pasting" value={s.handlePasting} onChange={(handlePasting) => set({ handlePasting })} suffix="₹/bag" /> : null}
        <Num label="Carton" value={s.cartonPerCase} onChange={(cartonPerCase) => set({ cartonPerCase })} suffix="₹/case" disabled={s.cartonReal} />
        <Num label="Glue" value={s.gluePerBag} onChange={(gluePerBag) => set({ gluePerBag })} suffix="₹/bag" hint="Replaces the glue formula" />
        <Num label="Plate" value={s.platePerColour} onChange={(platePerColour) => set({ platePerColour })} suffix="₹/colour" />
        <div className={full}><Toggle label="Cost the carton at its real weight" hint="Carton model weight × the corrugated rate, instead of the flat figure" checked={s.cartonReal} onChange={(cartonReal) => set({ cartonReal })} /></div>
        <Num label="Deckle from print file" value={s.deckle} onChange={(deckle) => set({ deckle })} suffix="mm" hint="Repeat jobs only" />
        <Num label="Cut-off from print file" value={s.cutoff} onChange={(cutoff) => set({ cutoff })} suffix="mm" />
        <Select label="Packed in" value={s.packing} onChange={(packing) => set({ packing })}
          options={[{ value: "auto", label: "Standard (small SOS in bales)" }, { value: "carton", label: "Cartons" }, { value: "bale", label: "Bales" }]} />
        <Select label="Route" value={s.route} onChange={(route) => set({ route })}
          options={[{ value: "auto", label: "Standard (hand-made under 15,000)" }, { value: "inhouse", label: "Machine, in-house" }, { value: "handmade", label: "Hand-made, offset printed" }, { value: "vendor", label: "Vendor" }]} />
        <div className={full}>
          <span className="mb-1 block text-xs font-medium text-ink-600">Extra cost lines (flap, base board, gumming, varnish)</span>
          {s.extras.map((e, i) => (
            <div key={i} className="mb-2 grid grid-cols-[1fr_8rem_auto] items-end gap-2">
              <Text label="" value={e.label} onChange={(label) => setExtra(i, { label })} placeholder="What it is" />
              <Num label="" value={e.perBag} onChange={(perBag) => setExtra(i, { perBag })} suffix="₹/bag" />
              <button type="button" onClick={() => set({ extras: s.extras.filter((_, j) => j !== i) })} className="h-10 px-2 text-sm text-ink-400 hover:text-red-600" aria-label="Remove line">Remove</button>
            </div>
          ))}
          <button type="button" onClick={() => set({ extras: [...s.extras, { label: "", perBag: "" }] })} className="text-sm font-medium text-royal-600 hover:text-royal-700">+ Add a line</button>
        </div>
      </Advanced>}
    </>
  );
}
