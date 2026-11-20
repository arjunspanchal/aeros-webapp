// Printer chase list (Arjun, 20-Nov-2026): every job sitting with a printer,
// grouped by printer, with how late it is and what the printer last told us.
// Read-only; the screen sends the list on WhatsApp from the sender's own phone.

import { dbSelect } from "@/lib/db/supabase";
import { VENDOR_STATUS_LABEL } from "@/lib/factoryos/repo";

const IST_OFFSET = 5.5 * 3600000;
export const todayIst = () => new Date(Date.now() + IST_OFFSET).toISOString().slice(0, 10);
const dayDiff = (a, b) => Math.round((new Date(`${a}T12:00:00Z`) - new Date(`${b}T12:00:00Z`)) / 86400000);

// Same rule as the task tracker: a 10-digit Indian number gets 91 in front.
export function waNumber(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = `91${d}`;
  return d.length >= 11 && d.length <= 15 ? d : "";
}

const inList = (ids) => `in.(${ids.join(",")})`;

export async function listPrinterChase() {
  const today = todayIst();
  const rows = await dbSelect("jobs", {
    select: "id,airtable_id,j_number,brand,item,qty,urgent,printing_type,printing_vendor,printing_vendor_id,printing_due_date,production_due_date,vendor_status,vendor_status_updated_at,vendor_dispatch_date,updated_at",
    filter: { stage: "eq.Under Printing" },
    order: "printing_due_date.asc.nullslast",
    limit: 1000,
  });
  if (!rows.length) return { today, groups: [], totals: { jobs: 0, late: 0, noDate: 0 } };

  const jobIds = rows.map((r) => r.id);
  const vendorIds = [...new Set(rows.map((r) => r.printing_vendor_id).filter(Boolean))];
  const [vendors, inwards] = await Promise.all([
    vendorIds.length
      ? dbSelect("vendors", { select: "id,airtable_id,name,contact_person,phone", filter: { id: inList(vendorIds) } })
      : [],
    dbSelect("job_inwards", { select: "job_id,qty,unit,received_on", filter: { job_id: inList(jobIds) }, limit: 5000 }).catch(() => []),
  ]);

  const vendorById = new Map(vendors.map((v) => [v.id, v]));
  const inwardByJob = new Map();
  for (const i of inwards) {
    const cur = inwardByJob.get(i.job_id) || { qty: 0, unit: i.unit || "", last: "" };
    cur.qty += Number(i.qty) || 0;
    if (i.received_on && String(i.received_on) > cur.last) cur.last = String(i.received_on).slice(0, 10);
    inwardByJob.set(i.job_id, cur);
  }
  const groups = new Map();
  for (const r of rows) {
    const v = r.printing_vendor_id ? vendorById.get(r.printing_vendor_id) : null;
    const name = (v?.name || r.printing_vendor || "").trim();
    const key = v ? v.id : name ? `name:${name.toLowerCase()}` : "none";
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        vendorId: v ? v.airtable_id || v.id : null,
        name: name || "No printer set",
        contact: v?.contact_person || "",
        phone: v?.phone || "",
        wa: waNumber(v?.phone),
        jobs: [],
      });
    }
    const due = r.printing_due_date ? String(r.printing_due_date).slice(0, 10) : null;
    const inward = inwardByJob.get(r.id) || null;
    groups.get(key).jobs.push({
      id: r.airtable_id || r.id,
      jNumber: r.j_number,
      brand: r.brand || "",
      item: r.item || "",
      qty: r.qty != null ? Number(r.qty) : null,
      urgent: !!r.urgent,
      printingType: r.printing_type || "",
      dueDate: due,
      daysLate: due ? dayDiff(today, due) : null,
      readyDate: r.production_due_date ? String(r.production_due_date).slice(0, 10) : null,
      readyPassed: !!r.production_due_date && String(r.production_due_date).slice(0, 10) < today,
      vendorStatus: r.vendor_status ? VENDOR_STATUS_LABEL[r.vendor_status] || r.vendor_status : "",
      vendorStatusOn: r.vendor_status_updated_at ? String(r.vendor_status_updated_at).slice(0, 10) : null,
      vendorDate: r.vendor_dispatch_date ? String(r.vendor_dispatch_date).slice(0, 10) : null,
      inwardQty: inward ? inward.qty : 0,
      inwardUnit: inward?.unit || "",
      inwardOn: inward?.last || null,
    });
  }

  // Inside a printer: latest first, then jobs with no date, then the rest by date.
  const rank = (j) => (j.daysLate === null ? 1 : j.daysLate > 0 ? 0 : 2);
  const list = [...groups.values()].map((g) => {
    g.jobs.sort((a, b) => rank(a) - rank(b) || (b.daysLate ?? 0) - (a.daysLate ?? 0) || String(a.jNumber).localeCompare(String(b.jNumber)));
    g.late = g.jobs.filter((j) => j.daysLate > 0).length;
    g.noDate = g.jobs.filter((j) => j.daysLate === null).length;
    g.worst = Math.max(0, ...g.jobs.map((j) => j.daysLate || 0));
    return g;
  });
  list.sort((a, b) => b.late - a.late || b.jobs.length - a.jobs.length || a.name.localeCompare(b.name));

  return {
    today,
    groups: list,
    totals: {
      jobs: rows.length,
      late: list.reduce((t, g) => t + g.late, 0),
      noDate: list.reduce((t, g) => t + g.noDate, 0),
    },
  };
}
