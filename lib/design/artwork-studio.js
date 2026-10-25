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
  const filter = all ? {} : { created_by_email: `eq.${session.email}` };
  return dbSelect("artwork_studio_jobs", { select: JOB_LIST_COLS, filter, order: "created_at.desc", limit: 100 });
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
    created_by_email: session.email,
    created_by_name: session.name || session.email,
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

export async function addInput(job, { filename, contentType, bytes }) {
  const name = safeFilename(filename);
  const path = `jobs/${job.id}/in/${Date.now()}-${name}`;
  await uploadToBucket({ bucket: BUCKET, path, contentType, bytes });
  // Files added mid-chat ride along with the next message (pending).
  const pending = (job.messages || []).length > 0;
  const inputs = [...(job.inputs || []), { name, storage_path: path, content_type: contentType, size: bytes.byteLength, ...(pending ? { pending: true } : {}) }];
  await dbUpdate("artwork_studio_jobs", "id", job.id, { inputs, updated_at: new Date().toISOString() });
  return inputs;
}

const KIND_RE = /__(PROOF|PREVIEW|CHECK|PRINT|RESULT|WRAP|RENDER)\.[a-z0-9]+$/i;
export function fileKind(name) {
  const m = KIND_RE.exec(name || "");
  return m ? m[1].toLowerCase() : "other";
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
  if (output.kind !== "print") return true;
  if (canApprove(session)) return true;
  return job.approved_version != null && output.version != null && output.version <= job.approved_version;
}

