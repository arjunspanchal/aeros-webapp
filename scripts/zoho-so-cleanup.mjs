#!/usr/bin/env node
// One-off Zoho sales-order clean-up (18-Nov-2026, Arjun approved the plan in
// "Aeros Documents/zoho-so-cleanup/Zoho SO clean-up plan 18-Nov-2026.xlsx").
// Same pattern as zoho-so-cleanup.mjs.
//
//   batch A  drafts / approved            → approve (drafts only), then void
//   batch B  confirmed, nothing done      → void
//   batch C  part invoiced, rest unshipped → cancel the open balance and close
//                                            (what Zoho's "Cancel Items" does: read
//                                            salesorders/forclose, then PUT
//                                            salesorders/status/closed)
// Zoho refuses any status change on an SO with no salesperson ("Salesperson
// cannot be empty"); those are logged as failed and left alone.
//
// Usage (from aeros-catalog):
//   node --env-file=.env.local scripts/zoho-so-cleanup.mjs dry
//   node --env-file=.env.local scripts/zoho-so-cleanup.mjs run A 1      ← one PO as a test
//   node --env-file=.env.local scripts/zoho-so-cleanup.mjs run A        ← the whole batch
//   node --env-file=.env.local scripts/zoho-so-cleanup.mjs run A,B,C:1  ← several batches on one code (C:1 = one PO of C)
//
// It asks for a Zoho code generated with scope ZohoBooks.salesorders.ALL.
// That access is held in memory only and revoked when the run ends; the app's
// own (mostly read-only) connection is not touched. Before each PO it re-reads
// it from Zoho and skips anything whose status changed since the plan. Every
// action is written to run-log.csv next to the plan.
import fs from "node:fs";
import readline from "node:readline";

const DIR = new URL("../../Aeros Documents/zoho-so-cleanup/", import.meta.url);
const ORG = process.env.ZOHO_ORG_ID, API = (process.env.ZOHO_API_URL || "https://www.zohoapis.in") + "/books/v3";
const ACC = process.env.ZOHO_ACCOUNTS_URL || "https://accounts.zoho.in";
const [mode = "dry", batchArg, limitArg] = process.argv.slice(2);
const batches = JSON.parse(fs.readFileSync(new URL("so-batches.json", DIR)));
const logFile = new URL("run-log.csv", DIR);
if (!fs.existsSync(logFile)) fs.writeFileSync(logFile, "time,batch,po,step,result,detail\n");
const log = (b, po, step, result, detail = "") => {
  const line = [new Date().toISOString(), b, po, step, result, `"${String(detail).replace(/"/g, "'")}"`].join(",");
  fs.appendFileSync(logFile, line + "\n"); console.log(line);
};
const doneBefore = new Set(fs.readFileSync(logFile, "utf8").split("\n").filter((l) => /,final,ok,/.test(l)).map((l) => l.split(",")[2]));

if (mode === "dry") {
  for (const k of ["A", "B", "C"]) console.log(`batch ${k}: ${batches[k].length} SOs, ${batches[k].filter((p) => doneBefore.has(p.number)).length} already done`);
  process.exit(0);
}
const plan = String(batchArg || "").split(",").filter(Boolean).map((x) => { const [b, n] = x.split(":"); return { b: b.toUpperCase(), n: Number(n || limitArg) || Infinity }; });
if (mode !== "run" || !plan.length || plan.some((x) => !["A", "B", "C"].includes(x.b))) { console.log("usage: dry | run A|B|C[:n][,…] [limit]"); process.exit(1); }

