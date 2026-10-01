"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { inputCls, labelCls, ButtonGroup } from "@/app/factoryos/_components/ui";
import { RM_FORMS, PRINTING_TYPES as PRINT_TYPES, PAPER_TYPES, MILLS, millFromPaperName, normRmForm, normPrintingType } from "@/lib/factoryos/jobOptions";
import { STAGES, LEGACY_CATEGORIES } from "@/lib/factoryos/constants";
import { LINES, lineForCategory } from "@/lib/factoryos/lines";
import { ROUTE_AT, defaultRoute, describeRoute } from "@/lib/factoryos/routes";
import { rmStockLabel, rmStockFree } from "@/lib/factoryos/rmStock";

// Fallback if the server didn't pass a precomputed J#. Returns "YYMM001"
// (just the prefix + first-of-month seq) so the form never starts blank.
function fallbackJNumber() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yy}${mm}001`;
}

const NEW_CLIENT = "__new";

// Size key for the Line → Size → Product cascade. The catalogue's size_volume
// starts with the size ("10oz / 290ml | 90 x 60 x 96 mm …", "105 x 65 x 165 mm
// (W x G x H)", "1000ml | …", "2-cup | …"); take that first segment and
// normalise spelling variants ("10 x 10 x 2.5 in (254 x …)" → "10x10x2.5 in").
// Falls back to the leading size token of the product name.
function sizeKeyOf(p) {
  let seg = String(p.sizeVolume || "").split("|")[0].trim();
  if (!seg) {
    const m = /^(\d+(?:\.\d+)?\s*(?:ml|mL|oz)(?:\s*\/\s*\d+(?:\.\d+)?\s*(?:ml|mL|oz))?|\d+\s*x\s*\d+\s*x\s*\d+(?:\.\d+)?\s*(?:mm|in)?)/i.exec(p.productName || "");
    seg = m ? m[1] : "";
  }
  seg = seg.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
  // Volumes: the catalogue writes "8oz / 250ml", "250 ml / 8 oz", "500 mL / 17 oz"
  // interchangeably — canonicalise to "<oz>oz / <ml>ml" so they merge.
  const oz = /(\d+(?:\.\d+)?)\s*oz\b/i.exec(seg);
  const ml = /(\d+(?:\.\d+)?)\s*ml\b/i.exec(seg);
  if (oz && ml) return `${oz[1]}oz / ${ml[1]}ml`;
  if (ml) return `${ml[1]}ml`;
  if (oz) return `${oz[1]}oz`;
  return seg
    .replace(/\s*x\s*/gi, "x")
    .replace(/(\d+)[\s-]+cup\b/i, "$1-cup")
    .trim();
}
// Sort volumes by ml (oz-only ≈ 30 ml/oz), dimensions numerically, else alpha.
function sizeVolumeMl(k) {
  const ml = /(\d+(?:\.\d+)?)\s*ml\b/i.exec(k);
  if (ml) return parseFloat(ml[1]);
  const oz = /(\d+(?:\.\d+)?)\s*oz\b/i.exec(k);
  if (oz) return parseFloat(oz[1]) * 30;
  return null;
}
// Volumes first by ml, then dimensions / counts in natural order.
function sizeSort(a, b) {
  const va = sizeVolumeMl(a), vb = sizeVolumeMl(b);
  if (va != null && vb != null) return va - vb || a.localeCompare(b);
  if (va != null) return -1;
  if (vb != null) return 1;
  return a.localeCompare(b, undefined, { numeric: true });
}

function Section({ title, children }) {
  return (
    <div className="border-t border-gray-100 dark:border-gray-800 pt-5 first:border-t-0 first:pt-0">
      <h3 className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-3 dark:text-gray-400">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

export default function NewJobForm({
  clients: initialClients,
  accountManagers,
  products = [],
  catalogError = null,
  masterPapers = [],
  printingVendors = [],
  initialJNumber,
  // { byClient: { clientId: [brand] }, all: [brand] } — past brands for the datalist.
  brands = { byClient: {}, all: [] },
  // RM stock lines (raw_materials) the job can draw paper from.
  rmStock = [],
  // Admin may raise a job that over-claims a stock line (with a note); factory
  // managers are blocked so stock isn't promised twice.
  canOverrideRm = false,
  // Repeat order: fields copied from a previous job (never J#, qty, dates).
  prefill = null,
}) {
  const [overrideShortRm, setOverrideShortRm] = useState(false);
  const router = useRouter();
  const [clients, setClients] = useState(initialClients);
  const [form, setForm] = useState({
    // Auto-incremented J# computed server-side from the highest sequence for
    // the current month. Editable — operators can override if they need to.
    jNumber: initialJNumber || fallbackJNumber(),
    // 'in_house' = manufactured here (full production pipeline). 'traded' =
    // bought-in and delivered (e.g. foils) — no catalogue SKU, no RM/printing.
    sourcing: "in_house",
    orderRate: "",
    clientId: "",
    newClientName: "",
    brand: "",
    customerManagerId: "",
    productId: "",
    // Category is auto-filled when the operator picks a master product —
    // the catalog category is the source of truth. Starts empty so a job
    // with no SKU selected doesn't carry a misleading default into the DB.
    category: "",
    item: "",
    itemSize: "",
    city: "",
    qty: "",
    orderDate: new Date().toISOString().slice(0, 10),
    expectedDispatchDate: "",
    estimatedDeliveryDate: "",
    stage: STAGES[0],
    poNumber: "",
    // RM
    rmStockLineId: "",
    masterPaperId: "",
    rmType: "",
    rmSupplier: "",
    rmMill: "",
    paperType: "",
    gsm: "",
    rmSizeMm: "",
    rmQtySheets: "",
    rmQtyKgs: "",
    rmDeliveryDate: "",
    // Printing / production
    printingType: "",
    printingVendor: "",
    // Where conversion / packing happen — defaulted from product + printer.
    conversionAt: "aeros",
    packingAt: "aeros",
    printingDueDate: "",
    productionDueDate: "",
    notes: "",
    ...(prefill?.fields || {}),
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [productQuery, setProductQuery] = useState("");
  // Category narrows the product list before the search filter applies —
  // 600+ rows in a single dropdown is unworkable, this scopes it to a
  // handful before the operator even types.
  // In-house jobs only ever produce the four factory lines, so the picker
  // opens on those ("line:any") instead of the 19-category catalogue.
  // Values: "line:any" | "line:<key>" | "" (whole catalogue) | a category name.
  const [productCategory, setProductCategory] = useState(prefill?.line ? `line:${prefill.line}` : "line:any");
  const [productSize, setProductSize] = useState("");
  const [masterPaperQuery, setMasterPaperQuery] = useState("");

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  const isNewClient = form.clientId === NEW_CLIENT;
  const brandOptions = useMemo(() => {
    if (form.clientId && !isNewClient) return brands.byClient?.[form.clientId] || [];
    return brands.all || [];
  }, [brands, form.clientId, isNewClient]);
  const isTraded = form.sourcing === "traded";

  // Unique categories derived from the loaded catalog. Sourcing them from the
  // products themselves keeps the dropdown honest if the taxonomy changes.
  const productCategories = useMemo(() => {
    const set = new Set();
    for (const p of products) if (p.category) set.add(p.category);
    return Array.from(set).sort();
  }, [products]);

  // Category options for the form field (post-pick). Union of catalog
  // categories + the legacy hardcoded values so editing an old job whose
  // category was set under the old taxonomy still displays its value. Plus
  // the current form value itself (covers freeform / unusual inputs).
  const formCategoryOptions = useMemo(() => {
    const set = new Set(productCategories);
    for (const c of LEGACY_CATEGORIES) set.add(c);
    if (form.category) set.add(form.category);
    return Array.from(set).sort();
  }, [productCategories, form.category]);

  // Filter pipeline: line / category (if set) → text search. The 200 cap
  // only applies to the whole unfiltered catalogue; a chosen line or
  // category is small enough to list in full (largest is Paper Bags).
  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    // FactoryOS doesn't record traded items — only what the factory makes.
    let list = products.filter((p) => p.inHouse);
    if (productCategory === "line:any") {
      list = list.filter((p) => lineForCategory(p.category, p.subCategory) !== null);
    } else if (productCategory.startsWith("line:")) {
      const key = productCategory.slice(5);
      list = list.filter((p) => lineForCategory(p.category, p.subCategory) === key);
    } else if (productCategory) {
      list = list.filter((p) => p.category === productCategory);
    }
    if (productSize) list = list.filter((p) => sizeKeyOf(p) === productSize);
    if (q) list = list.filter((p) => `${p.productName} ${p.sku} ${p.category} ${p.sizeVolume}`.toLowerCase().includes(q));
    return productCategory || q ? list : list.slice(0, 200);
  }, [products, productQuery, productCategory, productSize]);

  // Sizes available in the chosen line (before the size / search filters).
  const sizeOptions = useMemo(() => {
    let list = products.filter((p) => p.inHouse);
    if (productCategory === "line:any") list = list.filter((p) => lineForCategory(p.category, p.subCategory) !== null);
    else if (productCategory.startsWith("line:")) {
      const key = productCategory.slice(5);
      list = list.filter((p) => lineForCategory(p.category, p.subCategory) === key);
    } else if (productCategory) list = list.filter((p) => p.category === productCategory);
    const set = new Set();
    for (const p of list) { const k = sizeKeyOf(p); if (k) set.add(k); }
    return [...set].sort(sizeSort);
  }, [products, productCategory]);

  function onPickProduct(id) {
    const p = products.find((x) => x.id === id);
    if (!p) { set("productId", ""); return; }
    setForm((f) => ({
      ...f,
      productId: id,
      item: p.productName,
      ...defaultRoute({ category: p.category, subCategory: p.subCategory, item: p.productName, printingVendor: f.printingVendor }),
      itemSize: p.sizeVolume || f.itemSize,
      // Use the catalog's category verbatim. The previous gate
      // (`CATEGORIES.includes(...) ? p.category : f.category`) silently
      // discarded any catalog value that didn't appear in the hardcoded
      // legacy list — so picking a Lid / Take Out Container / Deli Wrap
      // / Straw would leave the field on whatever the form default was.
      // Source of truth is the catalog. Audit finding C6.
      category: p.category || f.category,
      gsm: p.gsm != null ? String(p.gsm) : f.gsm,
      paperType: p.material || f.paperType,
    }));
  }

  // Filter master papers by typed text — name / supplier / type / GSM / BF.
  const filteredMasterPapers = useMemo(() => {
    const q = masterPaperQuery.trim().toLowerCase();
    if (!q) return masterPapers.slice(0, 200);
    return masterPapers
      .filter((mp) => `${mp.materialName} ${mp.supplier} ${mp.type} ${mp.gsm ?? ""} ${mp.bf ?? ""}`.toLowerCase().includes(q))
      .slice(0, 200);
  }, [masterPapers, masterPaperQuery]);

  // Paper from stock: fill the RM fields from the stock line, and since the
  // paper is already here the job can start at Under Printing instead of
  // RM Pending (operator can still change the starting stage below).
  const supplierOptions = useMemo(() => {
    const set = new Set();
    for (const mp of masterPapers) if (mp.supplier) set.add(mp.supplier.trim());
    for (const rm of rmStock) if (rm.supplier) set.add(rm.supplier.trim());
    for (const x of ["KC Paper", "Janta Paper", "Kesari Paper", "Unisource", "Wikas"]) set.add(x);
    // Anything that resolves to a mill belongs in the Mill picker, not here.
    for (const x of [...set]) if (millFromPaperName(x)) set.delete(x);
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [masterPapers, rmStock]);
  const millOptions = useMemo(() => {
    const set = new Set(MILLS);
    for (const rm of rmStock) if (rm.mill) set.add(rm.mill.trim());
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [rmStock]);

  const linkedRm = useMemo(() => rmStock.find((x) => x.id === form.rmStockLineId) || null, [rmStock, form.rmStockLineId]);

  function onPickRmStock(id) {
    const rm = rmStock.find((x) => x.id === id);
    if (!rm) { set("rmStockLineId", ""); return; }
    setForm((f) => ({
      ...f,
      rmStockLineId: id,
      rmType: normRmForm(rm.form) || f.rmType,
      rmSupplier: rm.supplier || f.rmSupplier,
      rmMill: rm.mill || millFromPaperName(rm.name) || f.rmMill,
      paperType: rm.paperType || f.paperType,
      gsm: rm.gsm != null ? String(rm.gsm) : f.gsm,
      rmSizeMm: rm.widthMm != null ? String(rm.widthMm) : f.rmSizeMm,
      stage: f.stage === "RM Pending" ? "Under Printing" : f.stage,
    }));
  }

  function onPickMasterPaper(id) {
    const mp = masterPapers.find((x) => x.id === id);
    if (!mp) { set("masterPaperId", ""); return; }
    setForm((f) => ({
      ...f,
      masterPaperId: id,
      paperType: mp.type || f.paperType,
      rmSupplier: mp.supplier || f.rmSupplier,
      rmMill: millFromPaperName(mp.materialName) || f.rmMill,
      gsm: mp.gsm != null ? String(mp.gsm) : f.gsm,
      rmType: normRmForm(mp.form) || f.rmType,
    }));
  }

  async function submit(e) {
    e.preventDefault();
    setErr(""); setBusy(true);

    // Belt-and-braces guard — HTML5 `required` on the select also enforces this, but if
    // someone bypasses the browser we still catch it here before hitting the API.
    // Both in-house and traded jobs pick from the catalogue so the job maps to a DB SKU.
    const pickedProduct = products.find((p) => p.id === form.productId);
    if (!pickedProduct) {
      setErr("Pick a product from the master catalogue — required so this job maps to an SKU.");
      setBusy(false);
      return;
    }

    if (linkedRm) {
      const need = Number(/sheet/i.test(linkedRm.form) ? form.rmQtySheets : form.rmQtyKgs) || 0;
      if (!(need > 0)) {
        setErr(`Enter the ${/sheet/i.test(linkedRm.form) ? "sheets" : "kg"} this job needs from the stock line you picked.`);
        setBusy(false);
        return;
      }
      const free = rmStockFree(linkedRm);
      if (free && need > free.free && !(canOverrideRm && overrideShortRm)) {
        setErr(`Only ${free.free.toLocaleString("en-IN")} ${free.unit} of this stock line are free (${(need - free.free).toLocaleString("en-IN")} short). Reduce the quantity, pick another line, or leave the stock line blank and order paper.${canOverrideRm ? " Or tick the admin override below." : ""}`);
        setBusy(false);
        return;
      }
    }

    let clientId = form.clientId;
    if (isNewClient) {
      const trimmed = form.newClientName.trim();
      if (!trimmed) { setErr("Enter a name for the new client"); setBusy(false); return; }
      const cRes = await fetch("/api/factoryos/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!cRes.ok) { setErr(`Couldn't create client: ${(await cRes.json()).error || "Failed"}`); setBusy(false); return; }
      const cData = await cRes.json();
      clientId = cData.client.id;
      setClients((prev) => [...prev, cData.client].sort((a, b) => a.name.localeCompare(b.name)));
    }

    const body = {
      ...form,
      clientId,
      // Snapshot the master SKU + name at creation time. Master catalogue can change later;
      // the job-level record keeps the original mapping so FG ledger stays consistent.
      overrideShortRm: canOverrideRm && overrideShortRm,
      copySpecFromJobId: prefill?.fromJobId || undefined,
      masterSku: pickedProduct.sku || "",
      masterProductName: pickedProduct.productName || "",
      orderRate: form.orderRate ? Number(form.orderRate) : undefined,
      qty: form.qty ? Number(form.qty) : undefined,
      gsm: form.gsm ? Number(form.gsm) : undefined,
      rmSizeMm: form.rmSizeMm ? Number(form.rmSizeMm) : undefined,
      rmQtySheets: form.rmQtySheets ? Number(form.rmQtySheets) : undefined,
      rmQtyKgs: form.rmQtyKgs ? Number(form.rmQtyKgs) : undefined,
      customerManagerId: form.customerManagerId || undefined,
      orderDate: form.orderDate || undefined,
      expectedDispatchDate: form.expectedDispatchDate || undefined,
      estimatedDeliveryDate: form.estimatedDeliveryDate || undefined,
      rmDeliveryDate: form.rmDeliveryDate || undefined,
      printingDueDate: form.printingDueDate || undefined,
      productionDueDate: form.productionDueDate || undefined,
    };
    delete body.newClientName;
    delete body.productId;
    delete body.masterPaperId;

    const res = await fetch("/api/factoryos/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) { setErr((await res.json()).error || "Failed"); return; }
    const data = await res.json();
    // Route via the manager detail path — it resolves to the right surface for
    // every internal role (admin → admin job page, AM/FM → manager page).
    router.push(`/factoryos/manager/${data.job.id}`);
  }

  return (
    <form onSubmit={submit} className="mt-6 bg-white border border-gray-200 rounded-xl p-5 space-y-5 dark:bg-gray-900 dark:border-gray-800">
      {prefill && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-900/20 dark:text-blue-200">
          Repeating <span className="font-mono">J# {prefill.fromJNumber}</span> — product, paper, printer and job-order spec are copied. Enter the new quantity and dates, check RM, then create.
        </div>
      )}
      {/* Item type toggle removed 01-Oct-2026: FactoryOS records in-house jobs only. */}

      <Section title="Basics">
        <div>
          <label className={labelCls}>J#</label>
          <input className={inputCls} value={form.jNumber} onChange={(e) => set("jNumber", e.target.value)} required />
        </div>
        <div>
          <label className={labelCls}>PO number (optional)</label>
          <input className={inputCls} value={form.poNumber} onChange={(e) => set("poNumber", e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Customer</label>
          <select className={inputCls} value={form.clientId} onChange={(e) => set("clientId", e.target.value)} required>
            <option value="">Select customer…</option>
            <option value={NEW_CLIENT}>+ Create new customer</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {isNewClient && (
            <input
              className={`${inputCls} mt-2`}
              placeholder="New customer name, e.g. Brewbay"
              value={form.newClientName}
              onChange={(e) => set("newClientName", e.target.value)}
              required
              autoFocus
            />
          )}
        </div>
        <div>
          <label className={labelCls}>Brand</label>
          {/* datalist = dropdown of brands already recorded for this customer
              (all customers' brands until one is picked), but free text still
              works for a brand we haven't seen. */}
          <input
            className={inputCls}
            list="brand-options"
            value={form.brand}
            onChange={(e) => set("brand", e.target.value)}
            placeholder={brandOptions.length ? "Pick a past brand or type a new one" : "e.g. aB Coffee"}
            autoComplete="off"
          />
          <datalist id="brand-options">
            {brandOptions.map((b) => <option key={b} value={b} />)}
          </datalist>
        </div>
        <div>
          <label className={labelCls}>Account manager <span className="font-normal normal-case text-gray-400">(handles the customer)</span></label>
          <select className={inputCls} value={form.customerManagerId} onChange={(e) => set("customerManagerId", e.target.value)}>
            <option value="">—</option>
            {accountManagers.map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Order date</label>
          <input type="date" className={inputCls} value={form.orderDate} onChange={(e) => set("orderDate", e.target.value)} />
        </div>
      </Section>

      <Section title="Item">
        <div className="sm:col-span-2">
          <label className={labelCls}>
            Master product <span className="text-red-500">*</span>
            <span className="ml-2 text-[11px] font-normal normal-case text-gray-500 dark:text-gray-400">
              required — pick the SKU this job produces; auto-fills item, size, category, GSM, material
            </span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
            <select
              className={inputCls}
              value={productCategory}
              onChange={(e) => { setProductCategory(e.target.value); setProductSize(""); }}
              aria-label="Category"
            >
              <option value="line:any">All in-house products</option>
              {LINES.map((l) => (
                <option key={l.key} value={`line:${l.key}`}>{l.label}</option>
              ))}
            </select>
            <select
              className={inputCls}
              value={productSize}
              onChange={(e) => setProductSize(e.target.value)}
              aria-label="Size"
            >
              <option value="">All sizes ({sizeOptions.length})</option>
              {sizeOptions.map((sz) => <option key={sz} value={sz}>{sz}</option>)}
            </select>
            <input
              className={inputCls}
              placeholder={`Search ${filteredProducts.length === products.length ? products.length : `${filteredProducts.length} of ${products.length}`} products by name / SKU / size…`}
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
            />
          </div>
          <select
            className={inputCls}
            value={form.productId}
            onChange={(e) => onPickProduct(e.target.value)}
            required
          >
            <option value="">— Select a master product —</option>
            {filteredProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.productName}{p.sku ? ` (${p.sku})` : ""}{p.sizeVolume ? ` · ${p.sizeVolume}` : ""}
              </option>
            ))}
          </select>
          {(() => {
            const pp = products.find((x) => x.id === form.productId);
            if (!pp) return null;
            return (
              <p className="mt-1.5 text-xs text-gray-700 dark:text-gray-300">
                <span className="text-gray-500 dark:text-gray-400">Dimensions: </span>
                <span className="font-medium">{pp.sizeVolume || "not recorded in catalogue"}</span>
                {pp.sku && <span className="ml-2 font-mono text-gray-500 dark:text-gray-400">{pp.sku}</span>}
              </p>
            );
          })()}
          {products.length === 0 && (
            <div className="mt-1 text-xs text-red-600 dark:text-red-400 space-y-1">
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
          )}
        </div>
        <div>
          <label className={labelCls}>Category</label>
          <select className={inputCls} value={form.category} onChange={(e) => set("category", e.target.value)}>
            <option value="">— Select category —</option>
            {formCategoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Item</label>
          <input className={inputCls} value={form.item} onChange={(e) => set("item", e.target.value)} placeholder="e.g. 250 ml DW Paper Cup" required />
        </div>
        <div>
          <label className={labelCls}>Item size <span className="font-normal normal-case text-gray-400">(from the product)</span></label>
          <input className={`${inputCls} bg-gray-50 text-gray-600 dark:bg-gray-800/60`} value={form.itemSize} readOnly tabIndex={-1} placeholder="fills in when you pick a product" />
        </div>
        <div>
          <label className={labelCls}>Delivery city</label>
          <input className={inputCls} list="city-options" autoComplete="off" placeholder="e.g. Mumbai — the printer goes in Printing vendor below" value={form.city} onChange={(e) => set("city", e.target.value)} />
          <datalist id="city-options">
            {["Mumbai", "Bhiwandi", "Pune", "Delhi", "Bengaluru", "Hyderabad", "Chennai", "Ahmedabad", "Surat", "Vapi"].map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div>
          <label className={labelCls}>Quantity</label>
          <input type="number" className={inputCls} value={form.qty} onChange={(e) => set("qty", e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Rate (₹/unit)</label>
          <input type="number" step="0.0001" className={inputCls} value={form.orderRate} onChange={(e) => set("orderRate", e.target.value)} placeholder="e.g. 0.72" />
        </div>
        <div>
          <label className={labelCls}>Expected dispatch <span className="font-normal normal-case text-gray-400">(customer promise — defaults to production due)</span></label>
          <input type="date" className={inputCls} value={form.expectedDispatchDate} onChange={(e) => set("expectedDispatchDate", e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Estimated delivery (customer-facing ETA)</label>
          <input type="date" className={inputCls} value={form.estimatedDeliveryDate} onChange={(e) => set("estimatedDeliveryDate", e.target.value)} />
        </div>
      </Section>

      {!isTraded && (
      <Section title="Raw material">
        <div className="sm:col-span-2">
          <label className={labelCls}>Paper from RM stock (what we're holding right now)</label>
          <select className={inputCls} value={form.rmStockLineId} onChange={(e) => onPickRmStock(e.target.value)}>
            <option value="">— Not from stock / paper to be ordered —</option>
            {rmStock.map((rm) => <option key={rm.id} value={rm.id}>{rmStockLabel(rm)}</option>)}
          </select>
          <p className="text-[11px] text-gray-400 mt-1 dark:text-gray-500">
            Picking a stock line fills the paper details below and starts the job at Under Printing. Leave blank if the paper still has to be bought.
          </p>
        </div>
        {linkedRm && (() => {
          const free = rmStockFree(linkedRm);
          const isSheets = /sheet/i.test(linkedRm.form);
          const need = Number(isSheets ? form.rmQtySheets : form.rmQtyKgs) || 0;
          const short = free && need > free.free;
          return (
            <div className={`sm:col-span-2 rounded-lg border px-3 py-3 ${short ? "border-amber-400 bg-amber-50 dark:bg-amber-900/20" : "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/40"}`}>
              <label className={labelCls}>
                RM required for this job <span className="text-red-500">*</span>
                <span className="ml-1 font-normal normal-case">({isSheets ? "sheets" : "kg"})</span>
              </label>
              <input
                type="number"
                min="0"
                step={isSheets ? "1" : "0.1"}
                className={`${inputCls} sm:max-w-xs`}
                value={isSheets ? form.rmQtySheets : form.rmQtyKgs}
                onChange={(e) => set(isSheets ? "rmQtySheets" : "rmQtyKgs", e.target.value)}
                placeholder={isSheets ? "e.g. 1200" : "e.g. 350"}
              />
              {free ? (
                <p className={`mt-1.5 text-xs ${short ? "text-amber-800 dark:text-amber-300" : "text-gray-600 dark:text-gray-300"}`}>
                  In stock {free.onHand.toLocaleString("en-IN")} {free.unit}
                  {free.reserved > 0 && <> · already claimed by open jobs {free.reserved.toLocaleString("en-IN")} {free.unit}</>}
                  {" "}· <span className="font-semibold">free {free.free.toLocaleString("en-IN")} {free.unit}</span>
                  {short && <> — short by {(need - free.free).toLocaleString("en-IN")} {free.unit}. {canOverrideRm ? "Admin can override below; otherwise reduce or order paper." : "Reduce the quantity, pick another line, or leave the stock line blank and order paper."}</>}
                </p>
              ) : null}
              {short && canOverrideRm ? (
                <label className="mt-2 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
                  <input type="checkbox" checked={overrideShortRm} onChange={(e) => setOverrideShortRm(e.target.checked)} />
                  Admin override — raise the job anyway; RM will be topped up
                </label>
              ) : (
                <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">Stock quantity not recorded for this line yet.</p>
              )}
            </div>
          );
        })()}
        <div className="sm:col-span-2">
          <label className={labelCls}>Or pick from the Paper RM Database (paper to order — auto-fills type, GSM, supplier)</label>
          <input
            className={`${inputCls} mb-2`}
            placeholder={`Search ${masterPapers.length} master papers by name / supplier / type / GSM…`}
            value={masterPaperQuery}
            onChange={(e) => setMasterPaperQuery(e.target.value)}
          />
          <select className={inputCls} value={form.masterPaperId} onChange={(e) => onPickMasterPaper(e.target.value)}>
            <option value="">— None (enter manually below) —</option>
            {filteredMasterPapers.map((mp) => (
              <option key={mp.id} value={mp.id}>
                {mp.materialName}
                {mp.bf != null ? ` · ${mp.bf} BF` : ""}
                {mp.effectiveRate != null ? ` · ₹${mp.effectiveRate}/kg` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>RM type</label>
          <ButtonGroup value={form.rmType} onChange={(v) => set("rmType", v)} options={RM_FORMS} />
        </div>
        <div>
          <label className={labelCls}>RM supplier</label>
          <input className={inputCls} list="rm-supplier-options" autoComplete="off" value={form.rmSupplier} onChange={(e) => set("rmSupplier", e.target.value)} placeholder="pick or type" />
          <datalist id="rm-supplier-options">
            {supplierOptions.map((x) => <option key={x} value={x} />)}
          </datalist>
        </div>
        <div>
          <label className={labelCls}>Mill (manufacturer)</label>
          <input className={inputCls} list="rm-mill-options" autoComplete="off" value={form.rmMill} onChange={(e) => set("rmMill", e.target.value)} placeholder="e.g. ITC, BILT, JK" />
          <datalist id="rm-mill-options">
            {millOptions.map((x) => <option key={x} value={x} />)}
          </datalist>
        </div>
        <div>
          <label className={labelCls}>Paper type</label>
          <select className={inputCls} value={form.paperType} onChange={(e) => set("paperType", e.target.value)}>
            <option value="">—</option>
            {form.paperType && !PAPER_TYPES.includes(form.paperType) && <option value={form.paperType}>{form.paperType}</option>}
            {PAPER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>GSM</label>
          <input type="number" className={inputCls} value={form.gsm} onChange={(e) => set("gsm", e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>RM size (mm)</label>
          <input type="number" className={inputCls} value={form.rmSizeMm} onChange={(e) => set("rmSizeMm", e.target.value)} placeholder="e.g. 890" />
        </div>
        {!linkedRm && (
          <>
            {/* Paper not in stock yet: the quantity still goes on the job so
                purchasing knows what to order, and the job sits at RM Pending. */}
            <div>
              <label className={labelCls}>RM to order — sheets</label>
              <input type="number" className={inputCls} value={form.rmQtySheets} onChange={(e) => set("rmQtySheets", e.target.value)} placeholder="if sheet stock" />
            </div>
            <div>
              <label className={labelCls}>RM to order — kg</label>
              <input type="number" step="0.01" className={inputCls} value={form.rmQtyKgs} onChange={(e) => set("rmQtyKgs", e.target.value)} placeholder="if roll stock" />
            </div>
            <p className="sm:col-span-2 -mt-2 text-[11px] text-gray-400 dark:text-gray-500">
              No stock line picked, so this job starts at RM Pending. Enter what has to be ordered; once it arrives, link the job to the new stock line on the job page.
            </p>
          </>
        )}
        <div>
          <label className={labelCls}>RM delivery date</label>
          <input type="date" className={inputCls} value={form.rmDeliveryDate} onChange={(e) => set("rmDeliveryDate", e.target.value)} />
        </div>
      </Section>
      )}

      {!isTraded && (
      <Section title="Printing & production">
        <div>
          <label className={labelCls}>Printing type</label>
          <ButtonGroup value={form.printingType} onChange={(v) => set("printingType", v)} options={PRINT_TYPES} />
        </div>
        <div>
          <label className={labelCls}>Printing vendor</label>
          <select
            className={inputCls}
            value={form.printingVendor}
            onChange={(e) => {
              const v = e.target.value;
              // Printer choice can change the route (table mats: Viana packs).
              setForm((f) => ({ ...f, printingVendor: v, ...defaultRoute({ category: f.category, item: f.item, printingVendor: v }) }));
            }}
          >
            <option value="">—</option>
            {printingVendors.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Where does the work happen?</label>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {[["conversionAt", "Conversion"], ["packingAt", "Packing"]].map(([k, label]) => (
              <div key={k} className="flex items-center gap-2">
                <span className="text-sm text-gray-600 dark:text-gray-300 w-20">{label}</span>
                <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  {ROUTE_AT.map((o) => (
                    <button
                      type="button"
                      key={o.value}
                      onClick={() => set(k, o.value)}
                      className={`px-3 py-1 text-sm ${form[k] === o.value
                        ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                        : "bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-300"}`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {describeRoute(form)}. Stages that happen at the vendor are skipped on this job.
          </p>
        </div>
        <div>
          <label className={labelCls}>Printing due date</label>
          <input type="date" className={inputCls} value={form.printingDueDate} onChange={(e) => set("printingDueDate", e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Production due date <span className="font-normal normal-case text-gray-400">(the floor works to this)</span></label>
          <input
            type="date"
            className={inputCls}
            value={form.productionDueDate}
            onChange={(e) => {
              const v = e.target.value;
              // Expected dispatch follows production due unless the AM set it.
              setForm((f) => ({ ...f, productionDueDate: v, expectedDispatchDate: f.expectedDispatchDate || v }));
            }}
          />
        </div>
      </Section>
      )}

      <Section title="Workflow">
        <div>
          <label className={labelCls}>Starting stage</label>
          <select className={inputCls} value={form.stage} onChange={(e) => set("stage", e.target.value)}>
            {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Notes (visible to customer)</label>
          <textarea rows={2} className={inputCls} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>
      </Section>

      <div className="flex items-center gap-3 pt-2">
        <button disabled={busy} className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60">
          {busy ? "Creating…" : "Create job"}
        </button>
        {err && <span className="text-xs text-red-500">{err}</span>}
      </div>
    </form>
  );
}
