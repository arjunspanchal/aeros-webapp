"use client";
// Editorial-utilitarian login surface (Login Phase B).
//
// Layout: split-pane on md+ — brand panel (60% width, ink-100 + paper grain,
// eyebrow + <Brand size="lg" /> + tagline) on the left, form panel (40%,
// white) on the right. Below md the panels stack: a thin brand strip on top
// and the form panel filling the rest.
//
// All inputs are the <Input> primitive (h-12, royal focus). Submits are
// <Button variant="primary" size="lg"> so heights line up with inputs.
// Tabs are a segmented underline row with `border-royal-600` on active —
// matches Shell's MobileNav active treatment.
//
// State note: the third sign-up field is now `signup.country` (was
// `signup.location`). The wire payload still sends `{ location: ... }`
// to keep /api/auth/signup unchanged. User-facing label flips to "Country".
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Brand, Input, Button } from "@/app/components/ui";

// Country codes surfaced in the sign-up phone picker. India first because most
// of our users are domestic; the rest are the countries our clients ship to or
// have teams in. Add more here if a prospect asks for one.
const COUNTRY_CODES = [
  { code: "+91",  label: "IN  +91"  },
  { code: "+1",   label: "US  +1"   },
  { code: "+44",  label: "UK  +44"  },
  { code: "+971", label: "UAE +971" },
  { code: "+972", label: "IL  +972" },
  { code: "+65",  label: "SG  +65"  },
  { code: "+61",  label: "AU  +61"  },
  { code: "+81",  label: "JP  +81"  },
  { code: "+49",  label: "DE  +49"  },
  { code: "+33",  label: "FR  +33"  },
  { code: "+880", label: "BD  +880" },
  { code: "+94",  label: "LK  +94"  },
  { code: "+977", label: "NP  +977" },
];

const EMPTY_SIGNUP = {
  name: "",
  company: "",
  country: "",
  email: "",
  phoneCountry: "+91",
  phone: "",
};

// Native country-code <select> styled to match the Input primitive's resting
// state. We keep this inline rather than promoting it into a Select primitive
// because (a) login is the only surface that uses it, and (b) Phase B is
// scoped to login only — no primitive-layer additions.
const SELECT_CLS =
  "h-12 w-24 shrink-0 px-3 rounded border border-ink-200 bg-white text-sm text-ink-800 " +
  "focus:outline-none focus:border-royal-600 focus:ring-1 focus:ring-royal-600";

const TABS = [
  { key: "client", label: "Sign in" },
  { key: "signup", label: "Sign up" },
  { key: "admin",  label: "Admin"   },
];

const HEADLINE = {
  client: "Welcome back.",
  signup: "Create your account.",
  admin:  "Admin sign-in.",
};

