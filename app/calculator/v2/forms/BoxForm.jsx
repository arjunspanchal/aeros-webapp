"use client";
import { STANDARD_SHEETS, CONSTRUCTIONS, PRINTERS, FINISHES } from "@/lib/quote-engine/families/box.js";
import { Num, Select, Segmented, Toggle, Text, Section, Advanced, full } from "../fields";
import { BOARDS } from "../specs";

const opts = (map) => Object.entries(map).map(([value, v]) => ({ value, label: v.label }));

export default function BoxForm({ s, set, rateOf }) {
  const board = BOARDS[s.boardKey];
  const bookRate = board.rateKey ? rateOf(board.rateKey) : undefined;
  const allIn = s.conversionAllIn !== "";

  return (
    <>
      <Section title="Item">
        <Text className={full} label="What is it" value={s.name} onChange={(name) => set({ name })} placeholder="e.g. Double cup holder, burger box 102 × 102" />
        <Select className={full} label="Construction" value={s.construction} onChange={(construction) => set({ construction })} options={opts(CONSTRUCTIONS)} />
      </Section>

      <Section title="Sheet and layout" aside="Board is costed on the whole sheet we buy">
        <Select className="col-span-2" label="Sheet" value={s.sheetKey} onChange={(sheetKey) => set({ sheetKey })}
          options={[...opts(STANDARD_SHEETS), { value: "custom", label: "Cut-to-size or other sheet" }]} />
        <Num label="Pieces per sheet" value={s.ups} onChange={(ups) => set({ ups })} placeholder="from layout" hint="From the printer's layout" />
        {s.sheetKey === "custom" ? (
          <>
            <Num label="Sheet width" value={s.sheetW} onChange={(sheetW) => set({ sheetW })} suffix="mm" />
            <Num label="Sheet length" value={s.sheetH} onChange={(sheetH) => set({ sheetH })} suffix="mm" />
          </>
        ) : null}
        <Num label="Blank width" value={s.blankW} onChange={(blankW) => set({ blankW })} suffix="mm" hint="Estimates the ups when none is given" />
        <Num label="Blank length" value={s.blankH} onChange={(blankH) => set({ blankH })} suffix="mm" />
      </Section>

      <Section title="Board">
        <Select label="Board" value={s.boardKey} onChange={(boardKey) => set({ boardKey, boardRate: "" })} options={opts(BOARDS)} />
        <Num label="GSM" value={s.gsm} onChange={(gsm) => set({ gsm })} />
        <Num label="Board rate" value={s.boardRate} onChange={(boardRate) => set({ boardRate })} placeholder={bookRate !== undefined ? String(bookRate) : "enter"} suffix="₹/kg" />
        <div className={full}><Toggle label="PE coated, 1 side" hint="Adds the PE rate per kg of board" checked={s.pe} onChange={(pe) => set({ pe })} /></div>
      </Section>

      <Section title="Printing and finish">
        <Segmented className={full} value={s.printMode} onChange={(printMode) => set({ printMode })}
          options={[{ value: "none", label: "Plain" }, { value: "card", label: "Offset, by the printer's card" }, { value: "ink_flat", label: "CMYK, flat per box" }]} />
        {s.printMode === "card" ? (
          <>
            <Num label="Colours" value={s.colours} onChange={(colours) => set({ colours })} min="1" max="6" />
            <Select label="Sides printed" value={s.sides} onChange={(sides) => set({ sides })} options={[{ value: "1", label: "One side" }, { value: "2", label: "Both sides" }]} />
          </>
        ) : null}
        <Select className={s.printMode === "card" ? "" : "col-span-2"} label="Printer" value={s.printer} onChange={(printer) => set({ printer })} options={opts(PRINTERS)} />
        <Select label="Finish outside" value={s.finishOutside} onChange={(finishOutside) => set({ finishOutside })} options={opts(FINISHES)} />
        <Select label="Finish inside" value={s.finishInside} onChange={(finishInside) => set({ finishInside })} options={opts(FINISHES)} />
      </Section>

      <Section title="Packing and order">
        <Num label="Quantity" value={s.qty} onChange={(qty) => set({ qty })} suffix="pcs" />
        <Num label="Case pack" value={s.casePack} onChange={(casePack) => set({ casePack })} suffix="pcs" />
        <Num label="Margin" value={s.marginPct} onChange={(marginPct) => set({ marginPct })} placeholder="15" suffix="% on cost" />
        <Num label="Carton length" value={s.cartonL} onChange={(cartonL) => set({ cartonL })} suffix="mm" hint="Size gives a 5-ply cost" />
        <Num label="Carton breadth" value={s.cartonB} onChange={(cartonB) => set({ cartonB })} suffix="mm" />
        <Num label="Carton height" value={s.cartonH} onChange={(cartonH) => set({ cartonH })} suffix="mm" />
      </Section>

      <Advanced>
        <Num label="Converter, all-in" value={s.conversionAllIn} onChange={(conversionAllIn) => set({ conversionAllIn })} suffix="₹/pc" hint="Replaces print, punching and pasting" />
        <Num label="Pasting" value={s.pastingPerPc} onChange={(pastingPerPc) => set({ pastingPerPc })} suffix="₹/pc" disabled={allIn} />
        <Num label="Sheet wastage" value={s.wastagePct} onChange={(wastagePct) => set({ wastagePct })} suffix="%" />
        <Num label="Carton cost" value={s.cartonPerCase} onChange={(cartonPerCase) => set({ cartonPerCase })} suffix="₹/case" hint="Replaces the size-based cost" />
        <Num label="Poly cost" value={s.polyCost} onChange={(polyCost) => set({ polyCost })} suffix="₹" hint="Food boxes: 3.98 per 100" />
        <Num label="Poly covers" value={s.polyPer} onChange={(polyPer) => set({ polyPer })} suffix="pcs" />
        <Num label="Board per piece" value={s.boardGPerPc} onChange={(boardGPerPc) => set({ boardGPerPc })} suffix="g" hint="When already known; replaces sheet ÷ ups" />
        <Num label="Die cost" value={s.dieCost} onChange={(dieCost) => set({ dieCost })} suffix="₹" hint="One-time, at actuals" />
      </Advanced>
    </>
  );
}
