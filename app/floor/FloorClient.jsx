"use client";

// Big-button production-capture wizard for shop-floor operators.
// Flow: sign in (employee code + PIN) → machine line → specific machine →
// one slot per machine feed (roll, or for double-wall the single-wall-cup
// SKU + qty) → photo → product SKU → speed → START. Live run screen with
// PAUSE/RESUME and FINISH; finish collects good/waste + kg used per roll feed.
// Designed for low-literacy / first-time phone users: one decision per screen,
// large tap targets, clear back button.

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
  const [step, setStep] = useState("loading"); // loading|login|line|machine|feeds|photo|sku|speed|review|running|finish|done|error
  const [boot, setBoot] = useState({ categories: [], machines: [], rolls: [], stockLines: [] });
  const [bootErr, setBootErr] = useState("");

  // Auth
  const [me, setMe] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [loginPin, setLoginPin] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);

  // Selections
  const [category, setCategory] = useState(null);   // {key,label}
  const [machine, setMachine] = useState(null);      // machine row (with feeds[])
  const [feedSel, setFeedSel] = useState([]);        // aligned with machine.feeds
  const [feedIdx, setFeedIdx] = useState(0);
  const [photoPath, setPhotoPath] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [sku, setSku] = useState(null);              // product being made
  const [speed, setSpeed] = useState("");

  // SKU search (shared by the product step and the sku-kind feed slot)
  const [skuQuery, setSkuQuery] = useState("");
  const [skuRecent, setSkuRecent] = useState([]);
  const [skuResults, setSkuResults] = useState([]);
  const [feedQty, setFeedQty] = useState("");        // qty for a sku-kind feed

  // Run + finish
  const [run, setRun] = useState(null);
  const [runFeeds, setRunFeeds] = useState([]);      // DB feed rows for finish
  const [feedKg, setFeedKg] = useState({});          // feedId → kg used
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [good, setGood] = useState("");
  const [waste, setWaste] = useState("");
  const [, force] = useState(0);

  const fileRef = useRef(null);

  // ---- Bootstrap / auth ----
  function loadBootstrap() {
    return fetch("/api/floor/bootstrap")
      .then(async (r) => ({ status: r.status, ok: r.ok, d: await r.json().catch(() => ({})) }))
      .then(({ status, ok, d }) => {
        if (status === 401) { setStep("login"); return; }
        if (!ok || d.error) { setBootErr(d.error || "Failed to load"); setStep("error"); return; }
        setBoot({ categories: d.categories || [], machines: d.machines || [], rolls: d.rolls || [], stockLines: d.stockLines || [] });
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
      setLoginPin(""); setStep("loading");
      await loadBootstrap();
    } catch (e2) { setLoginErr(e2.message); } finally { setLoginBusy(false); }
  }

  async function logout() {
    await fetch("/api/hr/clock/logout", { method: "POST" }).catch(() => {});
    resetSelections(); setMe(""); setStep("login");
  }

  // Tick running clock
  useEffect(() => {
    if (step !== "running") return;
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [step]);

  // Load SKUs for the product step OR a sku-kind feed slot.
  const skuStepActive = step === "sku" || (step === "feeds" && machine?.feeds?.[feedIdx]?.kind === "sku");
  useEffect(() => {
    if (!skuStepActive) return;
    const cat = category?.key || "";
    const url = `/api/floor/skus?category=${encodeURIComponent(cat)}&q=${encodeURIComponent(skuQuery)}`;
    const id = setTimeout(() => {
      fetch(url).then((r) => r.json()).then((d) => {
        if (!d.error) { setSkuRecent(d.recent || []); setSkuResults(d.results || []); }
      }).catch(() => {});
    }, skuQuery ? 250 : 0);
    return () => clearTimeout(id);
  }, [skuStepActive, category, skuQuery, feedIdx]);

  function resetSelections() {
    setCategory(null); setMachine(null); setFeedSel([]); setFeedIdx(0);
    setPhotoPath(null); setPhotoPreview(null); setSku(null); setSpeed("");
    setSkuQuery(""); setFeedQty(""); setRun(null); setRunFeeds([]); setFeedKg({});
    setGood(""); setWaste(""); setErr("");
  }
  function resetAll() { resetSelections(); setStep("loading"); loadBootstrap(); }

  // ---- Step transitions ----
  function pickLine(c) {
    setCategory(c);
    const ms = boot.machines.filter((m) => m.type === c.key);
    if (ms.length === 1) { pickMachine(ms[0]); }
    else { setMachine(null); setStep("machine"); }
  }
  function pickMachine(m) {
    setMachine(m);
    setFeedSel((m.feeds || []).map((f) => ({ ...f })));
    setFeedIdx(0);
    setSkuQuery("");
    setStep("feeds");
  }
  function advanceFeed() {
    setSkuQuery(""); setFeedQty("");
    if (feedIdx < feedSel.length - 1) setFeedIdx((i) => i + 1);
    else setStep("photo");
  }
  function pickRollForFeed(roll) {
    setFeedSel((arr) => arr.map((f, i) => i === feedIdx ? { ...f, rmRollId: roll.id, roll } : f));
    advanceFeed();
  }
  function pickSkuForFeed(s) {
    const snap = `${s.sku ? s.sku + " · " : ""}${s.productName}`;
    setFeedSel((arr) => arr.map((f, i) => i === feedIdx
      ? { ...f, skuId: s.id, skuSnapshot: snap, qtyPcs: feedQty === "" ? null : Number(feedQty) }
      : f));
    advanceFeed();
  }
  function pickStockForFeed(line) {
    if (feedQty === "" || !(Number(feedQty) > 0)) { setErr("Enter kg loaded first"); return; }
    setErr("");
    const label = [line.supplier, line.paperType, line.gsm ? `${line.gsm} GSM` : null].filter(Boolean).join(" · ") || line.name;
    setFeedSel((arr) => arr.map((f, i) => i === feedIdx
      ? { ...f, rawMaterialId: line.id, skuSnapshot: label, loadedKg: Number(feedQty) }
      : f));
    advanceFeed();
  }

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
      setPhotoPath(d.path); setStep("sku");
    } catch (e2) { setErr(e2.message || "Photo failed"); } finally { setPhotoBusy(false); }
  }

  async function startRun() {
    setErr(""); setBusy(true);
    try {
      const feeds = feedSel.map((f) => ({
        role: f.role, roleLabel: f.label, kind: f.kind,
        rmRollId: f.kind === "roll" ? f.rmRollId : undefined,
        rawMaterialId: f.kind === "stockkg" ? f.rawMaterialId : undefined,
        loadedKg: f.kind === "stockkg" ? f.loadedKg : undefined,
        skuId: f.kind === "sku" ? f.skuId : undefined,
        skuSnapshot: (f.kind === "sku" || f.kind === "stockkg") ? f.skuSnapshot : undefined,
        qtyPcs: f.kind === "sku" ? f.qtyPcs : undefined,
      }));
      const res = await fetch("/api/floor/runs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          machineCategory: category.key,
          machineId: machine?.id || null,
          skuId: sku.id,
          skuSnapshot: `${sku.sku ? sku.sku + " · " : ""}${sku.productName}`,
          machineSpeed: speed === "" ? null : Number(speed),
          speedUnit: "pcs/min",
          photoPath,
          feeds,
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

  async function openFinish() {
    setErr("");
    try {
      const res = await fetch(`/api/floor/runs/${run.id}`);
      const d = await res.json();
      if (res.ok) {
        setRunFeeds(d.feeds || []);
        // default each roll feed kg input to its roll's remaining
        const init = {};
        for (const f of d.feeds || []) {
          if (f.rmRollId) {
            const sel = feedSel.find((s) => s.role === f.role);
            init[f.id] = sel?.roll?.remainingKg != null ? String(sel.roll.remainingKg) : "";
          } else if (f.rawMaterialId) {
            // Clam fan: pre-fill with the kg captured at load.
            init[f.id] = f.consumedKg != null ? String(f.consumedKg) : "";
          }
        }
        setFeedKg(init);
      }
    } catch {}
    setStep("finish");
  }

  // ---- Shell ----
  const Shell = ({ title, back, children }) => (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 flex flex-col">
      <div className="sticky top-0 z-10 bg-gray-900 text-white px-4 py-3 flex items-center gap-3">
        {back && <button onClick={back} className="text-2xl leading-none px-2 -ml-2" aria-label="Back">←</button>}
        <div className="font-semibold text-base">{title}</div>
        {me ? (
          <button onClick={logout} className="ml-auto text-xs underline opacity-80">{me} · Logout</button>
        ) : <div className="ml-auto text-xs opacity-70">Aeros Production</div>}
      </div>
      <div className="flex-1 p-4 max-w-xl w-full mx-auto space-y-3">{children}</div>
      {err && <div className="sticky bottom-0 bg-red-600 text-white text-center px-4 py-3 font-medium">{err}</div>}
    </div>
  );

  const RollList = ({ onPick }) => (
    <>
      {boot.rolls.length === 0 && <p className="text-gray-500 text-center py-8">No rolls in stock. Ask admin to register rolls.</p>}
      {boot.rolls.map((r) => (
        <button key={r.id} className={`${CARD} border-gray-200 bg-white dark:bg-gray-900`} onClick={() => onPick(r)}>
          <div className="font-bold text-gray-900 dark:text-white text-lg">{r.serial}</div>
          <div className="text-sm text-gray-600 dark:text-gray-300">
            {[r.supplier, r.paperType, r.gsm ? `${r.gsm} GSM` : null].filter(Boolean).join(" · ") || r.paperName}
          </div>
          <div className="text-sm text-gray-500">{r.remainingKg} kg left</div>
        </button>
      ))}
    </>
  );

  const SkuList = ({ onPick }) => (
    <>
      {skuRecent.length > 0 && (
        <>
          <div className="text-xs uppercase tracking-wide text-gray-500">Recent</div>
          {skuRecent.map((s) => (
            <button key={s.skuId} className={`${CARD} border-gray-200 bg-white dark:bg-gray-900`}
              onClick={() => onPick({ id: s.skuId, productName: s.skuSnapshot, sku: "" })}>
              <div className="font-semibold text-gray-900 dark:text-white">{s.skuSnapshot}</div>
            </button>
          ))}
          <div className="text-xs uppercase tracking-wide text-gray-500 pt-2">Search all</div>
        </>
      )}
      <input value={skuQuery} onChange={(e) => setSkuQuery(e.target.value)} placeholder="Type SKU or name…"
        className="w-full rounded-xl border-2 border-gray-300 px-4 py-3 text-base dark:bg-gray-900 dark:text-white" />
      {skuResults.map((s) => (
        <button key={s.id} className={`${CARD} border-gray-200 bg-white dark:bg-gray-900`} onClick={() => onPick(s)}>
          <div className="font-semibold text-gray-900 dark:text-white">{s.productName}</div>
          <div className="text-sm text-gray-500">{[s.sku, s.sizeVolume].filter(Boolean).join(" · ")}</div>
        </button>
      ))}
    </>
  );

  // ---- Screens ----
  if (step === "loading") return <Shell title="Loading…"><p className="text-center text-gray-500 py-20">Loading…</p></Shell>;
  if (step === "error") return <Shell title="Problem"><div className="rounded-xl bg-red-50 border border-red-200 p-4 text-red-800">{bootErr}</div></Shell>;

  if (step === "login") {
    return (
      <Shell title="Sign in">
        <form onSubmit={doLogin} className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">Enter your employee code and PIN to start.</p>
          <input value={loginCode} onChange={(e) => setLoginCode(e.target.value)} placeholder="Employee code" autoComplete="off"
            className="w-full rounded-xl border-2 border-gray-300 px-4 py-4 text-xl text-center font-semibold dark:bg-gray-900 dark:text-white" />
          <input value={loginPin} onChange={(e) => setLoginPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric" type="password" placeholder="PIN"
            className="w-full rounded-xl border-2 border-gray-300 px-4 py-4 text-2xl text-center font-bold tracking-widest dark:bg-gray-900 dark:text-white" />
          <button type="submit" disabled={loginBusy} className={`${BTN} bg-blue-600 text-white`}>{loginBusy ? "Signing in…" : "Sign in"}</button>
          {loginErr && <p className="text-sm text-red-600 text-center">{loginErr}</p>}
        </form>
      </Shell>
    );
  }

  if (step === "line") {
    return (
      <Shell title="1. Which machine line?">
        {boot.categories.map((c) => (
          <button key={c.key} className={`${BTN} bg-white border-2 border-gray-200 text-gray-900 dark:bg-gray-900 dark:text-white`}
            onClick={() => pickLine(c)}>{c.label}</button>
        ))}
      </Shell>
    );
  }

  if (step === "machine") {
    const ms = boot.machines.filter((m) => m.type === category.key);
    return (
      <Shell title="2. Which machine?" back={() => setStep("line")}>
        {ms.length === 0 && <p className="text-gray-500 text-center py-8">No machines for this line yet.</p>}
        {ms.map((m) => (
          <button key={m.id} className={`${CARD} border-gray-200 bg-white dark:bg-gray-900`} onClick={() => pickMachine(m)}>
            <div className="font-bold text-gray-900 dark:text-white text-lg">{m.name}</div>
            {m.notes && <div className="text-sm text-gray-500">{m.notes}</div>}
          </button>
        ))}
      </Shell>
    );
  }

  if (step === "feeds") {
    const f = machine?.feeds?.[feedIdx];
    const backFn = feedIdx > 0
      ? () => setFeedIdx((i) => i - 1)
      : () => { const ms = boot.machines.filter((m) => m.type === category.key); ms.length > 1 ? setStep("machine") : setStep("line"); };
    const title = `Feed ${feedIdx + 1} of ${feedSel.length}: ${f?.label || ""}`;
    if (!f) return <Shell title="Feed" back={backFn}><p className="text-gray-500">No feed.</p></Shell>;
    if (f.kind === "roll") {
      return <Shell title={title} back={backFn}><RollList onPick={pickRollForFeed} /></Shell>;
    }
    if (f.kind === "stockkg") {
      // Clam die-cut fan: enter kg loaded, then pick the fan paper stock line.
      return (
        <Shell title={title} back={backFn}>
          <label className="block text-sm text-gray-600 dark:text-gray-300">Kg loaded on machine</label>
          <input value={feedQty} onChange={(e) => setFeedQty(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal"
            placeholder="e.g. 50"
            className="w-full rounded-xl border-2 border-gray-300 px-4 py-3 text-xl text-center font-bold dark:bg-gray-900 dark:text-white" />
          <div className="text-xs uppercase tracking-wide text-gray-500 pt-1">Pick the fan paper</div>
          {boot.stockLines.length === 0 && <p className="text-gray-500 text-center py-6">No RM stock found. Ask admin to add fan paper in RM Inventory.</p>}
          {boot.stockLines.map((l) => (
            <button key={l.id} className={`${CARD} border-gray-200 bg-white dark:bg-gray-900`} onClick={() => pickStockForFeed(l)}>
              <div className="font-semibold text-gray-900 dark:text-white">
                {[l.supplier, l.paperType, l.gsm ? `${l.gsm} GSM` : null].filter(Boolean).join(" · ") || l.name}
              </div>
              <div className="text-sm text-gray-500">{l.qtyKgs} kg in stock</div>
            </button>
          ))}
        </Shell>
      );
    }
    // sku-kind feed (DW single-wall cups): pick SKU + qty
    return (
      <Shell title={title} back={backFn}>
        <label className="block text-sm text-gray-600 dark:text-gray-300">How many {f.label.toLowerCase()}?</label>
        <input value={feedQty} onChange={(e) => setFeedQty(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal"
          placeholder="qty (pcs)"
          className="w-full rounded-xl border-2 border-gray-300 px-4 py-3 text-xl text-center font-bold dark:bg-gray-900 dark:text-white" />
        <div className="text-xs uppercase tracking-wide text-gray-500 pt-1">Pick the {f.label.toLowerCase()} item</div>
        <SkuList onPick={pickSkuForFeed} />
      </Shell>
    );
  }

  if (step === "photo") {
    return (
      <Shell title="Photo of material" back={() => { setFeedIdx(feedSel.length - 1); setStep("feeds"); }}>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} />
        {photoPreview && <img src={photoPreview} alt="material" className="w-full rounded-2xl border-2 border-gray-200" />}
        <button className={`${BTN} bg-gray-900 text-white`} disabled={photoBusy} onClick={() => fileRef.current?.click()}>
          {photoBusy ? "Uploading…" : photoPreview ? "Retake photo" : "📷 Take photo"}
        </button>
        <button className={`${BTN} bg-white border-2 border-gray-300 text-gray-500`} onClick={() => setStep("sku")}>Skip photo</button>
      </Shell>
    );
  }

  if (step === "sku") {
    return (
      <Shell title="What are you making?" back={() => setStep("photo")}>
        <SkuList onPick={(s) => { setSku(s); setSkuQuery(""); setStep("speed"); }} />
      </Shell>
    );
  }

  if (step === "speed") {
    return (
      <Shell title="Machine speed" back={() => setStep("sku")}>
        <label className="block text-sm text-gray-600 dark:text-gray-300">Pieces per minute</label>
        <input value={speed} onChange={(e) => setSpeed(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="e.g. 80"
          className="w-full rounded-xl border-2 border-gray-300 px-4 py-4 text-2xl text-center font-bold dark:bg-gray-900 dark:text-white" />
        <button className={`${BTN} bg-blue-600 text-white`} onClick={() => setStep("review")}>Next →</button>
      </Shell>
    );
  }

  if (step === "review") {
    const Row = ({ k, v }) => (
      <div className="flex justify-between gap-3 py-2 border-b border-gray-100 dark:border-gray-800">
        <span className="text-gray-500">{k}</span><span className="font-semibold text-right text-gray-900 dark:text-white">{v}</span>
      </div>
    );
    return (
      <Shell title="Check & start" back={() => setStep("speed")}>
        <div className="rounded-2xl bg-white dark:bg-gray-900 border-2 border-gray-200 px-4 py-2">
          <Row k="Machine" v={machine?.name || category?.label} />
          <Row k="Operator" v={me} />
          {feedSel.map((f) => {
            let v = "—";
            if (f.kind === "roll") v = f.roll?.serial || "—";
            else if (f.kind === "stockkg") v = `${f.skuSnapshot || "—"}${f.loadedKg ? ` · ${f.loadedKg} kg` : ""}`;
            else v = `${f.skuSnapshot || "—"}${f.qtyPcs ? ` ×${f.qtyPcs}` : ""}`;
            return <Row key={f.role} k={f.label} v={v} />;
          })}
          <Row k="Making" v={sku?.productName} />
          <Row k="Speed" v={speed ? `${speed} pcs/min` : "—"} />
          <Row k="Photo" v={photoPath ? "✓" : "—"} />
        </div>
        <button className={`${BTN} bg-green-600 text-white text-2xl py-6`} disabled={busy} onClick={startRun}>
          {busy ? "Starting…" : "▶  MACHINE START"}
        </button>
      </Shell>
    );
  }

  if (step === "running") {
    const paused = run?.status === "paused";
    return (
      <Shell title={paused ? "Paused" : "Running"}>
        <div className={`rounded-2xl p-6 text-center text-white ${paused ? "bg-amber-500" : "bg-green-600"}`}>
          <div className="text-sm opacity-90">{machine?.name} · {sku?.productName}</div>
          <div className="text-5xl font-bold mt-2 tabular-nums">{elapsed(run?.startTime)}</div>
          <div className="text-sm opacity-90 mt-1">{me}</div>
        </div>
        {paused ? (
          <button className={`${BTN} bg-green-600 text-white text-2xl py-6`} disabled={busy}
            onClick={() => patchRun("resume").then(() => setStep("running"))}>▶  RESUME</button>
        ) : (
          <button className={`${BTN} bg-amber-500 text-white text-2xl py-6`} disabled={busy}
            onClick={() => patchRun("pause").then(() => setStep("running"))}>⏸  PAUSE</button>
        )}
        <button className={`${BTN} bg-red-600 text-white text-2xl py-6`} onClick={openFinish}>■  FINISH JOB</button>
      </Shell>
    );
  }

  if (step === "finish") {
    return (
      <Shell title="Finish job" back={() => setStep("running")}>
        <label className="block text-sm text-gray-600 dark:text-gray-300">Good pieces</label>
        <input value={good} onChange={(e) => setGood(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal"
          className="w-full rounded-xl border-2 border-gray-300 px-4 py-4 text-2xl text-center font-bold dark:bg-gray-900 dark:text-white" />
        <label className="block text-sm text-gray-600 dark:text-gray-300">Waste pieces</label>
        <input value={waste} onChange={(e) => setWaste(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal"
          className="w-full rounded-xl border-2 border-gray-300 px-4 py-4 text-2xl text-center font-bold dark:bg-gray-900 dark:text-white" />
        {runFeeds.filter((f) => f.rmRollId || f.rawMaterialId).map((f) => (
          <div key={f.id}>
            <label className="block text-sm text-gray-600 dark:text-gray-300">{f.roleLabel} — paper used (kg)</label>
            <input value={feedKg[f.id] ?? ""} onChange={(e) => setFeedKg((m) => ({ ...m, [f.id]: e.target.value.replace(/[^0-9.]/g, "") }))}
              inputMode="decimal"
              className="w-full rounded-xl border-2 border-gray-300 px-4 py-4 text-2xl text-center font-bold dark:bg-gray-900 dark:text-white" />
          </div>
        ))}
        <button className={`${BTN} bg-red-600 text-white text-2xl py-6`} disabled={busy}
          onClick={async () => {
            const feedConsumption = {};
            for (const f of runFeeds) {
              if (f.rmRollId || f.rawMaterialId) feedConsumption[f.id] = { consumedKg: feedKg[f.id] === "" || feedKg[f.id] == null ? 0 : Number(feedKg[f.id]) };
            }
            try {
              await patchRun("finish", { goodPcs: good === "" ? 0 : Number(good), wastePcs: waste === "" ? 0 : Number(waste), feedConsumption });
              setStep("done");
            } catch {}
          }}>
          {busy ? "Saving…" : "✓  CONFIRM FINISH"}
        </button>
      </Shell>
    );
  }

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
