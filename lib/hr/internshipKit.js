// Editable content for the public /internship page — highlight badges + FAQ —
// stored as a single Supabase row (id=1) so HR can update it live without a
// redeploy. getKit() is failure-safe: it falls back to DEFAULT_KIT so the
// public page always renders a complete, sensible FAQ even if the DB row is
// missing, empty, or unreachable.
import { dbSelect, dbUpdate } from "@/lib/db/supabase.js";

// Baked-in fallback — mirrors the seeded row. Keeps the public page correct if
// Supabase is unavailable (e.g. local dev with placeholder creds).
export const DEFAULT_KIT = {
  intro:
    "Aeros is building a unified B2B marketplace that simplifies packaging procurement and supply-chain operations — helping businesses source products, manage orders and streamline procurement in one technology-driven ecosystem. Join a fast-moving team with real ownership from day one.",
  contactName: "",
  contactPhone: "+91 90537 65050",
  contactEmail: "prabhnoor@aeros-x.com",
  whoCanApply:
    "Open across streams — MBA / PGDM · BMS / BBA / B.Com · Engineering (B.E./B.Tech) · and any final-year student. We value attitude, ownership, and communication as much as marks.",
  tracks: [
    { title: "Supply Chain & Operations", points: ["Order & fulfilment management", "Procurement workflows", "Vendor & supplier coordination", "Logistics & dispatch", "Inventory tracking"] },
    { title: "Management", points: ["Cross-functional operations", "Process improvement", "Project & program support", "Business & data analysis", "Reporting & coordination"] },
    { title: "E-commerce Sales", points: ["Client outreach", "Seller & buyer onboarding", "Account management", "Marketplace growth", "Sales operations support"] },
  ],
  gains: [
    "Hands-on experience at a growing B2B startup",
    "Direct mentorship from the leadership team",
    "Exposure to live supply-chain & marketplace operations",
    "ChatGPT subscription included for the full internship",
    "Completion certificate & a clear path to a full-time role",
  ],
  program: [
    { label: "Duration", value: "6 Months", note: "" },
    { label: "Stipend", value: "₹10,000–15,000", note: "per month · role & performance based" },
    { label: "Location", value: "In-Office", note: "Bhiwandi, Maharashtra" },
    { label: "Working days", value: "6-Day Week", note: "Monday to Saturday" },
    { label: "Equipment", value: "Bring Your Own", note: "personal laptop required" },
    { label: "Conversion", value: "PPO Track", note: "full-time offer for top performers" },
    { label: "Certificate", value: "Yes", note: "+ LOR for top performers" },
    { label: "Perk", value: "ChatGPT Sub", note: "included for the internship" },
    { label: "Intake", value: "Rolling", note: "applications reviewed as received" },
  ],
  highlights: [
    "6-month internship",
    "₹10,000–15,000 / month",
    "Completion certificate",
    "ChatGPT subscription included",
    "PPO track",
    "Rolling intake",
  ],
  faqs: [
    { q: "What is Aeros?", a: "Aeros is building a unified B2B marketplace that simplifies packaging procurement and supply-chain operations — helping businesses source products, manage orders and streamline procurement in one technology-driven ecosystem. It's a fast-moving team already trusted by 100+ brands across India, so you'll join with real ownership from day one." },
    { q: "Who can apply?", a: "Students in their final year and recent graduates. We care more about drive, ownership and a genuine interest in packaging, operations and business than about a specific degree — candidates from supply-chain, management and commerce backgrounds all fit our three tracks." },
    { q: "What will I actually work on?", a: "Pick one of three tracks on the form. Supply Chain & Operations — order & fulfilment, procurement workflows, vendor coordination, logistics & dispatch, inventory. Management — cross-functional operations, process improvement, project support, business & data analysis, reporting. E-commerce Sales — client outreach, seller & buyer onboarding, account management, marketplace growth, sales ops. It's real, hands-on work from week one." },
    { q: "Is the internship paid?", a: "Yes. Interns receive a monthly stipend of ₹10,000–₹15,000, depending on the role and your fit." },
    { q: "How long is the internship?", a: "6 months. We ask that you can commit to the full period — there's a question on the form to confirm this." },
    { q: "What else do interns get?", a: "Beyond the stipend: a completion certificate, a ChatGPT subscription for the duration of your internship, real ownership of your work from day one, and a PPO track (see below)." },
    { q: "Can the internship lead to a full-time role?", a: "Yes — there's a PPO (pre-placement offer) track. Strong performers are offered a full-time role at Aeros at the end of the internship." },
    { q: "Where is it based? Is it in person?", a: "In person at our office and factory in Bhiwandi, in the Greater Mumbai region. This is an on-site, hands-on internship — you'll be right next to the operation, not working remotely." },
    { q: "Is there an application deadline?", a: "No — we run a rolling intake and review applications as they come in. Apply whenever you're ready; tell us your available start date on the form and we'll work out timing." },
    { q: "What do I need to apply, and what happens next?", a: "Just this form and your resume (PDF or Word, up to 5 MB) — a LinkedIn profile and a short note on why Aeros are optional but help. We read every application; if your background looks like a fit, someone from the Aeros team will email you to set up a conversation, so keep an eye on your inbox." },
  ],
};

