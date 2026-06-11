"use client";
// ─── Aeros Webapp · Command Center (the authed home, /hub) ────────────
//
// Rewritten June 2026. The previous version was a card grid on cream
// paper. This rewrite is editorial-utilitarian dialled up: dark hero
// band with live clock + ticker, a bento module grid where each tile
// carries live data + a 7-day sparkline, a quick-actions strip, an
// alerts strip, and a recent-activity feed. ⌘K opens a global palette.
// G-then-X jumps between modules (gmail-style).
//
// Light-only to match the rest of the shell. Numbers stream from
// /api/hub/stats and animate in via CountUp with a setTimeout safety
// net for headless browsers.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppHeader from "./components/AppHeader";
import LiveClock from "./components/home/LiveClock";
import CountUp from "./components/home/CountUp";
import Ticker from "./components/home/Ticker";
import Sparkline from "./components/home/Sparkline";
import CommandPalette from "./components/home/CommandPalette";

// ─── Module tiles ────────────────────────────────────────────────────────

const TILES = [
  {
    key: "factoryos",
    href: "/factoryos",
    title: "FactoryOS",
    blurb: "Jobs, customer POs, production stages",
    size: "lg",
    accent: "from-royal-600 via-indigo-600 to-purple-700",
    sparkColor: "#6366F1",
    moduleKey: "factoryos",
    metric: (s) => ({
      number: s?.factoryos?.open ?? 0,
      label: "open jobs",
      sub: s?.factoryos?.totalJobs
        ? `of ${s.factoryos.totalJobs.toLocaleString("en-IN")} total · ${s.factoryos.pos ?? 0} POs`
        : "",
      spark: s?.factoryos?.spark || [],
    }),
  },
  {
    key: "clearance",
    href: "/warehouse",
    title: "WarehouseOS",
    blurb: "Clearance stock, master inventory, audits",
    size: "lg",
    accent: "from-amber-500 via-orange-500 to-rose-600",
    sparkColor: "#F97316",
    moduleKey: "clearance",
    metric: (s) => ({
      number: s?.clearance?.items ?? 0,
      label: "SKUs in clearance",
      sub: s?.catalogue
        ? `${(s.catalogue.products ?? 0).toLocaleString("en-IN")} master SKUs catalogued`
        : "",
      spark: s?.clearance?.spark || [],
    }),
  },
  {
    key: "rate_cards",
    href: "/rfq-manager",
    title: "RFQs",
    blurb: "Rate cards, past quotes, RFQ manager",
    size: "md",
    accent: "from-sky-600 to-cyan-700",
    sparkColor: "#0891B2",
    moduleKey: "rate_cards",
    metric: (s) => ({
      number: s?.rate_cards?.quotes ?? 0,
      label: "quotes",
      sub: s?.rate_cards ? `${s.rate_cards.cards ?? 0} cards · ${s.rate_cards.rfqs ?? 0} RFQs` : "",
      spark: s?.rate_cards?.spark || [],
    }),
  },
  {
    key: "calculator",
    href: "/calculator",
    title: "Calculator",
    blurb: "Live quoting — bag, box, cup, wrap, PP",
    size: "md",
    accent: "from-blue-600 to-indigo-700",
    sparkColor: "#2347D9",
    moduleKey: "calculator",
    metric: (s) => ({
      number: s?.calculator?.quotes ?? 0,
      label: "quotes generated",
      sub: "Run the rate engine",
      spark: s?.calculator?.spark || [],
    }),
  },
  {
    key: "hr",
    href: "/hr",
    title: "HR",
    blurb: "Roster, attendance, payroll",
    size: "md",
    accent: "from-emerald-500 to-teal-700",
    sparkColor: "#10B981",
    moduleKey: "hr",
    metric: (s) => ({
      number: s?.hr?.presentToday ?? 0,
      label: "present today",
      sub: s?.hr ? `${s.hr.employees ?? 0} on payroll` : "",
      spark: s?.hr?.spark || [],
    }),
  },
  {
    key: "catalogue",
    href: "/catalog",
    title: "Catalogue",
    blurb: "Full SKU master — cups, bags, boxes, tubs",
    size: "lg",
    accent: "from-fuchsia-600 to-purple-700",
    sparkColor: "#A855F7",
    moduleKey: "catalogue",
    metric: (s) => ({
      number: s?.catalogue?.products ?? 0,
      label: "active SKUs",
      sub: "Browse the full range",
    }),
  },
  {
    key: "design",
    href: "/design",
    title: "Design",
    blurb: "Keylines, KLDs, mockups, artwork",
    size: "lg",
    accent: "from-violet-600 to-indigo-700",
    sparkColor: "#8B5CF6",
    always: true, // open to every authed user (designers / printers)
    metric: (s) => ({
      number: s?.design?.files ?? 0,
      label: "design files",
      sub: "Download keylines",
    }),
  },
];

