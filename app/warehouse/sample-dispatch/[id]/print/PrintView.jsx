"use client";

import { useEffect } from "react";

function fmtINR(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function PrintView({ dispatch: d }) {
  useEffect(() => {
    // Auto-open the print dialog so "Save as PDF" is one keystroke away.
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="bg-white text-black mx-auto" style={{ maxWidth: "800px", padding: "32px" }}>
      <style>{`
        @page { size: A4; margin: 16mm; }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      `}</style>

      <div className="no-print mb-6 flex justify-end gap-2">
        <button onClick={() => window.print()} className="rounded-lg bg-black px-4 py-2 text-sm text-white">Print / Save PDF</button>
      </div>

      <header style={{ borderBottom: "2px solid #000", paddingBottom: "12px", marginBottom: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontSize: "28px", fontWeight: 700, letterSpacing: "0.05em", margin: 0 }}>Aeros</h1>
            <p style={{ margin: "4px 0 0", fontSize: "11px", color: "#555" }}>Boson Machines OPC Pvt Ltd · Mumbai, India</p>
          </div>
          <div style={{ textAlign: "right", fontSize: "12px" }}>
            <div><strong>Dispatch No:</strong> {d.dispatch_no}</div>
            <div><strong>Date:</strong> {fmtDate(d.dispatch_date)}</div>
            {d.managed_by && <div><strong>Managed By:</strong> {d.managed_by}</div>}
          </div>
        </div>
      </header>

      <section style={{ marginBottom: "20px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ background: "#f4f4f4" }}>
              <th style={th()}>Name of Customer</th>
              <th style={th()}>Contact Number</th>
              <th style={th()}>Billing Address</th>
              <th style={th()}>Delivery Address</th>
              <th style={th()}>GSTIN</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={td()}>{d.customer_name}</td>
              <td style={td()}>{d.customer_contact || ""}</td>
              <td style={td()}>{d.customer_billing_address || ""}</td>
              <td style={td()}>{d.customer_delivery_address || ""}</td>
              <td style={td()}>{d.customer_gstin || ""}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2 style={{ fontSize: "14px", fontWeight: 600, margin: "0 0 8px", letterSpacing: "0.02em" }}>Item List</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ background: "#f4f4f4" }}>
              <th style={th()}>Sr. No.</th>
              <th style={th()}>Order ID</th>
              <th style={th()}>Item Description</th>
              <th style={{ ...th(), textAlign: "right" }}>Quantity</th>
              <th style={{ ...th(), textAlign: "right" }}>Price/pc</th>
              <th style={{ ...th(), textAlign: "right" }}>Total (Excl. GST)</th>
              <th style={{ ...th(), textAlign: "right" }}>GST</th>
              <th style={{ ...th(), textAlign: "right" }}>Total (Incl. GST)</th>
            </tr>
          </thead>
          <tbody>
            {(d.items || []).map((ln) => (
              <tr key={ln.id}>
                <td style={td()}>{ln.sr_no}</td>
                <td style={{ ...td(), fontFamily: "monospace" }}>{ln.order_id}</td>
                <td style={td()}>{ln.description}</td>
                <td style={{ ...td(), textAlign: "right" }}>{ln.quantity}</td>
                <td style={{ ...td(), textAlign: "right" }}>{fmtINR(ln.price)}</td>
                <td style={{ ...td(), textAlign: "right" }}>{fmtINR(ln.total_excl_gst)}</td>
                <td style={{ ...td(), textAlign: "right" }}>{ln.gst_pct}%</td>
                <td style={{ ...td(), textAlign: "right" }}>{fmtINR(ln.total_incl_gst)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} style={{ ...td(), textAlign: "right", fontWeight: 600 }}>Subtotal</td>
              <td style={{ ...td(), textAlign: "right" }}>{fmtINR(d.total_excl_gst)}</td>
              <td style={{ ...td(), textAlign: "right" }}>{fmtINR(d.total_gst)}</td>
              <td style={{ ...td(), textAlign: "right", fontWeight: 700 }}>{fmtINR(d.total_incl_gst)}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      {(d.courier || d.awb) && (
        <section style={{ marginTop: "20px", fontSize: "12px" }}>
          <strong>Courier:</strong> {d.courier || "—"} &nbsp;&nbsp; <strong>AWB:</strong> {d.awb || "—"}
        </section>
      )}

      {d.notes && (
        <section style={{ marginTop: "16px", fontSize: "11px", color: "#444", whiteSpace: "pre-line" }}>
          <strong>Notes:</strong> {d.notes}
        </section>
      )}

      <footer style={{ marginTop: "32px", borderTop: "1px solid #ccc", paddingTop: "10px", fontSize: "10px", color: "#666", textAlign: "center" }}>
        Aeros · {d.dispatch_no} · Generated {new Date().toLocaleString("en-IN")}
      </footer>
    </div>
  );
}

function th() {
  return { border: "1px solid #999", padding: "6px 8px", textAlign: "left", fontWeight: 600 };
}
function td() {
  return { border: "1px solid #ccc", padding: "6px 8px", verticalAlign: "top" };
}
