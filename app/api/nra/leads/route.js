// Lead capture API for trade-show booth registration.
// Admin-only end-to-end — POST, GET, PATCH, DELETE all require a staff-
// admin hub session. The public visitor form was scrapped on 2026-05-17;
// the only writer is now Arjun walking the floor in owner mode.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { dbInsert, dbSelect } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES = new Set([
  "Operator", "Distributor", "Disposables", "Packaging", "Equipment",
  "Refrigeration", "Beverage", "Smallwares", "Cleaning", "POS / Tech", "Other",
]);
const INTERESTS = new Set([
  "Marketplace", "Aeros Select", "Factory OS", "Show offer", "Just exploring",
]);
const RECORD_TYPES = new Set(["exhibitor", "visitor"]);
const PRIORITIES = new Set(["P0", "P1", "P2"]);

function isStaffAdmin(session) {
  if (!session) return false;
  if (session.isAdmin) return true;
  return session.modules?.factoryos === "admin";
}

function clean(value, max = 500) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function sanitizeInterests(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const v = clean(raw, 60);
    if (!v || seen.has(v)) continue;
    if (!INTERESTS.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export async function POST(request) {
  const session = getSession();
  if (!isStaffAdmin(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = clean(body?.name, 120);
  const company = clean(body?.company, 160);
  const email = clean(body?.email, 200);

  // Floor-walking lookahead: we often won't have an email at all (just a
  // booth + business card). Name + company are still required, email is
  // optional but if present must look valid.
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!company) return NextResponse.json({ error: "Company is required" }, { status: 400 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Email looks malformed" }, { status: 400 });
  }

  // `source` was 'self' | 'owner' when there was a public visitor form.
  // Visitor flow is gone, so default to 'owner' and ignore the client value.
  const source = "owner";

  const category = clean(body?.category, 60);
  const recordTypeRaw = clean(body?.record_type, 12).toLowerCase();
  const priorityRaw = clean(body?.priority, 4).toUpperCase();
  const row = {
    name,
    company,
    role: clean(body?.role, 120),
    email,
    phone: clean(body?.phone, 60),
    category: CATEGORIES.has(category) ? category : "",
    booth: clean(body?.booth, 30),
    interests: sanitizeInterests(body?.interests),
    notes: clean(body?.notes, 2000),
    record_type: RECORD_TYPES.has(recordTypeRaw) ? recordTypeRaw : "exhibitor",
    priority: PRIORITIES.has(priorityRaw) ? priorityRaw : "P2",
    country: clean(body?.country, 60),
    source,
    show: clean(body?.show, 40) || "nra-2026",
  };

  try {
    const lead = await dbInsert("nra_leads", row);
    return NextResponse.json({ lead }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || "Insert failed" },
      { status: 500 },
    );
  }
}

export async function GET(request) {
  const session = getSession();
  if (!isStaffAdmin(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const show = url.searchParams.get("show") || "nra-2026";

  try {
    const leads = await dbSelect("nra_leads", {
      select: "*",
      filter: { show: `eq.${show}` },
      order: "created_at.desc",
      limit: 500,
    });
    return NextResponse.json({ leads });
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || "Fetch failed" },
      { status: 500 },
    );
  }
}
