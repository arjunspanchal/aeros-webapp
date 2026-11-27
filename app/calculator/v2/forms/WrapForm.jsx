"use client";
import { WRAP_SHEETS, WRAP_PRINT } from "@/lib/quote-engine/families/wrap.js";
import { Num, Select, Segmented, Text, Section, Advanced, full } from "../fields";
import { WRAP_PAPER_TYPES } from "../specs";

const opts = (map) => Object.entries(map).map(([value, v]) => ({ value, label: v.label }));
const bySupplier = (papers) => papers.reduce((m, p) => ({ ...m, [p.supplier || "Other"]: [...(m[p.supplier || "Other"] ?? []), p] }), {});

// Flat food-wrap sheets: deli paper, burger and sandwich wraps, basket liners.
export default function WrapForm({ s, set, papers, rateOf, staff = false }) {
  const book = (key) => (rateOf(key) === undefined ? "rate book" : String(rateOf(key)));
  const wrapPapers = papers.filter((p) => WRAP_PAPER_TYPES.includes(p.type));
  const printed = s.printMode !== "none";
  // flexo prints on the reel, offset on stock sheets; a plain wrap can be cut from either
  const source = s.printMode === "flexo" ? "reel" : s.printMode === "offset" ? "sheet" : s.source;

  const paperOptions = [
    { value: "", label: staff ? "Pick a paper" : "Type the rate by hand" },
    ...Object.entries(bySupplier(wrapPapers)).map(([group, list]) => ({
      group,
      options: list.map((p) => ({ value: p.id, label: `${p.type} ${p.gsm ? `${p.gsm} GSM` : "any GSM"}${staff ? "" : ` · ₹${p.landed} landed`}` })),
    })),
  ];
  const pickPaper = (id) => {
    const p = wrapPapers.find((x) => x.id === id);
    if (!p) return set({ paperId: "", supplier: "", paperLabel: "" });
    set({ paperId: id, ...(p.gsm ? { gsm: String(p.gsm) } : {}), paperRate: p.landed != null ? String(p.landed) : "", supplier: p.supplier, paperLabel: p.label, paperType: p.type });
  };

  return (
    <>
      <Section title="Wrap sheet" aside="The cut size of one sheet, as the customer gave it">
        <Text className={full} label="What is it" hint="This name goes on the customer's quote: no supplier or other customer's name" value={s.name} onChange={(name) => set({ name })} placeholder="e.g. Deli paper, burger wrap, basket liner" />
        <Num label="Width" value={s.W} onChange={(W) => set({ W })} suffix={s.unit} />
        <Num label="Length" value={s.L} onChange={(L) => set({ L })} suffix={s.unit} />
        <Segmented label="Size given in" value={s.unit} onChange={(unit) => set({ unit })} options={[{ value: "mm", label: "mm" }, { value: "cm", label: "cm" }, { value: "in", label: "inch" }]} />
      </Section>

      <Section title="Paper" aside={staff ? undefined : "Landed rate = ex-mill + lane"}>
        <Select className={full} label="Paper" value={s.paperId} onChange={pickPaper} options={paperOptions} />
        <Num label="GSM" value={s.gsm} onChange={(gsm) => set({ gsm })} hint="Wrap papers: 30 to 60" />
        {staff ? null : <Num label="Landed rate" value={s.paperRate} onChange={(paperRate) => set({ paperRate, paperId: "", supplier: "", paperLabel: "" })} suffix="₹/kg" />}
        {staff ? null : (
          <Select label="Grade, for the quote" value={s.paperType} onChange={(paperType) => set({ paperType })}
            options={[{ value: "OGR", label: "Grease-resistant (OGR)" }, { value: "MG", label: "MG paper" }, { value: "Bleach Kraft White", label: "Bleached white" }, { value: "Other", label: "Other food-grade paper" }]} />
        )}
      </Section>

      <Section title="Printing" aside="Flexo prints on the reel; offset prints on stock sheets">
        <Segmented className={full} value={s.printMode} onChange={(printMode) => set({ printMode })} options={opts(WRAP_PRINT)} />
        {printed ? <Num label="Colours" value={s.colours} onChange={(colours) => set({ colours })} min="1" max="6" hint="For the plate count" /> : null}
      </Section>

      <Section title="Made from" aside={source === "sheet" ? "The whole sheet is paid for, offcut included" : "A reel has no offcut"}>
        {printed ? null : (
          <Segmented className={full} value={s.source} onChange={(src) => set({ source: src })}
            options={[{ value: "reel", label: "A reel, slit and cut" }, { value: "sheet", label: "Stock sheets, cut down" }]} />
        )}
        {source === "sheet" ? (
          <>
            <Select className="col-span-2" label="Stock sheet" value={s.sheetKey} onChange={(sheetKey) => set({ sheetKey })} options={[...opts(WRAP_SHEETS), { value: "custom", label: "Other sheet size" }]} />
            {staff ? null : <Num label="Wraps per sheet" value={s.ups} onChange={(ups) => set({ ups })} placeholder="worked out" hint="Blank = straight cuts" />}
            {s.sheetKey === "custom" ? (
              <>
                <Num label="Sheet width" value={s.sheetW} onChange={(sheetW) => set({ sheetW })} suffix="mm" />
                <Num label="Sheet length" value={s.sheetH} onChange={(sheetH) => set({ sheetH })} suffix="mm" />
              </>
            ) : null}
          </>
        ) : printed ? <p className={`${full} text-xs text-ink-600`}>Printed on the reel, then slit and cut to size.</p> : null}
      </Section>

      <Section title="Order">
        <Num label="Quantity" value={s.qty} onChange={(qty) => set({ qty })} suffix="sheets" />
        <Num label="Case pack" value={s.casePack} onChange={(casePack) => set({ casePack })} placeholder="standard" suffix="sheets" hint="1,000 a poly; cases under 15 kg" />
        {staff ? null : <Num label="Margin" value={s.marginPct} onChange={(marginPct) => set({ marginPct })} placeholder={book("wrap.margin.default")} suffix="% on cost" />}
      </Section>

      {staff ? null : (
        <Advanced>
          {s.printMode === "flexo" ? <Num label="Flexo print rate" value={s.printRate} onChange={(printRate) => set({ printRate })} placeholder={book("wrap.print.flexo_per_kg")} suffix="₹/kg/colour" /> : null}
          {s.printMode === "offset" ? <Num label="Offset print, this job" value={s.printPer1000} onChange={(printPer1000) => set({ printPer1000 })} suffix="₹/1000 sheets" hint="Replaces the printer's slab card" /> : null}
          {printed ? <Num label="Plate" value={s.platePerColour} onChange={(platePerColour) => set({ platePerColour })} suffix="₹/colour" /> : null}
          <Num label="Wastage" value={s.wastagePct} onChange={(wastagePct) => set({ wastagePct })} placeholder={book("wrap.wastage.pct")} suffix="%" />
          {s.printMode === "offset" ? null : <Num label="Slitting and cutting" value={s.cuttingPerKg} onChange={(cuttingPerKg) => set({ cuttingPerKg })} placeholder={book("wrap.cutting.per_kg")} suffix="₹/kg" />}
          <Num label="Carton cost" value={s.cartonPerCase} onChange={(cartonPerCase) => set({ cartonPerCase })} suffix="₹/case" hint="Replaces the size-based cost" />
        </Advanced>
      )}
    </>
  );
}
