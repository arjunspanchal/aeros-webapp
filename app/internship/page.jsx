import { Brand } from "@/app/components/ui/Brand";
import { listCollegeNamesSafe } from "@/lib/hr/colleges";
import { getKit } from "@/lib/hr/internshipKit";
import InternshipForm from "./InternshipForm";

// PUBLIC application page — the single link shared with candidates. Not in the
// middleware matcher, so it renders for anyone (no login). Mirrors the public
// rate-sheet shell (ink palette, sticky brand bar, editorial title block).
//
// The highlight badges + FAQ are NOT hardcoded — they come from the
// `internship_kit` Supabase row (getKit), so HR can update them live from the
// editor at /hr/internship-kit with no redeploy. getKit() fails safe to
// baked-in defaults, so this open page can never break on a bad/absent row.

export const metadata = {
  title: "Internship Application — Aeros Packaging",
  description:
    "Apply for an internship at Aeros Packaging (Mumbai, India). Tracks in Supply Chain & Operations, Management, and E-commerce Sales. Submit your details and resume online.",
};

export const dynamic = "force-dynamic";

export default async function InternshipApplyPage() {
  // Active outreach colleges populate the "how did you hear" picker; the kit
  // drives the highlight badges + FAQ. Both are failure-safe.
  const [collegeOptions, kit] = await Promise.all([listCollegeNamesSafe(), getKit()]);

  return (
    <div className="min-h-screen bg-ink-50 text-ink-800">
      <header className="sticky top-0 z-20 border-b border-ink-200 bg-white">
        <div className="mx-auto max-w-2xl px-4 py-4 md:px-6">
          <Brand size="md" href="/" />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-10 md:px-6">
        <div className="max-w-xl">
          <p className="text-xs uppercase tracking-wide text-ink-400">Careers · Internships</p>
          <h1 className="mt-1 text-display-md font-bold text-ink-900">Apply for an Internship</h1>
          <p className="mt-3 text-ink-600">
            Join the Aeros team in Mumbai, India across Supply Chain &amp; Operations, Management,
            or E-commerce Sales. Read about the program below, then apply — we&apos;ll be in touch
            if there&apos;s a fit.
          </p>

          {kit.highlights.length > 0 && (
            <ul className="mt-5 flex flex-wrap gap-2">
              {kit.highlights.map((h) => (
                <li
                  key={h}
                  className="rounded-full border border-ink-200 bg-white px-3 py-1 text-xs font-medium text-ink-700"
                >
                  {h}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Learn about the internship — program overview from the kit */}
        <section className="mt-10">
          <h2 className="text-lg font-bold text-ink-900">Learn about the internship</h2>

          {kit.tracks.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Roles we&apos;re hiring for</p>
              <div className="mt-3 grid gap-4 sm:grid-cols-3">
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
            </div>
          )}

          {kit.program.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Program at a glance</p>
              <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-ink-200 bg-ink-200 sm:grid-cols-3">
                {kit.program.map((p) => (
                  <div key={p.label} className="bg-white p-3">
                    <p className="text-[11px] uppercase tracking-wide text-ink-400">{p.label}</p>
                    <p className="mt-0.5 text-sm font-semibold text-ink-900">{p.value}</p>
                    {p.note && <p className="text-[11px] text-ink-500">{p.note}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {kit.gains.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">What you&apos;ll gain</p>
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
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Who can apply</p>
                <p className="mt-3 text-sm leading-relaxed text-ink-600">{kit.whoCanApply}</p>
              </div>
            )}
          </div>
        </section>

        <section className="mt-10 border-t border-ink-200 pt-8">
          <h2 className="text-lg font-bold text-ink-900">Apply now</h2>
          <p className="mt-1 text-sm text-ink-600">Fill in the form below and attach your resume — it takes a couple of minutes.</p>
          <div className="mt-6">
            <InternshipForm collegeOptions={collegeOptions} />
          </div>
        </section>

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
      </main>

      <footer className="border-t border-ink-200 bg-white">
        <div className="mx-auto max-w-2xl px-4 py-6 md:px-6">
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
