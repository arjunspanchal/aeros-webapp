// Artwork Studio — staff build paper-cup / PP / PET cup artworks through the
// Claude API (code execution + Arjun's custom Agent Skills). Server-side only.
//
// Rules come from artwork_studio_rule_versions (staged from the studio-rules/
// master by scripts/publish-studio-rules.mjs, made live by an admin). A job is
// pinned to the rules version it started on, so its conversation never has
// its system prompt edited underneath it.
//
// Every API call is logged in artwork_studio_usage; non-admins have a daily ₹
// cap. Print-ready files stay locked until an admin / factory manager approves.

import Anthropic, { toFile } from "@anthropic-ai/sdk";
import { dbSelect, dbInsert, dbUpdate } from "../db/supabase.js";
import { uploadToBucket, signStorageUrl, safeFilename } from "../db/storage.js";
import { ROLES } from "../auth/roles.js";

export const BUCKET = "artwork-studio";
const MODEL = "claude-opus-5-5";
const USD_INR = 90;
export const DAILY_CAP_INR = Number(process.env.ARTWORK_STUDIO_DAILY_CAP_INR || 500);

// Shape for the 3D preview when a job's RESULT.json has no cup3d yet —
// approximate formed dims; the RESULT numbers (from the toolkit) win.
const CONE = (top, bottom, h, material = "paper-white") => ({
  shape: "cone", material, top_d_mm: top, bottom_d_mm: bottom, height_mm: h, print_top_mm: 4, print_bottom_mm: h - 6,
});
const U = (top, bottom, h, pt, pb) => ({
  shape: "u", material: "clear", top_d_mm: top, bottom_d_mm: bottom, height_mm: h, print_top_mm: pt, print_bottom_mm: pb,
});

// Strict scope (Arjun 2026-10-25). PET 16 oz U has no keyline yet.
export const PRODUCTS = [
  { key: "paper-8oz-sw", label: "8 oz (250 mL) paper cup — single wall", family: "Paper cups", cup3d: CONE(80, 56, 92) },
  { key: "paper-8oz-dw", label: "8 oz (250 mL) paper cup — double wall", family: "Paper cups", cup3d: CONE(80, 56, 92) },
  { key: "paper-12oz-sw", label: "12 oz (350 mL) paper cup — single wall", family: "Paper cups", cup3d: CONE(90, 60, 110) },
  { key: "paper-12oz-dw", label: "12 oz (350 mL) paper cup — double wall", family: "Paper cups", cup3d: CONE(90, 60, 110) },
  { key: "paper-16oz-sw", label: "16 oz (450 mL) paper cup — single wall", family: "Paper cups", cup3d: CONE(90, 60, 135) },
  { key: "paper-16oz-dw", label: "16 oz (450 mL) paper cup — double wall", family: "Paper cups", cup3d: CONE(90, 60, 135) },
  { key: "pp-12oz-u", label: "12 oz U-shape PP cup", family: "PP cups", cup3d: U(92, 48, 90, 8, 67) },
  { key: "pp-16oz-u", label: "16 oz U-shape PP cup", family: "PP cups", cup3d: U(95, 52, 120, 10, 90) },
  { key: "pet-12oz-u", label: "12 oz U-shape PET cup", family: "PET cups", cup3d: U(92, 48, 90, 8, 67) },
  { key: "pet-16oz-u", label: "16 oz U-shape PET cup", family: "PET cups", cup3d: U(95, 52, 120, 10, 90), unavailable: "Coming soon — keyline not measured yet" },
  // Deli wrap sheets: flat, all-over repeat (house standard KLD Templates/Wrap Sheets). No lid, no 3D cup.
  { key: "wrap-254x254-white", label: "10 × 10 in (254 × 254 mm) deli wrap — white", family: "Deli wraps", sheet: [254, 254], noLid: true },
  { key: "wrap-254x254-kraft", label: "10 × 10 in (254 × 254 mm) deli wrap — natural kraft", family: "Deli wraps", sheet: [254, 254], noLid: true },
  { key: "wrap-305x305-white", label: "12 × 12 in (305 × 305 mm) deli wrap — white", family: "Deli wraps", sheet: [305, 305], noLid: true },
  { key: "wrap-305x305-kraft", label: "12 × 12 in (305 × 305 mm) deli wrap — natural kraft", family: "Deli wraps", sheet: [305, 305], noLid: true },
  { key: "wrap-300x360-white", label: "12 × 14 in (300 × 360 mm) deli wrap — white", family: "Deli wraps", sheet: [300, 360], noLid: true },
  { key: "wrap-300x360-kraft", label: "12 × 14 in (300 × 360 mm) deli wrap — natural kraft", family: "Deli wraps", sheet: [300, 360], noLid: true },
];
export const PRODUCT_KEYS = new Set(PRODUCTS.filter((p) => !p.unavailable).map((p) => p.key));
export const LIDS = ["none", "paper", "PET", "PP"];
const ALLOWED_INPUT_EXT = new Set(["pdf", "ai", "svg", "eps", "png", "jpg", "jpeg", "webp"]);
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