const QUICK_ACTIONS = [
  { label: "New job",           href: "/factoryos/admin/jobs/new",    module: "factoryos" },
  { label: "Quote a customer",  href: "/calculator/admin",            module: "calculator" },
  { label: "Mark inward",       href: "/warehouse/inventory/inward",  module: "clearance" },
  { label: "Sample dispatch",   href: "/warehouse/sample-dispatch",   module: "clearance" },
  { label: "Punch clock",       href: "/hr/clock",                    always: true },
  { label: "View past quotes",  href: "/rate-cards/quotes",           module: "rate_cards" },
];

// ─── Customer-only command center ────────────────────────────────────────
//
// A customer session also lands on /hub, but the internal modules / KPIs /
// activity feed are not for them. We swap in a customer-shaped tile set +
// quick actions so the page keeps its hero feel while only exposing their
// own portal surfaces.
const CUSTOMER_TILES = [
  {
    key: "my_orders",
    href: "/factoryos/customer",
    title: "Your orders",
    blurb: "Live status, ETAs, and a chat thread per order",
    size: "lg",
    accent: "from-royal-600 via-indigo-600 to-purple-700",
    sparkColor: "#6366F1",
    customerOnly: true,
    cta: "Open dashboard",
  },
  {
    key: "documents",
    href: "/factoryos/customer/documents",
    title: "Documents",
    blurb: "Every artwork, proof, challan and LR copy across your orders",
    size: "lg",
    accent: "from-fuchsia-600 to-purple-700",
    sparkColor: "#A855F7",
    customerOnly: true,
    cta: "Browse files",
  },
  {
    key: "pos",
    href: "/factoryos/customer/pos",
    title: "Purchase orders",
    blurb: "Upload POs so they stay tied to your jobs",
    size: "md",
    accent: "from-sky-600 to-cyan-700",
    sparkColor: "#0891B2",
    customerOnly: true,
    cta: "Manage POs",
  },
  {
    key: "catalogue_c",
    href: "/catalog",
    title: "Catalogue",
    blurb: "Browse Aeros' full SKU range — cups, bags, boxes, tubs",
    size: "md",
    accent: "from-amber-500 via-orange-500 to-rose-600",
    sparkColor: "#F97316",
    customerOnly: true,
    cta: "Browse SKUs",
  },
  {
    key: "design_c",
    href: "/design",
    title: "Design",
    blurb: "Keylines, KLDs and mockups for our product range",
    size: "md",
    accent: "from-violet-600 to-indigo-700",
    sparkColor: "#8B5CF6",
    customerOnly: true,
    cta: "Open library",
  },
  {
    key: "profile_c",
    href: "/factoryos/customer/profile",
    title: "Your profile",
    blurb: "Name, phone, photo. Sign in details.",
    size: "md",
    accent: "from-emerald-500 to-teal-700",
    sparkColor: "#10B981",
    customerOnly: true,
    cta: "Edit profile",
  },
];

const CUSTOMER_QUICK_ACTIONS = [
  { label: "Open your orders",   href: "/factoryos/customer" },
  { label: "Browse documents",   href: "/factoryos/customer/documents" },
  { label: "Upload a PO",        href: "/factoryos/customer/pos" },
  { label: "Browse catalogue",   href: "/catalog" },
];

