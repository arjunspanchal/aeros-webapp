"use client";

// Printable production QR poster. Paste one on each machine — operators scan
// it to open the /floor capture page. The QR image is a static asset
// (public/floor-qr.png) encoding the /floor URL, so no runtime QR library is
// needed. "Print" opens the browser print dialog with everything but the
// poster hidden.

export default function FloorQrClient() {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 print:hidden">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Production QR</h1>
        <button onClick={() => window.print()} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900">
          🖨 Print
        </button>
      </div>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 print:hidden">
        Print this and paste one on every machine. Operators scan it to open the production page —
        no login needed. The same QR works on all machines (the operator picks the line each time).
      </p>

      {/* The poster — centered, print-friendly */}
      <div className="mt-6 rounded-2xl border-2 border-gray-900 bg-white p-8 text-center print:border-0 print:mt-0">
        <div className="text-2xl font-extrabold tracking-tight text-gray-900">AEROS — PRODUCTION</div>
        <div className="mt-1 text-base text-gray-600">Scan to log your machine job</div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/floor-qr.png" alt="Scan to open production page" className="mx-auto my-6 h-64 w-64" />
        <ol className="mx-auto max-w-xs text-left text-sm text-gray-700 space-y-1">
          <li>1. Open your phone camera</li>
          <li>2. Point at this code</li>
          <li>3. Tap the link that appears</li>
          <li>4. Pick machine → your name → roll → SKU → START</li>
        </ol>
        <div className="mt-6 text-xs text-gray-400">webapp.aeros-x.com/floor</div>
      </div>
    </div>
  );
}
