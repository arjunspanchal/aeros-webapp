// "How to use FactoryOS" — shown at /factoryos/how-to. Plain content so it
// can be updated as the app changes (Arjun, 01-Oct-2026: keep it on the
// webpage, not a PDF). Each step: title, who, and short lines.

export const HOWTO_UPDATED = "17 Nov 2026";

export const HOWTO = [
  {
    title: "How a job moves now",
    who: "Everyone",
    lines: [
      "Every job goes one step at a time: RM Pending → (Coating, if needed) → Under Printing → In Conversion → Packing → Ready for Dispatch → Dispatched → Delivered.",
      "The blue card at the top of each job shows the step it is on and what must be filled before the next one. The button stays locked until it is all there.",
      "Steps cannot be skipped and a job cannot go backwards. If something is truly wrong, an admin can override with a reason.",
      "Every move, and every change to the production ready date, is written on the job's timeline with your name.",
    ],
  },
  {
    title: "1 · Raise the job",
    who: "Rahul / Sachin",
    lines: [
      "Jobs → + New job. The J# fills itself.",
      "Pick the customer, the brand and the sales manager (every job needs one).",
      "Pick the item: line → size → item. The list shows each item once. If it is printed, choose the print in the Print box below it.",
      "Item not in the list (a new size or one-off)? Tick Custom item, pick the product type and type the name and real size.",
      "Something extra on top of the item, like a flap? Tick it under Additional features.",
      "Paper: pick the stock line if the paper is here, or leave it blank and enter the paper type, GSM and the sheets / kg needed.",
      "Say where the order came from (Aeros App, key account, export) and tick PE coating if the paper goes for coating first.",
    ],
  },
  {
    title: "2 · Paper, coating and the printer",
    who: "Rahul / Sachin",
    lines: [
      "To leave RM Pending the job needs: production ready date, paper type and paper quantity.",
      "Coating first? Pick the coater, the date the paper was sent and the date it is due back. When it comes back, enter that date.",
      "For printing: Flexo or Offset, the printer and the date printed stock is due back. The printer list only shows printers that do that process.",
      "Plain job with no printing? Choose Plain, no printing and the job skips the printer.",
      "Open Vendor job order to send the print details. Save, then Issue, and send the PDF. A later change makes a new revision.",
    ],
  },
  {
    title: "3 · Printed stock comes back",
    who: "Rahul / Sachin / Warehouse",
    lines: [
      "Record it under Inward from printer on the job: date, quantity, damaged, challan number. A job cannot leave Under Printing without it.",
      "Flap bags, D-cut bags and custom offset bags come in as sheets and are pasted by hand, so their inward is in sheets.",
      "If the printing due date passes, the job shows LATE and asks for the printer's new date. Call the printer and put it in.",
    ],
  },
  {
    title: "4 · Make it and hand it over",
    who: "Rahul / Sachin",
    lines: [
      "In Conversion → Packing needs the quantity produced.",
      "Packing → Ready for Dispatch is the handover to the warehouse. It needs finished pieces, cartons and a COA (QC → COA generator).",
      "The list opens on your own lines; tap All lines to see everything. Urgent jobs sit at the top.",
    ],
  },
  {
    title: "5 · Dispatch and delivery",
    who: "Suleman / Samar (warehouse)",
    lines: [
      "WarehouseOS → Dispatch shows everything ready to go, oldest first.",
      "Tap Dispatch on a job and enter: date, quantity, cartons, transport, LR or vehicle number and the Zoho invoice number. Part lots are fine.",
      "The job moves to Dispatched when the lots cover the order, or when you tick that the lot completes it.",
      "When the customer has it, enter the delivery date and tap Delivered. Sales can do this too.",
    ],
  },
  {
    title: "Who can do what",
    who: "Everyone",
    lines: [
      "Factory managers raise jobs and move them up to Ready for Dispatch.",
      "Warehouse records dispatch and delivery. Warehouse cannot change production details.",
      "Sales sees every job, its dates and its timeline, and can add notes. Sales cannot change stages or production details.",
      "Invoices and payments are in Zoho. The app only keeps the Zoho invoice number on each dispatch.",
      "A job can't claim more paper than is free on a stock line. Reduce, pick another line, or order paper.",
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
  {
    title: "Assistant (chat)",
    who: "Rahul / Sachin",
    lines: [
      "Daily → Assistant. Type what you want in plain English: \"what's under printing for bags\", \"create a job: 15,000 8oz DW printed cups for Froth, Blue Line\".",
      "It looks up jobs, customers and products itself. For anything that changes a job it shows a card — nothing happens until you press Confirm.",
      "If it asks a question (which job? how many?), answer in the chat. Press New to start over.",
    ],
  },
];