export default function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/hub";
  // Modes: "client" (existing user OTP), "admin" (master password), "signup" (new client)
  const [mode, setMode] = useState("client");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [signup, setSignup] = useState(EMPTY_SIGNUP);
  // Stages per mode — "enter" -> form, "otp" -> OTP entry.
  const [stage, setStage] = useState("enter");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function switchMode(nextMode) {
    setMode(nextMode);
    setErr("");
    setStage("enter");
  }

  async function requestOtp(e) {
    e.preventDefault();
    setErr(""); setBusy(true);
    const res = await fetch("/api/auth/request-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setBusy(false);
    if (!res.ok) { setErr((await res.json()).error || "Failed"); return; }
    setStage("otp");
  }

  async function verifyOtp(e) {
    e.preventDefault();
    setErr(""); setBusy(true);
    // The email to verify depends on which mode we arrived at the OTP stage from.
    const targetEmail = mode === "signup" ? signup.email.trim().toLowerCase() : email;
    const res = await fetch("/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: targetEmail, code: otp }),
    });
    setBusy(false);
    if (!res.ok) { setErr((await res.json()).error || "Failed"); return; }
    router.push(next);
  }

  async function adminLogin(e) {
    e.preventDefault();
    setErr(""); setBusy(true);
    const res = await fetch("/api/auth/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (!res.ok) { setErr((await res.json()).error || "Failed"); return; }
    router.push(next);
  }

  async function submitSignup(e) {
    e.preventDefault();
    setErr(""); setBusy(true);
    // Combine country code + local number so the backend stores the full
    // E.164-ish string. Only strip a leading "+CC " if the user actually
    // pasted one — without the literal "+" guard the regex eats the first
    // digits of a plain local number.
    const rawPhone = String(signup.phone || "").trim();
    const combinedPhone = rawPhone
      ? `${signup.phoneCountry} ${rawPhone.replace(/^\+\d{1,4}\s*/, "").trim()}`
      : "";
    // Wire payload uses `location` (not `country`) so /api/auth/signup
    // does not need to change. The state-key rename is presentation-only.
    const payload = {
      name: signup.name,
      company: signup.company,
      location: signup.country,
      email: signup.email,
      phone: combinedPhone,
    };
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!res.ok) { setErr((await res.json()).error || "Failed"); return; }
    setOtp("");
    setStage("otp");
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-ink-50">
      {/* ─── Brand panel ───────────────────────────────────────────────
         Desktop: 3/5 width, anchored top-left, paper-grain on ink-100.
         Mobile: collapses to a thin top strip with smaller Brand + eyebrow. */}
      <BrandPanel />

      {/* ─── Form panel ────────────────────────────────────────────────
         Desktop: 2/5 width, white. Mobile: full-width below brand strip. */}
      <section className="flex-1 md:w-2/5 bg-white flex items-start md:items-center justify-center px-6 py-10 md:px-10 md:py-12">
        <div className="w-full max-w-sm">
          {/* Back-to-home — secondary nav so a visitor on the login page
             can bail out to the public landing without retyping the URL. */}
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-ink-500 hover:text-ink-900 mb-6 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-royal-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white rounded-sm"
          >
            <span aria-hidden>←</span> Back to home
          </Link>
          {/* Tab row — segmented underline. Active border = royal-600 to
             match Shell's MobileNav active treatment. */}
          <nav className="flex gap-6 border-b border-ink-200 mb-6">
            {TABS.map((t) => {
              const isActive = mode === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => switchMode(t.key)}
                  className={`text-sm py-2 border-b-2 -mb-px transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-royal-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white rounded-sm ${
                    isActive
                      ? "text-ink-900 border-royal-600 font-medium"
                      : "text-ink-600 border-transparent hover:text-ink-900"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </nav>

          {/* Mode-aware headline — display-sm in font-logo for editorial weight. */}
          <h1 className="font-logo text-display-sm text-ink-900 mb-6">
            {stage === "otp" ? "Check your email." : HEADLINE[mode]}
          </h1>

          {/* Error block — substantive but not loud. Sits above the submit. */}
          {err && (
            <p className="text-xs text-red-600 bg-red-50/50 border-l-2 border-red-600 px-3 py-2 mb-4 rounded-sm">
              {err}
            </p>
          )}

          {/* ─── SIGN IN (existing user OTP) ─── */}
          {mode === "client" && stage === "enter" && (
            <form onSubmit={requestOtp} className="space-y-4">
              <Input
                label="Email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full">
                {busy ? "Sending…" : "Send code to email"}
              </Button>
              <p className="text-xs text-center text-ink-500">
                New customer?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("signup")}
                  className="text-royal-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-royal-600 rounded-sm"
                >
                  Create an account
                </button>
              </p>
            </form>
          )}

          {/* ─── SIGN UP (new client) ─── */}
          {mode === "signup" && stage === "enter" && (
            <form onSubmit={submitSignup} className="space-y-4">
              <Input
                label="Name"
                placeholder="Jane Doe"
                value={signup.name}
                onChange={(e) => setSignup({ ...signup, name: e.target.value })}
                required
              />
              <Input
                label="Company name"
                placeholder="Acme Foods Pvt. Ltd."
                value={signup.company}
                onChange={(e) => setSignup({ ...signup, company: e.target.value })}
                required
              />
              <Input
                label="Country"
                placeholder="e.g. India"
                value={signup.country}
                onChange={(e) => setSignup({ ...signup, country: e.target.value })}
              />
              <Input
                label="Email"
                type="email"
                placeholder="you@company.com"
                value={signup.email}
                onChange={(e) => setSignup({ ...signup, email: e.target.value })}
                required
              />
              <div>
                <label htmlFor="phone" className="block text-sm text-ink-600 mb-1.5">
                  Phone
                </label>
                <div className="flex gap-2">
                  <select
                    className={SELECT_CLS}
                    value={signup.phoneCountry}
                    onChange={(e) => setSignup({ ...signup, phoneCountry: e.target.value })}
                    aria-label="Country code"
                  >
                    {COUNTRY_CODES.map((c) => (
                      <option key={c.code} value={c.code}>{c.label}</option>
                    ))}
                  </select>
                  <Input
                    id="phone"
                    label=""
                    type="tel"
                    placeholder="98765 43210"
                    value={signup.phone}
                    onChange={(e) => setSignup({ ...signup, phone: e.target.value })}
                    className="flex-1"
                  />
                </div>
              </div>
              <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full">
                {busy ? "Creating account…" : "Create account & send code"}
              </Button>
              <p className="text-xs text-center text-ink-500">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("client")}
                  className="text-royal-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-royal-600 rounded-sm"
                >
                  Sign in
                </button>
              </p>
            </form>
          )}

          {/* ─── OTP (shared by client + signup) ─── */}
          {(mode === "client" || mode === "signup") && stage === "otp" && (
            <form onSubmit={verifyOtp} className="space-y-4">
              <p className="text-sm text-ink-600">
                We sent a 6-digit code to{" "}
                <span className="font-mono text-ink-800">
                  {mode === "signup" ? signup.email : email}
                </span>.
              </p>
              <Input
                label="Verification code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                mono
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                className="text-center tracking-widest"
                required
              />
              <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full">
                {busy ? "Verifying…" : mode === "signup" ? "Verify & finish sign-up" : "Verify & sign in"}
              </Button>
              <Button
                type="button"
                variant="tertiary"
                size="sm"
                onClick={() => setStage("enter")}
                className="w-full"
              >
                {mode === "signup" ? "Edit details" : "Use a different email"}
              </Button>
            </form>
          )}

          {/* ─── ADMIN ─── */}
          {mode === "admin" && (
            <form onSubmit={adminLogin} className="space-y-4">
              <Input
                label="Master password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full">
                {busy ? "Signing in…" : "Sign in as admin"}
              </Button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}

// ─── Brand panel ─────────────────────────────────────────────────────────
//
// Desktop (md+): full-height left column, 3/5 width, anchored content top-left
// with breathing room. Eyebrow → Brand → tagline. Paper-grain texture on
// ink-100 surface.
//
// Mobile (<md): collapses to a single horizontal strip. Brand size="sm" with
// eyebrow stacked beneath, light bottom border. Keeps the tone-setting moment
// without dominating the viewport.
function BrandPanel() {
  return (
    <>
      {/* Mobile strip */}
      <div className="md:hidden bg-ink-50 bg-paper-grain border-b border-ink-200 px-6 py-5">
        <p className="font-mono text-[11px] uppercase tracking-widest text-ink-400 mb-2">
          AEROS · PAPER PACKAGING
        </p>
        <Brand size="sm" />
      </div>

      {/* Desktop panel */}
      <aside className="hidden md:flex md:w-3/5 bg-ink-100 bg-paper-grain px-12 py-16 items-start">
        <div className="max-w-md">
          <p className="font-mono text-xs uppercase tracking-widest text-ink-400 mb-6">
            AEROS · PAPER PACKAGING
          </p>
          <Brand size="lg" />
          <p className="mt-8 text-lg text-ink-600 font-light">
            Paper, with precision.
          </p>
        </div>
      </aside>
    </>
  );
}
