// PDF stream proxy. Lets the detail-page iframe render the file inline
// regardless of how Supabase Storage serves the underlying object.
// Also enforces the same scope check as the rest of the RFQ API so a
// guessed RFQ id can't leak quotes between customers.
//
// Pass `?download=1` to flip Content-Disposition to attachment for
// explicit download links.

import { getSession } from "@/lib/auth/session";
import { requireInternal } from "@/lib/auth/policy";
import { dbSelect } from "@/lib/db/supabase";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "rfq-quotes";

const encodePath = (p) => encodeURI(p).replace(/%2F/g, "/");

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

export async function GET(req, { params }) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response("Storage not configured", { status: 500 });
  }

  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const rows = await dbSelect("rfq_quotes", {
    select: "id,client_id,client_email,storage_path,content_type,filename",
    filter: { id: `eq.${params.id}` },
    limit: 1,
  });
  const row = rows[0];
  if (!row) return new Response("Not found", { status: 404 });

  // Same scope as GET /api/rfq/[id]: internal sees all; everyone else
  // must own the customer via user_clients.
  const isInternal = session.isAdmin || requireInternal(session);
  if (!isInternal) {
    const owns = await userOwnsClient(session.email, row.client_id);
    if (!owns) return new Response("Not found", { status: 404 });
  }

  // Stream from Supabase Storage using the service-role key. The path is
  // private — never exposed to the browser; the browser only sees this
  // proxy URL.
  const storageUrl = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodePath(row.storage_path)}`;
  const upstream = await fetch(storageUrl, {
    headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!upstream.ok) {
    return new Response(`Storage error: ${upstream.status}`, { status: 502 });
  }

  const { searchParams } = new URL(req.url);
  const wantsDownload = searchParams.get("download") === "1";
  const contentType = row.content_type || upstream.headers.get("content-type") || "application/pdf";
  const safeFilename = (row.filename || "rfq.pdf").replace(/"/g, "");
  const disposition = wantsDownload ? "attachment" : "inline";

  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set("Content-Disposition", `${disposition}; filename="${safeFilename}"`);
  // Short-lived private cache so iframe re-renders / scrolls don't refetch
  // every time. Tweakable.
  headers.set("Cache-Control", "private, max-age=600");
  // Don't forward Content-Length — when the upstream uses chunked
  // transfer-encoding, that header is missing or wrong, and Next can
  // change the encoding anyway. Letting the runtime set its own framing
  // is safer and still gives the browser enough to render PDFs inline.

  return new Response(upstream.body, { status: 200, headers });
}