// Per-MTok USD prices for the model that actually served a call (a refusal
// fallback can route to another model). [input, output, cache write 5m, cache read]
const PRICES = {
  "claude-opus-5-5": [4, 20, 5, 0.2],
  "claude-opus-5": [5, 25, 6.25, 0.5],
  "claude-opus-4-8": [5, 25, 6.25, 0.5],
  "claude-fable-5-1": [10, 50, 12.5, 0.25],
  "claude-sonnet-5-5": [2, 10, 2.5, 0.2],
};

// ---- access ---------------------------------------------------------------

// Staff only: customers and print vendors also hold sessions (Design is open
// to them) but must never reach the Studio.
export function canUseStudio(session) {
  if (!session) return false;
  if (session.isAdmin) return true;
  const fo = session.modules?.factoryos;
  if (fo === ROLES.CUSTOMER || fo === ROLES.VENDOR) return false;
  return Object.values(session.modules || {}).some(Boolean);
}

export function canApprove(session) {
  if (!session) return false;
  if (session.isAdmin) return true;
  const fo = session.modules?.factoryos;
  return fo === ROLES.ADMIN || fo === ROLES.FACTORY_MANAGER;
}

export const canAdminStudio = (session) => !!session?.isAdmin;

// Who a session is, for ownership and the spend cap. The shared-password
// admin login carries no email.
export function userKey(session) {
  return session?.email || (session?.isAdmin ? "admin" : session?.name) || "unknown";
}

export function isAllowedInput(filename) {
  return ALLOWED_INPUT_EXT.has(String(filename || "").toLowerCase().split(".").pop());
}

// ---- reads ----------------------------------------------------------------

export async function getLiveRules() {
  const rows = await dbSelect("artwork_studio_rule_versions", {
    filter: { status: "eq.live" },
    limit: 1,
  });
  return rows[0] || null;
}

export async function listRuleVersions() {
  return dbSelect("artwork_studio_rule_versions", {
    select: "id,version_no,status,notes,rules_sha,toolkit_skill_version,staged_by,staged_at,published_by,published_at,rules",
    order: "version_no.desc",
    limit: 20,
  });
}

export async function getJob(id) {
  const rows = await dbSelect("artwork_studio_jobs", { filter: { id: `eq.${id}` }, limit: 1 });
  return rows[0] || null;
}

const JOB_LIST_COLS =
  "id,created_at,updated_at,created_by_email,created_by_name,product_key,brand,status,progress,cost_inr,approved_version,result";

export async function listJobs(session, { all = false } = {}) {
  const filter = all ? {} : { created_by_email: `eq.${userKey(session)}` };
  return dbSelect("artwork_studio_jobs", { select: JOB_LIST_COLS, filter, order: "created_at.desc", limit: 100 });
}

// Jobs with a proof whose latest print version is not approved yet (approvers' queue).
export async function listNeedsApproval() {
  const rows = await dbSelect("artwork_studio_jobs", {
    select: JOB_LIST_COLS + ",outputs",
    filter: { status: "eq.ready" },
    order: "updated_at.desc",
    limit: 100,
  });
  return rows
    .filter((j) => {
      const prints = (j.outputs || []).filter((o) => o.kind === "print" && o.version != null).map((o) => o.version);
      return prints.length && (j.approved_version == null || j.approved_version < Math.max(...prints));
    })
    .map(({ outputs, ...j }) => j);
}

