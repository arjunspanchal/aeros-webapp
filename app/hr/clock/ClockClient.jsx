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
    const { ok, data } = await postJson("/api/hr/clock/punch", { action });
    setBusy(false);
    if (!ok) {
      // 409 = already in/out — refresh so the UI reflects reality, surface msg.
      setErr(data.error || "Could not record punch.");
      await loadStatus();
      return;
    }
    setFlash(
      action === "in"
        ? (data.late ? `Checked in at ${data.inTime} — you're marked late.` : "Checked in. Have a good shift!")
        : "Checked out. See you tomorrow!",
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
          <ClockFace status={status} busy={busy} onPunch={punch} onSignOut={signOut} />
        )}
      </div>
    </main>
  );
}

function ClockFace({ status, busy, onPunch, onSignOut }) {
  const { employee, date, checkedIn, checkedOut, inTime, outTime, otHours } = status;
  const done = checkedIn && checkedOut;

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
          {busy ? "…" : "Check In"}
        </button>
      )}
      {checkedIn && !checkedOut && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onPunch("out")}
          className="w-full h-20 rounded-2xl bg-royal-600 text-white text-xl font-semibold hover:bg-royal-700 active:bg-royal-800 disabled:opacity-50 transition-colors"
        >
          {busy ? "…" : "Check Out"}
        </button>
      )}
      {done && (
        <div className="w-full h-20 rounded-2xl bg-ink-100 text-ink-500 text-lg font-medium flex items-center justify-center">
          Done for today ✓
        </div>
      )}

      <Button type="button" variant="tertiary" size="sm" onClick={onSignOut} className="w-full">
        Not you? Sign out
      </Button>
    </div>
  );
}
