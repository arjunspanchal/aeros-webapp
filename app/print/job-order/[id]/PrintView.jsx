"use client";

import { useEffect } from "react";
import { LABEL, qtyBand } from "@/lib/factoryos/jobOrderConstants";

function fmtDate(d) {
  if (!d) return null;
  const dt = new Date(d);
  return isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtNum(n, suffix = "") {
  if (n == null || n === "") return null;
  return `${Number(n).toLocaleString("en-IN")}${suffix}`;
}
const has = (v) => v !== null && v !== undefined && v !== "";

const INK = "#111";
const MUTED = "#666";
const RULE = "#bbb";

const th = (align = "left") => ({
  border: `1px solid ${RULE}`, padding: "5px 7px", textAlign: align, fontWeight: 600,
  fontSize: "9.5px", textTransform: "uppercase", letterSpacing: "0.04em", background: "#f2f2f2",
});
const td = (align = "left") => ({ border: `1px solid ${RULE}`, padding: "5px 7px", textAlign: align, fontSize: "11px", verticalAlign: "top" });

function Block({ title, children }) {
  return (
    <section style={{ marginTop: "14px", pageBreakInside: "avoid" }}>
      <h2 style={{
        fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
        borderBottom: `1.5px solid ${INK}`, paddingBottom: "3px", marginBottom: "6px",
      }}>{title}</h2>
      {children}
    </section>
  );
}

// Label/value grid. Rows with no value are dropped so an unused field
// doesn't print as a row of dashes the vendor has to read past — except
// `required` rows, where a blank is itself information ("not specified").
function Grid({ rows, cols = 3 }) {
  const shown = rows.filter((r) => r && (r.required || has(r.value)));
  if (!shown.length) return <p style={{ fontSize: "11px", color: MUTED }}>Not specified.</p>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, columnGap: "14px", rowGap: "5px" }}>
      {shown.map((r) => (
        <div key={r.label} style={{ gridColumn: r.span ? `span ${Math.min(r.span, cols)}` : undefined }}>
          <div style={{ fontSize: "8.5px", color: MUTED, textTransform: "uppercase", letterSpacing: "0.04em" }}>{r.label}</div>
          <div style={{ fontSize: "11.5px", fontWeight: r.strong ? 700 : 500, whiteSpace: "pre-wrap" }}>
            {has(r.value) ? r.value : <span style={{ color: "#b45309" }}>Not specified</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PrintView({ job, vendor, spec: s, colours = [], autoPrint = true }) {
  useEffect(() => {
    if (!autoPrint) return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [autoPrint]);

  const isFlexo = s.process === "flexo";
  const isDraft = s.status !== "issued";
  const band = qtyBand(s);
  const uom = s.qtyUom || "pcs";
  const hasOuterInner = colours.some((c) => c.side === "inner") && colours.some((c) => c.side === "outer");

  return (
    <div className="bg-white mx-auto" style={{ maxWidth: "860px", padding: "28px", color: INK, position: "relative" }}>
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          tr { page-break-inside: avoid; }
        }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      `}</style>

      <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
        <button onClick={() => window.print()} className="rounded-lg bg-black px-4 py-2 text-sm text-white">
          Print / Save PDF
        </button>
      </div>

      {isDraft && (
        <div aria-hidden style={{
          position: "absolute", top: "38%", left: 0, right: 0, textAlign: "center",
          fontSize: "120px", fontWeight: 800, color: "rgb(235,235,235)", transform: "rotate(-24deg)",
          pointerEvents: "none", zIndex: 0, letterSpacing: "0.1em",
        }}>DRAFT</div>
      )}

      <div style={{ position: "relative", zIndex: 1 }}>
        {/* Letterhead */}
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: `3px solid ${INK}`, paddingBottom: "8px" }}>
          <div>
            <div style={{ fontSize: "22px", fontWeight: 800, letterSpacing: "0.12em" }}>AEROS</div>
            <div style={{ fontSize: "9.5px", color: MUTED }}>Boson Machines OPC Pvt Ltd · Mumbai, India</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "16px", fontWeight: 800, letterSpacing: "0.06em" }}>PRINT JOB ORDER</div>
            <div style={{ fontSize: "11px", marginTop: "2px" }}>
              J# <strong>{job.jNumber}</strong> · Rev <strong>{s.rev}</strong> · {LABEL.process[s.process] || s.process}
            </div>
            <div style={{ fontSize: "9.5px", color: MUTED }}>
              {isDraft ? "DRAFT — not released" : `Issued ${fmtDate(s.issuedAt)}`}
            </div>
          </div>
        </header>

        {/* To / job */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: "16px", marginTop: "12px" }}>
          <div style={{ border: `1px solid ${RULE}`, padding: "8px 10px" }}>
            <div style={{ fontSize: "8.5px", color: MUTED, textTransform: "uppercase", letterSpacing: "0.04em" }}>To (printer)</div>
            <div style={{ fontSize: "13px", fontWeight: 700 }}>{vendor?.name || job.printingVendor || "—"}</div>
            {vendor?.contactPerson && <div style={{ fontSize: "11px" }}>{vendor.contactPerson}</div>}
            {(vendor?.phone || vendor?.email) && (
              <div style={{ fontSize: "10.5px", color: MUTED }}>{[vendor.phone, vendor.email].filter(Boolean).join(" · ")}</div>
            )}
          </div>
          <div style={{ border: `1px solid ${RULE}`, padding: "8px 10px" }}>
            <Grid cols={2} rows={[
              { label: "Item", value: [job.item, job.itemSize].filter(Boolean).join(" · "), span: 2, strong: true },
              { label: "Brand", value: job.brand },
              { label: "Aeros SKU", value: job.masterSku },
              { label: "Order quantity", value: s.orderQty != null ? `${fmtNum(s.orderQty)} ${uom}` : null, strong: true, required: true },
              { label: "Delivery due", value: fmtDate(s.deliveryDueDate), strong: true, required: true },
            ]} />
          </div>
        </div>

        {/* Substrate */}
        <Block title="1 · Substrate / paper">
          <Grid rows={[
            { label: "Paper / board", value: s.substrateName, strong: true, required: true },
            { label: "Mill / supplier", value: s.substrateMill },
            { label: "GSM", value: fmtNum(s.substrateGsm), strong: true, required: true },
            { label: "BF", value: fmtNum(s.substrateBf) },
            { label: "Form", value: LABEL.substrateForm[s.substrateForm] },
            { label: "Coating", value: s.substrateCoating },
            { label: "Notes", value: s.substrateNotes, span: 3 },
          ]} />
        </Block>

        {/* Printing */}
        <Block title="2 · Printing">
          <Grid rows={[
            { label: "Process", value: LABEL.process[s.process], strong: true },
            { label: "Print side", value: LABEL.printSide[s.printSide], required: true },
            { label: "Total colours", value: fmtNum(s.totalColours) ?? (colours.length ? String(colours.length) : null), strong: true },
          ]} />
        </Block>

        {/* Colours */}
        <Block title="3 · Colours & Pantones">
          {colours.length === 0 ? (
            <p style={{ fontSize: "11px", color: "#b45309" }}>No colours specified.</p>
          ) : (
            <>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th("center")}>#</th>
                    <th style={th("center")}>Ref</th>
                    <th style={th()}>Pantone / ink</th>
                    <th style={th()}>Type</th>
                    {hasOuterInner && <th style={th()}>Side</th>}
                    {isFlexo && <th style={th("center")}>Deck</th>}
                    {isFlexo && <th style={th()}>Anilox</th>}
                    <th style={th("right")}>Cover %</th>
                    <th style={th()}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {colours.map((c, i) => (
                    <tr key={c.id || i}>
                      <td style={td("center")}>{i + 1}</td>
                      <td style={{ ...td("center"), width: "34px" }}>
                        {c.swatchHex ? (
                          <span style={{ display: "inline-block", width: "22px", height: "14px", background: c.swatchHex, border: "1px solid #888" }} />
                        ) : "—"}
                      </td>
                      <td style={{ ...td(), fontWeight: 700 }}>{c.name}</td>
                      <td style={td()}>{LABEL.colourType[c.colourType] || c.colourType}</td>
                      {hasOuterInner && <td style={td()}>{LABEL.colourSide[c.side] || "—"}</td>}
                      {isFlexo && <td style={td("center")}>{c.deckNo ?? "—"}</td>}
                      {isFlexo && <td style={td()}>{c.anilox || "—"}</td>}
                      <td style={td("right")}>{c.coveragePct != null ? `${c.coveragePct}%` : "—"}</td>
                      <td style={td()}>{c.notes || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ fontSize: "9px", color: MUTED, marginTop: "4px" }}>
                Swatches are an on-screen / office-printer reference only and are not a colour standard. Match every spot colour to the
                current physical PANTONE® guide and the approved proof.
              </p>
            </>
          )}
        </Block>

        {/* Varnish & finishing */}
        <Block title="4 · Varnish & finishing">
          <Grid rows={[
            { label: "Varnish", value: s.varnishRequired ? "Required" : "Not required", strong: true },
            s.varnishRequired && { label: "Varnish type", value: LABEL.varnishType[s.varnishType], strong: true, required: true },
            s.varnishRequired && { label: "Coverage", value: LABEL.varnishCoverage[s.varnishCoverage], required: true },
            s.varnishRequired && { label: "Varnish notes", value: s.varnishNotes, span: 3 },
            { label: "Lamination", value: s.lamination && s.lamination !== "none" ? LABEL.lamination[s.lamination] : null },
            { label: "Foiling", value: s.foiling },
            { label: "Embossing", value: s.embossing },
            s.foodContact && {
              label: "Food contact", span: 3, strong: true,
              value: "Food-contact packaging: low-migration inks and varnish only. No print or varnish on the food-contact side.",
            },
          ]} />
        </Block>

        {/* Artwork & proof */}
        <Block title="5 · Artwork, proof & tolerances">
          <Grid rows={[
            { label: "Artwork file", value: s.artworkRef, required: true },
            { label: "Artwork version", value: s.artworkRev, strong: true, required: true },
            { label: "Approved on", value: fmtDate(s.artworkApprovedDate) },
            { label: "Dieline / KLD", value: s.dielineRef },
            { label: "Proof required", value: LABEL.proofType[s.proofType], strong: true, required: true },
            { label: "Proof due", value: fmtDate(s.proofDueDate) },
            { label: "Colour tolerance", value: s.colourTolerance },
            { label: "Registration tolerance", value: fmtNum(s.registrationToleranceMm, " mm") },
          ]} />
        </Block>

        {/* Plates */}
        <Block title={isFlexo ? "6 · Plates / cylinders" : "6 · Plates"}>
          <Grid cols={4} rows={[
            { label: "Plates", value: LABEL.platesStatus[s.platesStatus], strong: true, required: true },
            { label: "Plate ref", value: s.platesRef },
            { label: "Owned by", value: LABEL.plateOwner[s.plateOwner] },
            { label: "Plate charge", value: s.plateChargeInr != null ? `₹${fmtNum(s.plateChargeInr)}` : null },
          ]} />
        </Block>

        {/* Process block */}
        {isFlexo ? (
          <Block title="7 · Flexo details">
            <Grid cols={4} rows={[
              { label: "Reel width", value: fmtNum(s.flexoReelDeckleMm, " mm"), strong: true, required: true },
              { label: "Repeat length", value: fmtNum(s.flexoRepeatMm, " mm"), strong: true, required: true },
              { label: "No. of decks", value: fmtNum(s.flexoNoOfDecks) },
              { label: "Plate thickness", value: fmtNum(s.flexoPlateThicknessMm, " mm") },
              { label: "Colour order on press", value: s.flexoColourOrder, span: 2 },
              { label: "Anilox", value: s.flexoAnilox, span: 2 },
              { label: "Wind direction", value: LABEL.windDirection[s.flexoWindDirection], span: 2, strong: true, required: true },
              { label: "Core dia", value: fmtNum(s.flexoCoreDiaMm, " mm") },
              { label: "Max reel OD", value: fmtNum(s.flexoReelOdMm, " mm") },
              { label: "Max splices / reel", value: fmtNum(s.flexoSplicesAllowed) },
              { label: "Corona treatment", value: s.flexoCoronaTreatment, span: 3 },
            ]} />
          </Block>
        ) : (
          <Block title="7 · Offset details">
            <Grid cols={4} rows={[
              {
                label: "Sheet size", strong: true, required: true,
                value: has(s.offsetSheetLengthMm) || has(s.offsetSheetWidthMm)
                  ? `${fmtNum(s.offsetSheetLengthMm) ?? "?"} × ${fmtNum(s.offsetSheetWidthMm) ?? "?"} mm` : null,
              },
              { label: "Grain", value: LABEL.grain[s.offsetGrain], required: true },
              { label: "Ups / sheet", value: fmtNum(s.offsetUpsPerSheet), strong: true },
              { label: "No. of plates", value: fmtNum(s.offsetNoOfPlates) },
              { label: "Sheets required", value: fmtNum(s.offsetSheetsRequired), strong: true },
              { label: "Machine", value: s.offsetMachine },
              { label: "Punching / die cut", value: s.offsetPunching && s.offsetPunching !== "none" ? LABEL.punching[s.offsetPunching] : null },
              { label: "Die ref", value: s.offsetDieRef },
            ]} />
          </Block>
        )}

        {/* Qty */}
        <Block title="8 · Quantity & allowances">
          <Grid cols={4} rows={[
            { label: "Order quantity", value: s.orderQty != null ? `${fmtNum(s.orderQty)} ${uom}` : null, strong: true, required: true },
            { label: "Overs allowed", value: fmtNum(s.oversAllowancePct, "%") },
            { label: "Unders allowed", value: fmtNum(s.undersAllowancePct, "%") },
            { label: "Wastage allowance", value: fmtNum(s.wastageAllowancePct, "%") },
            band && {
              label: "Accepted quantity", span: 4, strong: true,
              value: `${band.min.toLocaleString("en-IN")} – ${band.max.toLocaleString("en-IN")} ${uom}. Quantity outside this range needs written approval from Aeros.`,
            },
          ]} />
        </Block>

        {/* Delivery */}
        <Block title="9 · Delivery & packing">
          <Grid rows={[
            { label: "Deliver to", value: s.deliveryTo },
            { label: "Delivery due", value: fmtDate(s.deliveryDueDate), strong: true, required: true },
            { label: "Address", value: s.deliveryAddress, span: 3 },
            { label: "Packing instructions", value: s.packingInstructions, span: 3 },
          ]} />
        </Block>

        {has(s.specialInstructions) && (
          <Block title="Special instructions">
            <div style={{ fontSize: "11.5px", whiteSpace: "pre-wrap", border: `1.5px solid ${INK}`, padding: "8px 10px" }}>
              {s.specialInstructions}
            </div>
          </Block>
        )}

        {/* Sign-off */}
        <section style={{ marginTop: "22px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", pageBreakInside: "avoid" }}>
          <div>
            <div style={{ fontSize: "8.5px", color: MUTED, textTransform: "uppercase", letterSpacing: "0.04em" }}>Issued by Aeros</div>
            <div style={{ fontSize: "11px", minHeight: "16px" }}>{s.issuedByEmail || ""}</div>
            <div style={{ borderTop: `1px solid ${INK}`, marginTop: "26px", fontSize: "9px", color: MUTED, paddingTop: "2px" }}>Signature & date</div>
          </div>
          <div>
            <div style={{ fontSize: "8.5px", color: MUTED, textTransform: "uppercase", letterSpacing: "0.04em" }}>Accepted by printer</div>
            <div style={{ fontSize: "11px", minHeight: "16px" }}>
              {s.vendorAckAt && !s.ackStale ? `Accepted online ${fmtDate(s.vendorAckAt)} (rev ${s.vendorAckRev})` : ""}
            </div>
            <div style={{ borderTop: `1px solid ${INK}`, marginTop: "26px", fontSize: "9px", color: MUTED, paddingTop: "2px" }}>Signature, stamp & date</div>
          </div>
        </section>

        <footer style={{ marginTop: "16px", fontSize: "8.5px", color: MUTED, borderTop: `1px solid ${RULE}`, paddingTop: "5px" }}>
          Do not start the run until the proof above is approved in writing. Any change to this job order is issued as a new revision.
          Always work from the latest revision (J# {job.jNumber}, rev {s.rev}).
        </footer>
      </div>
    </div>
  );
}
