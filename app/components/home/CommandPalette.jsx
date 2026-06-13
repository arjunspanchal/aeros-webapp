"use client";
// Global ⌘K / Ctrl+K command palette. Mounted by HomeClient (also reusable
// in any other surface that wants it). Search across modules, sub-tabs,
// and quick actions. Keyboard-first: ⌘K opens, arrows navigate, Enter
// selects, Esc closes. The G-then-X navigation shortcut is also hinted
// in the footer.
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const STATIC_ITEMS = [
  { kind: "module", label: "WarehouseOS",  hint: "Clearance stock, inward/outward, audits", href: "/warehouse",     module: "clearance" },
  { kind: "module", label: "FactoryOS",    hint: "Jobs, POs, production",                    href: "/factoryos",    module: "factoryos" },
  { kind: "module", label: "HR",           hint: "Employees, attendance, payroll",           href: "/hr",           module: "hr" },
  { kind: "module", label: "Payouts",      hint: "Vendor payments, due dates, calendar",     href: "/payouts",      module: "payouts" },
  { kind: "module", label: "Calculator",   hint: "Rate quoting — bag, box, cup, wrap, PP",   href: "/calculator",   module: "calculator" },
  { kind: "module", label: "RFQs",         hint: "Rate cards, past quotes, RFQ manager",     href: "/rfq-manager",  module: "rate_cards" },
  { kind: "module", label: "Catalogue",    hint: "Full SKU master",                          href: "/catalog",      module: "catalogue" },
  { kind: "module", label: "Design",       hint: "Keylines, KLDs, mockups",                  href: "/design",       always: true },
  { kind: "module", label: "Brand Kit",    hint: "Logos, palette, typography",               href: "/brand",        adminOnly: true },
  { kind: "module", label: "User Access",  hint: "Manage logins, roles, linked clients",     href: "/admin/access", adminOnly: true },

  { kind: "action", label: "New job",            hint: "Open the create-job form",   href: "/factoryos/admin/jobs/new",  module: "factoryos" },
  { kind: "action", label: "Quote a customer",   hint: "Open the calculator",        href: "/calculator/admin",          module: "calculator" },
  { kind: "action", label: "Punch in / out",     hint: "Worker self-service clock",  href: "/hr/clock",                  always: true },
  { kind: "action", label: "Mark inward stock",  hint: "Add a goods-in entry",       href: "/warehouse/inventory/inward",module: "clearance" },
  { kind: "action", label: "Mark outward stock", hint: "Record a dispatch",          href: "/warehouse/inventory/outward",module: "clearance" },
  { kind: "action", label: "Sample dispatch",    hint: "Send a sample to a prospect",href: "/warehouse/sample-dispatch", module: "clearance" },
  { kind: "action", label: "New rate card",      hint: "Build a fresh rate card",    href: "/rate-cards/admin/new",      module: "rate_cards" },
  { kind: "action", label: "Add a payout",       hint: "Log a vendor payment due",   href: "/payouts",                   module: "payouts" },

  { kind: "public", label: "Paper cups",         hint: "Public rate sheet",          href: "/paper-cups" },
  { kind: "public", label: "Paper bags",         hint: "Public rate sheet",          href: "/paper-bags" },
  { kind: "public", label: "PET cups & lids",    hint: "Public rate sheet",          href: "/pet-cups" },
  { kind: "public", label: "PP cups & IM lids",  hint: "Public rate sheet",          href: "/pp-cups" },
  { kind: "public", label: "Straws",             hint: "Public rate sheet",          href: "/straws" },
  { kind: "public", label: "Take-out containers",hint: "Public rate sheet",          href: "/take-out-containers" },
];

function filterItems(items, q) {
  if (!q.trim()) return items;
  const t = q.toLowerCase();
  return items.filter((it) =>
    it.label.toLowerCase().includes(t) ||
    it.hint.toLowerCase().includes(t) ||
    it.kind.includes(t),
  );
}

function visibleFor(session) {
  const modules = session?.modules || {};
  const isAdmin = !!session?.isAdmin;
  return STATIC_ITEMS.filter((it) => {
    if (it.always) return true;
    if (it.adminOnly) return isAdmin;
    if (it.kind === "public") return true;
    if (!session) return false;
    if (!it.module) return true;
    if (isAdmin) return true;
    return !!modules[it.module];
  });
}

const KIND_LABEL = {
  module: "MODULE",
  action: "QUICK ACTION",
  public: "PUBLIC PAGE",
};

export default function CommandPalette({ session, open, onClose }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const all = useMemo(() => visibleFor(session), [session]);
  const filtered = useMemo(() => filterItems(all, q), [all, q]);

  useEffect(() => {
    if (open) {
      setQ("");
      setCursor(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => { setCursor(0); }, [q]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => Math.min(filtered.length - 1, c + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => Math.max(0, c - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const it = filtered[cursor];
        if (it) {
          onClose();
          router.push(it.href);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, cursor, onClose, router]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector(`[data-idx="${cursor}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[14vh] px-4" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="absolute inset-0 bg-ink-900/30 backdrop-blur-sm cmdk-fade" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white border border-ink-200 rounded-lg shadow-sm overflow-hidden cmdk-rise">
        <div className="flex items-center gap-2 px-4 border-b border-ink-200">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-400">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search modules, actions, pages…"
            className="flex-1 py-3 bg-transparent outline-none text-sm text-ink-900 placeholder:text-ink-400"
          />
          <kbd className="font-mono text-[10px] text-ink-400 border border-ink-200 rounded px-1.5 py-0.5">ESC</kbd>
        </div>
        <div ref={listRef} className="max-h-[55vh] overflow-y-auto py-1.5">
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-ink-400">No matches for &quot;{q}&quot;</div>
          )}
          {filtered.map((it, i) => (
            <button
              key={it.href + i}
              data-idx={i}
              onMouseEnter={() => setCursor(i)}
              onClick={() => { onClose(); router.push(it.href); }}
              className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
                cursor === i ? "bg-ink-100" : "hover:bg-ink-50"
              }`}
            >
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${
                it.kind === "module" ? "bg-royal-600"
                : it.kind === "action" ? "bg-amber-500"
                : "bg-ink-400"
              }`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-ink-900 font-medium truncate">{it.label}</div>
                <div className="text-xs text-ink-400 truncate">{it.hint}</div>
              </div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-ink-400 shrink-0">{KIND_LABEL[it.kind]}</span>
            </button>
          ))}
        </div>
        <div className="border-t border-ink-200 bg-ink-50 px-4 py-2 flex items-center justify-between text-[10px] font-mono text-ink-400">
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1"><kbd className="border border-ink-200 rounded px-1 py-px">↑</kbd><kbd className="border border-ink-200 rounded px-1 py-px">↓</kbd> navigate</span>
            <span className="flex items-center gap-1"><kbd className="border border-ink-200 rounded px-1 py-px">↵</kbd> open</span>
            <span className="hidden sm:flex items-center gap-1">
              <kbd className="border border-ink-200 rounded px-1 py-px">G</kbd>
              <span className="text-ink-300">then</span>
              <kbd className="border border-ink-200 rounded px-1 py-px">F</kbd>
              <span>FactoryOS · </span>
              <kbd className="border border-ink-200 rounded px-1 py-px">W</kbd>
              <span>WarehouseOS · </span>
              <kbd className="border border-ink-200 rounded px-1 py-px">H</kbd>
              <span>HR</span>
            </span>
          </span>
          <span>{filtered.length} {filtered.length === 1 ? "result" : "results"}</span>
        </div>
      </div>
    </div>
  );
}
