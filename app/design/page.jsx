// Design-system showcase. URL: /design.
//
// Hidden from nav by enumeration — no link points here. Not in the middleware
// matcher (verified: middleware.js's matcher covers only the modules + their
// API namespaces, not /design). Ugly-honest by intent: a QA reference for
// every primitive and token, in one place, no marketing copy.
//
// Self-contained light island: the wrapper sets bg-ink-50 + text-ink-800 so
// the page renders consistently regardless of the user's theme cookie.

import {
  Button,
  Card,
  Input,
  Badge,
  EmptyState,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/app/components/ui";

export const metadata = {
  title: "Aeros — Design tokens",
  robots: { index: false, follow: false },
};

export default function DesignPage() {
  return (
    <div className="min-h-screen bg-ink-50 text-ink-800">
      <main className="max-w-5xl mx-auto px-6 py-12 space-y-16">
        <Header />
        <Section title="01 — Color tokens"><Swatches /></Section>
        <Section title="02 — Type ramp"><TypeRamp /></Section>
        <Section title="03 — Buttons"><ButtonsGrid /></Section>
        <Section title="04 — Inputs"><InputsGrid /></Section>
        <Section title="05 — Cards"><CardsRow /></Section>
        <Section title="06 — Badges"><BadgesRow /></Section>
        <Section title="07 — Tables"><TableExample /></Section>
        <Section title="08 — Empty state"><EmptyStateExample /></Section>
        <Section title="09 — Paper grain"><PaperGrainRow /></Section>
        <Footer />
      </main>
    </div>
  );
}

// ─── Layout helpers ─────────────────────────────────────────────────────────

function Header() {
  return (
    <header className="border-b border-ink-200 pb-6">
      <p className="font-mono text-xs text-ink-400 uppercase tracking-wider">Aeros · Design system · v1</p>
      <h1 className="font-logo text-display-md text-ink-900 mt-2">Tokens &amp; primitives</h1>
      <p className="text-sm text-ink-600 mt-3 max-w-xl">
        Reference page for color, type, and primitive components. Not for end
        users. Hidden from navigation; access by URL only.
      </p>
    </header>
  );
}

function Section({ title, children }) {
  return (
    <section>
      <h2 className="font-mono text-xs uppercase tracking-wider text-ink-400 mb-4">{title}</h2>
      {children}
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-ink-200 pt-6">
      <p className="font-mono text-xs text-ink-400">end · /design</p>
    </footer>
  );
}

// ─── 01 — Color tokens ──────────────────────────────────────────────────────

function Swatches() {
  return (
    <div className="space-y-6">
      <SwatchGroup name="ink" entries={[
        ["50",  "#FAFAF7"], ["100", "#F1F1ED"], ["200", "#E2E2DC"],
        ["400", "#9A9A92"], ["600", "#56564F"], ["800", "#262622"], ["900", "#0F0F0D"],
      ]} />
      <SwatchGroup name="slate" entries={[
        ["50",  "#F5F6F8"], ["100", "#E8EAEF"], ["200", "#CFD3DC"],
        ["400", "#7C8294"], ["600", "#454B5C"], ["800", "#1F2330"], ["900", "#0E1018"],
      ]} />
      <SwatchGroup name="royal" entries={[
        ["600", "#2347D9"], ["700", "#1A37B3"], ["800", "#142890"],
      ]} />
      <SwatchGroup name="brand" entries={[
        ["50",  "#FEF7EE"], ["100", "#FDECD3"], ["500", "#F59E0B"],
        ["600", "#D97706"], ["700", "#B45309"],
      ]} />
    </div>
  );
}

function SwatchGroup({ name, entries }) {
  return (
    <div>
      <p className="font-mono text-xs text-ink-400 mb-2">{name}</p>
      <div className="flex flex-wrap gap-3">
        {entries.map(([step, hex]) => (
          <div key={step} className="border border-ink-200 rounded-md bg-white overflow-hidden">
            <div className="h-20 w-24" style={{ backgroundColor: hex }} />
            <div className="px-2 py-1.5 text-[11px] font-mono leading-tight">
              <div className="text-ink-800">{name}-{step}</div>
              <div className="text-ink-400">{hex}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 02 — Type ramp ─────────────────────────────────────────────────────────

const RAMP_STRING = "The quick brown fox jumps over 1,24,500 paper bags.";
const SCALE = [
  { cls: "text-xs",          label: "text-xs · 12/16" },
  { cls: "text-sm",          label: "text-sm · 14/20" },
  { cls: "text-base",        label: "text-base · 16/24" },
  { cls: "text-lg",          label: "text-lg · 18/28" },
  { cls: "text-xl",          label: "text-xl · 20/28" },
  { cls: "text-2xl",         label: "text-2xl · 24/32" },
  { cls: "text-3xl",         label: "text-3xl · 30/36" },
  { cls: "text-4xl",         label: "text-4xl · 36/40" },
  { cls: "text-display-sm",  label: "text-display-sm · 24/32" },
  { cls: "text-display-md",  label: "text-display-md · 32/40" },
  { cls: "text-display-lg",  label: "text-display-lg · 48/56" },
  { cls: "text-display-xl",  label: "text-display-xl · 64/72" },
  { cls: "text-display-2xl", label: "text-display-2xl · 96/100" },
];

function TypeRamp() {
  return (
    <div className="grid md:grid-cols-2 gap-8">
      <div>
        <p className="font-mono text-xs text-ink-400 mb-3">font-sans (Plus Jakarta Sans)</p>
        <div className="space-y-3">
          {SCALE.map(({ cls, label }) => (
            <div key={cls}>
              <p className="font-mono text-[11px] text-ink-400">{label}</p>
              <p className={`${cls} text-ink-900`}>{RAMP_STRING}</p>
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="font-mono text-xs text-ink-400 mb-3">font-mono (IBM Plex Mono)</p>
        <div className="space-y-3">
          {SCALE.map(({ cls, label }) => (
            <div key={cls}>
              <p className="font-mono text-[11px] text-ink-400">{label}</p>
              <p className={`${cls} font-mono text-ink-900`}>{RAMP_STRING}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── 03 — Buttons ───────────────────────────────────────────────────────────

function ButtonsGrid() {
  return (
    <div className="space-y-6">
      {(["primary", "secondary", "tertiary", "danger"]).map((variant) => (
        <div key={variant}>
          <p className="font-mono text-xs text-ink-400 mb-2">variant: {variant}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant={variant} size="sm">Small</Button>
            <Button variant={variant} size="md">Medium</Button>
            <Button variant={variant} size="lg">Large</Button>
            <Button variant={variant} loading>Loading</Button>
            <Button variant={variant} disabled>Disabled</Button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── 04 — Inputs ────────────────────────────────────────────────────────────

function InputsGrid() {
  return (
    <div className="grid md:grid-cols-2 gap-x-8 gap-y-6 max-w-3xl">
      <Input label="Default" placeholder="Type here…" />
      <Input label="With helper" placeholder="you@aeros.in" helper="We'll send a one-time code." />
      <Input label="With error" placeholder="abc" error="Code must be 6 digits." />
      <Input label="Mono variant" mono placeholder="123456" />
      <Input label="Email" type="email" placeholder="you@aeros.in" />
      <Input label="Phone" type="tel" placeholder="98765 43210" />
      <Input label="Number" type="number" placeholder="0" />
      <Input label="Password" type="password" placeholder="••••••••" />
    </div>
  );
}

// ─── 05 — Cards ─────────────────────────────────────────────────────────────

function CardsRow() {
  return (
    <div className="grid md:grid-cols-3 gap-6">
      <Card>
        <p className="font-mono text-xs text-ink-400">bare card</p>
        <p className="mt-1 text-sm text-ink-600">Default p-6 padding.</p>
      </Card>
      <Card>
        <h3 className="text-base font-medium text-ink-900">Card with title</h3>
        <p className="mt-2 text-sm text-ink-600">
          Border-only, no shadow. Border-200 ink, rounded-md.
        </p>
      </Card>
      <Card padded={false}>
        <Table>
          <THead>
            <TR>
              <TH>SKU</TH>
              <TH className="text-right font-mono">Qty</TH>
            </TR>
          </THead>
          <TBody>
            <TR><TD>BAG-SOS-12</TD><TD className="text-right font-mono">1,200</TD></TR>
            <TR><TD>BAG-V-08</TD><TD className="text-right font-mono">840</TD></TR>
            <TR><TD>BOX-CLAM-06</TD><TD className="text-right font-mono">2,500</TD></TR>
          </TBody>
        </Table>
      </Card>
    </div>
  );
}

// ─── 06 — Badges ────────────────────────────────────────────────────────────

function BadgesRow() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Badge>default</Badge>
      <Badge variant="success">success</Badge>
      <Badge variant="warning">warning</Badge>
      <Badge variant="danger">danger</Badge>
      <Badge variant="info">info</Badge>
      <Badge mono>J# 04211</Badge>
      <Badge variant="info" mono>1,240 cases</Badge>
    </div>
  );
}

// ─── 07 — Tables ────────────────────────────────────────────────────────────

function TableExample() {
  const rows = [
    { jno: "J# 04211", brand: "Wellbeing", item: "Brown SOS 12oz",  qty: 15000, total: 142500 },
    { jno: "J# 04212", brand: "Talico",     item: "V-Bottom 6oz",    qty: 22000, total: 178200 },
    { jno: "J# 04213", brand: "Acme Foods", item: "Clamshell 750ml", qty:  8000, total:  96000 },
  ];
  return (
    <div className="border border-ink-200 rounded-md bg-white overflow-hidden">
      <Table>
        <THead>
          <TR>
            <TH className="font-mono">J#</TH>
            <TH>Brand</TH>
            <TH>Item</TH>
            <TH className="text-right font-mono">Qty</TH>
            <TH className="text-right font-mono">Total (₹)</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.jno}>
              <TD className="font-mono">{r.jno}</TD>
              <TD>{r.brand}</TD>
              <TD>{r.item}</TD>
              <TD className="text-right font-mono">{r.qty.toLocaleString("en-IN")}</TD>
              <TD className="text-right font-mono">{r.total.toLocaleString("en-IN")}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}

// ─── 08 — Empty state ───────────────────────────────────────────────────────

function EmptyStateExample() {
  return (
    <Card padded={false}>
      <EmptyState
        title="No jobs yet."
        description="Create one to get started, or wait for an account manager to open the next PO."
        action={<Button variant="primary" size="md">+ New job</Button>}
      />
    </Card>
  );
}

// ─── 09 — Paper grain ───────────────────────────────────────────────────────

function PaperGrainRow() {
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="border border-ink-200 rounded-md overflow-hidden">
        <div className="h-32 bg-ink-50 bg-paper-grain" />
        <p className="px-3 py-2 font-mono text-xs text-ink-400 border-t border-ink-200">
          .bg-paper-grain · alpha 0.045
        </p>
      </div>
      <div className="border border-ink-200 rounded-md overflow-hidden">
        <div className="h-32 bg-ink-50 bg-paper-grain-strong" />
        <p className="px-3 py-2 font-mono text-xs text-ink-400 border-t border-ink-200">
          .bg-paper-grain-strong · alpha 0.09
        </p>
      </div>
    </div>
  );
}
