"use client";
import { useState } from "react";
import { formatDate } from "@/app/factoryos/_components/ui";
import { LABEL, qtyBand } from "@/lib/factoryos/jobOrderConstants";

function Row({ label, value }) {
  if (value == null || value === "") return null;
  return (
    <div>
      <dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{value}</dd>
    </div>
  );
}

// Vendor-side summary of the issued job order: the handful of fields that
// most often cause a reprint, the colour list, and the accept action. The
// full sheet is one click away as the printable PDF.
export default function VendorJobOrderPanel({ jobId, initialSpec, initialColours = [] }) {
  const [spec, setSpec] = useState(initialSpec);
  const colours = initialColours;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (!spec) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5 dark:bg-gray-900 dark:border-gray-800">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Job order</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Aeros hasn't released the print job order yet. Please don't start printing until it appears here.
        </p>
      </div>
    );
  }

  const isFlexo = spec.process === "flexo";
  const accepted = !!spec.vendorAckAt && !spec.ackStale;
  const band = qtyBand(spec);

  async function accept() {
    setBusy(true); setErr("");
    try {
      const res = await fetch(`/api/factoryos/jobs/${jobId}/print-spec`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ack" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not accept");
      setSpec(data.spec);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 dark:bg-gray-900 dark:border-gray-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
            Job order · {LABEL.process[spec.process]} · rev {spec.rev}
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Issued {formatDate(spec.issuedAt)}. Always print from the latest revision.
          </p>
        </div>
        <a
          href={`/print/job-order/${jobId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          Open full job order / PDF
        </a>
      </div>

      {spec.ackStale && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
          This job order changed after you accepted rev {spec.vendorAckRev}. Please check rev {spec.rev} and accept it again.
        </p>
      )}

      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
        <Row label="Paper / board" value={[spec.substrateName, spec.substrateGsm ? `${spec.substrateGsm} GSM` : null].filter(Boolean).join(" · ")} />
        <Row label="Print side" value={LABEL.printSide[spec.printSide]} />
        <Row label="Varnish" value={spec.varnishRequired
          ? [LABEL.varnishType[spec.varnishType], LABEL.varnishCoverage[spec.varnishCoverage]].filter(Boolean).join(" · ") || "Required"
          : "Not required"} />
        <Row label="Proof required" value={LABEL.proofType[spec.proofType]} />
        <Row label="Artwork" value={[spec.artworkRef, spec.artworkRev].filter(Boolean).join(" · ")} />
        <Row label="Plates" value={LABEL.platesStatus[spec.platesStatus]} />
        {isFlexo ? (
          <>
            <Row label="Reel width × repeat" value={spec.flexoReelDeckleMm || spec.flexoRepeatMm ? `${spec.flexoReelDeckleMm ?? "?"} × ${spec.flexoRepeatMm ?? "?"} mm` : null} />
            <Row label="Wind direction" value={spec.flexoWindDirection ? `Wind ${spec.flexoWindDirection}` : null} />
          </>
        ) : (
          <>
            <Row label="Sheet size" value={spec.offsetSheetLengthMm || spec.offsetSheetWidthMm ? `${spec.offsetSheetLengthMm ?? "?"} × ${spec.offsetSheetWidthMm ?? "?"} mm` : null} />
            <Row label="Ups / sheet" value={spec.offsetUpsPerSheet} />
          </>
        )}
        <Row label="Accepted quantity" value={band ? `${band.min.toLocaleString("en-IN")} – ${band.max.toLocaleString("en-IN")} ${spec.qtyUom || "pcs"}` : null} />
        <Row label="Deliver by" value={spec.deliveryDueDate ? formatDate(spec.deliveryDueDate) : null} />
      </dl>

      {colours.length > 0 && (
        <div className="mt-4">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Colours ({colours.length})</div>
          <div className="flex flex-wrap gap-2">
            {colours.map((c, i) => (
              <span key={c.id || i} className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-800 dark:border-gray-700 dark:text-gray-200">
                {c.swatchHex && <span className="inline-block h-3 w-3 rounded-sm border border-gray-300" style={{ background: c.swatchHex }} />}
                {c.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {spec.specialInstructions && (
        <div className="mt-4 rounded-lg border border-gray-900 px-3 py-2 text-sm text-gray-900 whitespace-pre-wrap dark:border-gray-200 dark:text-gray-100">
          {spec.specialInstructions}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
        {accepted ? (
          <span className="text-sm text-green-700 dark:text-green-400">
            ✓ You accepted rev {spec.vendorAckRev} on {formatDate(spec.vendorAckAt)}
          </span>
        ) : (
          <>
            <button
              type="button"
              onClick={accept}
              disabled={busy}
              className="inline-flex items-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-gray-900"
            >
              {busy ? "Accepting…" : `I've checked it — accept rev ${spec.rev}`}
            </button>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Anything unclear? Ask in Messages below before accepting.
            </span>
          </>
        )}
        {err && <span className="text-xs text-red-600 dark:text-red-400">{err}</span>}
      </div>
    </div>
  );
}
