"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export const MAX_FILE_BYTES = 3 * 1024 * 1024; // mirrors the server cap
export const ACCEPT = ".pdf,.ai,.svg,.eps,.png,.jpg,.jpeg,.webp";

const inputCls =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500";
const labelCls = "mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300";
const cardCls = "rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900";
const btnPrimary =
  "rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300";
const btnGhost =
  "rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800";

export const STATUS = {
  draft: { label: "Draft", cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300" },
  running: { label: "Working…", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300" },
  needs_input: { label: "Needs your answer", cls: "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300" },
  ready: { label: "Proof ready", cls: "bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-300" },
  failed: { label: "Failed", cls: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300" },
};

export function StatusChip({ status, approved }) {
  const s = STATUS[status] || STATUS.draft;
  return (
    <span className="flex items-center gap-1">
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>{s.label}</span>
      {approved != null && (
        <span className="rounded-full bg-gray-900 px-2 py-0.5 text-[11px] font-medium text-white dark:bg-gray-100 dark:text-gray-900">
          Approved v{approved}
        </span>
      )}
    </span>
  );
}

export const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export default function StudioClient({ products, liveRules, me }) {
  const [tab, setTab] = useState("new");
  const tabs = [
    { key: "new", label: "New artwork" },
    { key: "jobs", label: me.canApprove ? "All jobs" : "My jobs" },
    ...(me.canApprove ? [{ key: "approve", label: "Needs approval" }] : []),
    ...(me.isAdmin ? [{ key: "admin", label: "Rules & spend" }] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1 dark:border-gray-800 dark:bg-gray-900">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                tab === t.key
                  ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                  : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {liveRules ? `Rules v${liveRules.version}` : "Rules not published yet"}
          {me.capInr != null && ` · today ${inr(me.spentTodayInr)} of ${inr(me.capInr)}`}
        </p>
      </div>

      {tab === "new" && <NewJobForm products={products} liveRules={liveRules} me={me} />}
      {tab === "jobs" && <JobList all={me.canApprove} />}
      {tab === "approve" && me.canApprove && <JobList all queue="approval" />}
      {tab === "admin" && me.isAdmin && <AdminPanel />}
    </div>
  );
}

function NewJobForm({ products, liveRules, me }) {
  const router = useRouter();
  const [f, setF] = useState({
    productKey: "",
    brand: "",
    channel: "direct",
    lid: "none",
    inkMode: "cmyk",
    pantones: "",
    pantoneGuide: "U",
    digitalSample: false,
    brief: "",
  });
  const [files, setFiles] = useState([]);          // [{file, role}]
  const [busy, setBusy] = useState("");
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const isSheet = !!products.find((p) => p.key === f.productKey)?.noLid;
  const families = useMemo(() => {
    const m = new Map();
    for (const p of products) m.set(p.family, [...(m.get(p.family) || []), p]);
    return [...m.entries()];
  }, [products]);

  const overCap = me.capInr != null && me.spentTodayInr >= me.capInr;
  const tooBig = files.map((x) => x.file).find((x) => x.size > MAX_FILE_BYTES);

  function addFiles(list, role) {
    setFiles((prev) => [...prev, ...Array.from(list || []).map((file) => ({ file, role }))].slice(0, 8));
  }
  const logos = files.filter((x) => x.role === "logo");
  const isVector = (name) => /\.(pdf|ai|svg|eps)$/i.test(name);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    const inks = f.inkMode === "cmyk" ? "CMYK (full colour)" : `Pantone (${f.pantoneGuide}): ${f.pantones}`;
    try {
      setBusy("Creating job…");
      const res = await fetch("/api/design/artwork-studio/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, inks }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not create job");
      const id = body.job.id;
      for (const [i, { file, role }] of files.entries()) {
        setBusy(`Uploading ${i + 1} of ${files.length}: ${file.name}`);
        const up = await fetch(`/api/design/artwork-studio/jobs/${id}/inputs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, contentType: file.type, fileBase64: await readAsBase64(file), role }),
        });
        if (!up.ok) throw new Error((await up.json().catch(() => ({}))).error || `Upload failed: ${file.name}`);
      }
      setBusy("Starting…");
      const run = await fetch(`/api/design/artwork-studio/jobs/${id}/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!run.ok) throw new Error((await run.json().catch(() => ({}))).error || "Could not start");
      router.push(`/design/artwork-studio/${id}`);
    } catch (err) {
      setError(err.message);
      setBusy("");
    }
  }

  const canSubmit =
    liveRules && !overCap && !tooBig && f.productKey && f.brand.trim() && (files.length > 0 || f.brief.trim()) &&
    (f.inkMode === "cmyk" || f.pantones.trim()) && !busy;

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-3">
      <div className={`${cardCls} space-y-4 lg:col-span-2`}>
        <div>
          <label className={labelCls}>Product</label>
          <select className={inputCls} value={f.productKey} onChange={set("productKey")} required>
            <option value="">Choose the product…</option>
            {families.map(([fam, list]) => (
              <optgroup key={fam} label={fam}>
                {list.map((p) => (
                  <option key={p.key} value={p.key} disabled={!!p.unavailable}>
                    {p.label}{p.unavailable ? ` — ${p.unavailable}` : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Brand / customer</label>
            <input className={inputCls} value={f.brand} onChange={set("brand")} placeholder="e.g. Penguin Bean" required />
          </div>
          <div>
            <label className={labelCls}>Who are we selling to?</label>
            <select className={inputCls} value={f.channel} onChange={set("channel")}>
              <option value="direct">Directly to the brand — Aeros mark goes on</option>
              <option value="dealer">Through a dealer — no Aeros branding</option>
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {!isSheet && (
          <div>
            <label className={labelCls}>Lid</label>
            <select className={inputCls} value={f.lid} onChange={set("lid")}>
              <option value="none">No lid</option>
              <option value="paper">Paper lid</option>
              <option value="PET">PET lid</option>
              <option value="PP">PP lid</option>
            </select>
          </div>
          )}
          {isSheet && (
          <div>
            <label className={labelCls}>Pattern</label>
            <p className="rounded-md border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-400">
              Deli wraps print as an all-over repeat: the logo in every tile, a small mark between the rows. Say in the brief if you want a second mark or a background colour.
            </p>
          </div>
          )}
          <div>
            <label className={labelCls}>Colours</label>
            <select className={inputCls} value={f.inkMode} onChange={set("inkMode")}>
              <option value="cmyk">Full colour (CMYK) — photos, gradients</option>
              <option value="pantone">Pantone spot colours (max 4)</option>
            </select>
          </div>
        </div>
        {f.inkMode === "pantone" && (
          <div>
            <label className={labelCls}>Pantone numbers</label>
            <div className="flex gap-2">
              <input className={inputCls} value={f.pantones} onChange={set("pantones")} placeholder="e.g. 7408, Black" />
              <select className={`${inputCls} w-auto`} value={f.pantoneGuide} onChange={set("pantoneGuide")} aria-label="Pantone guide">
                <option value="U">U (uncoated)</option>
                <option value="C">C (coated)</option>
              </select>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Don't know them? Switch to CMYK, or write "match the logo" and Claude will suggest the closest.
            </p>
          </div>
        )}

        <div>
          <label className={labelCls}>Design brief</label>
          <textarea
            className={`${inputCls} min-h-[120px]`}
            value={f.brief}
            onChange={set("brief")}
            placeholder={isSheet ? "e.g. Logo about 45 mm, small leaf mark between the rows, one colour navy. Any background colour?" : "What should the cup look like? e.g. Kraft look, logo centred on the front, Instagram handle small at the bottom, background colour from the logo."}
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input type="checkbox" checked={f.digitalSample} onChange={set("digitalSample")} />
          Also make a digital sample file (13 × 19 in sheet)
        </label>
      </div>

      <div className="space-y-4">
        <UploadSlot
          title="Customer's logo"
          hint="The artwork that gets printed. A vector file (PDF, AI, SVG, EPS) prints sharp at any size; a PNG / JPG only makes a proof - the print file will wait for the vector."
          files={files.filter((x) => x.role === "logo")}
          onAdd={(l) => addFiles(l, "logo")}
          onRemove={(x) => setFiles(files.filter((y) => y !== x))}
          warn={logos.length > 0 && !logos.some((x) => isVector(x.file.name)) ? "No vector logo yet - the proof is fine, but ask the customer for the PDF / AI / SVG before print." : null}
        />
        <UploadSlot
          title="Reference (optional)"
          hint="A mockup, photo, old proof or brand guide - for layout and colours. Claude won't cut the logo out of it when a logo file is given."
          files={files.filter((x) => x.role === "reference")}
          onAdd={(l) => addFiles(l, "reference")}
          onRemove={(x) => setFiles(files.filter((y) => y !== x))}
        />

        <div className={cardCls}>
          {!liveRules && <p className="mb-3 text-xs text-red-600">Arjun hasn't published the Studio rules yet.</p>}
          {overCap && <p className="mb-3 text-xs text-red-600">Today's limit is used up. It resets at midnight.</p>}
          {tooBig && <p className="mb-3 text-xs text-red-600">{tooBig.name} is over 3 MB.</p>}
          {error && <p className="mb-3 text-xs text-red-600">{error}</p>}
          <button type="submit" className={`${btnPrimary} w-full`} disabled={!canSubmit}>
            {busy || "Make artwork"}
          </button>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Takes 3–8 minutes. You get a customer proof to share; the print file unlocks after Arjun or a factory manager approves.
          </p>
        </div>
      </div>
    </form>
  );
}

function UploadSlot({ title, hint, files, onAdd, onRemove, warn }) {
  return (
    <div
      className={`${cardCls} border-dashed`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); onAdd(e.dataTransfer.files); }}
    >
      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</p>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint} Max 3 MB each.</p>
      <input type="file" multiple accept={ACCEPT} onChange={(e) => { onAdd(e.target.files); e.target.value = ""; }} className="mt-3 block w-full text-xs" />
      {files.length > 0 && (
        <ul className="mt-3 space-y-1">
          {files.map((x, i) => (
            <li key={i} className="flex items-center justify-between gap-2 text-xs">
              <span className={`truncate ${x.file.size > MAX_FILE_BYTES ? "text-red-600" : "text-gray-700 dark:text-gray-300"}`}>
                {x.file.name} · {(x.file.size / 1024 / 1024).toFixed(1)} MB
              </span>
              <button type="button" className="text-gray-400 hover:text-gray-700" onClick={() => onRemove(x)}>✕</button>
            </li>
          ))}
        </ul>
      )}
      {warn && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{warn}</p>}
    </div>
  );
}

function JobList({ all, queue }) {
  const [jobs, setJobs] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    fetch(`/api/design/artwork-studio/jobs?${all ? "all=1" : ""}${queue ? `&queue=${queue}` : ""}`)
      .then((r) => r.json())
      .then((b) => (b.error ? setError(b.error) : setJobs(b.jobs)))
      .catch((e) => setError(e.message));
  }, [all, queue]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!jobs) return <p className="text-sm text-gray-500">Loading…</p>;
  if (!jobs.length) return <p className="text-sm text-gray-500 dark:text-gray-400">{queue ? "Nothing waiting for approval." : "No jobs yet."}</p>;
  return (
    <div className="space-y-2">
      {jobs.map((j) => (
        <a
          key={j.id}
          href={`/design/artwork-studio/${j.id}`}
          className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm hover:border-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-600"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
              {j.brand} <span className="font-normal text-gray-500">· {j.product_key}</span>
            </p>
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">
              {new Date(j.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
              {all && ` · ${j.created_by_name || j.created_by_email}`} · {inr(j.cost_inr)}
              {j.status === "running" && j.progress ? ` · ${j.progress}` : ""}
            </p>
          </div>
          <StatusChip status={j.status} approved={j.approved_version} />
        </a>
      ))}
    </div>
  );
}

function AdminPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = () =>
    fetch("/api/design/artwork-studio/admin")
      .then((r) => r.json())
      .then((b) => (b.error ? setError(b.error) : setData(b)))
      .catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function act(payload) {
    setBusy(payload.versionId || payload.flagId);
    const res = await fetch("/api/design/artwork-studio/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error || "Failed");
    await load();
    setBusy(null);
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <p className="text-sm text-gray-500">Loading…</p>;
  const openFlags = data.flags.filter((x) => x.status === "open");

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className={cardCls}>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Rules versions</h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Stage a new version from your Mac with <code className="font-mono">node aeros-catalog/scripts/publish-studio-rules.mjs "what changed"</code>,
          then publish it here. New jobs use the live version; running jobs keep theirs.
        </p>
        <ul className="mt-4 divide-y divide-gray-100 dark:divide-gray-800">
          {data.versions.length === 0 && <li className="py-2 text-xs text-gray-500">Nothing staged yet.</li>}
          {data.versions.map((v) => (
            <li key={v.id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0 text-xs">
                <p className="font-semibold text-gray-900 dark:text-gray-100">
                  v{v.version_no}{" "}
                  <span className={v.status === "live" ? "text-green-700 dark:text-green-400" : "text-gray-500"}>· {v.status}</span>
                </p>
                <p className="text-gray-500 dark:text-gray-400">
                  {v.notes || "no notes"} · {v.files.length} rule files · staged {new Date(v.staged_at).toLocaleDateString("en-IN")}
                  {v.published_at && ` · published by ${v.published_by}`}
                </p>
              </div>
              {v.status === "staged" && (
                <button className={btnGhost} disabled={busy === v.id} onClick={() => act({ action: "publish", versionId: v.id })}>
                  {busy === v.id ? "Publishing…" : "Publish"}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className={cardCls}>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Flags from staff ({openFlags.length} open)</h3>
        <ul className="mt-4 divide-y divide-gray-100 dark:divide-gray-800">
          {data.flags.length === 0 && <li className="py-2 text-xs text-gray-500">No flags.</li>}
          {data.flags.map((x) => (
            <li key={x.id} className="flex items-start justify-between gap-3 py-2 text-xs">
              <div className="min-w-0">
                <p className={x.status === "open" ? "text-gray-900 dark:text-gray-100" : "text-gray-400 line-through"}>{x.note}</p>
                <p className="text-gray-500 dark:text-gray-400">
                  {x.created_by_name} · {new Date(x.created_at).toLocaleDateString("en-IN")} ·{" "}
                  <a className="underline" href={`/design/artwork-studio/${x.job_id}`}>open job</a>
                </p>
              </div>
              {x.status === "open" && (
                <button className={btnGhost} disabled={busy === x.id} onClick={() => act({ action: "resolveFlag", flagId: x.id })}>
                  Resolved
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className={`${cardCls} lg:col-span-2`}>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Claude spend this month</h3>
        <table className="mt-3 w-full text-left text-xs">
          <thead className="text-gray-500 dark:text-gray-400">
            <tr><th className="py-1">Person</th><th>Today</th><th>This month</th><th>API calls</th></tr>
          </thead>
          <tbody className="text-gray-800 dark:text-gray-200">
            {data.spend.length === 0 && <tr><td className="py-2 text-gray-500" colSpan={4}>No spend yet.</td></tr>}
            {data.spend.map((s) => (
              <tr key={s.email} className="border-t border-gray-100 dark:border-gray-800">
                <td className="py-1.5">{s.email}</td><td>{inr(s.today)}</td><td>{inr(s.month)}</td><td>{s.calls}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
