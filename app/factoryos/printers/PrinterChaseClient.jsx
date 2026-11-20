"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const shortDate = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "");
const num = (n) => (n == null ? "" : Number(n).toLocaleString("en-IN"));

// What the job is called in a message to the printer: the brand and the item.
// Never the customer's company name, never a rate.
function jobLine(j, i) {
  const what = [j.brand, j.item].filter(Boolean).join(", ");
  const due = j.daysLate === null
    ? "no date given yet"
    : j.daysLate > 0
      ? `was due ${shortDate(j.dueDate)}, ${j.daysLate} day${j.daysLate === 1 ? "" : "s"} late`
      : j.daysLate === 0 ? "due today" : `due ${shortDate(j.dueDate)}`;
  return `${i}. J# ${j.jNumber}: ${what}${j.qty ? `, ${num(j.qty)} pcs` : ""} (${due})`;
}

export function chaseMessage(group, jobs) {
  const first = group.contact ? group.contact.trim().split(/\s+/)[0] : "";
  const lines = [`${first ? `Hi ${first},` : "Hello,"} please share the status of these Aeros jobs with you:`, ""];
  jobs.forEach((j, i) => lines.push(jobLine(j, i + 1)));
  lines.push("", "Please reply with the date each one will reach us. Thank you.", "Aeros");
  return lines.join("\n");
}

async function patchJson(url, body) {
  try {
    const res = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, data } : { ok: false, error: data.error || `Could not save (${res.status})` };
  } catch {
    return { ok: false, error: "Could not reach the server. Check the connection and try again." };
  }
}

function DuePill({ j }) {
  if (j.daysLate === null) return <span className="rounded border border-dashed border-gray-300 px-1.5 py-0.5 text-[11px] text-gray-500 dark:border-gray-600 dark:text-gray-400">No due date</span>;
  if (j.daysLate > 0) return <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">{j.daysLate} d late · due {shortDate(j.dueDate)}</span>;
  if (j.daysLate === 0) return <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">Due today</span>;
  return <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-700 dark:bg-gray-800 dark:text-gray-300">Due {shortDate(j.dueDate)}</span>;
}

