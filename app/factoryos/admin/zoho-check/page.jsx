import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, requireManager } from "@/lib/auth/session";
import { dbSelect } from "@/lib/db/supabase";
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
  const worker = async () => {
    while (queue.length) {
      const n = queue.shift();
      try { out.set(n, { so: await getSalesOrderByNumber(n) }); } catch (e) { out.set(n, { error: e.message || "lookup failed" }); }
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
    select: "id,airtable_id,j_number,item,qty,stage,zoho_so_no,client_id,clients(name,zoho_contact_id)",
    order: "j_number.desc",
    limit: 2000,
  });
  const jobs = rows.map((r) => ({
    id: r.airtable_id || r.id,
    jNumber: r.j_number,
    item: r.item,
    qty: r.qty,
    stage: r.stage,
    so: r.zoho_so_no || "",
    client: r.clients?.name || "—",
    clientZoho: r.clients?.zoho_contact_id || "",
  }));
  const openNoSo = jobs.filter((j) => OPEN(j.stage) && !j.so);
  const withSo = jobs.filter((j) => j.so);

  const problems = [];
  if (withSo.length && zohoConfigured()) {
    const looked = await lookupAll([...new Set(withSo.map((j) => j.so))]);
    for (const j of withSo) {
      const hit = looked.get(j.so) || {};
      if (hit.error) problems.push({ j, why: `Couldn't check ${j.so} (${hit.error})` });
      else if (!hit.so) problems.push({ j, why: `${j.so} is not in Zoho` });
      else if (hit.so.status === "void") problems.push({ j, why: `${j.so} is void in Zoho` });
      else if (j.clientZoho && hit.so.customerId && j.clientZoho !== hit.so.customerId) problems.push({ j, why: `${j.so} is for ${hit.so.customer} in Zoho, job customer is ${j.client}` });
      else if (!j.clientZoho) problems.push({ j, why: `${j.client} isn't linked to Zoho (SO is for ${hit.so.customer})`, soft: true });
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
          Every job should sit on a Zoho sales order for the same customer. Read live from Zoho (read-only). Fix a job from its page: Edit order basics → Zoho SO.
        </p>
        {!zohoConfigured() && <p className="mt-2 text-sm text-red-600">Zoho is not connected.</p>}
      </div>

      <section className="bg-white border border-gray-200 rounded-xl dark:bg-gray-900 dark:border-gray-800">
        <h2 className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-800">
          New Zoho SOs with no job ({newSos.length}) <span className="font-normal text-gray-500 dark:text-gray-400">· SOs dated from 18 Nov 2026; one SO, one job</span>
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

      <section className="bg-white border border-gray-200 rounded-xl dark:bg-gray-900 dark:border-gray-800">
        <h2 className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-800">
          SO problems on jobs ({problems.length})
        </h2>
        {problems.length ? (
          <div className="overflow-x-auto"><table className="w-full"><tbody>{problems.map((p) => <Row key={p.j.id} {...p} />)}</tbody></table></div>
        ) : (
          <p className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">{withSo.length ? "All linked SOs match their job's customer." : "No jobs are linked to a Zoho SO yet."}</p>
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