// Messages for the chat view: staff turns and Claude's final words only.
export function chatView(messages) {
  const out = [];
  for (const m of messages || []) {
    if (m.role === "user") {
      const text = (Array.isArray(m.content) ? m.content : [{ type: "text", text: m.content }])
        .filter((b) => b.type === "text" && b.text && !b.text.startsWith("<job>"))
        .map((b) => b.text).join("\n");
      const jobBlock = Array.isArray(m.content) && m.content.find((b) => b.type === "text" && b.text?.startsWith("<job>"));
      if (jobBlock) out.push({ role: "user", text: "New artwork request", first: true });
      else if (text) out.push({ role: "user", text });
    } else if (m.role === "assistant") {
      const text = (m.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
      if (text) out.push({ role: "assistant", text });
    }
  }
  return out;
}

// ---- the run --------------------------------------------------------------

function costUsd(model, u) {
  const p = PRICES[model] || PRICES[MODEL];
  const cw = u.cache_creation_input_tokens || 0;
  const cr = u.cache_read_input_tokens || 0;
  return ((u.input_tokens || 0) * p[0] + (u.output_tokens || 0) * p[1] + cw * p[2] + cr * p[3]) / 1e6;
}

function jobBrief(job, rulesVersion) {
  const product = PRODUCTS.find((p) => p.key === job.product_key);
  const inputs = (job.inputs || []).map((i) => `- ${i.name} (${i.content_type})`).join("\n") || "- none";
  return [
    "<job>",
    `product_key: ${job.product_key} (${product?.label || "?"})`,
    `brand: ${job.brand}`,
    `channel: ${job.channel}${job.channel === "dealer" ? " (no Aeros branding at all)" : " (Aeros maker's mark goes on)"}`,
    `lid: ${job.lid}`,
    `inks: ${job.inks || "not specified"}`,
    `digital_sample: ${job.digital_sample ? "yes" : "no"}`,
    `rules_version: v${rulesVersion}`,
    `requested_by: ${job.created_by_name || job.created_by_email}`,
    "uploaded files (in the container's input directory):",
    inputs,
    "</job>",
  ].join("\n");
}

// Upload staff files to the Files API and return the blocks that put them in
// the container (and show raster images to Claude directly).
async function attachInputs(client, list) {
  const content = [];
  const uploaded = [];
  for (const inp of list) {
    const url = await signStorageUrl(BUCKET, inp.storage_path, 600);
    const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
    const up = await client.files.upload({
      file: await toFile(bytes, inp.name, { type: inp.content_type }),
      expires_in_seconds: 30 * 24 * 3600, // containers live 30 days too
    });
    const { pending, ...rest } = inp;
    uploaded.push({ ...rest, anthropic_file_id: up.id });
    content.push({ type: "container_upload", file_id: up.id });
    if (IMAGE_TYPES.has(inp.content_type)) content.push({ type: "image", source: { type: "file", file_id: up.id } });
  }
  return { content, uploaded };
}

async function firstUserMessage(client, job, rulesVersion) {
  const { content, uploaded: inputs } = await attachInputs(client, job.inputs || []);
  content.push({ type: "text", text: jobBrief(job, rulesVersion) });
  content.push({ type: "text", text: job.brief ? `Brief from staff:\n${job.brief}` : "No extra brief from staff." });
  return { message: { role: "user", content }, inputs };
}

function newFileIds(content) {
  const ids = [];
  for (const b of content || []) {
    if (b.type === "bash_code_execution_tool_result" && b.content?.type === "bash_code_execution_result") {
      for (const o of b.content.content || []) if (o.file_id) ids.push(o.file_id);
    }
  }
  return ids;
}

async function saveOutputs(client, job, fileIds) {
  const saved = [];
  let result = null;
  for (const fid of fileIds) {
    const meta = await client.files.retrieveMetadata(fid);
    const bytes = new Uint8Array(await (await client.files.download(fid)).arrayBuffer());
    const name = safeFilename(meta.filename);
    const kind = fileKind(name);
    const path = `jobs/${job.id}/out/${name}`;
    await uploadToBucket({ bucket: BUCKET, path, contentType: meta.mime_type, bytes });
    saved.push({ name, kind, version: fileVersion(name), storage_path: path, size: bytes.byteLength, content_type: meta.mime_type, anthropic_file_id: fid, created_at: new Date().toISOString() });
    if (kind === "result") {
      try { result = JSON.parse(Buffer.from(bytes).toString("utf8")); } catch { /* keep going */ }
    }
  }
  return { saved, result };
}

// Run one staff turn to completion (looping through pause_turn), or until the
// time budget is spent — then the job is left with continue_pending and the
// client's next poll resumes it. userText is null for the first turn and for
// a resume.
export async function runTurn(jobId, { userText = null, resume = false, budgetMs = 680_000 } = {}) {
  const started = Date.now();
  let job = await getJob(jobId);
  if (!job) throw new Error("Job not found");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const patch = async (p) => {
    await dbUpdate("artwork_studio_jobs", "id", jobId, { ...p, updated_at: new Date().toISOString() });
    job = { ...job, ...p };
  };

  try {
    let rv = job.rule_version_id
      ? (await dbSelect("artwork_studio_rule_versions", { filter: { id: `eq.${job.rule_version_id}` }, limit: 1 }))[0]
      : await getLiveRules();
    if (!rv) throw new Error("No live rules yet — an admin must publish the Studio rules first.");

    let messages = [...(job.messages || [])];
    if (!resume) {
      if (messages.length === 0) {
        const { message, inputs } = await firstUserMessage(client, job, rv.version_no);
        messages.push(message);
        await patch({ inputs, rule_version_id: rv.id });
      } else {
        const pending = (job.inputs || []).filter((i) => i.pending);
        const { content, uploaded } = await attachInputs(client, pending);
        if (pending.length) {
          content.push({ type: "text", text: `Attached: ${pending.map((p) => p.name).join(", ")} (in the container's input directory)` });
          const done = new Map(uploaded.map((u) => [u.storage_path, u]));
          await patch({ inputs: job.inputs.map((i) => done.get(i.storage_path) || i) });
        }
        content.push({ type: "text", text: userText });
        messages.push({ role: "user", content });
      }
    }
    await patch({
      messages,
      status: "running",
      progress: resume ? "Continuing…" : "Starting…",
      error: null,
      continue_pending: false,
      ...(resume ? {} : { turn_started_at: new Date(started).toISOString() }),
    });

    const system = [{
      type: "text",
      text: rv.rules.map((r) => r.content).join("\n\n---\n\n"),
      cache_control: { type: "ephemeral" },
    }];
    const skills = [{ type: "custom", skill_id: rv.toolkit_skill_id, version: rv.toolkit_skill_version }];
    if (rv.pymupdf_skill_id) skills.push({ type: "custom", skill_id: rv.pymupdf_skill_id, version: rv.pymupdf_skill_version });

    const outputs = [...(job.outputs || [])];
    let result = job.result;
    let finalStop = null;

    for (let iter = 0; iter < 25; iter++) {
      let lastFlush = 0;
      let note = "";
      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 64000,
        betas: ["code-execution-2025-08-25", "server-side-fallback-2026-07-01", "thinking-display-updates-2026-08-18"],
        fallbacks: "default",
        thinking: { type: "adaptive", display: "updates" },
        output_config: { effort: "high" },
        cache_control: { type: "ephemeral" },
        system,
        container: { ...(job.container_id ? { id: job.container_id } : {}), skills },
        tools: [{ type: "code_execution_20260521", name: "code_execution" }],
        messages,
      });
      // Progress updates arrive as short thinking summaries; surface the
      // latest one to the poller every few seconds.
      stream.on("thinking", (_d, snap) => {
        note = snap;
        if (Date.now() - lastFlush > 4000) {
          lastFlush = Date.now();
          patch({ progress: note.slice(-300) }).catch(() => {});
        }
      });
      const msg = await stream.finalMessage();

      const usd = costUsd(msg.model, msg.usage);
      await dbInsert("artwork_studio_usage", [{
        job_id: jobId,
        user_email: job.created_by_email,
        model: msg.model,
        input_tokens: msg.usage.input_tokens || 0,
        output_tokens: msg.usage.output_tokens || 0,
        cache_read_tokens: msg.usage.cache_read_input_tokens || 0,
        cache_write_tokens: msg.usage.cache_creation_input_tokens || 0,
        cost_usd: usd,
        cost_inr: usd * USD_INR,
      }], { returning: "minimal" });

      messages.push({ role: "assistant", content: msg.content });
      const { saved, result: r } = await saveOutputs(client, job, newFileIds(msg.content));
      outputs.push(...saved);
      if (r) result = r;

      await patch({
        messages,
        outputs,
        result,
        container_id: msg.container?.id || job.container_id,
        cost_usd: Number(job.cost_usd || 0) + usd,
        cost_inr: Number(job.cost_inr || 0) + usd * USD_INR,
        progress: saved.length ? `Saved ${saved.map((s) => s.name).join(", ")}` : note.slice(-300) || job.progress,
      });

      finalStop = msg.stop_reason;
      if (msg.stop_reason !== "pause_turn") break;
      if (Date.now() - started > budgetMs) {
        await patch({ continue_pending: true, progress: "Still working — continuing…" });
        return { status: "running" };
      }
    }

    if (finalStop === "refusal") {
      await patch({ status: "failed", error: "Claude declined this request. Change the brief and try again, or flag it." });
    } else if (finalStop === "max_tokens") {
      await patch({ status: "failed", error: "The reply ran too long. Ask again with a narrower change." });
    } else {
      // A turn that produced a proof is ready; one that only replied with
      // text is Claude asking staff something.
      const turnStart = Date.parse(job.turn_started_at || 0);
      const madeProof = outputs.some((o) => o.kind === "proof" && Date.parse(o.created_at) >= turnStart);
      await patch({ status: madeProof ? "ready" : "needs_input", progress: null });
    }
    return { status: job.status };
  } catch (e) {
    let msg = e?.message || String(e);
    if (e instanceof Anthropic.APIError && /container/i.test(msg)) {
      msg = "This job's workspace has expired (jobs last 30 days). Start a new job with the same files.";
    }
    await patch({ status: "failed", error: msg.slice(0, 500), progress: null, continue_pending: false });
    return { status: "failed", error: msg };
  }
}
