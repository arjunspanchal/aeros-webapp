"use client";
// Worker-facing punch clock. Two phases: login (phone + PIN) → clock. Big tap
// targets, minimal chrome — works on a shared tablet at the gate or on each
// worker's own phone. Auth = phone + a 4–6 digit PIN a manager sets (no SMS).
//
// Bilingual: English + Hindi (Devanagari), toggled top-right and remembered per
// device (localStorage). All worker-facing copy lives in STR[lang]; server
// errors are re-localised from the structured flags the API returns, so the
// floor sees Hindi end-to-end without any server change.
import { useCallback, useEffect, useState } from "react";
import { Input, Button } from "@/app/components/ui";

const LANG_KEY = "aeros_clock_lang";

// Distance helper for the geofence error, localised unit suffix.
function fmtDist(m, km, metre) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} ${km}` : `${Math.round(m)} ${metre}`;
}

// All copy. Values are strings or functions (for interpolation). Time values
// are rendered in a mono span by the component, so the checked-in/out lines are
// split into pre/post fragments to handle the different word order in Hindi.
const STR = {
  en: {
    title: "Punch Clock",
    loading: "Loading…",
    idLabel: "Phone number or employee code",
    idPlaceholder: "98765 43210 or your code",
    pin: "PIN",
    signIn: "Sign in",
    signingIn: "Signing in…",
    pinHelp: "Use the PIN your manager gave you. Forgot it? Ask them to reset it.",
    loginInvalid: "Invalid phone or PIN.",
    hi: (name) => `Hi, ${name}`,
    there: "there",
    notCheckedIn: "You haven't checked in yet today.",
    checkedInPre: (y) => `Checked in ${y ? "yesterday " : ""}at `,
    checkedInPost: () => "",
    otInProgress: "Overtime in progress — check out when you finish.",
    inLabel: "In",
    outLabel: "Out",
    otRecorded: (n) => `${n}h overtime recorded`,
    checkIn: "Check In",
    checkOut: "Check Out",
    locating: "📍 Locating…",
    doneToday: "Done for today ✓",
    geoNoteWfo: "📍 You must be at the Bhiwandi office to check in or out. Allow location when asked.",
    geoNoteWfh: "📍 Your location is recorded when you check in and out.",
    signOut: "Not you? Sign out",
    // Flashes
    flashCheckedIn: "Checked in. Have a good shift!",
    flashCheckedInLate: (t) => `Checked in at ${t} — you're marked late.`,
    flashCheckedOut: "Checked out. See you tomorrow!",
    flashCheckedOutOt: (n, capped) =>
      `Checked out — ${n}h overtime recorded${capped ? " (capped at the OT cutoff)." : "."}`,
    flashCheckedOutCapped: "Checked out — shift was auto-capped at the OT cutoff.",
    locRecorded: " 📍 Location recorded.",
    locNotShared: " (Location not shared.)",
    // Punch errors
    errCouldNotPunch: "Could not record punch.",
    errNeedLocation:
      "Location required. Turn on GPS/location and allow it, then try again — office staff must punch at the Bhiwandi office.",
    errOutside: (m) =>
      `You appear to be about ${fmtDist(m, "km", "m")} from the office. Office staff must check in/out at the Bhiwandi factory.`,
    errOpenSince: (t) => `You're still checked in from yesterday (since ${t}). Check out first.`,
    errAlreadyIn: (t) => `Already checked in at ${t}.`,
    errAlreadyOut: (t) => `Already checked out at ${t}.`,
    // Leave
    leave: "🏖️ Leave",
    pendingN: (n) => ` · ${n} pending`,
    requestLeave: "+ Request leave",
    paidLeave: "Paid leave",
    unpaidLeave: "Unpaid leave",
    paidShort: "Paid",
    unpaidShort: "Unpaid",
    from: "From",
    to: "To",
    reasonOptional: "Reason (optional)",
    submit: "Submit",
    submitting: "Submitting…",
    cancel: "Cancel",
    leaveSubmitted: "Request submitted — pending approval.",
    leaveCouldNotSubmit: "Could not submit.",
    daysShort: (n) => `${n}d`,
    statusPending: "pending",
    statusApproved: "approved",
    statusRejected: "rejected",
    locale: "en-IN",
  },
  hi: {
    title: "हाज़िरी क्लॉक",
    loading: "लोड हो रहा है…",
    idLabel: "फ़ोन नंबर या कर्मचारी कोड",
    idPlaceholder: "98765 43210 या आपका कोड",
    pin: "पिन",
    signIn: "साइन इन करें",
    signingIn: "साइन इन हो रहा है…",
    pinHelp: "अपने मैनेजर से मिला पिन इस्तेमाल करें। भूल गए? उनसे रीसेट करवाएँ।",
    loginInvalid: "ग़लत फ़ोन या पिन।",
    hi: (name) => `नमस्ते, ${name}`,
    there: "जी",
    notCheckedIn: "आपने आज अभी तक चेक-इन नहीं किया है।",
    checkedInPre: () => "",
    checkedInPost: (y) => ` बजे${y ? " कल" : ""} चेक-इन किया गया`,
    otInProgress: "ओवरटाइम चल रहा है — काम ख़त्म होने पर चेक-आउट करें।",
    inLabel: "चेक-इन",
    outLabel: "चेक-आउट",
    otRecorded: (n) => `${n} घंटे ओवरटाइम दर्ज हुआ`,
    checkIn: "चेक-इन करें",
    checkOut: "चेक-आउट करें",
    locating: "📍 लोकेशन ले रहे हैं…",
    doneToday: "आज के लिए पूरा ✓",
    geoNoteWfo: "📍 चेक-इन/चेक-आउट के लिए आपको भिवंडी ऑफ़िस में होना ज़रूरी है। पूछे जाने पर लोकेशन की अनुमति दें।",
    geoNoteWfh: "📍 चेक-इन और चेक-आउट के समय आपकी लोकेशन दर्ज होती है।",
    signOut: "आप नहीं? साइन आउट करें",
    // Flashes
    flashCheckedIn: "चेक-इन हो गया। आपकी शिफ्ट अच्छी रहे!",
    flashCheckedInLate: (t) => `${t} बजे चेक-इन — आप लेट दर्ज हुए हैं।`,
    flashCheckedOut: "चेक-आउट हो गया। कल मिलते हैं!",
    flashCheckedOutOt: (n, capped) =>
      `चेक-आउट हो गया — ${n} घंटे ओवरटाइम दर्ज${capped ? " (OT कट-ऑफ़ पर सीमित)।" : "।"}`,
    flashCheckedOutCapped: "चेक-आउट — शिफ्ट OT कट-ऑफ़ पर अपने-आप सीमित कर दी गई।",
    locRecorded: " 📍 लोकेशन दर्ज हुई।",
    locNotShared: " (लोकेशन साझा नहीं हुई।)",
    // Punch errors
    errCouldNotPunch: "पंच दर्ज नहीं हो सका।",
    errNeedLocation:
      "लोकेशन ज़रूरी है। GPS/लोकेशन चालू करके अनुमति दें, फिर कोशिश करें — ऑफ़िस स्टाफ़ को भिवंडी ऑफ़िस में ही पंच करना है।",
    errOutside: (m) =>
      `आप ऑफ़िस से लगभग ${fmtDist(m, "किमी", "मीटर")} दूर लगते हैं। ऑफ़िस स्टाफ़ को भिवंडी फ़ैक्ट्री में ही चेक-इन/आउट करना है।`,
    errOpenSince: (t) => `आप कल से (${t} बजे से) अभी भी चेक-इन हैं। पहले चेक-आउट करें।`,
    errAlreadyIn: (t) => `आप पहले ही ${t} बजे चेक-इन कर चुके हैं।`,
    errAlreadyOut: (t) => `आप पहले ही ${t} बजे चेक-आउट कर चुके हैं।`,
    // Leave
    leave: "🏖️ छुट्टी",
    pendingN: (n) => ` · ${n} लंबित`,
    requestLeave: "+ छुट्टी के लिए आवेदन",
    paidLeave: "सवेतन छुट्टी",
    unpaidLeave: "अवैतनिक छुट्टी",
    paidShort: "सवेतन",
    unpaidShort: "अवैतनिक",
    from: "से",
    to: "तक",
    reasonOptional: "कारण (वैकल्पिक)",
    submit: "जमा करें",
    submitting: "जमा हो रहा है…",
    cancel: "रद्द करें",
    leaveSubmitted: "आवेदन जमा हुआ — मंज़ूरी बाक़ी है।",
    leaveCouldNotSubmit: "जमा नहीं हो सका।",
    daysShort: (n) => `${n} दिन`,
    statusPending: "लंबित",
    statusApproved: "मंज़ूर",
    statusRejected: "अस्वीकृत",
    locale: "hi-IN",
  },
};

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

