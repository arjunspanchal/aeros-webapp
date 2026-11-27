"use client";
import { Num, Select, Segmented, Toggle, Section, Advanced, full } from "../fields";
import { CUP_SIZES } from "../specs";

const sizeLabel = (s) => s.replace("_", " ");

export default function CupForm({ s, set, rateOf, staff = false }) {
  // The rate-book value shown as the placeholder of a blank field.
  const book = (key) => (rateOf(key) === undefined ? "rate book" : String(rateOf(key)));
  const dw = s.wall === "DW";
  const tub = s.wall === "TUB";
  const printed = s.printMode !== "none";
  const setWall = (wall) => set({ wall, size: CUP_SIZES[wall].includes(s.size) ? s.size : CUP_SIZES[wall][wall === "DW" ? 1 : 0], gsm: wall === "TUB" ? "280" : s.gsm });

  return (
    <>
      <Section title="Cup or tub" aside="Only sizes we make are costed; others need a vendor rate">
        <Segmented className={full} value={s.wall} onChange={setWall}
          options={[{ value: "SW", label: "Single wall" }, { value: "DW", label: "Double wall" }, { value: "TUB", label: "Paper tub Ø115" }]} />
        {/* 8 oz runs on 260 GSM, the bigger cups on 280. A GSM the user typed themselves is left alone. */}
        <Select label="Size" value={s.size} options={CUP_SIZES[s.wall].map((v) => ({ value: v, label: sizeLabel(v) }))}
          onChange={(size) => set({ size, ...(!tub && (s.gsm === "260" || s.gsm === "280") ? { gsm: /^(4|8)oz$/.test(size) ? "260" : "280" } : {}) })} />
        <Num label={dw ? "Inner wall GSM" : "Wall GSM"} value={s.gsm} onChange={(gsm) => set({ gsm })} hint={tub ? undefined : "8oz 260, others 280"} />
        {dw ? <Num label="Outer wall GSM" value={s.outerGsm} onChange={(outerGsm) => set({ outerGsm })} placeholder="same as inner" /> : null}
        {!tub ? <Num label="Weighed cup" value={s.cupWeight} onChange={(cupWeight) => set({ cupWeight })} suffix="g" placeholder="optional" hint="A measured cup replaces the GSM build" /> : null}
        {staff ? null : <Num label="Vendor rate" value={s.vendorRate} onChange={(vendorRate) => set({ vendorRate })} suffix="₹/cup" placeholder="bought-in only" hint="For sizes we buy, such as 20oz" />}
      </Section>

      {staff ? null : <Section title="Board">
        {!tub ? (
          <Segmented className={full} label="Wall board is bought as" value={s.boardBasis} onChange={(boardBasis) => set({ boardBasis })}
            options={[{ value: "poly", label: "PE-coated board, per kg" }, { value: "paper", label: "Paper + PE adder" }]} />
        ) : null}
        {s.boardBasis === "poly" && !tub ? <Num label="Poly board rate" value={s.polyRate} onChange={(polyRate) => set({ polyRate })} placeholder={book("cup.paper.poly_board")} suffix="₹/kg" hint="PE weight included" /> : null}
        <Select label={s.boardBasis === "poly" && !tub ? "Bottom paper" : "Paper"} value={s.paper} onChange={(paper) => set({ paper })}
          options={[{ value: "APP", label: "APP" }, { value: "APP_VOLUME", label: "APP, volume rate" }, { value: "TNPL", label: "TNPL" }]} />
        {dw ? (
          <Select label="Outer wall board" value={s.outerPaper} onChange={(outerPaper) => set({ outerPaper, outerRate: "" })}
            options={[{ value: "TNPL", label: "TNPL + 1-side PE" }, { value: "APP", label: "APP + 1-side PE" }, { value: "APP_VOLUME", label: "APP volume + 1-side PE" }, { value: "same", label: "Same board as the inner wall" }]} />
        ) : null}
        {dw && s.outerPaper !== "same" ? <Num label="Outer board rate" value={s.outerRate} onChange={(outerRate) => set({ outerRate })} placeholder={book(`cup.paper.${s.outerPaper}`)} suffix="₹/kg" /> : null}
      </Section>}

      <Section title="Printing" aside={dw ? "Printed on the outer wall" : undefined}>
        <Segmented className={full} value={s.printMode} onChange={(printMode) => set({ printMode })}
          options={[{ value: "none", label: "Plain" }, { value: "flexo", label: "Flexo" }, { value: "offset", label: "Offset" }]} />
        {printed ? <Num label="Colours" value={s.colours} onChange={(colours) => set({ colours })} min="1" max="6" /> : null}
        {s.printMode === "flexo" && !staff ? <Num label="Print rate" value={s.printRate} onChange={(printRate) => set({ printRate })} placeholder={book("cup.print.flexo_per_kg")} suffix="₹/kg/colour" /> : null}
        {s.printMode === "flexo" && !staff ? <Num label="Punching" value={s.punch} onChange={(punch) => set({ punch })} suffix="₹/kg" /> : null}
        {s.printMode === "offset" && !staff ? (
          <p className={`${full} text-xs text-ink-600`}>
            Offset is costed as a printer's job: the Pantone card, varnish and punching, over the sheets run plus make-ready sheets. It moves with the quantity.
          </p>
        ) : null}
        {s.printMode === "offset" && dw && !staff ? (
          <>
            <Num label="Outer sheet width" value={s.outerSheetW} onChange={(outerSheetW) => set({ outerSheetW })} suffix="mm" hint="The offset outer wall's own sheet" />
            <Num label="Outer sheet length" value={s.outerSheetH} onChange={(outerSheetH) => set({ outerSheetH })} suffix="mm" />
            <Num label="Outer walls per sheet" value={s.outerSheetUps} onChange={(outerSheetUps) => set({ outerSheetUps })} />
          </>
        ) : null}
        {s.printMode === "offset" ? <div className={full}><Toggle label="Varnish" checked={s.varnish} onChange={(varnish) => set({ varnish })} /></div> : null}
        {s.printMode === "flexo" && !tub && !staff ? <div className={full}><Toggle label="Printed and punched outside, billed on fan weight" hint="The printer returns the skeleton scrap" checked={s.viana} onChange={(viana) => set({ viana })} /></div> : null}
        {printed ? <div className={full}><Toggle label="Stock design, no plate charge" checked={s.genericDesign} onChange={(genericDesign) => set({ genericDesign })} /></div> : null}
      </Section>

      <Section title="Order">
        <Num label="Quantity" value={s.qty} onChange={(qty) => set({ qty })} suffix="pcs" />
        <Num label="Case pack" value={s.casePack} onChange={(casePack) => set({ casePack })} placeholder="standard" suffix="pcs" />
        {staff ? null : <Num label="Margin" value={s.marginPct} onChange={(marginPct) => set({ marginPct })} placeholder={book("cup.margin.default")} suffix="% of price" />}
        <div className={full}><Toggle label="Export: put FOB charges into the cost" hint="Full container loads only" checked={s.fob} onChange={(fob) => set({ fob })} /></div>
        {s.fob ? (
          <>
            <Num label="Cups per container" value={s.unitsPerContainer} onChange={(unitsPerContainer) => set({ unitsPerContainer })} hint="Needed for FOB" />
            {staff ? null : <Num label="Charges per container" value={s.chargesPerContainer} onChange={(chargesPerContainer) => set({ chargesPerContainer })} placeholder="rate book" suffix="₹" />}
            {staff ? null : <Num label="Exchange rate" value={s.fx} onChange={(fx) => set({ fx })} placeholder={book("export.fx.usd")} suffix="₹/USD" />}
            <div className={full}><Toggle label="Shipping to the USA" hint="Adds the AMS filing charge" checked={s.us} onChange={(us) => set({ us })} /></div>
          </>
        ) : null}
      </Section>

      {staff ? null : <Advanced>
        <Num label="Carton" value={s.carton} onChange={(carton) => set({ carton })} suffix="₹/case" />
        <Num label="Paper rate" value={s.paperRate} onChange={(paperRate) => set({ paperRate })} suffix="₹/kg" />
        <Num label="Glue" value={s.glueG} onChange={(glueG) => set({ glueG })} suffix="g/unit" />
        <Num label="Die sheet width" value={s.sheetW} onChange={(sheetW) => set({ sheetW })} suffix="mm" hint="A real die for a size with none on file" />
        <Num label="Die sheet height" value={s.sheetH} onChange={(sheetH) => set({ sheetH })} suffix="mm" />
        <Num label="Ups" value={s.sheetUps} onChange={(sheetUps) => set({ sheetUps })} />
        {s.printMode === "offset" ? <Num label="Offset print rate" value={s.offsetSheetRate} onChange={(offsetSheetRate) => set({ offsetSheetRate })} suffix="₹/sheet/colour" hint="A printer's own rate; replaces the job costing" /> : null}
        {dw && s.outerPaper === "same" ? <div className={full}><Toggle label="Outer wall is PE coated" checked={s.outerCoated} onChange={(outerCoated) => set({ outerCoated })} /></div> : null}
      </Advanced>}
    </>
  );
}