function normKit(row) {
  const arr = (v) => (Array.isArray(v) ? v : []);
  const highlights = arr(row?.highlights)
    .map((h) => String(h || "").trim())
    .filter(Boolean);
  const faqs = arr(row?.faqs)
    .map((f) => ({ q: String(f?.q || "").trim(), a: String(f?.a || "").trim() }))
    .filter((f) => f.q && f.a);
  const tracks = arr(row?.tracks)
    .map((t) => ({
      title: String(t?.title || "").trim(),
      points: arr(t?.points).map((p) => String(p || "").trim()).filter(Boolean),
    }))
    .filter((t) => t.title);
  const gains = arr(row?.gains).map((g) => String(g || "").trim()).filter(Boolean);
  const program = arr(row?.program)
    .map((p) => ({
      label: String(p?.label || "").trim(),
      value: String(p?.value || "").trim(),
      note: String(p?.note || "").trim(),
    }))
    .filter((p) => p.label && p.value);
  return {
    intro: (row?.intro && String(row.intro).trim()) || DEFAULT_KIT.intro,
    contactName: (row?.contact_name && String(row.contact_name).trim()) || "",
    contactPhone: (row?.contact_phone && String(row.contact_phone).trim()) || "",
    contactEmail: (row?.contact_email && String(row.contact_email).trim()) || "",
    whoCanApply: (row?.who_can_apply && String(row.who_can_apply).trim()) || DEFAULT_KIT.whoCanApply,
    tracks: tracks.length ? tracks : DEFAULT_KIT.tracks,
    gains: gains.length ? gains : DEFAULT_KIT.gains,
    program: program.length ? program : DEFAULT_KIT.program,
    highlights: highlights.length ? highlights : DEFAULT_KIT.highlights,
    faqs: faqs.length ? faqs : DEFAULT_KIT.faqs,
    updatedAt: row?.updated_at || null,
  };
}

// Public-page read — never throws. Falls back to DEFAULT_KIT on any error so
// the open /internship page can't break on a bad/absent kit row.
export async function getKit() {
  try {
    const rows = await dbSelect("internship_kit", { select: "*", filter: { id: "eq.1" }, limit: 1 });
    if (!rows.length) return { ...DEFAULT_KIT, updatedAt: null };
    return normKit(rows[0]);
  } catch {
    return { ...DEFAULT_KIT, updatedAt: null };
  }
}

// HR editor read — same shape, but surfaces errors to the authed caller.
export async function getKitForEdit() {
  const rows = await dbSelect("internship_kit", { select: "*", filter: { id: "eq.1" }, limit: 1 });
  return rows.length ? normKit(rows[0]) : { ...DEFAULT_KIT, updatedAt: null };
}

// Validate + persist the editable fields. Coerces to clean arrays so the
// public page's assumptions hold.
export async function updateKit(patch) {
  const out = { updated_at: new Date().toISOString() };
  if ("intro" in patch) out.intro = String(patch.intro || "").trim() || null;
  if ("contactName" in patch) out.contact_name = String(patch.contactName || "").trim() || null;
  if ("contactPhone" in patch) out.contact_phone = String(patch.contactPhone || "").trim() || null;
  if ("contactEmail" in patch) out.contact_email = String(patch.contactEmail || "").trim() || null;
  if ("whoCanApply" in patch) out.who_can_apply = String(patch.whoCanApply || "").trim() || null;
  if ("tracks" in patch) {
    out.tracks = (Array.isArray(patch.tracks) ? patch.tracks : [])
      .map((t) => ({
        title: String(t?.title || "").trim(),
        points: (Array.isArray(t?.points) ? t.points : []).map((p) => String(p || "").trim()).filter(Boolean),
      }))
      .filter((t) => t.title)
      .slice(0, 10);
  }
  if ("gains" in patch) {
    out.gains = (Array.isArray(patch.gains) ? patch.gains : [])
      .map((g) => String(g || "").trim())
      .filter(Boolean)
      .slice(0, 20);
  }
  if ("program" in patch) {
    out.program = (Array.isArray(patch.program) ? patch.program : [])
      .map((p) => ({ label: String(p?.label || "").trim(), value: String(p?.value || "").trim(), note: String(p?.note || "").trim() }))
      .filter((p) => p.label && p.value)
      .slice(0, 20);
  }
  if ("highlights" in patch) {
    out.highlights = (Array.isArray(patch.highlights) ? patch.highlights : [])
      .map((h) => String(h || "").trim())
      .filter(Boolean)
      .slice(0, 12);
  }
  if ("faqs" in patch) {
    out.faqs = (Array.isArray(patch.faqs) ? patch.faqs : [])
      .map((f) => ({ q: String(f?.q || "").trim(), a: String(f?.a || "").trim() }))
      .filter((f) => f.q && f.a)
      .slice(0, 40);
  }
  const row = await dbUpdate("internship_kit", "id", 1, out, { returning: "representation" });
  return normKit(Array.isArray(row) ? row[0] : row);
}
