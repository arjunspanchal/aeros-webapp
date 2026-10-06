// "How to use FactoryOS" — shown at /factoryos/how-to. Plain content so it
// can be updated as the app changes (Arjun, 01-Oct-2026: keep it on the
// webpage, not a PDF). Each step: title, who, and short lines.

export const HOWTO_UPDATED = "06 Oct 2026";

export const HOWTO = [
  {
    title: "1 · Raise the job",
    who: "Rahul / Sachin",
    lines: [
      "Jobs → + New job. The J# fills itself.",
      "Pick the customer, then the brand from the list (type a new one if it isn't there).",
      "Pick the product: line → size → product. Dimensions show under it.",
      "Paper from RM stock: pick the stock line if the paper is already here — it fills type, GSM, mill, and starts the job at Under Printing. Enter the sheets / kg this job needs; the form shows what's free.",
      "If the paper still has to be ordered, leave the stock line blank, pick the paper from the Paper RM Database and enter the sheets / kg to order. The job starts at RM Pending.",
      "Printing: Flexo or Offset, the printer, and the printing due date. Production due = the date the floor works to.",
    ],
  },
  {
    title: "2 · Send the job order to the printer",
    who: "Rahul / Sachin",
    lines: [
      "On the job, open Vendor job order. It is pre-filled from the job.",
      "Add the Pantones / CMYK, varnish, plates (available with vendor — yes / no), and the sheets or reel details.",
      "Save, then Issue. Print / PDF and send it. Any later change makes a new revision — always send the latest.",
    ],
  },
  {
    title: "3 · Track printing",
    who: "Printer + Rahul / Sachin",
    lines: [
      "The printer logs in at /printer (company + password) and taps Printed, then Sent to Aeros.",
      "If the printing due date passes without Printed, the job shows LATE on your list and the job page asks you for the new committed date — call the printer and put it in.",
      "When printed stock arrives, record it in Inward from printer on the job: qty, damaged, challan. The job shows received vs ordered.",
    ],
  },
  {
    title: "4 · Move the job through the floor",
    who: "Rahul / Sachin",
    lines: [
      "Update status on the job: Under Printing → In Conversion → Packing → Ready for Dispatch.",
      "Only the stages that happen here are offered — cup carriers and table mats skip what the vendor does.",
      "Urgent jobs sit at the top of your list. The list opens on your own lines; tap All lines to see everything.",
    ],
  },
  {
    title: "5 · Close the job and hand over",
    who: "Rahul / Sachin → Warehouse team",
    lines: [
      "When the finished goods are packed: Close job → warehouse. Enter the finished pcs and cartons.",
      "The job moves to Ready for Dispatch and appears on WarehouseOS → From Factory.",
      "The warehouse team dispatches from that list and marks it Dispatched. Delays to the customer are handled by the account manager.",
    ],
  },
  {
    title: "Rules worth knowing",
    who: "Everyone",
    lines: [
      "Only factory managers raise jobs. Account managers handle the customer side.",
      "A job can't claim more paper than is free on a stock line — reduce, pick another line, or order paper. Admin can override.",
      "FactoryOS records in-house jobs only. Traded items don't come here.",
      "Mill = who made the paper (ITC, BILT, JK). Supplier = who we bought it from.",
    ],
  },
  {
    title: "QC · Certificate of Analysis (COA)",
    who: "Rahul / Sachin",
    lines: [
      "QC → COA generator. Find the job and tap Make COA.",
      "The sheet fills itself from the job and the product master — material, dimensions, pcs per box, weight, packing.",
      "Check every line against the actual goods (weigh a few pieces; check the print against the approved artwork and mark Artwork Passed / Failed), fix what's different, then Save & print.",
      "Inspection result and Approved by can be typed in, or left blank to sign by hand on the printout.",
      "One COA per dispatch lot: if 2 lakh pcs leave as 25,000 + 50,000 + …, each invoice gets its own COA — tap + Next lot, enter that lot's quantity and invoice / challan number. Open any COA again to correct and re-print.",
      "No job for it (a sample, a stock item)? Use + New COA under \"COA without a job\" — search the product to fill the sheet, or type it in.",
    ],
  },
];
