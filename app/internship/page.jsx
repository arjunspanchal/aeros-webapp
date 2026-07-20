import Link from "next/link";
import { Brand } from "@/app/components/ui/Brand";
import { getKit } from "@/lib/hr/internshipKit";

// PUBLIC internship landing page — the single link shared with candidates. Not
// in the middleware matcher, so it renders for anyone (no login). This page
// carries all the program info (roles, program-at-a-glance, FAQ, contact); the
// application FORM lives on /internship/apply, reached via the Apply buttons.
//
// All content comes from the `internship_kit` Supabase row (getKit), editable
// live at /hr/internship-kit. getKit() fails safe to baked-in defaults, so this
// open page can never break on a bad/absent row.

export const metadata = {
  title: "Internships at Aeros — Program 2026",
  description:
    "The Aeros internship program (Mumbai, India): roles across Supply Chain & Operations, Management and E-commerce Sales, a ₹10,000–15,000/month stipend, ChatGPT subscription, PPO track and completion certificate. Learn about the program and apply.",
};

export const dynamic = "force-dynamic";

function ApplyButton({ className = "" }) {
  return (
    <Link
      href="/internship/apply"
      className={`inline-flex items-center gap-1.5 rounded bg-royal-600 font-medium text-white hover:bg-royal-700 ${className}`}
    >
      Apply now <span aria-hidden="true">→</span>
    </Link>
  );
}

export default async function InternshipLandingPage() {
  const kit = await getKit();

  return (
    <div className="min-h-screen bg-ink-50 text-ink-800">
      <header className="sticky top-0 z-20 border-b border-ink-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 md:px-6">
          <Brand size="md" href="/" />
          <ApplyButton className="h-10 px-4 text-sm" />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10 md:px-6">
        {/* Hero */}
        <div className="max-w-2xl">
          <p className="text-xs uppercase tracking-wide text-ink-400">Careers · Internship Program 2026</p>
          <h1 className="mt-1 text-display-md font-bold text-ink-900">
            Intern where India&apos;s B2B supply chain gets built.
          </h1>
          <p className="mt-3 text-ink-600">{kit.intro}</p>

          {kit.highlights.length > 0 && (
            <ul className="mt-5 flex flex-wrap gap-2">
              {kit.highlights.map((h) => (
                <li key={h} className="rounded-full border border-ink-200 bg-white px-3 py-1 text-xs font-medium text-ink-700">
                  {h}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <ApplyButton className="h-12 px-5 text-base" />
            <span className="text-sm text-ink-500">Rolling intake — apply anytime.</span>
          </div>
        </div>

        {/* Roles */}
        {kit.tracks.length > 0 && (
          <section className="mt-12">
            <h2 className="text-lg font-bold text-ink-900">Roles we&apos;re hiring for</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {kit.tracks.map((t, i) => (
                <div key={t.title} className="rounded-md border border-ink-200 bg-white p-4">
                  <p className="text-[11px] font-medium text-ink-400">Track {String(i + 1).padStart(2, "0")}</p>
                  <h3 className="mt-0.5 text-sm font-bold text-ink-900">{t.title}</h3>
                  <ul className="mt-2 space-y-1">
                    {t.points.map((p) => (
                      <li key={p} className="flex gap-1.5 text-xs text-ink-600">
                        <span className="text-ink-300" aria-hidden="true">—</span>
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Program at a glance */}
        {kit.program.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-bold text-ink-900">Program at a glance</h2>
            <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-ink-200 bg-ink-200 sm:grid-cols-3">
              {kit.program.map((p) => (
                <div key={p.label} className="bg-white p-3">
                  <p className="text-[11px] uppercase tracking-wide text-ink-400">{p.label}</p>
                  <p className="mt-0.5 text-sm font-semibold text-ink-900">{p.value}</p>
                  {p.note && <p className="text-[11px] text-ink-500">{p.note}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Gains + who can apply */}
        <section className="mt-10 grid gap-8 sm:grid-cols-2">
          {kit.gains.length > 0 && (
            <div>
              <h2 className="text-lg font-bold text-ink-900">What you&apos;ll gain</h2>
              <ul className="mt-3 space-y-1.5">
                {kit.gains.map((g) => (
                  <li key={g} className="flex gap-2 text-sm text-ink-600">
                    <span className="mt-0.5 shrink-0 text-royal-600" aria-hidden="true">✓</span>
                    <span>{g}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {kit.whoCanApply && (
            <div>
              <h2 className="text-lg font-bold text-ink-900">Who can apply</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink-600">{kit.whoCanApply}</p>
            </div>
          )}
        </section>

        {/* FAQ */}
        {kit.faqs.length > 0 && (
          <section className="mt-12 border-t border-ink-200 pt-8">
            <h2 className="text-lg font-bold text-ink-900">Frequently asked questions</h2>
            <div className="mt-4 border-t border-ink-200">
              {kit.faqs.map((f) => (
                <details key={f.q} className="group border-b border-ink-200 py-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-ink-900">
                    <span className="font-medium">{f.q}</span>
                    <span className="shrink-0 text-xl leading-none text-ink-400 transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                  </summary>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-600">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        )}

        {/* Final CTA */}
        <section className="mt-12 rounded-md border border-ink-200 bg-white p-6 text-center">
          <h2 className="text-lg font-bold text-ink-900">Ready to apply?</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-600">
            Pick your track, tell us about yourself and attach your resume — it takes a couple of minutes.
          </p>
          <ApplyButton className="mt-4 h-12 px-5 text-base" />
        </section>
      </main>

      <footer className="border-t border-ink-200 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-6 md:px-6">
          {(kit.contactPhone || kit.contactEmail) && (
            <div className="mb-5 rounded-md border border-ink-200 bg-ink-50 p-4">
              <p className="text-sm font-medium text-ink-900">Prefer to reach out directly?</p>
              <p className="mt-1 text-sm text-ink-600">
                Contact our HR team{kit.contactName ? ` — ${kit.contactName}` : ""}:
              </p>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                {kit.contactPhone && (
                  <a href={`tel:${kit.contactPhone.replace(/\s+/g, "")}`} className="font-medium text-ink-900 hover:underline">
                    {kit.contactPhone}
                  </a>
                )}
                {kit.contactEmail && (
                  <a href={`mailto:${kit.contactEmail}`} className="font-medium text-ink-900 hover:underline">
                    {kit.contactEmail}
                  </a>
                )}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <p className="text-sm text-ink-600">Aeros — Mumbai, India</p>
            <p className="font-mono text-xs text-ink-400">Aeros Packaging</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
