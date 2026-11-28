"use client";
import { PP_ITEMS } from "@/lib/quote-engine/families/pp.js";
import { Num, Select, Segmented, Text, Section, Advanced, full } from "../fields";

// PP cups and lids off an injection-moulding line: a should-cost estimate.
// Admins only: every input here is a cost.
export default function PpForm({ s, set, rateOf }) {
  const book = (key) => (rateOf(key) === undefined ? "rate book" : String(rateOf(key)));
  const item = PP_ITEMS[s.item] ?? PP_ITEMS.custom;
  const custom = s.item === "custom";
  const lid = custom ? s.kind === "lid" : item.kind === "lid";
  const std = (v) => (v === undefined ? "enter" : String(v));

  return (
    <>
      <Section title="PP item" aside="A should-cost estimate from line assumptions">
        <Select className={full} label="Item" value={s.item} onChange={(key) => set({ item: key, ...(PP_ITEMS[key].kind === "lid" ? { printColours: "0" } : {}) })}
          options={Object.entries(PP_ITEMS).map(([value, v]) => ({ value, label: v.label }))} />
        {custom ? <Segmented label="It is a" value={s.kind} onChange={(kind) => set({ kind, ...(kind === "lid" ? { printColours: "0" } : {}) })} options={[{ value: "cup", label: "Cup or container" }, { value: "lid", label: "Lid" }]} /> : null}
        <Text className={full} label="Name on the quote" hint="Leave blank to use the item name. No supplier or other customer's name" value={s.name} onChange={(name) => set({ name })} placeholder={item.label} />
        <Num label="Item weight" value={s.itemWeight} onChange={(itemWeight) => set({ itemWeight })} placeholder={std(item.itemWeightG)} suffix="g" hint="Weigh a real piece" />
        <Num label="PP resin rate" value={s.rmRate} onChange={(rmRate) => set({ rmRate })} placeholder={book("pp.rm.rate_per_kg")} suffix="₹/kg" />
      </Section>

      <Section title="Printing" aside={lid ? "PP lids are never printed" : "Dry offset on the moulded cup"}>
        <Num label="Colours" value={s.printColours} onChange={(printColours) => set({ printColours })} min="0" max="6" disabled={lid} hint={lid ? undefined : "0 for plain"} />
      </Section>

      <Section title="Order">
        <Num label="Quantity" value={s.qty} onChange={(qty) => set({ qty })} suffix="pcs" />
        <Num label="Case pack" value={s.casePack} onChange={(casePack) => set({ casePack })} placeholder={book("pp.pack.case_pack")} suffix="pcs" />
        <Num label="Margin" value={s.marginPct} onChange={(marginPct) => set({ marginPct })} placeholder={book(lid ? "pp.margin.lid" : "pp.margin.cup")} suffix="% on cost" />
      </Section>

      <Advanced title="Adjust the line assumptions">
        <Num label="Cycle time" value={s.cycleTime} onChange={(cycleTime) => set({ cycleTime })} placeholder={std(item.cycleTimeS)} suffix="s" />
        <Num label="Cavities" value={s.cavities} onChange={(cavities) => set({ cavities })} placeholder={std(item.cavities)} hint="Pieces per shot" />
        <Num label="Runner per shot" value={s.runnerG} onChange={(runnerG) => set({ runnerG })} placeholder={std(item.runnerGPerShot)} suffix="g" />
        <Num label="Regrind recovered" value={s.regrindPct} onChange={(regrindPct) => set({ regrindPct })} placeholder={book("pp.regrind.capture_pct")} suffix="%" />
        <Num label="Shift length" value={s.shiftHrs} onChange={(shiftHrs) => set({ shiftHrs })} placeholder={book("pp.shift.hours")} suffix="hours" />
        <Num label="Shifts a day" value={s.shiftsPerDay} onChange={(shiftsPerDay) => set({ shiftsPerDay })} placeholder={book("pp.shift.per_day")} />
        <Num label="Labour" value={s.labourPerDay} onChange={(labourPerDay) => set({ labourPerDay })} placeholder={book("pp.labour.per_day")} suffix="₹/day" />
        <Num label="Machine power" value={s.powerKw} onChange={(powerKw) => set({ powerKw })} placeholder={std(item.powerKw)} suffix="kW" />
        <Num label="Electricity" value={s.powerRate} onChange={(powerRate) => set({ powerRate })} placeholder={book("pp.power.rate")} suffix="₹/unit" />
        <Num label="Forming rejects" value={s.rejectPct} onChange={(rejectPct) => set({ rejectPct })} placeholder={book("pp.reject.pct")} suffix="%" />
        <Num label="Mould cost to recover" value={s.mouldCost} onChange={(mouldCost) => set({ mouldCost })} placeholder="0" suffix="₹" hint="Only a mould we paid for" />
        <Num label="Mould life" value={s.mouldLifeShots} onChange={(mouldLifeShots) => set({ mouldLifeShots })} placeholder={book("pp.mould.life_shots")} suffix="shots" />
        {lid ? null : <Num label="Print, per colour" value={s.printRate} onChange={(printRate) => set({ printRate })} placeholder={book("pp.print.rate_per_colour")} suffix="₹/cup" />}
        {lid ? null : <Num label="Print rejects" value={s.printRejectPct} onChange={(printRejectPct) => set({ printRejectPct })} placeholder={book("pp.print.reject_pct")} suffix="%" />}
        {lid ? null : <Num label="Plate" value={s.platePerColour} onChange={(platePerColour) => set({ platePerColour })} placeholder={book("pp.print.plate_per_colour")} suffix="₹/colour" hint="One-time, outside the rate" />}
        <Num label="Sleeve" value={s.sleeveCost} onChange={(sleeveCost) => set({ sleeveCost })} placeholder={std(item.sleeveCost)} suffix="₹" />
        <Num label="Sleeving labour" value={s.sleevePackLabour} onChange={(sleevePackLabour) => set({ sleevePackLabour })} placeholder={std(item.sleevePackLabour)} suffix="₹/sleeve" />
        <Num label="Pieces per sleeve" value={s.unitsPerSleeve} onChange={(unitsPerSleeve) => set({ unitsPerSleeve })} placeholder={book("pp.pack.units_per_sleeve")} />
        <Num label="Carton" value={s.cartonPerCase} onChange={(cartonPerCase) => set({ cartonPerCase })} placeholder={book("pp.pack.carton_per_case")} suffix="₹/case" />
      </Advanced>
    </>
  );
}