function prettyDate(ymd, locale) {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, {
    weekday: "long", day: "numeric", month: "long",
  });
}

// Localise a failed-punch response using the API's structured flags, so Hindi
// users get Hindi even though the server sends English in `error`.
function punchErrorMsg(data, t) {
  if (data.needLocation) return t.errNeedLocation;
  if (data.outsideGeofence && data.distanceM != null) return t.errOutside(data.distanceM);
  if (data.openSince) return t.errOpenSince(data.openSince);
  if (data.inTime) return t.errAlreadyIn(data.inTime);
  if (data.outTime) return t.errAlreadyOut(data.outTime);
  return data.error || t.errCouldNotPunch;
}

export default function ClockClient({ initialSignedIn }) {
  const [lang, setLang] = useState("en");
  const t = STR[lang];

  // Restore the device's saved language after mount (avoids SSR mismatch).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved === "hi" || saved === "en") setLang(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const changeLang = useCallback((next) => {
    setLang(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

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
    const { ok } = await postJson("/api/hr/clock/login", { identifier, pin });
    setBusy(false);
    if (!ok) { setErr(t.loginInvalid); return; }
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
      setErr(punchErrorMsg(data, t));
      await loadStatus();
      return;
    }
    const locNote = data.located ? t.locRecorded : t.locNotShared;
    let msg;
    if (action === "in") {
      msg = data.late ? t.flashCheckedInLate(data.inTime) : t.flashCheckedIn;
    } else if (data.otHours > 0) {
      msg = t.flashCheckedOutOt(data.otHours, data.capped);
    } else if (data.capped) {
      msg = t.flashCheckedOutCapped;
    } else {
      msg = t.flashCheckedOut;
    }
    setFlash(msg + locNote);
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
        <div className="flex justify-end mb-3">
          <LangToggle lang={lang} onChange={changeLang} />
        </div>

        <div className="text-center mb-6">
          <p className="font-mono text-[11px] uppercase tracking-widest text-ink-400">
            AEROS · ATTENDANCE
          </p>
          <h1 className="font-logo text-2xl text-ink-900 mt-1">{t.title}</h1>
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
          <p className="text-center text-sm text-ink-500">{t.loading}</p>
        )}

        {phase === "login" && (
          <form onSubmit={login} className="space-y-4">
            <Input
              label={t.idLabel}
              type="text"
              autoCapitalize="none"
              autoComplete="off"
              placeholder={t.idPlaceholder}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
            <Input
              label={t.pin}
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
              {busy ? t.signingIn : t.signIn}
            </Button>
            <p className="text-xs text-center text-ink-500">{t.pinHelp}</p>
          </form>
        )}

        {phase === "clock" && status && (
          <ClockFace status={status} busy={busy} locating={locating} t={t} onPunch={punch} onSignOut={signOut} />
        )}
      </div>
    </main>
  );
}