// Admins + factory managers with an email - the people who approve print files.
export async function approverEmails() {
  const rows = await dbSelect("users", {
    select: "email,factoryos_role,active",
    filter: { factoryos_role: `in.(${ROLES.ADMIN},${ROLES.FACTORY_MANAGER})`, active: "eq.true" },
  });
  const set = new Set(rows.map((r) => r.email).filter(Boolean));
  for (const e of String(process.env.ARTWORK_STUDIO_APPROVER_EMAILS || "").split(",")) if (e.trim()) set.add(e.trim());
  return [...set];
}

// Start of today in IST, as an ISO timestamp.
function istDayStart() {
  const now = new Date(Date.now() + 5.5 * 3600e3);
  const d = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(d - 5.5 * 3600e3).toISOString();
}

export async function spentTodayInr(email) {
  const rows = await dbSelect("artwork_studio_usage", {
    select: "cost_inr",
    filter: { user_email: `eq.${email}`, created_at: `gte.${istDayStart()}` },
  });
  return rows.reduce((s, r) => s + Number(r.cost_inr || 0), 0);
}

export async function spendSummary() {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const rows = await dbSelect("artwork_studio_usage", {
    select: "user_email,created_at,cost_inr",
    filter: { created_at: `gte.${monthStart.toISOString()}` },
    range: "0-9999",
  });
  const today = istDayStart();
  const by = {};
  for (const r of rows) {
    const u = (by[r.user_email] ||= { email: r.user_email, today: 0, month: 0, calls: 0 });
    u.month += Number(r.cost_inr || 0);
    u.calls += 1;
    if (r.created_at >= today) u.today += Number(r.cost_inr || 0);
  }
  return Object.values(by).sort((a, b) => b.month - a.month);
}

// ---- jobs -----------------------------------------------------------------

export async function createJob(session, f) {
  const [row] = await dbInsert("artwork_studio_jobs", [{
    created_by_email: userKey(session),
    created_by_name: session.name || userKey(session),
    product_key: f.productKey,
    brand: f.brand,
    channel: f.channel,
    lid: f.lid,
    inks: f.inks || null,
    digital_sample: !!f.digitalSample,
    brief: f.brief || null,
    status: "draft",
  }]);
  return row;
}

// role: "logo" (the thing to print - vector preferred) | "reference" (mockup, photo, old proof)
export async function addInput(job, { filename, contentType, bytes, role = "logo" }) {
  const name = safeFilename(filename);
  role = role === "reference" ? "reference" : "logo";
  const path = `jobs/${job.id}/in/${Date.now()}-${name}`;
  await uploadToBucket({ bucket: BUCKET, path, contentType, bytes });
  // Files added mid-chat ride along with the next message (pending).
  const pending = (job.messages || []).length > 0;
  const inputs = [...(job.inputs || []), { name, role, storage_path: path, content_type: contentType, size: bytes.byteLength, ...(pending ? { pending: true } : {}) }];
  await dbUpdate("artwork_studio_jobs", "id", job.id, { inputs, updated_at: new Date().toISOString() });
  return inputs;
}

const KIND_RE = /__(PROOF|PREVIEW|CHECK|PRINT-4UP|PRINT|RESULT|WRAP|RENDER|SAMPLE)\.[a-z0-9]+$/i;
// The print file is proof-only while a logo is a raster / has live text.
export function needsVectorLogo(job) {
  const r = job?.result;
  if (!r) return false;
  const g = (r.gates || []).find((x) => x.name === "fonts / resolution");
  const w = (r.warnings || []).join(" ").toLowerCase();
  return (g && g.pass === false) || /vector logo|dpi picture|live text/.test(w);
}

export function fileKind(name) {
  const m = KIND_RE.exec(name || "");
  return m ? m[1].toLowerCase().replace("-", "") : "other";   // print4up = the 4-up press sheet (deli wraps)
}
function fileVersion(name) {
  const m = /_v(\d+)__/i.exec(name || "");
  return m ? Number(m[1]) : null;
}

export async function signedOutputUrl(output, expiresIn = 600) {
  return signStorageUrl(BUCKET, output.storage_path, expiresIn);
}

