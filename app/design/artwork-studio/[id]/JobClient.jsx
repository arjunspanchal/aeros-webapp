"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ACCEPT, MAX_FILE_BYTES, StatusChip, inr, readAsBase64 } from "../StudioClient";

const Cup3DViewer = dynamic(() => import("./Cup3DViewer"), { ssr: false });

// One tap adds a line to the change request; "…" lines need finishing.
const QUICK_CHANGES = [
  "Make the logo bigger",
  "Make the logo smaller",
  "Move the logo up",
  "Move the logo down",
  "Put the logo on both sides of the cup",
  "Change the background colour to …",
  "Use only the colours from the logo",
  "Add this text: …",
  "Remove …",
  "Use the attached file instead of the old logo",
];

const cardCls = "rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900";
const inputCls =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100";
const btnPrimary =
  "rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300";
const btnGhost =
  "rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800";

const KIND_LABEL = {
  proof: "Customer proof",
  check: "Curve / gate check",
  print: "Print file",
  print4up: "Press sheet (4-up)",
  sample: "Digital sample (13 × 19 in)",
  preview: "Preview image",
  result: "Result data",
  wrap: "Unrolled artwork (texture)",
  render: "3D render",
  other: "File",
};

const fileUrl = (jobId, name) => `/api/design/artwork-studio/jobs/${jobId}/files?name=${encodeURIComponent(name)}`;

