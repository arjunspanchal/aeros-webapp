#!/usr/bin/env node
// Stage a new Artwork Studio rules version from the studio-rules/ master.
//
//   node aeros-catalog/scripts/publish-studio-rules.mjs ["what changed"]
//
// 1. Reads studio-rules/rules/*.md (filename order) -> the system-prompt rules.
// 2. Uploads studio-rules/toolkit/ (skill `aeros-artwork-studio`) and
//    studio-rules/pymupdf/ (skill `aeros-pymupdf`) to the Claude API as new
//    skill versions — only when their files changed since the last version.
// 3. Inserts a row in artwork_studio_rule_versions with status 'staged'.
//
// Nothing goes live until an admin presses Publish on /design/artwork-studio.
// Needs ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (read from
// aeros-catalog/.env.local when not already in the environment).

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import Anthropic, { toFile } from "@anthropic-ai/sdk";

const here = path.dirname(fileURLToPath(import.meta.url));
const CATALOG = path.resolve(here, "..");
const MASTER = path.resolve(CATALOG, "..", "studio-rules");

function loadEnvLocal() {
  const p = path.join(CATALOG, ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "__pycache__") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out.sort();
}

function shaOf(files, root) {
  const h = crypto.createHash("sha256");
  for (const f of files) {
    h.update(path.relative(root, f));
    h.update(fs.readFileSync(f));
  }
  return h.digest("hex").slice(0, 16);
}

const SUPA = () => ({
  url: process.env.SUPABASE_URL,
  headers: {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  },
});

async function lastVersion() {
  const { url, headers } = SUPA();
  const res = await fetch(
    `${url}/rest/v1/artwork_studio_rule_versions?select=*&order=version_no.desc&limit=1`,
    { headers },
  );
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return (await res.json())[0] || null;
}

// Upload a skill folder as a new version (or create the skill the first time).
// The folder's own name becomes the top-level directory inside the upload.
async function uploadSkill(client, dir, skillName, knownId) {
  const files = walk(dir);
  const bytes = files.reduce((n, f) => n + fs.statSync(f).size, 0);
  if (bytes > 29 * 1024 * 1024) throw new Error(`${skillName}: ${(bytes / 1e6).toFixed(1)} MB — over the 30 MB skill limit`);
  const uploads = await Promise.all(
    files.map((f) => toFile(fs.createReadStream(f), `${skillName}/${path.relative(dir, f)}`)),
  );
  let id = knownId;
  if (!id) {
    for await (const s of client.skills.list({ source: "custom" })) {
      if (s.display_name === skillName) { id = s.id; break; }
    }
  }
  if (id) {
    const v = await client.skills.versions.create(id, { files: uploads });
    // container.skills pins a custom skill by its version ID (skver_…)
    return { id, version: v.id, bytes };
  }
  const s = await client.skills.create({ files: uploads, display_name: skillName });
  return { id: s.id, version: s.latest_version_id, bytes };
}

