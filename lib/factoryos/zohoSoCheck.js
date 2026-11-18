// One job per Zoho sales-order ITEM (Arjun, 18-Nov-2026: "One SO could have
// multiple items"). An SO with three items can carry three jobs, one each.
// Used when a job is raised and when its SO is changed on the job page.

import { dbSelect } from "@/lib/db/supabase";
import { getSalesOrderByNumber, normaliseSoNumber, zohoConfigured } from "@/lib/zoho/books";
import { pickSoLine } from "@/lib/factoryos/zohoSoRule";

// Jobs already sitting on an SO number.
export async function jobsOnSo(number) {
  const rows = await dbSelect("jobs", {
    select: "id,airtable_id,j_number,item,stage,qty,zoho_so_line_id,zoho_so_line_name",
    filter: { zoho_so_no: `ilike.${number}` },
    limit: 100,
  }).catch(() => []);
  return (rows || []).map((r) => ({
    id: r.airtable_id || r.id, rowId: r.id, jNumber: r.j_number, item: r.item, stage: r.stage, qty: r.qty,
    lineId: r.zoho_so_line_id || "", lineName: r.zoho_so_line_name || "",
  }));
}

// Returns { error } or { number, so, unverified, lineId, lineName }.
//   raw        the SO number as typed
//   lineId     the SO item this job is for ("" = work it out)
//   excludeJob public id or row id of the job being edited (it does not clash with itself)
export async function checkSoForJob({ raw, lineId = "", excludeJob = "" }) {
  const number = normaliseSoNumber(raw);
  if (!number) return { error: "Enter the Zoho SO number. A job can't be created without one." };

  // Zoho down or over its daily limit: the number is saved, flagged "not
  // checked", and the Zoho check page verifies it later.
  let so = null;
  let unverified = false;
  if (!zohoConfigured()) unverified = true;
  else {
    try { so = await getSalesOrderByNumber(number); }
    catch (e) { console.error("zoho SO check failed, saving unverified:", e?.message || e); unverified = true; }
  }
  if (unverified) return { number, so: null, unverified: true, lineId: "", lineName: "" };
  if (!so) return { error: `${number} is not in Zoho. Check the SO number.` };
  if (so.status === "void") return { error: `${number} is void in Zoho.` };

  const others = (await jobsOnSo(number)).filter((j) => j.id !== excludeJob && j.rowId !== excludeJob);
  const pick = pickSoLine({ number, so, others, lineId });
  if (pick.error) return { error: pick.error };
  return { number, so, unverified: false, lineId: pick.lineId, lineName: pick.lineName };
}
