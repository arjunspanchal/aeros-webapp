// RFQ detail — metadata header + embedded PDF viewer. Internal users
// always see; everyone else must be linked to the RFQ's customer via
// user_clients (mirrors the GET /api/rfq/[id] gate so URL-guessing
// can't leak quotes).

import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { requireInternal } from "@/lib/auth/policy";
import { dbSelect } from "@/lib/db/supabase";
import { getRfqQuote } from "@/lib/rfq/store";
import { listClients } from "@/lib/factoryos/repo";
import RfqDetailActions from "./RfqDetailActions";

export const dynamic = "force-dynamic";

async function userOwnsClient(email, clientId) {
  if (!email || !clientId) return false;
  const userRows = await dbSelect("users", {
    select: "id",
    filter: { email: `ilike.${email.toLowerCase()}` },
    limit: 1,
  });
  const userId = userRows[0]?.id;
  if (!userId) return false;
  const links = await dbSelect("user_clients", {
    select: "client_id",
    filter: { user_id: `eq.${userId}`, client_id: `eq.${clientId}` },
    limit: 1,
  });
  return links.length > 0;
}

export default async function RfqDetailPage({ params }) {
  const session = getSession();
  if (!session) redirect("/login");

  const isInternal = session.isAdmin || requireInternal(session);

  const quote = await getRfqQuote(params.id).catch(() => null);
  if (!quote) notFound();

  if (!isInternal) {
    const owns = await userOwnsClient(session.email, quote.clientId);
    if (!owns) notFound();
  }

  // Customer name for the header (admin & customer both want to see who
  // this is for). Cheap read.
  let customerName = "";
  if (quote.clientId) {
    try {
      const clients = await listClients();
      customerName = clients.find((c) => c.id === quote.clientId)?.name || "";
    } catch {}
  }

  return (
    <div className="max-w-6xl mx-auto px-4 pb-10 pt-4">
      {/* Breadcrumb */}
      <Link
        href="/rfq-manager"
        className="text-xs text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
      >
        ← RFQ Manager
      </Link>

      {/* Header */}
      <div className="mt-2 flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white break-all">
            {quote.aerosRfqNumber || "Untitled RFQ"}
          </h1>
          <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
            {[quote.brand, quote.productName, customerName]
              .filter(Boolean)
              .join(" · ") || quote.filename}
          </p>
        </div>
        <RfqDetailActions
          quoteId={quote.id}
          downloadUrl={`/api/rfq/${quote.id}/file?download=1`}
          filename={quote.filename}
          isInternal={isInternal}
        />
      </div>

      {/* Metadata grid */}
      <dl className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-white border border-gray-200 rounded-xl p-4 dark:bg-gray-900 dark:border-gray-800">
        <Field label="Aeros RFQ #" mono>{quote.aerosRfqNumber || "—"}</Field>
        <Field label="Customer RFQ #" mono>{quote.customerRfqNumber || "—"}</Field>
        <Field label="Brand">{quote.brand || "—"}</Field>
        <Field label="Product">{quote.productName || "—"}</Field>
        {isInternal && <Field label="Customer">{customerName || quote.clientEmail || "—"}</Field>}
        <Field label="Uploaded">
          {quote.createdAt ? new Date(quote.createdAt).toLocaleDateString() : "—"}
        </Field>
        <Field label="File">
          <span className="break-all">{quote.filename}</span>
        </Field>
        <Field label="Size">{formatBytes(quote.bytes)}</Field>
        {quote.notes && (
          <div className="sm:col-span-2 lg:col-span-4">
            <dt className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">Notes</dt>
            <dd className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{quote.notes}</dd>
          </div>
        )}
      </dl>

      {/* PDF viewer — streams through the in-app proxy so the browser
          renders inline regardless of how Supabase serves the object. */}
      <div className="mt-5 bg-white border border-gray-200 rounded-xl overflow-hidden dark:bg-gray-900 dark:border-gray-800">
        <object
          data={`/api/rfq/${quote.id}/file`}
          type={quote.contentType || "application/pdf"}
          className="w-full block"
          style={{ height: "calc(100vh - 360px)", minHeight: 480 }}
          aria-label={quote.filename || "RFQ PDF"}
        >
          <div className="p-10 text-center text-sm text-gray-500 dark:text-gray-400">
            Your browser can&apos;t display this PDF inline.{" "}
            <a
              href={`/api/rfq/${quote.id}/file?download=1`}
              className="text-blue-600 hover:text-blue-700 dark:text-blue-400 underline"
            >
              Download instead
            </a>
            .
          </div>
        </object>
      </div>
    </div>
  );
}

function Field({ label, mono, children }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">{label}</dt>
      <dd className={`text-sm text-gray-800 dark:text-gray-100 ${mono ? "font-mono" : ""}`}>{children}</dd>
    </div>
  );
}

function formatBytes(n) {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