// The print file is locked until an approver signs off on that version.
export function canDownload(session, job, output) {
  if (!String(output.kind).startsWith("print")) return true;   // print + print4up stay locked until approval
  if (canApprove(session)) return true;
  return job.approved_version != null && output.version != null && output.version <= job.approved_version;
}

// Messages for the chat view: staff turns and Claude's final words only.
// Chat for the job page. Managed-Agents jobs store plain {role, text} turns.
export function chatView(messages) {
  return (messages || [])
    .filter((m) => typeof m.text === "string" && m.text.trim())
    .map((m) => ({ role: m.role, text: m.text, ...(m.first ? { first: true } : {}) }));
}

// ---- the run (Anthropic Managed Agents) --------------------------------------
// One agent version per rules version (system = the rules, skills = toolkit +
// wheels; set up by scripts/publish-studio-rules.mjs). One SESSION per job, so a
// revision is the next message in the same session and the sandbox keeps the
// earlier versions. Vercel never waits on Claude: startTurn() sends a message
// and returns; syncJob() runs on each poll of the job page.

const INPUT_DIR = "/mnt/session/uploads/inputs";
const OUTPUT_DIR = "/mnt/session/outputs";
const ADMIN_SESSION_CAP_USD = 25;

const client = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function jobBrief(job, rulesVersion) {
  const product = PRODUCTS.find((p) => p.key === job.product_key);
  const roleNote = { logo: "LOGO - the artwork to print", reference: "REFERENCE - mockup / photo / old proof; take the layout and colours from it, never cut the logo out of it if a LOGO file exists" };
  const inputs = (job.inputs || []).map((i) => `- ${INPUT_DIR}/${i.name} (${i.content_type}) - ${roleNote[i.role] || roleNote.logo}`).join("\n") || "- none";
  return [
    "<job>",
    `product_key: ${job.product_key} (${product?.label || "?"})`,
    `brand: ${job.brand}`,
    `channel: ${job.channel}${job.channel === "dealer" ? " (no Aeros branding at all)" : " (Aeros maker's mark goes on - paper cups only)"}`,
    `lid: ${job.lid}`,
    `inks: ${job.inks || "not specified"}`,
    `digital_sample: ${job.digital_sample ? "yes" : "no"}`,
    `rules_version: v${rulesVersion}`,
    `requested_by: ${job.created_by_name || job.created_by_email}`,
    "uploaded files:",
    inputs,
    `deliverables: copy them into ${OUTPUT_DIR}/ (that is the output folder for this job; there is no $OUTPUT_DIR here)`,
    "</job>",
  ].join("\n");
}

async function uploadInputs(c, list) {
  const out = [];
  for (const inp of list) {
    const url = await signStorageUrl(BUCKET, inp.storage_path, 600);
    const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
    const up = await c.files.upload({ file: await toFile(bytes, inp.name, { type: inp.content_type }) });
    const { pending, ...rest } = inp;
    out.push({ ...rest, anthropic_file_id: up.id });
  }
  return out;
}

async function rulesFor(job) {
  if (job.rule_version_id) {
    return (await dbSelect("artwork_studio_rule_versions", { filter: { id: `eq.${job.rule_version_id}` }, limit: 1 }))[0];
  }
  return getLiveRules();
}

const budgetOf = (usd) => ({ type: "limit", max_list_cost: { amount: String(Math.max(50, Math.round(usd * 100))), currency: "USD" } });

