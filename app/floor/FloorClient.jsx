"use client";

// Big-button production-capture wizard for shop-floor operators. Designed for
// low-literacy / first-time phone users: one decision per screen, large tap
// targets, minimal text, a clear back button, and a final review before the
// big green START. After start it shows a live run screen with PAUSE and
// FINISH; finish collects good/waste/consumed on number pads.

import { useEffect, useRef, useState } from "react";

const BTN = "w-full rounded-2xl px-5 py-5 text-lg font-semibold shadow-sm active:scale-[0.99] transition";
const CARD = "w-full rounded-2xl border-2 px-5 py-4 text-left active:scale-[0.99] transition";

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || "").split(",", 2)[1] || "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function elapsed(fromIso) {
  if (!fromIso) return "0:00";
  const s = Math.max(0, Math.floor((Date.now() - new Date(fromIso).getTime()) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const p = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(ss)}` : `${m}:${p(ss)}`;
}

export default function FloorClient() {
  const [step, setStep] = useState("loading"); // loading|login|line|roll|photo|sku|speed|review|running|finish|done|error
  const [boot, setBoot] = useState({ categories: [], rolls: [] });
  const [bootErr, setBootErr] = useState("");

  // Auth (employee code + PIN → shared punch-clock session)
  const [me, setMe] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [loginPin, setLoginPin] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);

  // Selections
  const [category, setCategory] = useState(null);   // {key,label}
  const [roll, setRoll] = useState(null);
  const [photoPath, setPhotoPath] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [sku, setSku] = useState(null);
  const [speed, setSpeed] = useState("");

  // SKU picker
  const [skuRecent, setSkuRecent] = useState([]);
  const [skuQuery, setSkuQuery] = useState("");
  const [skuResults, setSkuResults] = useState([]);

  // Run + finish
  const [run, setRun] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [good, setGood] = useState("");
  const [waste, setWaste] = useState("");
  const [consumed, setConsumed] = useState("");
  const [, force] = useState(0);

  const fileRef = useRef(null);

  // Bootstrap — 401 means no employee session yet → show the PIN login.
  function loadBootstrap() {
    return fetch("/api/floor/bootstrap")
      .then(async (r) => ({ ok: r.ok, status: r.status, d: await r.json().catch(() => ({})) }))
      .then(({ ok, status, d }) => {
        if (status === 401) { setStep("login"); return; }
        if (!ok || d.error) { setBootErr(d.error || "Failed to load"); setStep("error"); return; }
        setBoot({ categories: d.categories || [], rolls: d.rolls || [] });
        setMe(d.operator?.name || "");
        setStep("line");
      })
      .catch((e) => { setBootErr(String(e)); setStep("error"); });
  }
  useEffect(() => { loadBootstrap(); }, []);

  async function doLogin(e) {
    e?.preventDefault?.();
    setLoginErr("");
    if (!loginCode.trim() || !/^\d{4,6}$/.test(loginPin)) {
      setLoginErr("Enter your employee code and 4–6 digit PIN");
      return;
    }
    setLoginBusy(true);
    try {
      const res = await fetch("/api/hr/clock/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: loginCode.trim(), pin: loginPin }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Login failed");
      setLoginPin("");
      setStep("loading");
      await loadBootstrap();
    } catch (e2) { setLoginErr(e2.message); } finally { setLoginBusy(false); }
  }

  async function logout() {
    await fetch("/api/hr/clock/logout", { method: "POST" }).catch(() => {});
    setMe(""); setCategory(null); setRoll(null); setSku(null); setRun(null);
    setStep("login");
  }

  // Tick the running clock once a second (cosmetic).
  useEffect(() => {
    if (step !== "running") return;
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [step]);

  // Load SKUs when entering the SKU step or searching.
  useEffect(() => {
    if (step !== "sku" || !category) return;
    const url = `/api/floor/skus?category=${encodeURIComponent(category.key)}&q=${encodeURIComponent(skuQuery)}`;
    const id = setTimeout(() => {
      fetch(url).then((r) => r.json()).then((d) => {
        if (!d.error) { setSkuRecent(d.recent || []); setSkuResults(d.results || []); }
      }).catch(() => {});
    }, skuQuery ? 250 : 0);
    return () => clearTimeout(id);
  }, [step, category, skuQuery]);

  async function onPhoto(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setErr(""); setPhotoBusy(true);
    try {
      const fileBase64 = await fileToBase64(f);
      setPhotoPreview(URL.createObjectURL(f));
      const res = await fetch("/api/floor/photo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: f.name, contentType: f.type, fileBase64 }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Upload failed");
      setPhotoPath(d.path);
      setStep("sku");
    } catch (e2) {
      setErr(e2.message || "Photo failed");
    } finally { setPhotoBusy(false); }
  }

  async function startRun() {
    setErr(""); setBusy(true);
    try {
      const res = await fetch("/api/floor/runs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          machineCategory: category.key,
          rmRollId: roll.id,
          skuId: sku.id,
          skuSnapshot: `${sku.sku ? sku.sku + " · " : ""}${sku.productName}`,
          machineSpeed: speed === "" ? null : Number(speed),
          speedUnit: "pcs/min",
          photoPath,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not start");
      setRun(d.run); setStep("running");
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  async function patchRun(action, extra) {
    setErr(""); setBusy(true);
    try {
      const res = await fetch(`/api/floor/runs/${run.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setRun(d.run);
      return d.run;
    } catch (e2) { setErr(e2.message); throw e2; } finally { setBusy(false); }
  }

  function resetAll() {
    setCategory(null); setRoll(null); setPhotoPath(null);
    setPhotoPreview(null); setSku(null); setSpeed(""); setRun(null);
    setGood(""); setWaste(""); setConsumed(""); setErr("");
    setStep("loading");
    // refresh rolls so the consumed one drops off; lands back on the line step
    loadBootstrap();
  }

  // ---- Shell ----
  const Shell = ({ title, back, children }) => (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 flex flex-col">
      <div className="sticky top-0 z-10 bg-gray-900 text-white px-4 py-3 flex items-center gap-3">
        {back && (
          <button onClick={back} className="text-2xl leading-none px-2 -ml-2" aria-label="Back">←</button>
        )}
        <div className="font-semibold text-base">{title}</div>
        {me ? (
          <button onClick={logout} className="ml-auto text-xs underline opacity-80">{me} · Logout</button>
        ) : (
          <div className="ml-auto text-xs opacity-70">Aeros Production</div>
        )}
      </div>
      <div className="flex-1 p-4 max-w-xl w-full mx-auto space-y-3">{children}</div>
      {err && (
        <div className="sticky bottom-0 bg-red-600 text-white text-center px-4 py-3 font-medium">{err}</div>
      )}
    </div>
  );

  if (step === "loading") return <Shell title="Loading…"><p className="text-center text-gray-500 py-20">Loading…</p></Shell>;
  if (step === "error") return <Shell title="Problem"><div className="rounded-xl bg-red-50 border border-red-200 p-4 text-red-800">{bootErr}</div></Shell>;

  // 0) Login — employee code + PIN (shared punch-clock session)
  if (step === "login") {
    return (
      <Shell title="Sign in">
        <form onSubmit={doLogin} className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">Enter your employee code and PIN to start.</p>
          <input value={loginCode} onChange={(e) => setLoginCode(e.target.value)} placeholder="Employee code"
            autoComplete="off"
            className="w-full rounded-xl border-2 border-gray-300 px-4 py-4 text-xl text-center font-semibold dark:bg-gray-900 dark:text-white" />
          <input value={loginPin} onChange={(e) => setLoginPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric" type="password" placeholder="PIN"
            className="w-full rounded-xl border-2 border-gray-300 px-4 py-4 text-2xl text-center font-bold tracking-widest dark:bg-gray-900 dark:text-white" />
          <button type="submit" disabled={loginBusy} className={`${BTN} bg-blue-600 text-white`}>
            {loginBusy ? "Signing in…" : "Sign in"}
          </button>
          {loginErr && <p className="text-sm text-red-600 text-center">{loginErr}</p>}
        </form>
      </Shell>
    );
  }

  // 1) Machine line
  if (step === "line") {
    return (
      <Shell title="1. Which machine?">
        {boot.categories.map((c) => (
          <button key={c.key} className={`${BTN} bg-white border-2 border-gray-200 text-gray-900 dark:bg-gray-900 dark:text-white`}
            onClick={() => { setCategory(c); setStep("roll"); }}>
            {c.label}
          </button>
        ))}
      </Shell>
    );
  }

  // 2) Roll
  if (step === "roll") {
    return (
      <Shell title="2. Which paper roll?" back={() => setStep("line")}>
        {boot.rolls.length === 0 && <p className="text-gray-500 text-center py-8">No rolls in stock. Ask admin to register rolls.</p>}
        {boot.rolls.map((r) => (
          <button key={r.id} className={`${CARD} ${roll?.id === r.id ? "border-blue-600 bg-blue-50 dark:bg-blue-900/20" : "border-gray-200 bg-white dark:bg-gray-900"}`}
            onClick={() => { setRoll(r); setStep("photo"); }}>
            <div className="font-bold text-gray-900 dark:text-white text-lg">{r.serial}</div>
            <div className="text-sm text-gray-600 dark:text-gray-300">
              {[r.supplier, r.paperType, r.gsm ? `${r.gsm} GSM` : null].filter(Boolean).join(" · ") || r.paperName}
            </div>
            <div className="text-sm text-gray-500">{r.remainingKg} kg left</div>
          </button>
        ))}
      </Shell>
    );
  }

  // 4) Photo
  if (step === "photo") {
    return (
      <Shell title="3. Photo of roll" back={() => setStep("roll")}>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} />
        {photoPreview && <img src={photoPreview} alt="roll" className="w-full rounded-2xl border-2 border-gray-200" />}
        <button className={`${BTN} bg-gray-900 text-white`} disabled={photoBusy} onClick={() => fileRef.current?.click()}>
          {photoBusy ? "Uploading…" : photoPreview ? "Retake photo" : "📷 Take photo"}
        </button>
        <button className={`${BTN} bg-white border-2 border-gray-300 text-gray-500`} onClick={() => setStep("sku")}>
          Skip photo
        </button>
      </Shell>
    );
  }

  // 5) SKU
  if (step === "sku") {
    return (
      <Shell title="4. What are you making?" back={() => setStep("photo")}>
        {skuRecent.length > 0 && (
          <>
            <div className="text-xs uppercase tracking-wide text-gray-500">Recent</div>
            {skuRecent.map((s) => (
              <button key={s.skuId} className={`${CARD} border-gray-200 bg-white dark:bg-gray-900`}
                onClick={() => { setSku({ id: s.skuId, productName: s.skuSnapshot, sku: "" }); setStep("speed"); }}>
                <div className="font-semibold text-gray-900 dark:text-white">{s.skuSnapshot}</div>
              </button>
            ))}
            <div className="text-xs uppercase tracking-wide text-gray-500 pt-2">Search all</div>
          </>
        )}
        <input value={skuQuery} onChange={(e) => setSkuQuery(e.target.value)} placeholder="Type SKU or name…"
          className="w-full rounded-xl border-2 border-gray-300 px-4 py-3 text-base dark:bg-gray-900 dark:text-white" />
        {skuResults.map((s) => (
          <button key={s.id} className={`${CARD} border-gray-200 bg-white dark:bg-gray-900`}
            onClick={() => { setSku(s); setStep("speed"); }}>
            <div className="font-semibold text-gray-900 dark:text-white">{s.productName}</div>
            <div className="text-sm text-gray-500">{[s.sku, s.sizeVolume].filter(Boolean).join(" · ")}</div>
          </button>
        ))}
      </Shell>
    );
  }

  // 6) Speed
  if (step === "speed") {
    return (
      <Shell title="5. Machine speed" back={() => setStep("sku")}>
        <label className="block text-sm text-gray-600 dark:text-gray-300">Pieces per minute</label>
        <input value={speed} onChange={(e) => setSpeed(e.target.value.replace(/[^0-9.]/g, ""))}
          inputMode="decimal" placeholder="e.g. 80"
          className="w-full rounded-xl border-2 border-gray-300 px-4 py-4 text-2xl text-center font-bold dark:bg-gray-900 dark:text-white" />
        <button className={`${BTN} bg-blue-600 text-white`} onClick={() => setStep("review")}>Next →</button>
      </Shell>
    );
  }

  // 7) Review + START
  if (step === "review") {
    const Row = ({ k, v }) => (
      <div className="flex justify-between gap-3 py-2 border-b border-gray-100 dark:border-gray-800">
        <span className="text-gray-500">{k}</span><span className="font-semibold text-right text-gray-900 dark:text-white">{v}</span>
      </div>
    );
    return (
      <Shell title="Check & start" back={() => setStep("speed")}>
        <div className="rounded-2xl bg-white dark:bg-gray-900 border-2 border-gray-200 px-4 py-2">
          <Row k="Machine" v={category?.label} />
          <Row k="Operator" v={me} />
          <Row k="Roll" v={roll?.serial} />
          <Row k="SKU" v={sku?.productName} />
          <Row k="Speed" v={speed ? `${speed} pcs/min` : "—"} />
          <Row k="Photo" v={photoPath ? "✓" : "—"} />
        </div>
        <button className={`${BTN} bg-green-600 text-white text-2xl py-6`} disabled={busy} onClick={startRun}>
          {busy ? "Starting…" : "▶  MACHINE START"}
        </button>
      </Shell>
    );
  }

  // 8) Running
  if (step === "running") {
    const paused = run?.status === "paused";
    return (
      <Shell title={paused ? "Paused" : "Running"}>
        <div className={`rounded-2xl p-6 text-center text-white ${paused ? "bg-amber-500" : "bg-green-600"}`}>
          <div className="text-sm opacity-90">{category?.label} · {sku?.productName}</div>
          <div className="text-5xl font-bold mt-2 tabular-nums">{elapsed(run?.startTime)}</div>
          <div className="text-sm opacity-90 mt-1">Roll {roll?.serial} · {me}</div>
        </div>
        {paused ? (
          <button className={`${BTN} bg-green-600 text-white text-2xl py-6`} disabled={busy}
            onClick={() => patchRun("resume").then(() => setStep("running"))}>▶  RESUME</button>
        ) : (
          <button className={`${BTN} bg-amber-500 text-white text-2xl py-6`} disabled={busy}
            onClick={() => patchRun("pause").then(() => setStep("running"))}>⏸  PAUSE</button>
        )}
        <button className={`${BTN} bg-red-600 text-white text-2xl py-6`}
          onClick={() => { setConsumed(String(roll?.remainingKg ?? "")); setStep("finish"); }}>■  FINISH JOB</button>
      </Shell>
    );
  }

  // 9) Finish
  if (step === "finish") {
    const Num = ({ label, val, set, hint }) => (
      <div>
        <label className="block text-sm text-gray-600 dark:text-gray-300">{label}</label>
        <input value={val} onChange={(e) => set(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal"
          className="w-full rounded-xl border-2 border-gray-300 px-4 py-4 text-2xl text-center font-bold dark:bg-gray-900 dark:text-white" />
        {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
      </div>
    );
    return (
      <Shell title="Finish job" back={() => setStep("running")}>
        <Num label="Good pieces" val={good} set={setGood} />
        <Num label="Waste pieces" val={waste} set={setWaste} />
        <Num label="Paper used (kg)" val={consumed} set={setConsumed} hint={`Roll has ${roll?.remainingKg ?? 0} kg left`} />
        <button className={`${BTN} bg-red-600 text-white text-2xl py-6`} disabled={busy}
          onClick={async () => {
            try {
              await patchRun("finish", { goodPcs: good === "" ? 0 : Number(good), wastePcs: waste === "" ? 0 : Number(waste), consumedKg: consumed === "" ? 0 : Number(consumed) });
              setStep("done");
            } catch {}
          }}>
          {busy ? "Saving…" : "✓  CONFIRM FINISH"}
        </button>
      </Shell>
    );
  }

  // 10) Done
  if (step === "done") {
    return (
      <Shell title="Done">
        <div className="rounded-2xl bg-green-600 text-white p-6 text-center">
          <div className="text-4xl">✓</div>
          <div className="font-bold text-xl mt-2">Job recorded</div>
          <div className="text-sm opacity-90 mt-1">{run?.runId}</div>
        </div>
        <div className="rounded-2xl bg-white dark:bg-gray-900 border-2 border-gray-200 px-4 py-3 text-sm">
          <div className="flex justify-between py-1"><span className="text-gray-500">Good</span><span className="font-semibold">{run?.outputPcs ?? 0} pcs</span></div>
          <div className="flex justify-between py-1"><span className="text-gray-500">Waste</span><span className="font-semibold">{run?.wastePcs ?? 0} pcs</span></div>
          <div className="flex justify-between py-1"><span className="text-gray-500">Paper used</span><span className="font-semibold">{run?.consumedKg ?? 0} kg</span></div>
        </div>
        <button className={`${BTN} bg-blue-600 text-white text-xl py-6`} onClick={resetAll}>Start another job</button>
      </Shell>
    );
  }

  return null;
}