// Set or change the date the printed stock is due back.
function DueDateEdit({ j, onSaved }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(j.dueDate || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function save() {
    if (!date) return;
    setBusy(true); setErr("");
    const res = await patchJson(`/api/factoryos/jobs/${j.id}`, { printingDueDate: date });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setOpen(false);
    onSaved();
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded px-1.5 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-900/30">
        {j.dueDate ? "Change date" : "Set due date"}
      </button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <input type="date" aria-label={`Due date for job ${j.jNumber}`} value={date} onChange={(e) => setDate(e.target.value)} className="rounded border border-gray-300 bg-white px-1.5 py-1 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white" />
      <button type="button" disabled={busy || !date} onClick={save} className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
      <button type="button" onClick={() => { setOpen(false); setErr(""); }} className="rounded px-1.5 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
      {err && <span className="basis-full text-[11px] text-red-600 dark:text-red-400">{err}</span>}
    </span>
  );
}

function JobRow({ j, canEditDates, onSaved }) {
  const facts = [];
  if (j.vendorStatus) facts.push(`Printer says: ${j.vendorStatus}${j.vendorStatusOn ? ` (${shortDate(j.vendorStatusOn)})` : ""}`);
  if (j.vendorDate) facts.push(`Printer's date: ${shortDate(j.vendorDate)}`);
  if (j.inwardQty > 0) facts.push(`Part received: ${num(j.inwardQty)}${j.inwardUnit ? ` ${j.inwardUnit}` : ""}${j.inwardOn ? ` on ${shortDate(j.inwardOn)}` : ""}`);
  if (j.readyDate) facts.push(`Production ready date ${shortDate(j.readyDate)}${j.readyPassed ? " (passed)" : ""}`);
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Link href={`/factoryos/manager/${j.id}`} className="font-mono text-xs font-semibold text-indigo-700 hover:underline dark:text-indigo-300">J# {j.jNumber}</Link>
        <DuePill j={j} />
        {j.urgent && <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">Urgent</span>}
        {canEditDates && <DueDateEdit j={j} onSaved={onSaved} />}
      </div>
      <div className="mt-1 text-sm text-gray-900 dark:text-gray-100">
        {[j.brand, j.item].filter(Boolean).join(" · ") || "—"}
        {j.qty ? <span className="text-gray-500 dark:text-gray-400"> · {num(j.qty)} pcs</span> : null}
      </div>
      {facts.length > 0 && <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{facts.join(" · ")}</div>}
    </li>
  );
}

// Save the printer's WhatsApp number on the vendor (managers).
function PhoneEdit({ group, onSaved }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(group.phone || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function save() {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) { setErr("Enter the full mobile number."); return; }
    setBusy(true); setErr("");
    const res = await patchJson(`/api/factoryos/vendors/${group.vendorId}`, { phone: phone.trim() });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setOpen(false);
    onSaved();
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded px-1.5 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-900/30">
        {group.phone ? "Change number" : "Add WhatsApp number"}
      </button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <input type="tel" inputMode="tel" autoFocus aria-label={`WhatsApp number for ${group.name}`} placeholder="98xxxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-40 rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white" />
      <button type="button" disabled={busy} onClick={save} className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
      <button type="button" onClick={() => { setOpen(false); setErr(""); }} className="rounded px-1.5 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
      {err && <span className="basis-full text-[11px] text-red-600 dark:text-red-400">{err}</span>}
    </span>
  );
}

function PrinterCard({ group, canEditDates, canEditVendor, onSaved }) {
  const [lateOnly, setLateOnly] = useState(false);
  const [copied, setCopied] = useState(false);
  const chaseable = group.late + group.noDate;
  const inMessage = useMemo(
    () => (lateOnly ? group.jobs.filter((j) => j.daysLate === null || j.daysLate > 0) : group.jobs),
    [group.jobs, lateOnly],
  );
  const text = chaseMessage(group, inMessage);
  const href = `https://wa.me/${group.wa}?text=${encodeURIComponent(text)}`;
  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
  }
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <header className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">{group.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
              <span>{group.jobs.length} job{group.jobs.length === 1 ? "" : "s"}</span>
              {group.late > 0 && <span className="font-semibold text-red-600 dark:text-red-400">{group.late} late, worst {group.worst} days</span>}
              {group.noDate > 0 && <span className="text-amber-700 dark:text-amber-400">{group.noDate} with no due date</span>}
              {group.late === 0 && group.noDate === 0 && <span className="text-green-700 dark:text-green-400">all on time</span>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
              {group.contact && <span>{group.contact}</span>}
              {group.phone ? <span>{group.phone}</span> : group.vendorId ? <span>No WhatsApp number saved</span> : null}
              {canEditVendor && group.vendorId && <PhoneEdit group={group} onSaved={onSaved} />}
            </div>
          </div>
          {group.key !== "none" && (
            <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
              <div className="flex flex-wrap items-center gap-2">
                <a href={href} target="_blank" rel="noopener noreferrer" title={group.wa ? `Opens WhatsApp with the list written to ${group.name}` : "No number saved: WhatsApp will ask who to send it to"} className="inline-flex items-center justify-center rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700">
                  Send list on WhatsApp
                </a>
                <button type="button" onClick={copy} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
                  {copied ? "Copied" : "Copy message"}
                </button>
              </div>
              {chaseable > 0 && chaseable < group.jobs.length && (
                <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                  <input type="checkbox" checked={lateOnly} onChange={(e) => setLateOnly(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
                  Only late jobs and jobs with no date ({chaseable})
                </label>
              )}
              <span className="text-[11px] text-gray-500 dark:text-gray-400">{inMessage.length} job{inMessage.length === 1 ? "" : "s"} in the message. Nothing is sent until you press send in WhatsApp.</span>
            </div>
          )}
        </div>
        {group.key === "none" && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">These jobs are under printing with no printer chosen. Open the job and pick the printer.</p>}
      </header>
      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
        {group.jobs.map((j) => <JobRow key={j.id} j={j} canEditDates={canEditDates} onSaved={onSaved} />)}
      </ul>
    </section>
  );
}

export default function PrinterChaseClient({ data, canEditDates, canEditVendor }) {
  const router = useRouter();
  const [show, setShow] = useState("all");
  const refresh = () => router.refresh();
  const groups = useMemo(() => {
    if (show === "all") return data.groups;
    return data.groups
      .map((g) => ({ ...g, jobs: g.jobs.filter((j) => (show === "late" ? j.daysLate > 0 : j.daysLate === null)) }))
      .filter((g) => g.jobs.length);
  }, [data.groups, show]);
  const tabs = [
    { key: "all", label: `All (${data.totals.jobs})` },
    { key: "late", label: `Late (${data.totals.late})` },
    { key: "nodate", label: `No due date (${data.totals.noDate})` },
  ];
  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Printer chase</h1>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Every job that is with a printer, printer by printer. Send a printer the whole list in one WhatsApp message.
      </p>
      <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Which jobs to show">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={show === t.key} onClick={() => setShow(t.key)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${show === t.key ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-4 space-y-5">
        {groups.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            {data.totals.jobs === 0 ? "No job is with a printer right now." : "Nothing to show in this view."}
          </div>
        )}
        {groups.map((g) => {
          // Counts on the card follow what is shown.
          const late = g.jobs.filter((j) => j.daysLate > 0).length;
          const noDate = g.jobs.filter((j) => j.daysLate === null).length;
          const worst = Math.max(0, ...g.jobs.map((j) => j.daysLate || 0));
          return <PrinterCard key={g.key} group={{ ...g, late, noDate, worst }} canEditDates={canEditDates} canEditVendor={canEditVendor} onSaved={refresh} />;
        })}
      </div>
    </div>
  );
}
