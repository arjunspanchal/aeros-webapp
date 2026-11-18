import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, requireManager } from "@/lib/auth/session";
import { dbSelect, dbUpdate } from "@/lib/db/supabase";
import { getSalesOrderByNumber, listSalesOrdersSince, zohoConfigured } from "@/lib/zoho/books";
import NoJobButton from "./NoJobButton";

// SOs from this date on must each get a job (one SO, one job; Arjun,
// 18-Nov-2026). Older SOs are history and are not chased.
const NEW_SO_FROM = "2026-11-18";

export const dynamic = "force-dynamic";

// Zoho check (Arjun, 18-Nov-2026): open jobs with no Zoho SO, and jobs whose
// SO is missing, void, or for a different Zoho customer than the job's
// customer. Read-only — fixes happen on the job page.
async function lookupAll(numbers) {
  const out = new Map();
  const queue = [...numbers];
  let down = "";
  const worker = async () => {
    while (queue.length) {
      const n = queue.shift();
      // After the first failure (outage, daily limit) stop calling Zoho.
      if (down) { out.set(n, { error: down }); continue; }
      try { out.set(n, { so: await getSalesOrderByNumber(n) }); } catch (e) { down = e.message || "lookup failed"; out.set(n, { error: down }); }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return out;
}

const OPEN = (s) => s !== "Dispatched" && s !== "Delivered";

export default async function ZohoCheckPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!requireManager(session)) redirect("/factoryos");

  const rows = await dbSelect("jobs", {
    select: "id,airtable_id,j_number,item,qty,stage,zoho_so_no,zoho_so_unverified,zoho_so_line_id,client_id,clients(name,zoho_contact_id)",
    order: "j_number.desc",
    limit: 2000,
  });
  const jobs = rows.map((r) => ({
    id: r.airtable_id || r.id,
    rowId: r.id,
    unverified: !!r.zoho_so_unverified,
    lineId: r.zoho_so_line_id || "",
    jNumber: r.j_number,
    item: r.item,
    qty: r.qty,
    stage: r.stage,
    so: r.zoho_so_no || "",
    client: r.clients?.name || "—",
    clientZoho: r.clients?.zoho_contact_id || "",
  }));
  const openNoSo = jobs.filter((j) => OPEN(j.stage) && !j.so);
  // Only open jobs (and any job saved while Zoho was down) are checked, to
  // spare Zoho's 5,000-calls-a-day allowance.
  const withSo = jobs.filter((j) => j.so && (OPEN(j.stage) || j.unverified));
  const cleared = [];
  const missingItems = []; // SO items that have no job yet, on SOs that already have a job

  const problems = [];
  if (withSo.length && zohoConfigured()) {
    const looked = await lookupAll([...new Set(withSo.map((j) => j.so))]);
    for (const j of withSo) {
      const hit = looked.get(j.so) || {};
      if (hit.error) { problems.push({ j, why: `Couldn't check ${j.so} yet: Zoho not reachable${j.unverified ? " (saved while Zoho was down)" : ""}`, soft: true }); continue; }
      // Checked now: a job saved while Zoho was down loses its "not checked" flag.
      if (j.unverified) {
        await dbUpdate("jobs", "id", j.rowId, { zoho_so_unverified: false }, { returning: "minimal" }).catch(() => {});
        cleared.push(j);
      }
      if (!hit.so) problems.push({ j, why: `${j.so} is not in Zoho` });
      else if (hit.so.status === "void") problems.push({ j, why: `${j.so} is void in Zoho` });
      else if (j.clientZoho && hit.so.customerId && j.clientZoho !== hit.so.customerId) problems.push({ j, why: `${j.so} is for ${hit.so.customer} in Zoho, job customer is ${j.client}` });
      else if (!j.clientZoho) problems.push({ j, why: `${j.client} isn't linked to Zoho (SO is for ${hit.so.customer})`, soft: true });
      // One job per SO item: say which item this job is for.
      if (hit.so && hit.so.status !== "void") {
        const lines = (hit.so.lines || []).filter((l) => l.id);
        if (!j.lineId && lines.length === 1) {
          await dbUpdate("jobs", "id", j.rowId, { zoho_so_line_id: lines[0].id, zoho_so_line_name: lines[0].name }, { returning: "minimal" }).catch(() => {});
          j.lineId = lines[0].id;
        } else if (!j.lineId && lines.length > 1) {
          // Same quantity as exactly one free item on the SO: that is the item.
          const taken = new Set(jobs.filter((x) => x.so.toUpperCase() === j.so.toUpperCase() && x.lineId).map((x) => x.lineId));
          const sameQty = lines.filter((l) => !taken.has(l.id) && Number(l.qty) === Number(j.qty));
          if (sameQty.length === 1) {
            await dbUpdate("jobs", "id", j.rowId, { zoho_so_line_id: sameQty[0].id, zoho_so_line_name: sameQty[0].name }, { returning: "minimal" }).catch(() => {});
            j.lineId = sameQty[0].id;
            continue;
          }
          problems.push({ j, why: `${j.so} has ${lines.length} items. Open the job and pick which item it is for (Edit order basics → Zoho SO).`, soft: true });
        } else if (j.lineId && !lines.some((l) => l.id === j.lineId)) {
          problems.push({ j, why: `The item this job was raised on is no longer on ${j.so}. Pick the item again on the job page.` });
        }
      }
    }
    // Items with no job, on SOs where every existing job says which item it is for.
    const bySo = new Map();
    for (const j of jobs) if (j.so) { if (!bySo.has(j.so.toUpperCase())) bySo.set(j.so.toUpperCase(), []); bySo.get(j.so.toUpperCase()).push(j); }
    for (const [soNo, hit] of looked) {
      if (!hit.so || hit.so.status === "void") continue;
      const onSo = bySo.get(String(soNo).toUpperCase()) || [];
      if (onSo.some((j) => !j.lineId)) continue;
      for (const l of (hit.so.lines || []).filter((x) => x.id)) {
        if ((Number(l.qty) || 0) - (Number(l.cancelled) || 0) <= 0) continue;
        if (!onSo.some((j) => j.lineId === l.id)) missingItems.push({ so: hit.so, line: l });
      }
    }
  }

  // New Zoho SOs (from NEW_SO_FROM) with no job and not marked "no job needed".
  let newSos = [], reviewed = [], newSoError = "";
  if (zohoConfigured()) {
    try {
      const [list, reviews] = await Promise.all([
        listSalesOrdersSince(NEW_SO_FROM),
        dbSelect("zoho_so_reviews", { select: "so_number,reason,customer,so_date,reviewed_by_email,reviewed_at", order: "reviewed_at.desc", limit: 500 }).catch(() => []),
      ]);
      const linked = new Set(jobs.map((j) => j.so.toUpperCase()).filter(Boolean));
      const reviewedSet = new Set((reviews || []).map((r) => r.so_number.toUpperCase()));
      newSos = list.filter((s) => !linked.has(s.number.toUpperCase()) && !reviewedSet.has(s.number.toUpperCase()));
      reviewed = (reviews || []).filter((r) => !r.so_date || r.so_date >= NEW_SO_FROM);
    } catch (e) { newSoError = "Couldn't read new SOs from Zoho right now."; }
  }

  const Row = ({ j, why, soft }) => (
    <tr className="border-t border-gray-100 dark:border-gray-800">
      <td className="px-3 py-2 font-mono text-xs"><Link href={`/factoryos/manager/${j.id}`} className="text-blue-600 hover:underline dark:text-blue-400">{j.jNumber}</Link></td>
      <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">{j.client}</td>
      <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">{j.item}</td>
      <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">{j.stage}</td>
      {why !== undefined && <td className={`px-3 py-2 text-xs ${soft ? "text-amber-700 dark:text-amber-300" : "text-red-600 dark:text-red-400"}`}>{why}</td>}
    </tr>
  );

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Zoho check</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Every job should sit on a Zoho sales order for the same customer, one job per SO item. Open jobs are read live from Zoho (read-only); jobs saved while Zoho was down are checked here and their flag cleared. Fix a job from its page: Edit order basics → Zoho SO.
        </p>
        {!zohoConfigured() && <p className="mt-2 text-sm text-red-600">Zoho is not connected.</p>}
      </div>

      <section className="bg-white border border-gray-200 rounded-xl dark:bg-gray-900 dark:border-gray-800">
        <h2 className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-800">
          New Zoho SOs with no job ({newSos.length}) <span className="font-normal text-gray-500 dark:text-gray-400">· SOs dated from 18 Nov 2026; one job per SO item</span>
        </h2>
        {newSoError && <p className="px-4 py-3 text-sm text-red-600">{newSoError}</p>}
        {newSos.length ? (
          <div className="overflow-x-auto"><table className="w-full"><tbody>
            {newSos.map((s) => (
              <tr key={s.number} className="border-t border-gray-100 dark:border-gray-800">
                <td className="px-3 py-2 font-mono text-xs text-gray-900 dark:text-white">{s.number}</td>
                <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">{s.date}</td>
                <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">{s.customer}</td>
                <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 uppercase">{s.status}</td>
                <td className="px-3 py-2 text-xs whitespace-nowrap">
                  <Link href={`/factoryos/admin/jobs/new?so=${encodeURIComponent(s.number)}`} className="text-blue-700 hover:underline dark:text-blue-400 mr-3">Raise job</Link>
                  <NoJobButton number={s.number} customer={s.customer} date={s.date} />
                </td>
              </tr>
            ))}
          </tbody></table></div>
        ) : (
          !newSoError && <p className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">Every new SO has a job or is marked "no job needed".</p>
        )}
        {reviewed.length > 0 && (
          <details className="px-4 py-3 border-t border-gray-100 dark:border-gray-800">
            <summary className="text-xs text-gray-600 dark:text-gray-300 cursor-pointer">Marked "no job needed" ({reviewed.length})</summary>
            <ul className="mt-2 space-y-1">
              {reviewed.map((r) => (
                <li key={r.so_number} className="text-xs text-gray-700 dark:text-gray-300">
                  <span className="font-mono">{r.so_number}</span> · {r.customer || ""} · {r.reason} · {r.reviewed_by_email} <NoJobButton number={r.so_number} undo />
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {missingItems.length > 0 && (
        <section className="bg-white border border-gray-200 rounded-xl dark:bg-gray-900 dark:border-gray-800">
          <h2 className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-800">
            SO items with no job yet ({missingItems.length}) <span className="font-normal text-gray-500 dark:text-gray-400">· on SOs that already have a job for another item</span>
          </h2>
          <div className="overflow-x-auto"><table className="w-full"><tbody>
            {missingItems.map(({ so, line }) => (
              <tr key={`${so.number}-${line.id}`} className="border-t border-gray-100 dark:border-gray-800">
                <td className="px-3 py-2 font-mono text-xs text-gray-900 dark:text-white">{so.number}</td>
                <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">{so.customer}</td>
                <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">{line.name}</td>
                <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">{Number(line.qty).toLocaleString("en-IN")} {line.unit}</td>
                <td className="px-3 py-2 text-xs whitespace-nowrap">
                  <Link href={`/factoryos/admin/jobs/new?so=${encodeURIComponent(so.number)}&line=${encodeURIComponent(line.id)}`} className="text-blue-700 hover:underline dark:text-blue-400">Raise job</Link>
                </td>
              </tr>
            ))}
          </tbody></table></div>
        </section>
      )}

      <section className="bg-white border border-gray-200 rounded-xl dark:bg-gray-900 dark:border-gray-800">
        <h2 className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-800">
          SO problems on open jobs ({problems.length})
        </h2>
        {problems.length ? (
          <div className="overflow-x-auto"><table className="w-full"><tbody>{problems.map((p, i) => <Row key={`${p.j.id}-${i}`} {...p} />)}</tbody></table></div>
        ) : (
          <p className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">{withSo.length ? "All linked SOs match their job's customer." : "No jobs are linked to a Zoho SO yet."}</p>
        )}
        {cleared.length > 0 && (
          <p className="px-4 py-3 text-xs text-green-700 border-t border-gray-100 dark:border-gray-800 dark:text-green-400">
            Checked just now (were saved while Zoho was down): {cleared.map((j) => j.jNumber).join(", ")}
          </p>
        )}
      </section>

      <section className="bg-white border border-gray-200 rounded-xl dark:bg-gray-900 dark:border-gray-800">
        <h2 className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-800">
          Open jobs with no Zoho SO ({openNoSo.length})
        </h2>
        {openNoSo.length ? (
          <div className="overflow-x-auto"><table className="w-full"><tbody>{openNoSo.map((j) => <Row key={j.id} j={j} />)}</tbody></table></div>
        ) : (
          <p className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">Every open job has a Zoho SO.</p>
        )}
      </section>
    </main>
  );
}