async function main() {
  loadEnvLocal();
  for (const k of ["ANTHROPIC_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!process.env[k]) throw new Error(`${k} missing`);
  }
  const notes = process.argv.slice(2).join(" ") || null;

  const rulesDir = path.join(MASTER, "rules");
  const ruleFiles = fs.readdirSync(rulesDir).filter((f) => f.endsWith(".md")).sort();
  if (!ruleFiles.length) throw new Error(`No rules in ${rulesDir}`);
  const rules = ruleFiles.map((file) => ({ file, content: fs.readFileSync(path.join(rulesDir, file), "utf8") }));
  const rulesSha = shaOf(ruleFiles.map((f) => path.join(rulesDir, f)), rulesDir);

  const toolkitDir = path.join(MASTER, "toolkit");
  const pymupdfDir = path.join(MASTER, "pymupdf");
  const toolkitSha = shaOf(walk(toolkitDir), toolkitDir);
  const pymupdfSha = shaOf(walk(pymupdfDir), pymupdfDir);

  const prev = await lastVersion();
  const client = new Anthropic();

  let toolkit = { id: prev?.toolkit_skill_id, version: prev?.toolkit_skill_version };
  if (!prev || prev.shas?.toolkit !== toolkitSha || !toolkit.id) {
    console.log("Uploading toolkit skill (aeros-artwork-studio)…");
    toolkit = await uploadSkill(client, toolkitDir, "aeros-artwork-studio", prev?.toolkit_skill_id);
    console.log(`  ${toolkit.id} @ ${toolkit.version} (${(toolkit.bytes / 1e6).toFixed(1)} MB)`);
  } else console.log("Toolkit unchanged — reusing", toolkit.id, toolkit.version);

  let pymupdf = { id: prev?.pymupdf_skill_id, version: prev?.pymupdf_skill_version };
  if (!prev || prev.shas?.pymupdf !== pymupdfSha || !pymupdf.id) {
    console.log("Uploading pymupdf skill (aeros-pymupdf)…");
    pymupdf = await uploadSkill(client, pymupdfDir, "aeros-pymupdf", prev?.pymupdf_skill_id);
    console.log(`  ${pymupdf.id} @ ${pymupdf.version} (${(pymupdf.bytes / 1e6).toFixed(1)} MB)`);
  } else console.log("PyMuPDF unchanged — reusing", pymupdf.id, pymupdf.version);

  if (prev && prev.rules_sha === rulesSha && prev.toolkit_skill_version === toolkit.version && prev.agent_id) {
    console.log(`Nothing changed since v${prev.version_no} — no new version staged.`);
    return;
  }

  // Managed Agents: one sandbox environment (no internet; the wheels ship in a
  // skill) and one agent whose every version = one rules version.
  const ENV_NAME = "aeros-artwork-studio";
  let environmentId = prev?.environment_id;
  if (!environmentId) {
    for await (const e of client.beta.environments.list()) {
      if (e.name === ENV_NAME && !e.archived_at) { environmentId = e.id; break; }
    }
  }
  if (!environmentId) {
    const env = await client.beta.environments.create({
      name: ENV_NAME,
      config: { type: "cloud", networking: { type: "limited", allow_package_managers: true, allow_mcp_servers: false } },
    });
    environmentId = env.id;
    console.log("Created environment", environmentId);
  }
  const agentConfig = {
    name: "Aeros Artwork Studio",
    model: { id: "claude-opus-5-5", effort: "high" },
    system: rules.map((r) => r.content).join("\n\n---\n\n"),
    skills: [
      { type: "custom", skill_id: toolkit.id, version: String(toolkit.version) },
      { type: "custom", skill_id: pymupdf.id, version: String(pymupdf.version) },
    ],
    tools: [{
      type: "agent_toolset_20260401",
      // the sandbox has no network and holds only this job's files: run unattended
      default_config: { enabled: true, permission_policy: { type: "always_allow" } },
      configs: [{ name: "web_fetch", enabled: false }, { name: "web_search", enabled: false }],
    }],
  };
  let agent;
  const agentId = prev?.agent_id;
  if (agentId) agent = await client.beta.agents.update(agentId, agentConfig);
  else agent = await client.beta.agents.create(agentConfig);
  console.log(`Agent ${agent.id} @ v${agent.version}`);

  const { url, headers } = SUPA();
  const res = await fetch(`${url}/rest/v1/artwork_studio_rule_versions`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify({
      status: "staged",
      rules,
      rules_sha: rulesSha,
      shas: { rules: rulesSha, toolkit: toolkitSha, pymupdf: pymupdfSha },
      toolkit_skill_id: toolkit.id,
      toolkit_skill_version: String(toolkit.version),
      pymupdf_skill_id: pymupdf.id,
      pymupdf_skill_version: String(pymupdf.version),
      notes,
      agent_id: agent.id,
      agent_version: agent.version,
      environment_id: environmentId,
      staged_by: process.env.USER || "script",
    }),
  });
  if (!res.ok) throw new Error(`Supabase insert ${res.status}: ${await res.text()}`);
  const [row] = await res.json();
  console.log(`\nStaged rules v${row.version_no} (${rules.length} files).`);
  console.log("Now open /design/artwork-studio → Rules → Publish to make it live for staff.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
