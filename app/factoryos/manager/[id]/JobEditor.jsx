"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StageBadge, StageTimeline, inputCls, labelCls, formatDate, formatDateTime } from "@/app/factoryos/_components/ui";
import { ROLES, STAGES } from "@/lib/factoryos/constants";
import PushToWarehouseCard from "./PushToWarehouseCard";
import JobThread from "@/app/factoryos/_components/JobThread";

export default function JobEditor({
  job: initialJob,
  initialUpdates,
  clientMap,
  role,
  products = [],
  catalogError = null,
  // True once the job has at least one warehouse push — locks the master-
  // product mapping card. Server PATCH guard re-checks; this prop just
  // drives the UI affordance so users see the lock before they try.
  masterMappingLocked = false,
  pushCount = 0,
  // Active printing-vendor names for the editable Printing Vendor dropdown.
  printingVendors = [],
}) {
  const router = useRouter();
  const [job, setJob] = useState(initialJob);
  const [updates, setUpdates] = useState(initialUpdates);
  const [stage, setStage] = useState(initialJob.stage);
  const [note, setNote] = useState("");
  const [internalStatus, setInternalStatus] = useState(initialJob.internalStatus);
  const [actionPoints, setActionPoints] = useState(initialJob.actionPoints);
  const [expectedDispatchDate, setExpectedDispatchDate] = useState(initialJob.expectedDispatchDate || "");
  const [estimatedDeliveryDate, setEstimatedDeliveryDate] = useState(initialJob.estimatedDeliveryDate || "");
  // RM + production editable fields
  const [rmSupplier, setRmSupplier] = useState(initialJob.rmSupplier);
  const [paperType, setPaperType] = useState(initialJob.paperType);
  const [gsm, setGsm] = useState(initialJob.gsm ?? "");
  const [rmSizeMm, setRmSizeMm] = useState(initialJob.rmSizeMm ?? "");
  const [rmQtySheets, setRmQtySheets] = useState(initialJob.rmQtySheets ?? "");
  const [rmQtyKgs, setRmQtyKgs] = useState(initialJob.rmQtyKgs ?? "");
  const [rmDeliveryDate, setRmDeliveryDate] = useState(initialJob.rmDeliveryDate || "");
  const [printingVendor, setPrintingVendor] = useState(initialJob.printingVendor || "");
  const [printingDueDate, setPrintingDueDate] = useState(initialJob.printingDueDate || "");
  const [productionDueDate, setProductionDueDate] = useState(initialJob.productionDueDate || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [savedAt, setSavedAt] = useState(null);
  const [lrFile, setLrFile] = useState(null);
  const [lrBusy, setLrBusy] = useState(false);
  const [lrErr, setLrErr] = useState("");
  const [transportMode, setTransportMode] = useState(initialJob.transportMode || "");
  const [lrOrVehicleNumber, setLrOrVehicleNumber] = useState(initialJob.lrOrVehicleNumber || "");
  const [driverContact, setDriverContact] = useState(initialJob.driverContact || "");
  const [trackingBusy, setTrackingBusy] = useState(false);
  const [trackingSaved, setTrackingSaved] = useState(false);
  // Master-product mapping (admin + factory manager can edit; others see read-only).
  const canEditMasterProduct = role === ROLES.ADMIN || role === ROLES.FACTORY_MANAGER;
  // Hard-delete (cascades the job + its timeline). FE included alongside
  // admin / FM because shop floor sometimes needs to drop test jobs.
  const canDeleteJob =
    role === ROLES.ADMIN ||
    role === ROLES.FACTORY_MANAGER ||
    role === ROLES.FACTORY_EXECUTIVE;
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteErr, setDeleteErr] = useState("");

  async function deleteJob() {
    setDeleteErr("");
    // Preview first so the confirm dialog can quote the timeline count.
    let updateCount = 0;
    try {
      const res = await fetch(`/api/factoryos/jobs/${job.id}?count=updates`, { method: "DELETE" });
      if (!res.ok) {
        setDeleteErr((await res.json()).error || "Couldn't check timeline count");
        return;
      }
      ({ updateCount } = await res.json());
    } catch (e) {
      setDeleteErr(e?.message || "Couldn't check timeline count");
      return;
    }

    const label = `J# ${job.jNumber}${job.item ? ` — ${job.item}` : ""}`;
    const msg = updateCount > 0
      ? `Delete ${label} and its ${updateCount} timeline update${updateCount === 1 ? "" : "s"}? This cannot be undone.`
      : `Delete ${label}? It has no timeline updates. This cannot be undone.`;
    if (!window.confirm(msg)) return;

    setDeleteBusy(true);
    const res = await fetch(`/api/factoryos/jobs/${job.id}`, { method: "DELETE" });
    if (!res.ok) {
      setDeleteBusy(false);
      setDeleteErr((await res.json()).error || `Delete failed (${res.status})`);
      return;
    }
    // Land back on the list view that matches the caller's role.
    router.push(role === ROLES.FACTORY_EXECUTIVE ? "/factoryos/manager" : "/factoryos/admin");
    router.refresh();
  }
  const [masterSku, setMasterSku] = useState(initialJob.masterSku || "");
  const [masterProductName, setMasterProductName] = useState(initialJob.masterProductName || "");
  // Resolve the initial productId from masterSku if it matches a catalog row.
  const [productId, setProductId] = useState(() => {
    const hit = products.find((p) => p.sku && initialJob.masterSku && p.sku === initialJob.masterSku);
    return hit?.id || "";
  });
  const [productQuery, setProductQuery] = useState("");
  // Category filter sits above the search box so operators don't have to
  // scroll past 600+ rows when they know the kind of product they want.
  // Pre-seed from the job's existing category if it matches a real catalog
  // category — keeps the picker scoped to the right slice on first open.
  const [productCategory, setProductCategory] = useState(initialJob.category || "");
  const [masterBusy, setMasterBusy] = useState(false);
  const [masterSaved, setMasterSaved] = useState(false);
  const [masterErr, setMasterErr] = useState("");

  // Audit L2: dirty-state guard for the main job-edit form. Compares the
  // 15 fields that participate in save() against the live `job` state
  // (which save() updates on success, so a clean save flips this back to
  // false). When dirty, a beforeunload listener warns the user on
  // navigation / tab close.
  //
  // Other cards (master-mapping, LR upload, tracking) have their own
  // save buttons next to a small set of inputs — lower loss risk, not
  // worth tracking separately. Keep this scoped to the main form.
  //
  // Coalesce null/undefined → "" on both sides so a never-set field
  // doesn't read as dirty on first load.
  const norm = (v) => (v == null ? "" : String(v));
  const formDirty = useMemo(() => {
    if (note && note.trim()) return true;
    if (stage !== job.stage) return true;
    if (norm(internalStatus) !== norm(job.internalStatus)) return true;
    if (norm(actionPoints) !== norm(job.actionPoints)) return true;
    if (norm(expectedDispatchDate) !== norm(job.expectedDispatchDate)) return true;
    if (norm(estimatedDeliveryDate) !== norm(job.estimatedDeliveryDate)) return true;
    if (norm(rmSupplier) !== norm(job.rmSupplier)) return true;
    if (norm(paperType) !== norm(job.paperType)) return true;
    if (norm(gsm) !== norm(job.gsm)) return true;
    if (norm(rmSizeMm) !== norm(job.rmSizeMm)) return true;
    if (norm(rmQtySheets) !== norm(job.rmQtySheets)) return true;
    if (norm(rmQtyKgs) !== norm(job.rmQtyKgs)) return true;
    if (norm(rmDeliveryDate) !== norm(job.rmDeliveryDate)) return true;
    if (norm(printingVendor) !== norm(job.printingVendor)) return true;
    if (norm(printingDueDate) !== norm(job.printingDueDate)) return true;
    if (norm(productionDueDate) !== norm(job.productionDueDate)) return true;
    return false;
  }, [
    job, note, stage, internalStatus, actionPoints,
    expectedDispatchDate, estimatedDeliveryDate,
    rmSupplier, paperType, gsm, rmSizeMm, rmQtySheets, rmQtyKgs,
    rmDeliveryDate, printingVendor, printingDueDate, productionDueDate,
  ]);

  useEffect(() => {
    if (!formDirty) return undefined;
    // Modern browsers ignore the returned string and show their own copy,
    // but both preventDefault() AND setting returnValue is required for
    // the prompt to actually fire across Chrome / Firefox / Safari.
    function onBeforeUnload(e) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [formDirty]);

  // Unique categories sourced from the loaded catalog itself, so the dropdown
  // never falls out of sync with whatever taxonomy the master products use.
  const productCategories = useMemo(() => {
    const set = new Set();
    for (const p of products) if (p.category) set.add(p.category);
    return Array.from(set).sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    let list = products;
    if (productCategory) list = list.filter((p) => p.category === productCategory);
    if (q) list = list.filter((p) => `${p.productName} ${p.sku} ${p.category} ${p.sizeVolume}`.toLowerCase().includes(q));
    return list.slice(0, 200);
  }, [products, productQuery, productCategory]);

  function onPickProduct(id) {
    setProductId(id);
    const p = products.find((x) => x.id === id);
    if (!p) { setMasterSku(""); setMasterProductName(""); return; }
    setMasterSku(p.sku || "");
    setMasterProductName(p.productName || "");
  }

  async function saveMasterMapping() {
    setMasterErr(""); setMasterSaved(false);
    if (!masterSku.trim()) {
      setMasterErr("Pick a master product first.");
      return;
    }
    setMasterBusy(true);
    const res = await fetch(`/api/factoryos/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ masterSku, masterProductName }),
    });
    setMasterBusy(false);
    if (!res.ok) { setMasterErr((await res.json()).error || "Failed"); return; }
    const data = await res.json();
    setJob(data.job);
    setMasterSaved(true);
    setTimeout(() => setMasterSaved(false), 2000);
    router.refresh();
  }

  const clientName = job.clientIds.map((c) => clientMap[c]?.name).filter(Boolean).join(", ");

  async function uploadLr() {
    setLrErr("");
    if (!lrFile) { setLrErr("Pick a file"); return; }
    const ok = new Set(["application/pdf", "image/jpeg", "image/png"]);
    if (!ok.has(lrFile.type)) { setLrErr("PDF / JPG / PNG only"); return; }
    if (lrFile.size > 5 * 1024 * 1024) { setLrErr("Max 5 MB"); return; }
    setLrBusy(true);
    const base64 = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const s = String(r.result || "");
        resolve(s.slice(s.indexOf(",") + 1));
      };
      r.onerror = reject;
      r.readAsDataURL(lrFile);
    });
    const res = await fetch(`/api/factoryos/jobs/${job.id}/lr-files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: lrFile.name, contentType: lrFile.type, fileBase64: base64 }),
    });
    setLrBusy(false);
    if (!res.ok) { setLrErr((await res.json()).error || "Failed"); return; }
    const data = await res.json();
    setJob(data.job);
    setLrFile(null);
    router.refresh();
  }

  async function save() {
    setErr(""); setBusy(true);
    const res = await fetch(`/api/factoryos/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stage,
        note: note.trim() || undefined,
        internalStatus,
        actionPoints,
        expectedDispatchDate: expectedDispatchDate || null,
        estimatedDeliveryDate: estimatedDeliveryDate || null,
        rmSupplier,
        paperType,
        gsm: gsm === "" ? null : Number(gsm),
        rmSizeMm: rmSizeMm === "" ? null : Number(rmSizeMm),
        rmQtySheets: rmQtySheets === "" ? null : Number(rmQtySheets),
        rmQtyKgs: rmQtyKgs === "" ? null : Number(rmQtyKgs),
        rmDeliveryDate: rmDeliveryDate || null,
        printingVendor: printingVendor || null,
        printingDueDate: printingDueDate || null,
        productionDueDate: productionDueDate || null,
      }),
    });
    setBusy(false);
    if (!res.ok) { setErr((await res.json()).error || "Failed"); return; }
    const data = await res.json();
    setJob(data.job);
    setNote("");
    setSavedAt(new Date());
    router.refresh();
    // Optimistic: push the new update into the timeline locally.
    if (stage !== initialJob.stage || (note && note.trim())) {
      setUpdates((prev) => [
        {
          id: `local-${Date.now()}`,
          stage,
          note: note.trim(),
          updatedByEmail: "",
          updatedByName: "",
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    }
  }

  return (
    <div className="mt-4 space-y-5">
      <div className="bg-white border border-gray-200 rounded-xl p-5 dark:bg-gray-900 dark:border-gray-800">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{job.item}</h1>
            <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
              J# {job.jNumber}{clientName && <> · {clientName}</>}{job.brand && <> · {job.brand}</>}{job.city && <> · {job.city}</>}
            </p>
          </div>
          <div className="flex items-start gap-3 shrink-0">
            <StageBadge stage={job.stage} />
            {canDeleteJob && (
              <button
                type="button"
                onClick={deleteJob}
                disabled={deleteBusy}
                className="text-xs font-medium text-red-600 hover:underline dark:text-red-400 disabled:opacity-50"
                title="Delete this job and its timeline updates"
              >
                {deleteBusy ? "Deleting…" : "Delete job"}
              </button>
            )}
          </div>
        </div>
        {deleteErr && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">{deleteErr}</p>
        )}
        <div className="mt-4">
          <StageTimeline stage={job.stage} />
        </div>

        <dl className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 text-sm">
          <Col label="Quantity" value={job.qty != null ? job.qty.toLocaleString("en-IN") : "—"} />
          <Col label="Category" value={job.category || "—"} />
          <Col label="Item size" value={job.itemSize || "—"} />
          <Col label="PO #" value={job.poNumber || "—"} />
          <Col label="Master SKU" value={job.masterSku || "— (unmapped)"} />
          <Col label="Order date" value={formatDate(job.orderDate)} />
          <Col label="Printing vendor" value={job.printingVendor || "—"} />
          <Col label="Printing type" value={job.printingType || "—"} />
          <Col label="Printing due" value={formatDate(job.printingDueDate)} />
          <Col
            label="Vendor status"
            value={
              {
                accepted: "Job accepted",
                printing_started: "Printing started",
                printing_completed: "Printing completed",
                dispatched: `Dispatched${job.vendorDispatchDate ? ` · ${formatDate(job.vendorDispatchDate)}` : ""}`,
              }[job.vendorStatus] || "—"
            }
          />
          <Col label="Production due" value={formatDate(job.productionDueDate)} />
          <Col label="RM delivery" value={formatDate(job.rmDeliveryDate)} />
        </dl>
      </div>

      {canEditMasterProduct && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 dark:bg-gray-900 dark:border-gray-800">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Master product mapping</h2>
            {job.masterSku ? (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Currently: <span className="font-mono text-gray-900 dark:text-white">{job.masterSku}</span>
                {job.masterProductName && <> · {job.masterProductName}</>}
              </span>
            ) : (
              <span className="text-xs text-amber-600 dark:text-amber-400">Unmapped — pick a master product so FG inventory can track this job.</span>
            )}
          </div>
          {masterMappingLocked ? (
            // Locked once any warehouse push has booked stock against the
            // current SKU. Remapping mid-production would split FG inventory
            // for one physical job across two SKUs silently (audit C5).
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
              <p className="font-medium">🔒 Master mapping locked</p>
              <p className="mt-1">
                {pushCount} warehouse push{pushCount === 1 ? "" : "es"} already booked stock against{" "}
                <span className="font-mono">{job.masterSku || "this SKU"}</span>. Changing the mapping
                now would split FG inventory across two SKUs.
              </p>
              <p className="mt-1 text-amber-700 dark:text-amber-300">
                If the mapping is wrong, delete the job and create a new one — or contact an admin if a controlled fix is needed.
              </p>
            </div>
          ) : products.length === 0 ? (
            <div className="text-xs text-red-600 dark:text-red-400 space-y-1">
              <p>No master products loaded.</p>
              {catalogError ? (
                <p className="font-mono text-[11px] break-words">Error: {catalogError}</p>
              ) : (
                <p>The catalog returned 0 records — check that the catalog table actually has rows with a Product Name.</p>
              )}
              <p className="text-gray-500 dark:text-gray-400">
                Catalog reads go through Supabase — verify <code>SUPABASE_URL</code> + <code>SUPABASE_SERVICE_ROLE_KEY</code> are set and the <code>master_products</code> view exists.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
                <select
                  className={inputCls}
                  value={productCategory}
                  onChange={(e) => setProductCategory(e.target.value)}
                  aria-label="Category"
                >
                  <option value="">All categories</option>
                  {productCategories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <input
                  className={`${inputCls} sm:col-span-2`}
                  placeholder={`Search ${filteredProducts.length === products.length ? products.length : `${filteredProducts.length} of ${products.length}`} products by name / SKU / size…`}
                  value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)}
                />
              </div>
              <select
                className={inputCls}
                value={productId}
                onChange={(e) => onPickProduct(e.target.value)}
              >
                <option value="">— Select a master product —</option>
                {filteredProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.productName}{p.sku ? ` (${p.sku})` : ""}{p.sizeVolume ? ` · ${p.sizeVolume}` : ""}
                  </option>
                ))}
              </select>
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={saveMasterMapping}
                  disabled={masterBusy || !masterSku.trim()}
                  className="bg-blue-600 text-white text-sm font-medium px-3 py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-60"
                >
                  {masterBusy ? "Saving…" : "Save mapping"}
                </button>
                {masterSaved && <span className="text-xs text-green-600 dark:text-green-400">Saved</span>}
                {masterErr && <span className="text-xs text-red-500">{masterErr}</span>}
              </div>
            </>
          )}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-5 dark:bg-gray-900 dark:border-gray-800">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">RM details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>RM supplier</label>
            <input className={inputCls} value={rmSupplier} onChange={(e) => setRmSupplier(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Paper type</label>
            <input className={inputCls} value={paperType} onChange={(e) => setPaperType(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>GSM</label>
            <input type="number" className={inputCls} value={gsm} onChange={(e) => setGsm(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>RM size (mm)</label>
            <input type="number" className={inputCls} value={rmSizeMm} onChange={(e) => setRmSizeMm(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>RM qty (sheets)</label>
            <input type="number" className={inputCls} value={rmQtySheets} onChange={(e) => setRmQtySheets(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>RM qty (kgs)</label>
            <input type="number" step="0.01" className={inputCls} value={rmQtyKgs} onChange={(e) => setRmQtyKgs(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>RM delivery date</label>
            <input type="date" className={inputCls} value={rmDeliveryDate ? rmDeliveryDate.slice(0, 10) : ""} onChange={(e) => setRmDeliveryDate(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Printing vendor</label>
            <select className={inputCls} value={printingVendor} onChange={(e) => setPrintingVendor(e.target.value)}>
              <option value="">— None —</option>
              {/* Keep a legacy/typed value selectable even if it's not in the active list. */}
              {printingVendor && !printingVendors.includes(printingVendor) && (
                <option value={printingVendor}>{printingVendor}</option>
              )}
              {printingVendors.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Printing due date</label>
            <input type="date" className={inputCls} value={printingDueDate ? printingDueDate.slice(0, 10) : ""} onChange={(e) => setPrintingDueDate(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Production due date</label>
            <input type="date" className={inputCls} value={productionDueDate ? productionDueDate.slice(0, 10) : ""} onChange={(e) => setProductionDueDate(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-3 dark:text-gray-500">These save along with the status update below.</p>
      </div>

      {/* Audit C2: ledger writes (FG stock + unit cost) are admin/FM only.
          FE keeps full production-floor access (RM, stage, runs) but no
          longer authors financial movements. */}
      <PushToWarehouseCard
        job={job}
        canPush={role === ROLES.ADMIN || role === ROLES.FACTORY_MANAGER}
      />

      <JobThread jobId={job.id} viewerRole="team" title="Messages & files (customer + vendor)" />

      <div className="bg-white border border-gray-200 rounded-xl p-5 dark:bg-gray-900 dark:border-gray-800">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Update status</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Stage</label>
            <select className={inputCls} value={stage} onChange={(e) => setStage(e.target.value)}>
              {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Expected dispatch date</label>
            <input
              type="date"
              className={inputCls}
              value={expectedDispatchDate ? expectedDispatchDate.slice(0, 10) : ""}
              onChange={(e) => setExpectedDispatchDate(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Estimated delivery date (shown to customer)</label>
            <input
              type="date"
              className={inputCls}
              value={estimatedDeliveryDate ? estimatedDeliveryDate.slice(0, 10) : ""}
              onChange={(e) => setEstimatedDeliveryDate(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Internal status (not shown to customer)</label>
            <input
              className={inputCls}
              placeholder="e.g. Forming plates pending, Colour approval awaited"
              value={internalStatus}
              onChange={(e) => setInternalStatus(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Action points (internal)</label>
            <textarea
              rows={3}
              className={inputCls}
              placeholder="Open tasks, follow-ups…"
              value={actionPoints}
              onChange={(e) => setActionPoints(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Note to log with this update (visible in customer timeline)</label>
            <input
              className={inputCls}
              placeholder="e.g. Moved to printing, production starts Monday"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={save}
            disabled={busy}
            className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save"}
          </button>
          {formDirty && !busy && (
            <span className="text-xs text-amber-600 dark:text-amber-400" title="You'll be warned if you try to leave the page without saving.">
              ● Unsaved changes
            </span>
          )}
          {savedAt && !formDirty && <span className="text-xs text-green-600 dark:text-green-400">Saved {formatDateTime(savedAt.toISOString())}</span>}
          {err && <span className="text-xs text-red-500">{err}</span>}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 dark:bg-gray-900 dark:border-gray-800">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Tracking details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Mode of transport</label>
            <select className={inputCls} value={transportMode} onChange={(e) => setTransportMode(e.target.value)}>
              <option value="">—</option>
              <option value="Delhivery">Delhivery</option>
              <option value="Bluedart">Bluedart</option>
              <option value="Direct Vehicle">Direct Vehicle</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>LR / Vehicle number</label>
            <input
              className={inputCls}
              value={lrOrVehicleNumber}
              onChange={(e) => setLrOrVehicleNumber(e.target.value)}
              placeholder={transportMode === "Direct Vehicle" ? "MH-12-AB-1234" : "LR number"}
            />
          </div>
          <div>
            <label className={labelCls}>Driver contact</label>
            <input
              className={inputCls}
              value={driverContact}
              onChange={(e) => setDriverContact(e.target.value)}
              placeholder="Ravi — +91 98xx xx xxxx"
            />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            disabled={trackingBusy}
            onClick={async () => {
              setTrackingBusy(true); setTrackingSaved(false);
              const res = await fetch(`/api/factoryos/jobs/${job.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ transportMode, lrOrVehicleNumber, driverContact }),
              });
              setTrackingBusy(false);
              if (!res.ok) { setLrErr((await res.json()).error || "Failed"); return; }
              const data = await res.json();
              setJob(data.job);
              setTrackingSaved(true);
              setTimeout(() => setTrackingSaved(false), 2000);
            }}
            className="bg-blue-600 text-white text-sm font-medium px-3 py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-60"
          >
            {trackingBusy ? "Saving…" : "Save tracking details"}
          </button>
          {trackingSaved && <span className="text-xs text-green-600 dark:text-green-400">Saved</span>}
        </div>

        <h3 className="text-xs uppercase tracking-wide text-gray-500 font-semibold mt-6 mb-2 dark:text-gray-400">LR copies</h3>
        {job.lrFiles && job.lrFiles.length > 0 ? (
          <ul className="space-y-2 mb-4">
            {job.lrFiles.map((f) => (
              <li key={f.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-700 dark:text-gray-300 truncate">{f.filename}</span>
                <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline dark:text-blue-400 ml-3 shrink-0">
                  Download ↗
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500 mb-4 dark:text-gray-400">No LR copies yet.</p>
        )}
        <div className="flex items-center gap-3">
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            onChange={(e) => setLrFile(e.target.files?.[0] || null)}
            className="block text-sm text-gray-700 file:mr-3 file:py-1.5 file:px-3 file:border-0 file:rounded-md file:bg-blue-600 file:text-white file:text-xs hover:file:bg-blue-700 dark:text-gray-300"
          />
          <button
            type="button"
            onClick={uploadLr}
            disabled={lrBusy || !lrFile}
            className="bg-blue-600 text-white text-sm font-medium px-3 py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-60"
          >
            {lrBusy ? "Uploading…" : "Upload"}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1 dark:text-gray-500">PDF / JPG / PNG, max 5 MB. Customer can download.</p>
        {lrErr && <p className="text-xs text-red-500 mt-2">{lrErr}</p>}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 dark:bg-gray-900 dark:border-gray-800">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Timeline</h2>
        {updates.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No updates yet.</p>}
        <ol className="space-y-3">
          {updates.map((u) => (
            <li key={u.id} className="flex items-start gap-3">
              <div className="mt-1.5 w-2 h-2 rounded-full bg-blue-500 shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm">
                  <StageBadge stage={u.stage} />
                  <span className="text-xs text-gray-500 dark:text-gray-400">{formatDateTime(u.createdAt)}</span>
                  {u.updatedByName && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">by {u.updatedByName}</span>
                  )}
                </div>
                {u.note && <p className="text-sm text-gray-700 mt-1 dark:text-gray-300">{u.note}</p>}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Col({ label, value }) {
  return (
    <div>
      <dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="text-sm text-gray-900 dark:text-white">{value}</dd>
    </div>
  );
}