// Start a turn: the first one creates the session; later ones (revisions,
// answers) send the next message. Returns quickly - the work runs at Anthropic.
export async function startTurn(jobId, { userText = null, allowanceInr = null } = {}) {
  let job = await getJob(jobId);
  const c = client();
  const patch = async (p) => {
    await dbUpdate("artwork_studio_jobs", "id", jobId, { ...p, updated_at: new Date().toISOString() }, { returning: "minimal" });
    job = { ...job, ...p };
  };
  try {
    const rv = await rulesFor(job);
    if (!rv?.agent_id) throw new Error("The Studio rules haven't been published for the hosted agent yet - ask Arjun.");
    const allowanceUsd = allowanceInr == null ? ADMIN_SESSION_CAP_USD : allowanceInr / USD_INR;
    const messages = [...(job.messages || [])];
    let text;
    if (!job.session_id) {
      const inputs = await uploadInputs(c, job.inputs || []);
      const session = await c.beta.sessions.create({
        agent: { type: "agent", id: rv.agent_id, version: rv.agent_version },
        environment_id: rv.environment_id,
        title: `${job.brand} - ${job.product_key}`.slice(0, 200),
        resources: inputs.map((i) => ({ type: "file", file_id: i.anthropic_file_id, mount_path: `/inputs/${i.name}` })),
        budget: budgetOf(allowanceUsd),
      });
      await patch({ session_id: session.id, rule_version_id: rv.id, inputs });
      text = jobBrief(job, rv.version_no) + "\n\n" + (job.brief ? `Brief from staff:\n${job.brief}` : "No extra brief from staff.");
      messages.push({ role: "user", text: job.brief || "New artwork request", first: true, at: new Date().toISOString() });
    } else {
      const pending = (job.inputs || []).filter((i) => i.pending);
      let note = "";
      if (pending.length) {
        const up = await uploadInputs(c, pending);
        for (const i of up) {
          await c.beta.sessions.resources.add(job.session_id, { type: "file", file_id: i.anthropic_file_id, mount_path: `/inputs/${i.name}` });
        }
        const done = new Map(up.map((u) => [u.storage_path, u]));
        await patch({ inputs: job.inputs.map((i) => done.get(i.storage_path) || i) });
        note = `\n\nAttached: ${pending.map((p) => `${INPUT_DIR}/${p.name}`).join(", ")}`;
      }
      // the session budget only grows with what is still allowed today
      const s = await c.beta.sessions.retrieve(job.session_id);
      const spent = Number(s.usage?.list_cost?.amount || 0) / 100;
      await c.beta.sessions.update(job.session_id, { budget: budgetOf(spent + allowanceUsd) });
      text = userText + note;
      messages.push({ role: "user", text: userText, at: new Date().toISOString() });
    }
    await c.beta.sessions.events.send(job.session_id, {
      events: [{ type: "user.message", content: [{ type: "text", text }] }],
    });
    await patch({
      messages, status: "running", progress: "Starting…", error: null,
      turn_started_at: new Date().toISOString(), continue_pending: false,
    });
    return { status: "running" };
  } catch (e) {
    await patch({ status: "failed", error: String(e?.message || e).slice(0, 500), progress: null });
    return { status: "failed", error: e?.message };
  }
}

async function saveOutputFile(c, job, f) {
  const bytes = new Uint8Array(await (await c.beta.files.download(f.id)).arrayBuffer());
  const name = safeFilename(f.filename);
  const path = `jobs/${job.id}/out/${name}`;
  await uploadToBucket({ bucket: BUCKET, path, contentType: f.mime_type || "application/octet-stream", bytes });
  let result = null;
  if (fileKind(name) === "result") {
    try { result = JSON.parse(Buffer.from(bytes).toString("utf8")); } catch { /* ignore */ }
  }
  return {
    out: { name, kind: fileKind(name), version: fileVersion(name), storage_path: path, size: bytes.byteLength,
           content_type: f.mime_type, anthropic_file_id: f.id, created_at: new Date().toISOString() },
    result,
  };
}