export default function JobClient({ jobId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagNote, setFlagNote] = useState("");
  const [sendTo, setSendTo] = useState("");
  const [sendCc, setSendCc] = useState("");
  const [sendNote, setSendNote] = useState("");
  const [sending2, setSending2] = useState(false);
  const [notice, setNotice] = useState(null);
  const [uploading, setUploading] = useState("");
  const resuming = useRef(false);
  const fileInput = useRef(null);
  const viewer = useRef(null);
  const [view, setView] = useState("proof");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/design/artwork-studio/jobs/${jobId}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Load failed");
      setData(body);
      // A long turn parks itself between serverless calls — kick the next leg.
      if (body.job.continuePending && !resuming.current) {
        resuming.current = true;
        await fetch(`/api/design/artwork-studio/jobs/${jobId}/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resume: true }),
        }).catch(() => {});
        resuming.current = false;
      }
    } catch (e) {
      setError(e.message);
    }
  }, [jobId]);

  useEffect(() => { load(); }, [load]);
  const running = data?.job.status === "running";
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [running, load]);

  async function post(path, payload) {
    const res = await fetch(`/api/design/artwork-studio/jobs/${jobId}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Failed");
    return body;
  }

  function addChange(text) {
    setMessage((m) => (m.trim() ? `${m.trimEnd()}\n- ${text}` : `- ${text}`));
  }

  const attachRole = useRef("logo");
  async function attach(list) {
    setNotice(null);
    for (const file of Array.from(list || [])) {
      if (file.size > MAX_FILE_BYTES) {
        setNotice(`${file.name} is over 3 MB.`);
        continue;
      }
      setUploading(`Uploading ${file.name}…`);
      try {
        await post("inputs", { filename: file.name, contentType: file.type, fileBase64: await readAsBase64(file), role: attachRole.current });
      } catch (err) {
        setNotice(err.message);
      }
    }
    setUploading("");
    if (fileInput.current) fileInput.current.value = "";
    await load();
  }

  async function send(e) {
    e?.preventDefault();
    setSending(true);
    setNotice(null);
    try {
      await post("run", { message: message.trim() || "Use the attached file(s) — see what changed and update the artwork." });
      setMessage("");
      await load();
    } catch (err) {
      setNotice(err.message);
    } finally {
      setSending(false);
    }
  }

  function download3d() {
    const url = viewer.current?.toPng(2);
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${job.brand.replace(/[^A-Za-z0-9]+/g, "-")}_${job.productKey}_3D.png`;
    a.click();
  }

  async function retry() {
    setNotice(null);
    try {
      await post("run", { message: "The last run stopped. Please continue from where you were and finish the job." });
      await load();
    } catch (err) {
      setNotice(err.message);
    }
  }

  async function approve() {
    try {
      const b = await post("approve");
      setNotice(`Approved v${b.approvedVersion} — the print file is now unlocked for staff.`);
      await load();
    } catch (err) {
      setNotice(err.message);
    }
  }

  async function sendProof(e) {
    e.preventDefault();
    setSending2(true);
    setNotice(null);
    try {
      await post("send", { to: sendTo, cc: sendCc, note: sendNote });
      setNotice(`Proof v${latest} emailed to ${sendTo}.`);
      setSendNote("");
      await load();
    } catch (err) {
      setNotice(err.message);
    } finally {
      setSending2(false);
    }
  }

  function copyVectorRequest() {
    const msg = `Hi, this is ${me.name || "Aeros"} from Aeros. To print your ${job.brand} cups sharp we need the original logo as a vector file - a PDF, AI, SVG or EPS exported from the design software (not a JPG/PNG/screenshot). Could you send it over, or ask your designer to? Thank you!`;
    navigator.clipboard?.writeText(msg).then(() => setNotice("Message copied - paste it into WhatsApp or email."), () => setNotice(msg));
  }

  async function flag(e) {
    e.preventDefault();
    try {
      await post("flag", { note: flagNote });
      setFlagOpen(false);
      setFlagNote("");
      setNotice("Thanks — Arjun will see this and fix the rule.");
    } catch (err) {
      setNotice(err.message);
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <p className="text-sm text-gray-500">Loading…</p>;
  const { job, me } = data;

  const versions = [...new Set(job.outputs.map((o) => o.version).filter((v) => v != null))].sort((a, b) => b - a);
  const latest = versions[0];
  const preview = job.outputs.findLast((o) => o.kind === "preview");
  const hasPrint = job.outputs.some((o) => o.kind === "print");
  const shownView = job.cup3d ? view : "proof";   // flat sheets have no 3D cup
  const firstRun = job.chat.length === 0;
  const pendingFiles = job.inputs.filter((i) => i.pending);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <a href="/design/artwork-studio" className="text-xs text-gray-500 hover:underline">← Artwork Studio</a>
          <h2 className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">{job.brand}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {job.product} · {job.channel === "dealer" ? "dealer (no Aeros mark)" : "direct (Aeros mark)"} · lid: {job.lid} · {job.inks}
            {" · "}by {job.createdBy} · {inr(job.costInr)} so far
          </p>
        </div>
        <StatusChip status={job.status} approved={job.approvedVersion} />
      </div>

      {notice && (
        <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
          {notice}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <section className={cardCls}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex gap-1">
                {(job.cup3d ? ["proof", "3d"] : ["proof"]).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                      shownView === v ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900" : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                    }`}
                  >
                    {v === "proof" ? "Proof" : "3D cup"}
                  </button>
                ))}
              </div>
              {shownView === "3d" && job.wrap && (
                <button className={btnGhost} onClick={download3d}>Download PNG</button>
              )}
            </div>
            {shownView === "3d" ? (
              job.cup3d ? (
                <div>
                  <Cup3DViewer ref={viewer} wrapUrl={job.wrap ? fileUrl(jobId, job.wrap) : null} cup={job.cup3d} />
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Drag to turn, scroll to zoom. A quick preview{job.cup3dApprox ? " on an approximate cup shape" : ""} — the proof is the placement truth.
                    {!job.wrap && " No artwork texture yet: it appears once a version is made."}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-500">No 3D shape for this product.</p>
              )
            ) : preview ? (
              <a href={fileUrl(jobId, preview.name)} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fileUrl(jobId, preview.name)} alt="Proof preview" className="w-full rounded border border-gray-100 dark:border-gray-800" />
              </a>
            ) : (
              <div className="flex h-64 items-center justify-center rounded border border-dashed border-gray-300 text-sm text-gray-500 dark:border-gray-700">
                {running ? "Building the artwork… this usually takes 3–8 minutes." : "No proof yet."}
              </div>
            )}
            {running && (
              <p className="mt-3 animate-pulse text-xs text-gray-600 dark:text-gray-300">{job.progress || "Working…"}</p>
            )}
            {job.status === "failed" && (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                <span>{job.error}</span>
                <button className={btnGhost} onClick={retry}>Retry</button>
              </div>
            )}
            {job.result?.summary && <p className="mt-3 text-sm text-gray-800 dark:text-gray-200">{job.result.summary}</p>}
            {job.needsVectorLogo && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                <span><strong>Vector logo needed before print.</strong> This proof is fine to share; the print file waits for the customer's PDF / AI / SVG. Attach it here when it arrives.</span>
                <button type="button" className={btnGhost} onClick={copyVectorRequest}>Copy request to customer</button>
              </div>
            )}
            {job.result?.warnings?.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-800 dark:text-amber-300">
                {job.result.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
          </section>

          <section className={cardCls}>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Conversation</h3>
            <div className="mt-3 space-y-3">
              {firstRun && <p className="text-xs text-gray-500">Waiting for the first reply…</p>}
              {job.chat.map((m, i) => (
                <div key={i} className={m.role === "user" ? "text-right" : ""}>
                  <div
                    className={`inline-block max-w-[90%] whitespace-pre-wrap rounded-lg px-3 py-2 text-left text-sm ${
                      m.role === "user"
                        ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                        : "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                    }`}
                  >
                    {m.first ? `New artwork request${job.brief ? `: ${job.brief}` : ""}` : m.text}
                  </div>
                </div>
              ))}
            </div>
            {!firstRun && (
              <form onSubmit={send} className="mt-4 space-y-2">
                <textarea
                  className={`${inputCls} min-h-[80px]`}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={
                    job.status === "needs_input"
                      ? "Answer the questions above…"
                      : "List every change you want — one per line. Tap the buttons below to add common ones."
                  }
                  disabled={running}
                />
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_CHANGES.map((q) => (
                    <button
                      key={q}
                      type="button"
                      disabled={running}
                      onClick={() => addChange(q)}
                      className="rounded-full border border-gray-300 px-2.5 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                      + {q}
                    </button>
                  ))}
                </div>
                {(pendingFiles.length > 0 || uploading) && (
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {uploading || `Goes with your next message: ${pendingFiles.map((p) => p.name).join(", ")}`}
                  </p>
                )}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex gap-2">
                    <button type="button" className={btnGhost} onClick={() => { attachRole.current = "logo"; fileInput.current?.click(); }} disabled={running || !!uploading}>
                      Attach logo
                    </button>
                    <button type="button" className={btnGhost} onClick={() => { attachRole.current = "reference"; fileInput.current?.click(); }} disabled={running || !!uploading}>
                      Attach reference
                    </button>
                    <input ref={fileInput} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => attach(e.target.files)} />
                    <button type="button" className={btnGhost} onClick={() => setFlagOpen(!flagOpen)}>Flag a problem</button>
                  </div>
                  <button type="submit" className={btnPrimary} disabled={running || sending || !!uploading || (!message.trim() && pendingFiles.length === 0)}>
                    {sending ? "Sending…" : "Send"}
                  </button>
                </div>
              </form>
            )}
            {flagOpen && (
              <form onSubmit={flag} className="mt-3 space-y-2 rounded-md border border-gray-200 p-3 dark:border-gray-800">
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Tell Arjun what the Studio keeps getting wrong (e.g. "logo always too big on 16 oz"). He fixes the rule for everyone.
                </p>
                <textarea className={`${inputCls} min-h-[60px]`} value={flagNote} onChange={(e) => setFlagNote(e.target.value)} />
                <button type="submit" className={btnGhost} disabled={!flagNote.trim()}>Send flag</button>
              </form>
            )}
          </section>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <section className={cardCls}>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Files</h3>
            {versions.length === 0 && <p className="mt-2 text-xs text-gray-500">Nothing yet.</p>}
            {versions.map((v) => (
              <div key={v} className="mt-3">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                  Version {v}{v === latest ? " (latest)" : ""}{job.approvedVersion != null && v <= job.approvedVersion ? " · approved" : ""}
                </p>
                <ul className="mt-1 space-y-1">
                  {job.outputs.filter((o) => o.version === v && o.kind !== "result").map((o) => (
                    <li key={o.name} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-gray-800 dark:text-gray-200">{KIND_LABEL[o.kind]}</span>
                      {o.locked ? (
                        <span className="shrink-0 text-gray-400">Locked until approved</span>
                      ) : (
                        <a className="shrink-0 underline" href={fileUrl(jobId, o.name)} target="_blank" rel="noreferrer">Download</a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {me.canApprove && hasPrint && (job.approvedVersion == null || job.approvedVersion < latest) && (
              <button className={`${btnPrimary} mt-4 w-full`} onClick={approve} disabled={running}>
                Approve v{latest} for print
              </button>
            )}
          </section>

          {job.result?.gates?.length > 0 && (
            <section className={cardCls}>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Checks</h3>
              <ul className="mt-2 space-y-1 text-xs">
                {job.result.gates.map((g, i) => (
                  <li key={i} className="flex gap-2">
                    <span className={g.pass ? "text-green-700 dark:text-green-400" : "text-red-600"}>{g.pass ? "✓" : "✗"}</span>
                    <span className="text-gray-700 dark:text-gray-300">{g.name}{g.detail ? ` — ${g.detail}` : ""}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {job.outputs.some((o) => o.kind === "proof") && (
            <section className={cardCls}>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Send proof to customer</h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Emails the customer proof v{latest} only (never the print file), from Aeros, with your note.
              </p>
              <form onSubmit={sendProof} className="mt-3 space-y-2">
                <input className={inputCls} type="text" value={sendTo} onChange={(e) => setSendTo(e.target.value)} placeholder="customer@email.com" required />
                <input className={inputCls} type="text" value={sendCc} onChange={(e) => setSendCc(e.target.value)} placeholder="cc (optional, e.g. yourself)" />
                <textarea className={`${inputCls} min-h-[60px]`} value={sendNote} onChange={(e) => setSendNote(e.target.value)} placeholder="Short note (optional) - e.g. Please confirm the logo size and the green." />
                <button type="submit" className={`${btnPrimary} w-full`} disabled={sending2 || running || !sendTo.trim()}>
                  {sending2 ? "Sending…" : `Email proof v${latest}`}
                </button>
              </form>
              {job.sends?.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-gray-500 dark:text-gray-400">
                  {job.sends.map((x, i) => (
                    <li key={i}>v{x.version} sent to {x.to.join(", ")} by {x.by} · {new Date(x.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section className={cardCls}>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Uploaded</h3>
            <ul className="mt-2 space-y-1 text-xs text-gray-700 dark:text-gray-300">
              {job.inputs.length === 0 && <li className="text-gray-500">No files.</li>}
              {job.inputs.map((i, k) => (
                <li key={k} className="truncate">
                  <span className="mr-1 rounded bg-gray-100 px-1 text-[10px] uppercase text-gray-500 dark:bg-gray-800">{i.role === "reference" ? "ref" : "logo"}</span>
                  {i.name}{i.pending ? " · not sent yet" : ""}
                </li>
              ))}
            </ul>
            {me.capInr != null && (
              <p className="mt-3 text-xs text-gray-500">Your spend today: {inr(me.spentTodayInr)} of {inr(me.capInr)}</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
