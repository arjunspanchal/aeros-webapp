// Live tile data for the home command center. Returns per-module counts,
// pulse metrics, and a 7-day sparkline. Role-gated: each module's numbers
// are only computed if the session has access. Anonymous callers get the
// public subset (clearance + catalogue).
//
// In local dev (no SUPABASE_URL set) returns realistic demo numbers so the
// new home renders during local visual verification.
//
// Shape:
//   {
//     ok: true,
//     ts: <ISO>,
//     alerts: [{kind, label, href}],     // optional, only when there's actually something to flag
//     stats: {
//       clearance:  { items, label, spark },
//       catalogue:  { products, label },
//       factoryos:  { open, totalJobs, pos, label, spark },
//       rate_cards: { quotes, cards, rfqs, label, spark },
//       calculator: { quotes, label, spark },
//       hr:         { employees, presentToday, label, spark },
//       design:     { files, label },
//       clients:    { count },
//     },
//     activity: [{ kind, title, sub, when }],
//   }
import { getSession } from "@/lib/hub/session";
import { dbCount, dbSelect } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function safe(fn, fallback) {
  try { return await fn(); } catch { return fallback; }
}

// Build a 7-point sparkline by pulling recent rows from `table` ordered
// by `col` (desc) and bucketing them by day. Returns 7 daily counts
// oldest → newest. Approximate but lightweight — one round-trip instead
// of seven dbCount calls per spark. Falls back to zeros on error.
async function dailySpark(table, col = "created_at") {
  try {
    const rows = await dbSelect(table, {
      select: col,
      order: `${col}.desc`,
      limit: 200,
    });
    const buckets = [0, 0, 0, 0, 0, 0, 0];
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    for (const r of rows) {
      const d = new Date(r[col]);
      d.setUTCHours(0, 0, 0, 0);
      const diff = Math.round((today - d) / 86400000);
      if (diff >= 0 && diff < 7) buckets[6 - diff] += 1;
    }
    return buckets;
  } catch {
    return [0, 0, 0, 0, 0, 0, 0];
  }
}

// Demo numbers used when SUPABASE_URL isn't set (local dev without service-
// role creds). Lets the new home render with realistic stats so the bento
// + sparklines visually verify locally.
const DEMO_STATS = {
  clearance:  { items: 177, label: "SKUs in clearance",   spark: [3, 5, 4, 8, 7, 10, 6] },
  catalogue:  { products: 638, label: "active SKUs" },
  factoryos:  { open: 24,  totalJobs: 115, pos: 7, label: "open jobs", spark: [2, 5, 3, 6, 4, 7, 8] },
  rate_cards: { quotes: 32, cards: 4, rfqs: 9,            label: "quotes drafted", spark: [1, 0, 2, 1, 3, 2, 4] },
  calculator: { quotes: 18, label: "quotes generated",    spark: [0, 1, 1, 2, 1, 3, 2] },
  hr:         { employees: 43, presentToday: 31,          label: "on payroll",  spark: [29,30,32,31,28,33,31] },
  design:     { files: 10, label: "design files" },
  clients:    { count: 57 },
};