const ask = (q) => new Promise((res) => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, (a) => { rl.close(); res(a.trim()); }); });
const code = (await ask("Zoho code (scope ZohoBooks.salesorders.ALL): ")).replace(/\s+/g, "");
const tk = await (await fetch(`${ACC}/oauth/v2/token`, { method: "POST", body: new URLSearchParams({ grant_type: "authorization_code", client_id: process.env.ZOHO_CLIENT_ID, client_secret: process.env.ZOHO_CLIENT_SECRET, code }) })).json();
if (!tk.access_token) { console.log("Zoho refused the code:", tk.error || "unknown"); process.exit(1); }
const H = { Authorization: `Zoho-oauthtoken ${tk.access_token}` };
const call = async (method, path, form = null) => {
  const u = new URL(API + path); u.searchParams.set("organization_id", ORG);
  const opts = { method, headers: { ...H } };
  if (form) { opts.body = new URLSearchParams(form); opts.headers["Content-Type"] = "application/x-www-form-urlencoded"; }
  const r = await fetch(u, opts); const d = await r.json().catch(() => ({}));
  await new Promise((s) => setTimeout(s, 700)); // stay well under Zoho's rate limit
  return d;
};
const revoke = async () => { if (tk.refresh_token) await fetch(`${ACC}/oauth/v2/token/revoke?token=${tk.refresh_token}`, { method: "POST" }).catch(() => {}); };
process.on("SIGINT", async () => { await revoke(); console.log("\nstopped, access revoked"); process.exit(130); });

let ok = 0, skipped = 0, failed = 0;
for (const { b: batchArg, n } of plan) {
const todo = batches[batchArg].filter((p) => !doneBefore.has(p.number)).slice(0, n);
console.log(`batch ${batchArg}: ${todo.length} to do`);
for (const p of todo) {
  const cur = (await call("GET", `/salesorders/${p.id}`)).salesorder;
  if (!cur) { log(batchArg, p.number, "read", "failed", "not found"); failed++; continue; }
  const st = cur.order_status || cur.status;
  if (st !== p.status || (cur.invoiced_status || "") !== p.invoiced) { log(batchArg, p.number, "check", "skipped", `now ${st}/${cur.invoiced_status}, plan had ${p.status}/${p.invoiced}`); skipped++; continue; }
  if (!String(cur.salesperson_name || "").trim()) { log(batchArg, p.number, "check", "failed", "no salesperson; Zoho will refuse"); failed++; continue; }
  let good = true;
  if (batchArg === "C") {
    const fc = await call("GET", `/salesorders/forclose?salesorder_ids=${p.id}`);
    const lines = ((fc.salesorders || [])[0]?.line_items || []).filter((l) => Number(l.quantity_to_close) > 0)
      .map((l) => ({ line_item_id: l.line_item_id, qty_cancelled: Number(l.quantity_to_close) }));
    if (fc.code !== 0 || !lines.length) { log(batchArg, p.number, "read balance", "failed", fc.code !== 0 ? `${fc.code} ${fc.message}` : "nothing open to cancel"); failed++; continue; }
    const d = await call("PUT", "/salesorders/status/closed", { salesorder_ids: p.id, JSONString: JSON.stringify({ line_items: lines }) });
    if (d.code !== 0) { log(batchArg, p.number, "close", "failed", `${d.code} ${d.message}`); failed++; continue; }
    log(batchArg, p.number, "close", "ok", lines.map((l) => `${l.line_item_id}:${l.qty_cancelled}`).join(" "));
    log(batchArg, p.number, "final", "ok", "closed, open balance cancelled"); ok++; continue;
  }
  if (st === "draft") {
    const a = await call("POST", `/salesorders/${p.id}/approve`);
    if (a.code !== 0) { log(batchArg, p.number, "approve", "failed", `${a.code} ${a.message}`); failed++; continue; }
    log(batchArg, p.number, "approve", "ok");
  }
  const d = await call("POST", `/salesorders/${p.id}/status/void`);
  if (d.code !== 0) { log(batchArg, p.number, "void", "failed", `${d.code} ${d.message}`); good = false; }
  else log(batchArg, p.number, "void", "ok");
  if (good) { log(batchArg, p.number, "final", "ok", "void"); ok++; } else failed++;
}
}
await revoke();
console.log(`done: ${ok} voided or closed, ${skipped} skipped (changed since the plan), ${failed} failed. Access revoked. Log: Aeros Documents/zoho-so-cleanup/run-log.csv`);