// Bring a running job up to date from its session. Cheap; called on each poll.
export async function syncJob(job) {
  if (job.status !== "running" || !job.session_id) return job;
  if (Date.now() - Date.parse(job.updated_at || 0) < 2500) return job;          // polls are 4 s apart; don't stack
  const c = client();
  const p = {};
  try {
    const session = await c.beta.sessions.retrieve(job.session_id);
    const costUsd = Number(session.usage?.list_cost?.amount || 0) / 100;
    const delta = costUsd - Number(job.session_cost_usd || 0);
    if (delta > 0.0001) {
      await dbInsert("artwork_studio_usage", [{
        job_id: job.id, user_email: job.created_by_email, model: "managed-agent",
        input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0,
        cost_usd: delta, cost_inr: delta * USD_INR,
      }], { returning: "minimal" });
      Object.assign(p, { session_cost_usd: costUsd, cost_usd: Number(job.cost_usd || 0) + delta, cost_inr: Number(job.cost_inr || 0) + delta * USD_INR });
    }

    // new events since the last sync (events carry processed_at; dedupe by id)
    const seen = (() => { try { return JSON.parse(job.events_seen_at || "{}"); } catch { return {}; } })();
    const events = [];
    for await (const ev of c.beta.sessions.events.list(job.session_id, { order: "asc", ...(seen.at ? { "created_at[gte]": seen.at } : {}) })) {
      if (seen.ids?.includes(ev.id)) continue;
      events.push(ev);
    }
    const messages = [...(job.messages || [])];
    // the latest idle event of THIS turn is remembered across polls: the session's
    // own status can still read "running" for a moment after the event arrives
    let idle = seen.idle && Date.parse(seen.idle.processed_at) >= Date.parse(job.turn_started_at || 0) ? seen.idle : null;
    let terminated = false, progress = job.progress;
    for (const ev of events) {
      if (ev.type === "agent.message") {
        const text = (ev.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
        if (text) { messages.push({ role: "assistant", text, at: ev.processed_at }); progress = text.slice(0, 200); }
      } else if (ev.type === "agent.tool_use") {
        progress = `Working - ${ev.name}${ev.input?.command ? ": " + String(ev.input.command).slice(0, 80) : ""}`;
      } else if (ev.type === "session.status_idle" && Date.parse(ev.processed_at) >= Date.parse(job.turn_started_at || 0)) {
        idle = { processed_at: ev.processed_at, stop_reason: { type: ev.stop_reason?.type } };
      } else if (ev.type === "session.status_terminated") {
        terminated = true;
      }
    }
    if (events.length) {
      const last = events[events.length - 1];
      const ids = events.filter((e) => e.processed_at === last.processed_at).map((e) => e.id);
      p.events_seen_at = JSON.stringify({ at: last.processed_at, ids, idle });
      p.messages = messages;
      p.progress = progress;
    }

    if (idle && !events.length) p.events_seen_at = JSON.stringify({ ...seen, idle });
    if (terminated) {
      Object.assign(p, { status: "failed", error: "The session stopped. Press Retry to start again.", progress: null });
    } else if (idle && session.status === "idle") {
      const reason = idle.stop_reason?.type;
      if (reason === "budget_reached") {
        Object.assign(p, { status: "failed", progress: null, error: `Today's limit is used up (₹${DAILY_CAP_INR}). Continue tomorrow, or ask Arjun.` });
      } else if (reason === "end_turn") {
        // collect output files the job hasn't stored yet (short indexing lag after idle)
        const have = new Set((job.outputs || []).map((o) => o.anthropic_file_id));
        const outputs = [...(job.outputs || [])];
        let result = job.result;
        for await (const f of c.beta.files.list({ scope_id: job.session_id, betas: ["managed-agents-2026-04-01"] })) {
          if (have.has(f.id) || f.downloadable === false) continue;      // staff uploads are listed too
          const { out, result: r } = await saveOutputFile(c, job, f);
          outputs.push(out);
          if (r) result = r;
        }
        const madeProof = outputs.some((o) => o.kind === "proof" && !have.has(o.anthropic_file_id));
        if (!madeProof && Date.now() - Date.parse(idle.processed_at) < 8000) {
          Object.assign(p, { outputs, result });                // files may still be indexing - next poll decides
        } else {
          Object.assign(p, { outputs, result, status: madeProof ? "ready" : "needs_input", progress: null });
          if (madeProof) {
            // tell the approvers once per version (never fails the job)
            const v = Math.max(...outputs.filter((o) => o.kind === "proof").map((o) => o.version || 1));
            try {
              const { notifyApprovers } = await import("./artwork-studio-mail.js");
              await notifyApprovers({ to: await approverEmails(), job: { ...job, ...p }, version: v });
            } catch (e) { console.error("artwork-studio approver mail", e?.message); }
          }
        }
      } else if (reason === "requires_action") {
        Object.assign(p, { progress: "Waiting on a tool approval…" });
      } else {
        Object.assign(p, { status: "failed", progress: null, error: reason === "refusal"
          ? "Claude declined this request. Change the brief and try again, or flag it."
          : "The run stopped after repeated errors. Press Retry." });
      }
    }
  } catch (e) {
    p.progress = `Checking… (${String(e?.message || e).slice(0, 80)})`;
  }
  p.updated_at = new Date().toISOString();
  await dbUpdate("artwork_studio_jobs", "id", job.id, p, { returning: "minimal" });
  return { ...job, ...p };
}
