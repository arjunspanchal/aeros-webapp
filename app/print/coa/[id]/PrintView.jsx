"use client";

import { useEffect } from "react";

const INK = "#111";
const MUTED = "#555";
const RULE = "#999";

function fmtDate(d) {
  if (!d) return "";
  const [y, m, day] = String(d).slice(0, 10).split("-");
  return y && m && day ? `${day}-${m}-${y}` : d;
}

const cell = (extra = {}) => ({ border: `1px solid ${RULE}`, padding: "8px 10px", fontSize: "12.5px", verticalAlign: "top", ...extra });

export default function PrintView({ coa, fields, autoPrint = true }) {
  useEffect(() => {
    if (!autoPrint) return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [autoPrint]);

  const rows = [{ label: "Date", value: fmtDate(coa.date) }, ...fields.map((f) => ({ label: f.label, value: coa[f.key] }))];
  const line = (v) => (
    <span style={{ display: "inline-block", minWidth: "260px", borderBottom: `1px solid ${INK}`, padding: "0 6px 2px", fontWeight: 600 }}>{v || " "}</span>
  );

  return (
    <div className="bg-white mx-auto" style={{ maxWidth: "800px", padding: "32px", color: INK, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          tr { page-break-inside: avoid; }
        }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      `}</style>

      <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
        <button onClick={() => window.print()} className="rounded-lg bg-black px-4 py-2 text-sm text-white">Print / Save PDF</button>
      </div>

      <header style={{ borderBottom: `3px solid ${INK}`, paddingBottom: "8px" }}>
        <div style={{ fontSize: "22px", fontWeight: 800, letterSpacing: "0.12em" }}>AEROS</div>
        <div style={{ fontSize: "10px", color: MUTED }}>Boson Machines (OPC) Private Limited</div>
      </header>

      <h1 style={{ textAlign: "center", fontSize: "18px", fontWeight: 800, letterSpacing: "0.04em", margin: "22px 0 16px" }}>
        CERTIFICATE OF ANALYSIS (COA)
      </h1>

      <div style={{ fontSize: "13px", fontWeight: 700, marginBottom: "6px" }}>Product Details</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={cell({ width: "64px", textAlign: "center", background: "#f2f2f2", fontWeight: 700 })}>Sr. No.</th>
            <th style={cell({ width: "38%", textAlign: "left", background: "#f2f2f2", fontWeight: 700 })}>Parameter</th>
            <th style={cell({ textAlign: "left", background: "#f2f2f2", fontWeight: 700 })}>Specification</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.label}>
              <td style={cell({ textAlign: "center" })}>{i + 1}</td>
              <td style={cell({ fontWeight: 600 })}>{r.label}</td>
              <td style={cell({ whiteSpace: "pre-wrap" })}>{r.value || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: "22px", pageBreakInside: "avoid" }}>
        <div style={{ fontSize: "13px", fontWeight: 700 }}>Quality Confirmation:</div>
        <p style={{ fontSize: "12.5px", marginTop: "4px", lineHeight: 1.5 }}>
          This is to certify that the above-mentioned packaging product has been manufactured and inspected as per the
          customer&apos;s specifications and meets the agreed quality parameters.
        </p>
        <div style={{ fontSize: "12.5px", marginTop: "22px" }}>Inspection Result: {line(coa.inspectionResult)}</div>
        <div style={{ fontSize: "12.5px", marginTop: "26px" }}>Approved By: {line(coa.approvedBy)}</div>
        <div style={{ fontSize: "12.5px", marginTop: "6px", fontWeight: 600 }}>Authorized Signatory</div>
      </div>

      <footer style={{ marginTop: "auto", paddingTop: "28px", pageBreakInside: "avoid" }}>
        <div style={{ borderTop: `1.5px solid ${INK}`, paddingTop: "8px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", fontSize: "10px", color: MUTED, lineHeight: 1.5 }}>
          <div>
            <div style={{ color: INK, fontWeight: 700 }}>Boson Machines (OPC) Private Limited</div>
            <div>Address: 76/612, Motilal Nagar No.1, Goregaon West, Mumbai - 104, MH, INDIA</div>
            <div>Contact: +91 9870983696 · Email: bosonmachines@gmail.com</div>
            <div>CIN: U74999MH2017OPC299430 · GST: 27AAHCB4282B1ZW</div>
            <div>MSME: UDYAM-MH-18-0092157</div>
          </div>
          <div>
            <div style={{ color: INK, fontWeight: 700 }}>Manufacturing Unit:</div>
            <div>Thee Packaging Company,</div>
            <div>B-203, B4, Shree Raj Rajeshwari Logistics Park,</div>
            <div>Bhatale, Bhiwandi, Mumbai, Maharashtra – 421302.</div>
          </div>
        </div>
        <p style={{ fontSize: "9px", color: MUTED, marginTop: "8px", lineHeight: 1.45 }}>
          <strong>Disclaimer:</strong> These products have been manufactured exclusively at the request of the customer. Boson
          Machines (OPC) Pvt Ltd assumes no liability for any non-compliance with applicable regulations, standards, or intended use.
        </p>
      </footer>
    </div>
  );
}
