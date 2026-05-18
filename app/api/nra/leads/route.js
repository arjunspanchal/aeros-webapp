// Lead capture API for trade-show booth registration.
// POST is public — anyone walking past Booth #12937 can submit.
// GET is admin-only — only staff admins can see who signed in.

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
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = clean(body?.name, 120);
  const company = clean(body?.company, 160);
  const email = clean(body?.email, 200);

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!company) return NextResponse.json({ error: "Company is required" }, { status: 400 });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  const sourceRaw = clean(body?.source, 10).toLowerCase();
  const source = sourceRaw === "owner" ? "owner" : "self";

  const category = clean(body?.category, 60);
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