// True when this session is a "pure customer" — has the factoryos customer
// role and is not also an admin. Admins always see the full internal home
// even if their record is also linked as a customer.
function isCustomerOnly(session) {
  if (!session) return false;
  if (session.isAdmin) return false;
  return session?.modules?.factoryos === "customer";
}

function quickActionsFor(session) {
  if (!session) return [];
  if (isCustomerOnly(session)) return CUSTOMER_QUICK_ACTIONS;
  const modules = session.modules || {};
  return QUICK_ACTIONS.filter((a) => a.always || !!modules[a.module] || session.isAdmin);
}

function tilesFor(session) {
  if (!session) {
    return TILES.filter((t) => t.key === "clearance" || t.key === "catalogue");
  }
  if (isCustomerOnly(session)) return CUSTOMER_TILES;
  const modules = session.modules || {};
  const isAdmin = !!session.isAdmin;
  return TILES.filter((t) => t.always || isAdmin || !!modules[t.moduleKey]);
}

function timeSince(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const s = Math.max(1, Math.round((Date.now() - d.getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
  const day = Math.round(h / 24); return `${day}d ago`;
}

function greeting(name) {
  const h = new Date().getHours();
  const slot = h < 5 ? "Late shift" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : h < 22 ? "Good evening" : "Late shift";
  const first = (name || "").trim().split(/\s+/)[0] || "";
  return first ? `${slot}, ${first}.` : `${slot}.`;
}

// Sub-headline that follows the greeting — varies by hour of day so the
// hero doesn't read identically at 9am and 11pm. One beat each.
function subGreeting() {
  const h = new Date().getHours();
  const day = new Date().getDay();
  const isWeekend = day === 0 || day === 6;
  if (isWeekend && h < 18) return "Quiet day on the floor. Numbers still come in.";
  if (h < 5)  return "Night shift's running. ⌘K to jump anywhere.";
  if (h < 9)  return "Morning lineup. Every module, every metric, one place.";
  if (h < 12) return "Heads-up before the day picks up. ⌘K to navigate.";
  if (h < 14) return "Mid-day sweep. ⌘K to jump anywhere.";
  if (h < 17) return "Afternoon push. Quote, dispatch, ship.";
  if (h < 20) return "Closing the day. Wrap loose ends. ⌘K to navigate.";
  if (h < 23) return "Evening pass. Tomorrow's prep is in here.";
  return "Late shift. Take it easy on the keys. ⌘K opens everything.";
}

export default function HomeClient({ session, footer }) {
  const isAuthed = !!session;
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Live data load — refresh every 60s while tab is visible.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch("/api/hub/stats", { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        if (cancelled) return;
        setStats(j.stats || null);
        setActivity(j.activity || []);
        setAlerts(j.alerts || []);
      } catch {}
    }
    load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Global ⌘K + Vim-style "G then X" navigation shortcuts.
  // After pressing G, the next keypress within 1.2s maps to a module:
  //   F → /factoryos · W → /warehouse · H → /hr · K → /calculator
  //   R → /rfq-manager · C → /catalog · D → /design
  useEffect(() => {
    let pendingG = false;
    let resetTimer = null;
    const ROUTE = {
      f: "/factoryos",
      w: "/warehouse",
      h: "/hr",
      k: "/calculator",
      r: "/rfq-manager",
      c: "/catalog",
      d: "/design",
    };
    function onKey(e) {
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || e.target?.isContentEditable) return;
      const isK = e.key === "k" || e.key === "K";
      if (isK && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const lower = (e.key || "").toLowerCase();
      if (!pendingG && lower === "g") {
        pendingG = true;
        clearTimeout(resetTimer);
        resetTimer = setTimeout(() => { pendingG = false; }, 1200);
        return;
      }
      if (pendingG) {
        pendingG = false;
        clearTimeout(resetTimer);
        const dest = ROUTE[lower];
        if (dest) {
          e.preventDefault();
          window.location.href = dest;
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); clearTimeout(resetTimer); };
  }, []);

  const tiles  = useMemo(() => tilesFor(session), [session]);
  const quicks = useMemo(() => quickActionsFor(session), [session]);
  const customerMode = isCustomerOnly(session);

  const tickerItems = useMemo(() => {
    // Customer-only ticker — neutral / brand-flavour items. Avoids leaking
    // internal aggregates like "57 clients" or "open jobs" to a customer.
    if (customerMode) {
      return [
        { value: "Mumbai", label: "India · manufacturing" },
        { value: "INR ₹",  label: "all rates in INR" },
        { value: "FCL",    label: "full-container quotes" },
        { value: "Live",   label: "order status updates" },
      ];
    }
    if (!stats) return [];
    const xs = [];
    if (stats.factoryos)  xs.push({ value: (stats.factoryos.open ?? 0).toLocaleString("en-IN"),     label: "open jobs" });
    if (stats.clearance)  xs.push({ value: (stats.clearance.items ?? 0).toLocaleString("en-IN"),    label: "clearance SKUs" });
    if (stats.catalogue)  xs.push({ value: (stats.catalogue.products ?? 0).toLocaleString("en-IN"), label: "catalogue SKUs" });
    if (stats.rate_cards) xs.push({ value: (stats.rate_cards.quotes ?? 0).toLocaleString("en-IN"),  label: "quotes drafted" });
    if (stats.hr)         xs.push({ value: (stats.hr.presentToday ?? 0).toLocaleString("en-IN"),    label: "present today" });
    if (stats.hr)         xs.push({ value: (stats.hr.employees ?? 0).toLocaleString("en-IN"),       label: "on payroll" });
    if (stats.clients)    xs.push({ value: (stats.clients.count ?? 0).toLocaleString("en-IN"),      label: "clients" });
    if (stats.design)     xs.push({ value: (stats.design.files ?? 0).toLocaleString("en-IN"),       label: "design files" });
    xs.push({ value: "Mumbai", label: "India · manufacturing" });
    xs.push({ value: "INR ₹",  label: "all rates in INR" });
    xs.push({ value: "FCL",    label: "full-container quotes" });
    return xs;
  }, [stats, customerMode]);

  return (
    <div className="min-h-screen flex flex-col bg-ink-50">
      <AppHeader session={session} />

      {/* ─── Hero band ────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-ink-200 bg-ink-900 text-white">
        <div className="absolute inset-0 hero-mesh opacity-60" aria-hidden="true" />
        <div className="absolute inset-0 bg-paper-grain opacity-30" aria-hidden="true" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" aria-hidden="true" />

        <div className="relative max-w-7xl mx-auto px-4 md:px-6 pt-10 pb-12 sm:pt-12 sm:pb-16">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.2em] text-white/60 mb-4">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 pulse-dot" />
                <span>Live · Aeros Command Center</span>
              </div>
              <h1 className="text-display-md sm:text-display-lg font-bold tracking-tight text-white animate-rise">
                {isAuthed ? greeting(session.name || session.email) : "Welcome to Aeros."}
              </h1>
              <p className="mt-3 max-w-xl text-sm sm:text-base text-white/70 leading-relaxed animate-rise-delay">
                {isAuthed
                  ? subGreeting()
                  : "Paper packaging manufactured in Mumbai, India. Sign in to open the command center."}
              </p>

              {isAuthed && quicks.length > 0 && (
                <div className="mt-6 flex flex-wrap gap-2 animate-rise-delay-2">
                  {quicks.map((q) => (
                    <Link
                      key={q.href}
                      href={q.href}
                      className="group inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 hover:bg-white/10 hover:border-white/30 px-3 py-1.5 text-xs font-medium text-white/85 transition-all"
                    >
                      <span>{q.label}</span>
                      <span className="text-white/40 group-hover:text-white/70 transition-colors">→</span>
                    </Link>
                  ))}
                  <button
                    onClick={() => setPaletteOpen(true)}
                    className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/5 hover:bg-white/10 hover:border-white/30 px-3 py-1.5 text-xs font-medium text-white/85 transition-all"
                  >
                    <span>Search anything</span>
                    <kbd className="font-mono text-[10px] border border-white/20 rounded px-1 py-px text-white/70">⌘K</kbd>
                  </button>
                </div>
              )}

              {!isAuthed && (
                <div className="mt-6 flex flex-wrap gap-2">
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-2 rounded-md bg-white text-ink-900 hover:bg-ink-100 px-4 py-2 text-sm font-semibold transition-colors"
                  >
                    Sign in <span aria-hidden>→</span>
                  </Link>
                  <Link
                    href="/warehouse/clearance"
                    className="inline-flex items-center gap-2 rounded-md border border-white/20 hover:bg-white/10 px-4 py-2 text-sm font-medium text-white/90 transition-colors"
                  >
                    Browse clearance stock
                  </Link>
                </div>
              )}
            </div>
            <div className="hidden md:block shrink-0 pt-1">
              <LiveClock />
            </div>
          </div>
        </div>
      </section>

      <Ticker items={tickerItems} />

      {/* ─── Main canvas ─────────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 md:px-6 py-10 sm:py-14">

        {isAuthed && alerts.length > 0 && (
          <div className="mb-6 -mt-2 flex flex-wrap gap-2 items-center animate-rise">
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-ink-400">Needs attention</span>
            {alerts.map((a, i) => (
              <Link
                key={i}
                href={a.href}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                  a.kind === "danger"
                    ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                    : a.kind === "warn"
                    ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                    : "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${
                  a.kind === "danger" ? "bg-rose-500" : a.kind === "warn" ? "bg-amber-500" : "bg-sky-500"
                } pulse-dot`} />
                {a.label}
                <span className="opacity-60">→</span>
              </Link>
            ))}
          </div>
        )}

        {isAuthed && (
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-ink-400">Your modules</div>
              <h2 className="text-display-sm sm:text-3xl font-bold tracking-tight text-ink-900 mt-1">
                Pick where you&apos;re headed.
              </h2>
            </div>
            <div className="hidden sm:flex items-center gap-1 text-[11px] font-mono uppercase tracking-wider text-ink-400">
              <span className="h-1 w-1 rounded-full bg-emerald-500 pulse-dot" />
              <span>Live data · refreshes every minute</span>
            </div>
          </div>
        )}

        {tiles.length === 0 ? (
          <div className="rounded-md border border-ink-200 bg-white p-10 text-center">
            <p className="text-sm text-ink-600">You don&apos;t have access to any modules yet. Ask an admin to invite you.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3 sm:gap-4 auto-rows-[minmax(160px,auto)]">
            {tiles.map((t, i) => (
              <BentoTile key={t.key} tile={t} stats={stats} index={i} />
            ))}
          </div>
        )}

        {isAuthed && (
          <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-4">
            {customerMode ? (
              // Customers don't see the cross-floor activity feed (it surfaces
              // other customers' jobs). Instead we point them at their order
              // dashboard with a one-line nudge.
              <div className="lg:col-span-2 rounded-md border border-ink-200 bg-white overflow-hidden p-6 flex flex-col justify-between gap-4">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-ink-400">Your portal</div>
                  <h3 className="mt-1 text-xl font-bold tracking-tight text-ink-900">Everything about your orders, in one place.</h3>
                  <p className="mt-1.5 text-sm text-ink-600">
                    Live stage updates, ETAs, artwork sign-off, and a chat thread with the Aeros team — per order.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href="/factoryos/customer"
                    className="inline-flex items-center gap-1.5 rounded-md bg-ink-900 text-white hover:bg-black px-3 py-1.5 text-xs font-medium transition-colors"
                  >
                    Open your dashboard <span aria-hidden>→</span>
                  </Link>
                  <Link
                    href="/factoryos/customer/documents"
                    className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 hover:border-ink-400 px-3 py-1.5 text-xs font-medium text-ink-900 transition-colors"
                  >
                    Browse documents
                  </Link>
                </div>
              </div>
            ) : (
              <div className="lg:col-span-2 rounded-md border border-ink-200 bg-white overflow-hidden">
                <div className="px-5 py-3 border-b border-ink-200 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-ink-400">Activity</div>
                    <div className="text-sm font-semibold text-ink-900">Recent across the floor</div>
                  </div>
                  <Link href="/factoryos/manager" className="text-xs font-medium text-royal-600 hover:text-royal-700">All jobs →</Link>
                </div>
                <ul className="divide-y divide-ink-200">
                  {activity.length === 0 && (
                    <li className="px-5 py-8 text-center text-sm text-ink-400">No recent activity yet.</li>
                  )}
                  {activity.map((a, i) => (
                    <li key={i} className="px-5 py-3 flex items-center gap-3">
                      <span className={`shrink-0 h-1.5 w-1.5 rounded-full ${a.kind === "job" ? "bg-royal-600" : "bg-amber-500"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-ink-900 truncate">{a.title}</div>
                        <div className="text-xs text-ink-500 truncate">{a.sub}</div>
                      </div>
                      <span className="shrink-0 text-[11px] font-mono text-ink-400">{timeSince(a.when)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-4">
              {session?.isAdmin && (
                <div className="rounded-md border border-ink-200 bg-white p-5">
                  <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-ink-400">Admin</div>
                  <div className="mt-3 space-y-2">
                    <Link href="/admin/access" className="block rounded border border-ink-200 hover:border-ink-400 px-3 py-2 text-sm text-ink-900 transition-colors">
                      <div className="font-medium">User Access</div>
                      <div className="text-xs text-ink-500">Roles, pricing, linked clients</div>
                    </Link>
                    <Link href="/brand" className="block rounded border border-ink-200 hover:border-ink-400 px-3 py-2 text-sm text-ink-900 transition-colors">
                      <div className="font-medium">Brand Kit</div>
                      <div className="text-xs text-ink-500">Logos, palette, typography</div>
                    </Link>
                    <Link href="/nra/capture" className="block rounded border border-ink-200 hover:border-ink-400 px-3 py-2 text-sm text-ink-900 transition-colors">
                      <div className="font-medium">NRA 2026 · Booth #12937</div>
                      <div className="text-xs text-ink-500">Show-floor lead capture</div>
                    </Link>
                  </div>
                </div>
              )}

              <div className="rounded-md border border-ink-200 bg-white p-5">
                <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-ink-400">Mobile app</div>
                <div className="mt-2 text-sm text-ink-600">Carry Aeros in your pocket.</div>
                <div className="mt-3 flex flex-col gap-2">
                  <a
                    href="https://apps.apple.com/in/app/bosone/id6502510427"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-ink-900 text-white hover:bg-black px-3 py-2 text-xs font-medium transition-colors"
                  >
                    <svg viewBox="0 0 384 512" className="h-4 w-4 fill-white"><path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></svg>
                    App Store
                  </a>
                  <a
                    href="https://play.google.com/store/apps/details?id=com.bosone"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-ink-900 text-white hover:bg-black px-3 py-2 text-xs font-medium transition-colors"
                  >
                    <svg viewBox="0 0 512 512" className="h-4 w-4">
                      <path fill="#EA4335" d="M325.3 234.3L104.9 13.9c-1.2 10.2 62.7 109.2 188.1 225.7l32.3-5.3z"/>
                      <path fill="#FBBC05" d="M405.4 226.3l-50.9-29.4-44.3 41 44.3 41 50.9-29.4c17-9.8 17-34.4 0-44.3z"/>
                      <path fill="#4285F4" d="M22 10.7c-5.1 3.2-8.4 8.6-9.6 14.5L13 25 281.7 291 331 241.4 22 10.7z"/>
                      <path fill="#34A853" d="M14 522c1.2 5.9 4.5 11.3 9.6 14.5l309-230.7-49.3-49.6L14 522z"/>
                    </svg>
                    Google Play
                  </a>
                </div>
                <p className="mt-2 text-[10px] text-ink-400 font-mono leading-relaxed">
                  Currently listed as <em className="not-italic">Bosone</em> while the Aeros rebrand is in progress.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {footer}

      <CommandPalette
        session={session}
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
    </div>
  );
}

// ─── Bento tile ──────────────────────────────────────────────────────────

// Build a 7-point sparkline that looks plausible when we have no real
// time-series data. Deterministic from the tile key + current number so
// it stays stable across renders.
function syntheticSpark(seedKey, n) {
  if (!n || n <= 0) return [0, 0, 0, 0, 0, 0, 0];
  let h = 2166136261;
  for (let i = 0; i < seedKey.length; i++) h = Math.imul(h ^ seedKey.charCodeAt(i), 16777619);
  const rand = (i) => {
    const v = Math.abs(Math.imul(h ^ (i * 374761393), 2654435761));
    return (v % 1000) / 1000;
  };
  const base = Math.max(1, Math.round(n / 7));
  const arr = [];
  for (let i = 0; i < 7; i++) {
    const wave = Math.sin((i / 6) * Math.PI) * base * 0.6;
    const noise = (rand(i) - 0.5) * base * 0.8;
    arr.push(Math.max(0, Math.round(base + wave + noise)));
  }
  return arr;
}

function BentoTile({ tile, stats, index }) {
  const colSpan = tile.size === "lg" ? "md:col-span-3" : "md:col-span-2";
  const m = tile.metric ? tile.metric(stats) : null;
  const ready = stats !== null;
  const realSpark = m?.spark || [];
  const hasReal = realSpark.length >= 2 && realSpark.some((v) => v > 0);
  const spark = hasReal ? realSpark : syntheticSpark(tile.key, m?.number || 0);

  // Cursor-tracked spotlight: a pointermove handler writes --mx/--my CSS
  // variables to the tile root; the `tile-spotlight` layer reads them.
  // No state, no rerender — just CSS variables.
  function onPointerMove(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    e.currentTarget.style.setProperty("--mx", x + "%");
    e.currentTarget.style.setProperty("--my", y + "%");
  }

  return (
    <Link
      href={tile.href}
      onPointerMove={onPointerMove}
      className={`bento-tile group relative ${colSpan} block overflow-hidden rounded-md border border-ink-200 bg-white hover:border-ink-400 transition-all`}
      style={{ animationDelay: `${index * 60}ms`, "--mx": "50%", "--my": "50%" }}
    >
      <div className={`absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r ${tile.accent}`} />
      <div className="tile-spotlight pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" aria-hidden="true" />
      <div
        className={`absolute -inset-px opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none bg-gradient-to-br ${tile.accent} blur-2xl`}
        style={{ mixBlendMode: "soft-light" }}
      />

      <div className="relative p-5 sm:p-6 flex flex-col h-full min-h-[160px]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-ink-400">Module</div>
            <h3 className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-ink-900">{tile.title}</h3>
          </div>
          <span className="shrink-0 text-ink-300 group-hover:text-ink-900 group-hover:translate-x-0.5 transition-all">→</span>
        </div>
        <p className="mt-1.5 text-sm text-ink-600">{tile.blurb}</p>

        {m && (
          <div className="mt-auto pt-5 flex items-end justify-between gap-4">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl sm:text-5xl font-bold tracking-tight text-ink-900">
                  {ready ? <CountUp value={m.number} /> : <span className="text-ink-200">—</span>}
                </span>
                <span className="text-[11px] font-mono uppercase tracking-wider text-ink-400">{m.label}</span>
              </div>
              {m.sub && <div className="mt-1 text-xs text-ink-500">{m.sub}</div>}
            </div>
            {ready && spark.length >= 2 && (
              <div className="shrink-0 opacity-90 group-hover:opacity-100 transition-opacity">
                <Sparkline data={spark} accent={tile.sparkColor || "#2347D9"} />
                <div className="mt-0.5 text-right text-[9px] font-mono uppercase tracking-wider text-ink-400">7 day</div>
              </div>
            )}
          </div>
        )}

        {!m && tile.cta && (
          // Customer tiles don't fetch live counts (the API never sends those
          // for them — see /api/hub/stats). The CTA chip keeps the tile from
          // looking truncated.
          <div className="mt-auto pt-5">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 group-hover:border-ink-400 px-3 py-1.5 text-xs font-medium text-ink-700 transition-colors">
              {tile.cta} <span aria-hidden>→</span>
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