export async function GET() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({
      ok: true,
      ts: new Date().toISOString(),
      alerts: [],
      stats: DEMO_STATS,
      activity: [
        { kind: "job",      title: "Job #J0240", sub: "RM Pending · Pre-press review",   when: new Date(Date.now() - 18*60*1000).toISOString() },
        { kind: "movement", title: "Inward",     sub: "Hanyong PP — 250 cases received", when: new Date(Date.now() - 95*60*1000).toISOString() },
        { kind: "job",      title: "Job #J0239", sub: "Printing · Plate locked",         when: new Date(Date.now() - 4*3600*1000).toISOString() },
        { kind: "job",      title: "Job #J0237", sub: "Dispatched · Delhivery W2",       when: new Date(Date.now() - 28*3600*1000).toISOString() },
      ],
    });
  }

  const session = getSession();
  const modules = session?.modules || {};
  const isAdmin = !!session?.isAdmin;

  // Public counts — clearance + catalogue are always available
  const tasks = {
    clearance: safe(() => dbCount("clearance_items"), 0),
    catalogue: safe(() => dbCount("master_products"), 0),
  };

  if (isAdmin || modules.factoryos) {
    tasks.jobsTotal = safe(() => dbCount("jobs"), 0);
    tasks.jobsOpen = safe(() => dbCount("jobs", { stage: "neq.Delivered" }), 0);
    tasks.pos = safe(() => dbCount("customer_pos"), 0);
    tasks.factoryosSpark = dailySpark("job_status_updates", "created_at");
  }
  if (isAdmin || modules.rate_cards) {
    tasks.quotes = safe(() => dbCount("quotes_v2"), 0);
    tasks.cards = safe(() => dbCount("rate_cards"), 0);
    tasks.rfqs = safe(() => dbCount("rfq_quotes"), 0);
    tasks.rfqSpark = dailySpark("quotes_v2", "created_at");
  }
  if (isAdmin || modules.calculator) {
    tasks.calcQuotes = safe(() => dbCount("quotes_v2"), 0);
    tasks.calcSpark = dailySpark("quotes_v2", "created_at");
  }
  if (isAdmin || modules.hr) {
    tasks.employees = safe(() => dbCount("employees", { active: "eq.true" }), 0);
    tasks.presentToday = safe(
      () => dbCount("attendance", { date: `eq.${todayISO()}`, punch_in: "not.is.null" }),
      0,
    );
    tasks.hrSpark = dailySpark("attendance", "date");
  }
  if (isAdmin || modules.clearance) {
    tasks.clearanceSpark = dailySpark("inventory_movements", "created_at");
  }
  if (session) {
    tasks.designFiles = safe(() => dbCount("product_design_files"), 0);
    tasks.clients = safe(() => dbCount("clients"), 0);
  }

  // Activity feed — last 6 job status updates if FactoryOS, else recent
  // inventory movements.
  let activityTask;
  if (isAdmin || modules.factoryos) {
    activityTask = safe(
      () => dbSelect("job_status_updates", {
        select: "id,stage,note,created_at,j_number:jobs(j_number)",
        order: "created_at.desc",
        limit: 6,
      }),
      [],
    );
  } else {
    activityTask = safe(
      () => dbSelect("inventory_movements", {
        select: "id,kind,note,created_at",
        order: "created_at.desc",
        limit: 6,
      }),
      [],
    );
  }

  // Alerts band — urgent items worth surfacing above the bento. Only ones
  // that turn up actually render.
  const alertTasks = [];
  if (isAdmin || modules.factoryos) {
    alertTasks.push(
      safe(() => dbCount("jobs", {
        stage: "neq.Delivered",
        promised_date: `lt.${todayISO()}`,
      }), 0).then((n) => n > 0 ? { kind: "danger", label: `${n} overdue job${n>1?"s":""}`, href: "/factoryos/manager?filter=overdue" } : null),
    );
  }
  if (isAdmin || modules.rate_cards) {
    alertTasks.push(
      safe(() => dbCount("rfq_quotes", { status: "eq.open" }), 0)
        .then((n) => n > 0 ? { kind: "info", label: `${n} RFQ${n>1?"s":""} awaiting reply`, href: "/rfq-manager?filter=open" } : null),
    );
  }
  if (isAdmin || modules.hr) {
    alertTasks.push((async () => {
      const todayCount = await safe(
        () => dbCount("attendance", { date: `eq.${todayISO()}`, punch_in: "not.is.null" }),
        0,
      );
      const employeesCount = await safe(() => dbCount("employees", { active: "eq.true" }), 0);
      if (employeesCount && todayCount < employeesCount * 0.5) {
        return { kind: "warn", label: `Only ${todayCount}/${employeesCount} on the floor`, href: "/hr/attendance" };
      }
      return null;
    })());
  }

  const [results, activityRaw, alertsResults] = await Promise.all([
    Promise.all(Object.values(tasks)),
    activityTask,
    Promise.all(alertTasks),
  ]);
  const keys = Object.keys(tasks);
  const v = Object.fromEntries(keys.map((k, i) => [k, results[i]]));
  const alerts = (alertsResults || []).filter(Boolean);

  const activity = (activityRaw || []).map((row) => {
    if (row.stage) {
      const jn = row.j_number?.j_number ?? row.j_number ?? "";
      return {
        kind: "job",
        title: jn ? `Job #${jn}` : "Job update",
        sub: row.stage + (row.note ? ` · ${row.note}` : ""),
        when: row.created_at,
      };
    }
    return {
      kind: "movement",
      title: row.kind === "in" ? "Inward" : row.kind === "out" ? "Outward" : "Movement",
      sub: row.note || "—",
      when: row.created_at,
    };
  });

  return Response.json({
    ok: true,
    ts: new Date().toISOString(),
    alerts,
    stats: {
      clearance:  { items: v.clearance ?? 0, label: "SKUs in clearance", spark: v.clearanceSpark || [] },
      catalogue:  { products: v.catalogue ?? 0, label: "active SKUs" },
      factoryos:  {
        open: v.jobsOpen ?? 0,
        totalJobs: v.jobsTotal ?? 0,
        pos: v.pos ?? 0,
        spark: v.factoryosSpark || [],
        label: "open jobs",
      },
      rate_cards: {
        quotes: v.quotes ?? 0,
        cards: v.cards ?? 0,
        rfqs: v.rfqs ?? 0,
        spark: v.rfqSpark || [],
        label: "quotes drafted",
      },
      calculator: { quotes: v.calcQuotes ?? 0, spark: v.calcSpark || [], label: "quotes generated" },
      hr: {
        employees: v.employees ?? 0,
        presentToday: v.presentToday ?? 0,
        spark: v.hrSpark || [],
        label: "on payroll",
      },
      design: { files: v.designFiles ?? 0, label: "design files" },
      clients: { count: v.clients ?? 0 },
    },
    activity,
  });
}
