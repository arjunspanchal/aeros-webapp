"use client";
// Worker-facing punch clock. Two phases: login (phone + PIN) → clock. Big tap
// targets, minimal chrome — works on a shared tablet at the gate or on each
// worker's own phone. Auth = phone + a 4–6 digit PIN a manager sets (no SMS).
import { useCallback, useEffect, useState } from "react";
import { Input, Button } from "@/app/components/ui";

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// Best-effort device location for a punch. Resolves null (never rejects) if the
// browser has no geolocation, the worker denies it, or it doesn't fix within
// the timeout — the punch then goes through without coordinates.
function getPosition() {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  });
}

function prettyDate(ymd) {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long",
  });
}

export default function ClockClient({ initialSignedIn }) {
  const [phase, setPhase] = useState(initialSignedIn ? "loading" : "login");
  // identifier = phone number OR employee code — either signs the worker in.
  const [identifier, setIdentifier] = useState("");
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [err, setErr] = useState("");
  const [flash, setFlash] = useState("");

  const loadStatus = useCallback(async () => {
    const res = await fetch("/api/hr/clock/status", { cache: "no-store" });
    if (!res.ok) {
      // Session gone / inactive — fall back to sign-in.
      setStatus(null);
      setPhase("login");
      return;
    }
    setStatus(await res.json());
    setPhase("clock");
  }, []);

  useEffect(() => {
    if (initialSignedIn) loadStatus();
  }, [initialSignedIn, loadStatus]);

  async function login(e) {
    e?.preventDefault();
    setErr(""); setBusy(true);
    const { ok, data } = await postJson("/api/hr/clock/login", { identifier, pin });
    setBusy(false);
    if (!ok) { setErr(data.error || "Invalid phone or PIN."); return; }
    setPin("");
    await loadStatus();
  }

  async function punch(action) {
    setErr(""); setFlash(""); setBusy(true);
    // Grab location first (best-effort). The punch still records if it's null.
    setLocating(true);
    const pos = await getPosition();
    setLocating(false);
    const { ok, data } = await postJson("/api/hr/clock/punch", { action, ...(pos || {}) });
    setBusy(false);
    if (!ok) {
      // 409 = already in/out — refresh so the UI reflects reality, surface msg.
      setErr(data.error || "Could not record punch.");
      await loadStatus();
      return;
    }
    const locNote = data.located ? " 📍 Location recorded." : " (Location not shared.)";
    setFlash(
      (action === "in"
        ? (data.late ? `Checked in at ${data.inTime} — you're marked late.` : "Checked in. Have a good shift!")
        : "Checked out. See you tomorrow!") + locNote,
    );
    await loadStatus();
  }

  async function signOut() {
    await postJson("/api/hr/clock/logout", {});
    setStatus(null); setIdentifier(""); setPin(""); setErr(""); setFlash("");
    setPhase("login");
  }

  return (
    <main className="min-h-[70vh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <p className="font-mono text-[11px] uppercase tracking-widest text-ink-400">
            AEROS · ATTENDANCE
          </p>
          <h1 className="font-logo text-2xl text-ink-900 mt-1">Punch Clock</h1>
        </div>

        {err && (
          <p className="text-sm text-red-600 bg-red-50/60 border-l-2 border-red-600 px-3 py-2 mb-4 rounded-sm">
            {err}
          </p>
        )}
        {flash && !err && (
          <p className="text-sm text-emerald-700 bg-emerald-50/60 border-l-2 border-emerald-600 px-3 py-2 mb-4 rounded-sm">
            {flash}
          </p>
        )}

        {phase === "loading" && (
          <p className="text-center text-sm text-ink-500">Loading…</p>
        )}

        {phase === "login" && (
          <form onSubmit={login} className="space-y-4">
            <Input
              label="Phone number or employee code"
              type="text"
              autoCapitalize="none"
              autoComplete="off"
              placeholder="98765 43210 or your code"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
            <Input
              label="PIN"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              mono
              placeholder="••••"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              className="text-center text-lg tracking-widest"
              required
            />
            <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full">
              {busy ? "Signing in…" : "Sign in"}
            </Button>
            <p className="text-xs text-center text-ink-500">
              Use the PIN your manager gave you. Forgot it? Ask them to reset it.
            </p>
          </form>
        )}

        {phase === "clock" && status && (
          <ClockFace status={status} busy={busy} locating={locating} onPunch={punch} onSignOut={signOut} />
        )}
      </div>
    </main>
  );
}