function LangToggle({ lang, onChange }) {
  const cls = (on) =>
    `px-3 py-1 text-xs font-medium transition-colors ${
      on ? "bg-ink-900 text-white" : "bg-white text-ink-500 hover:bg-ink-50"
    }`;
  return (
    <div className="inline-flex rounded-full border border-ink-200 overflow-hidden" role="group" aria-label="Language">
      <button type="button" onClick={() => onChange("en")} className={cls(lang === "en")}>
        EN
      </button>
      <button type="button" onClick={() => onChange("hi")} className={cls(lang === "hi")}>
        हिं
      </button>
    </div>
  );
}

function ClockFace({ status, busy, locating, t, onPunch, onSignOut }) {
  const { employee, date, checkedIn, checkedOut, inTime, outTime, otHours, inYesterday } = status;
  const done = checkedIn && checkedOut;
  const wfo = String(employee?.workMode || "WFO").toUpperCase() !== "WFH";
  const btnLabel = (label) => (locating ? t.locating : busy ? "…" : label);

  return (
    <div className="space-y-5">
      <div className="text-center">
        <p className="text-lg font-medium text-ink-900">{t.hi(employee?.name || t.there)}</p>
        {employee?.designation && (
          <p className="text-xs text-ink-500">{employee.designation}</p>
        )}
        <p className="text-sm text-ink-500 mt-1">{prettyDate(date, t.locale)}</p>
      </div>

      {/* Today's state */}
      <div className="rounded-xl border border-ink-200 bg-white p-4 text-center">
        {!checkedIn && <p className="text-sm text-ink-600">{t.notCheckedIn}</p>}
        {checkedIn && !checkedOut && (
          <div className="text-sm text-ink-700 space-y-0.5">
            <p>
              {t.checkedInPre(inYesterday)}
              <span className="font-mono font-semibold">{inTime}</span>
              {t.checkedInPost(inYesterday)}
            </p>
            {inYesterday && employee?.otEligible && (
              <p className="text-emerald-700 font-medium">{t.otInProgress}</p>
            )}
          </div>
        )}
        {done && (
          <div className="text-sm text-ink-700 space-y-0.5">
            <p>
              {t.inLabel} <span className="font-mono font-semibold">{inTime}</span> · {t.outLabel}{" "}
              <span className="font-mono font-semibold">{outTime}</span>
            </p>
            {employee?.otEligible && otHours > 0 && (
              <p className="text-emerald-700 font-medium">{t.otRecorded(otHours)}</p>
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
          {btnLabel(t.checkIn)}
        </button>
      )}
      {checkedIn && !checkedOut && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onPunch("out")}
          className="w-full h-20 rounded-2xl bg-royal-600 text-white text-xl font-semibold hover:bg-royal-700 active:bg-royal-800 disabled:opacity-50 transition-colors"
        >
          {btnLabel(t.checkOut)}
        </button>
      )}
      {!done && (
        <p className="text-[11px] text-center text-ink-400">
          {wfo ? t.geoNoteWfo : t.geoNoteWfh}
        </p>
      )}
      {done && (
        <div className="w-full h-20 rounded-2xl bg-ink-100 text-ink-500 text-lg font-medium flex items-center justify-center">
          {t.doneToday}
        </div>
      )}

      <LeaveSection t={t} />

      <Button type="button" variant="tertiary" size="sm" onClick={onSignOut} className="w-full">
        {t.signOut}
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
function LeaveSection({ t }) {
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
    const { ok } = await postJson("/api/hr/clock/leave", { type, fromDate: from, toDate: to, reason });
    setBusy(false);
    if (!ok) { setMsg(t.leaveCouldNotSubmit); return; }
    setMsg(t.leaveSubmitted);
    setFrom(""); setTo(""); setReason(""); setShowForm(false);
    load();
  }

  const statusLabel = (s) =>
    s === "approved" ? t.statusApproved : s === "rejected" ? t.statusRejected : t.statusPending;
  const pending = (requests || []).filter((r) => r.status === "pending").length;

  return (
    <div className="rounded-xl border border-ink-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-ink-800"
      >
        <span>{t.leave}{pending ? t.pendingN(pending) : ""}</span>
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
              {t.requestLeave}
            </button>
          )}

          {showForm && (
            <form onSubmit={submit} className="space-y-2">
              <div className="flex gap-2">
                {[{ v: "PL", l: t.paidLeave }, { v: "UL", l: t.unpaidLeave }].map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setType(o.v)}
                    className={`flex-1 text-sm font-medium px-2 py-2 rounded-md border ${type === o.v ? "border-sky-600 bg-sky-50 text-sky-700" : "border-ink-200 text-ink-500"}`}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <label className="flex-1 text-xs text-ink-500">{t.from}
                  <input type="date" required value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-full h-10 px-2 rounded border border-ink-200 text-sm" />
                </label>
                <label className="flex-1 text-xs text-ink-500">{t.to}
                  <input type="date" required value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full h-10 px-2 rounded border border-ink-200 text-sm" />
                </label>
              </div>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t.reasonOptional}
                className="w-full h-10 px-2 rounded border border-ink-200 text-sm"
              />
              <div className="flex gap-2">
                <button type="submit" disabled={busy} className="flex-1 text-sm font-medium px-3 py-2 rounded-md bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-40">
                  {busy ? t.submitting : t.submit}
                </button>
                <button type="button" onClick={() => { setShowForm(false); setMsg(""); }} className="px-3 py-2 text-sm text-ink-500">{t.cancel}</button>
              </div>
            </form>
          )}

          {msg && <p className="text-xs text-ink-600">{msg}</p>}

          {requests && requests.length > 0 && (
            <ul className="space-y-1.5 pt-1">
              {requests.slice(0, 5).map((r) => (
                <li key={r.id} className="flex items-center justify-between text-xs text-ink-600">
                  <span>{r.type === "PL" ? t.paidShort : t.unpaidShort} · {r.fromDate}{r.toDate !== r.fromDate ? `→${r.toDate}` : ""} · {t.daysShort(r.days)}</span>
                  <span className={`px-1.5 py-0.5 rounded ${LEAVE_STATUS_STYLE[r.status] || ""}`}>{statusLabel(r.status)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
