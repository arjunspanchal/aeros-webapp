import Link from "next/link";
import { getSession } from "@/lib/hub/session";
import { canSeeStock, DEFAULT_WAREHOUSE } from "@/lib/warehouse/access";
import { outwardQueue, transitQueue } from "@/lib/warehouse/outward";
import { inwardQueue } from "@/lib/warehouse/inward";
import { dbSelect } from "@/lib/db/supabase";
import { PageHead, Section, Card, Empty, Notice, Pill } from "./_components/ui";
import { num, fmtDate, boxes } from "./_components/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Warehouse — FactoryOS" };

function Stat({ href, label, value, sub, tone }) {
  return (
    <Link href={href} className="group rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-600">
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-white">{value}</div>
      <div className={`mt-1 text-xs ${tone === "late" ? "font-medium text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400"}`}>{sub}</div>
    </Link>
  );
}

function Row({ href, left, right, sub }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800/60">
      <div className="min-w-0">
        <div className="truncate text-gray-900 dark:text-white">{left}</div>
        {sub && <div className="truncate text-xs text-gray-500 dark:text-gray-400">{sub}</div>}
      </div>
      {right}
    </Link>
  );
}

// The warehouse's start page: what has to move today, oldest first.
export default async function WarehouseTodayPage() {
  const session = getSession();
  const [out, inw, transit, stock] = await Promise.all([
    outwardQueue(),
    inwardQueue(),
    transitQueue(),
    canSeeStock(session)
      ? dbSelect("inventory_stock", { select: "item_id,qty", filter: { qty: "gt.0" }, limit: 20000 }).catch(() => [])
      : Promise.resolve(null),
  ]);
  const lateOut = out.pending.filter((i) => i.waitingDays > 2).length;
  const latePo = inw.expected.filter((p) => p.overdueDays > 0).length;
  const inTransit = transit.invoices.length + transit.jobs.length;
  const longOut = transit.invoices.filter((r) => r.daysOut > 7).length + transit.jobs.filter((j) => j.waitingDays > 10).length;
  const errors = [...new Set([out.error, inw.error].filter(Boolean))];
  return (
    <div>
      <PageHead title="Warehouse" sub={`${DEFAULT_WAREHOUSE} · ${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}`} />
      {errors.map((e) => <Notice key={e}>{e}</Notice>)}

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat href="/factoryos/warehouse/outward" label="Invoices to load" value={out.pending.length} sub={lateOut ? `${lateOut} waiting over 2 days` : "none waiting long"} tone={lateOut ? "late" : ""} />
        <Stat href="/factoryos/warehouse/inward" label="Expected in" value={inw.expected.length + inw.fromFactory.length} sub={`${inw.expected.length} from vendors · ${inw.fromFactory.length} from the factory${latePo ? ` · ${latePo} late` : ""}`} tone={latePo ? "late" : ""} />
        <Stat href="/factoryos/warehouse/transit" label="In transit" value={inTransit} sub={longOut ? `${longOut} out a long time` : "delivery not yet confirmed"} tone={longOut ? "late" : ""} />
        {stock
          ? <Stat href="/factoryos/warehouse/stock" label="Items in stock" value={new Set(stock.map((s) => s.item_id)).size} sub={`${num(Math.round(stock.reduce((t, s) => t + Number(s.qty || 0), 0)))} units on the racks`} />
          : <Stat href="/factoryos/warehouse/outward" label="Recorded this week" value={out.done.length} sub="invoices loaded or closed" />}
      </div>

      <div className="grid gap-x-8 lg:grid-cols-2">
        <Section title="Load next" count={out.pending.length}>
          {out.pending.length ? (
            <Card className="divide-y divide-gray-100 !p-0 dark:divide-gray-800">
              {out.pending.slice(0, 6).map((i) => (
                <Row key={i.id} href="/factoryos/warehouse/outward" left={<><span className="font-mono font-medium">{i.number}</span> · {i.customer}</>}
                  sub={[fmtDate(i.date), boxes(i.cartons), i.transport?.trim(), i.job ? `job ${i.job.jNumber}` : ""].filter(Boolean).join(" · ")}
                  right={i.waitingDays > 2 ? <Pill tone="late">{i.waitingDays} days</Pill> : null} />
              ))}
            </Card>
          ) : <Empty>{out.error ? "Waiting for Zoho." : "Nothing to load."}</Empty>}
        </Section>

        <Section title="Arriving next" count={inw.expected.length + inw.fromFactory.length}>
          {inw.expected.length + inw.fromFactory.length ? (
            <Card className="divide-y divide-gray-100 !p-0 dark:divide-gray-800">
              {inw.fromFactory.slice(0, 3).map((j) => (
                <Row key={j.id} href="/factoryos/warehouse/inward" left={<><span className="font-medium">Job {j.jNumber}</span> · {j.brand}</>}
                  sub={`From the factory · ${num(j.qty)} pcs · ${j.item}`} right={<Pill tone="good">ready</Pill>} />
              ))}
              {inw.expected.slice(0, 5).map((p) => (
                <Row key={p.id} href="/factoryos/warehouse/inward" left={<><span className="font-mono font-medium">{p.number}</span> · {p.vendor}</>}
                  sub={p.reference}
                  right={p.overdueDays > 0 ? <Pill tone="late">{p.overdueDays} days late</Pill> : p.expectedOn ? <Pill>due {fmtDate(p.expectedOn)}</Pill> : null} />
              ))}
            </Card>
          ) : <Empty>{inw.error ? "Waiting for Zoho." : "Nothing expected."}</Empty>}
        </Section>
      </div>
    </div>
  );
}