function ClockFace({ status, busy, locating, onPunch, onSignOut }) {
  const { employee, date, checkedIn, checkedOut, inTime, outTime, otHours } = status;
  const done = checkedIn && checkedOut;
  const btnLabel = (label) => (locating ? "📍 Locating…" : busy ? "…" : label);

  return (
    <div className="space-y-5">
      <div className="text-center">
        <p className="text-lg font-medium text-ink-900">Hi, {employee?.name || "there"}</p>
        {employee?.designation && (
          <p className="text-xs text-ink-500">{employee.designation}</p>
        )}
        <p className="text-sm text-ink-500 mt-1">{prettyDate(date)}</p>
      </div>

      {/* Today's state */}
      <div className="rounded-xl border border-ink-200 bg-white p-4 text-center">
        {!checkedIn && <p className="text-sm text-ink-600">You haven&apos;t checked in yet today.</p>}
        {checkedIn && !checkedOut && (
          <p className="text-sm text-ink-700">
            Checked in at <span className="font-mono font-semibold">{inTime}</span>
          </p>
        )}
        {done && (
          <div className="text-sm text-ink-700 space-y-0.5">
            <p>In <span className="font-mono font-semibold">{inTime}</span> · Out <span className="font-mono font-semibold">{outTime}</span></p>
            {employee?.otEligible && otHours > 0 && (
              <p className="text-emerald-700 font-medium">{otHours}h overtime recorded</p>
            )}
          </div>
        )}
      </div>

      {/* Primary action — big tap target */}
      {!checkedIn && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onPunch("in")}
          className="w-full h-20 rounded-2xl bg-emerald-600 text-white text-xl font-semibold hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 transition-colors"
        >
          {btnLabel("Check In")}
        </button>
      )}
      {checkedIn && !checkedOut && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onPunch("out")}
          className="w-full h-20 rounded-2xl bg-royal-600 text-white text-xl font-semibold hover:bg-royal-700 active:bg-royal-800 disabled:opacity-50 transition-colors"
        >
          {btnLabel("Check Out")}
        </button>
      )}
      {!done && (
        <p className="text-[11px] text-center text-ink-400">
          📍 Your location is recorded when you check in and out.
        </p>
      )}
      {done && (
        <div className="w-full h-20 rounded-2xl bg-ink-100 text-ink-500 text-lg font-medium flex items-center justify-center">
          Done for today ✓
        </div>
      )}

      <LeaveSection />

      <Button type="button" variant="tertiary" size="sm" onClick={onSignOut} className="w-full">
        Not you? Sign out
      </Button>
    </div>
  );
}

const LEAVE_STATUS_STYLE = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

// Worker self-service leave: request Paid/Unpaid leave and see their requests'
// status. HR approves in /hr/leaves; on approval it lands on attendance.
function LeaveSection() {
  const [open, setOpen] = useState(false);
  const [requests, setRequests] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState("PL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/hr/clock/leave", { cache: "no-store" });
    if (res.ok) setRequests((await res.json()).requests || []);
  }, []);

  useEffect(() => {
    if (open && requests === null) load();
  }, [open, requests, load]);

  async function submit(e) {
    e.preventDefault();
    setMsg(""); setBusy(true);
    const { ok, data } = await postJson("/api/hr/clock/leave", { type, fromDate: from, toDate: to, reason });
    setBusy(false);
    if (!ok) { setMsg(data.error || "Could not submit."); return; }
    setMsg("Request submitted — pending approval.");
    setFrom(""); setTo(""); setReason(""); setShowForm(false);
    load();
  }

  const pending = (requests || []).filter((r) => r.status === "pending").length;

  return (
    <div className="rounded-xl border border-ink-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-ink-800"
      >
        <span>🏖️ Leave{pending ? ` · ${pending} pending` : ""}</span>
        <span className="text-ink-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          {!showForm && (
            <button
              type="button"
              onClick={() => { setShowForm(true); setMsg(""); }}
              className="w-full text-sm font-medium px-3 py-2 rounded-md bg-sky-600 text-white hover:bg-sky-700"
            >
              + Request leave
            </button>
          )}

          {showForm && (
            <form onSubmit={submit} className="space-y-2">
              <div className="flex gap-2">
                {[{ v: "PL", l: "Paid" }, { v: "UL", l: "Unpaid" }].map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setType(o.v)}
                    className={`flex-1 text-sm font-medium px-2 py-2 rounded-md border ${type === o.v ? "border-sky-600 bg-sky-50 text-sky-700" : "border-ink-200 text-ink-500"}`}
                  >
                    {o.l} leave
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <label className="flex-1 text-xs text-ink-500">From
                  <input type="date" required value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-full h-10 px-2 rounded border border-ink-200 text-sm" />
                </label>
                <label className="flex-1 text-xs text-ink-500">To
                  <input type="date" required value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full h-10 px-2 rounded border border-ink-200 text-sm" />
                </label>
              </div>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason (optional)"
                className="w-full h-10 px-2 rounded border border-ink-200 text-sm"
              />
              <div className="flex gap-2">
                <button type="submit" disabled={busy} className="flex-1 text-sm font-medium px-3 py-2 rounded-md bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-40">
                  {busy ? "Submitting…" : "Submit"}
                </button>
                <button type="button" onClick={() => { setShowForm(false); setMsg(""); }} className="px-3 py-2 text-sm text-ink-500">Cancel</button>
              </div>
            </form>
          )}

          {msg && <p className="text-xs text-ink-600">{msg}</p>}

          {requests && requests.length > 0 && (
            <ul className="space-y-1.5 pt-1">
              {requests.slice(0, 5).map((r) => (
                <li key={r.id} className="flex items-center justify-between text-xs text-ink-600">
                  <span>{r.type === "PL" ? "Paid" : "Unpaid"} · {r.fromDate}{r.toDate !== r.fromDate ? `→${r.toDate}` : ""} · {r.days}d</span>
                  <span className={`px-1.5 py-0.5 rounded capitalize ${LEAVE_STATUS_STYLE[r.status] || ""}`}>{r.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
