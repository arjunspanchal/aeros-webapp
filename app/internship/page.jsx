import { Brand } from "@/app/components/ui/Brand";
import InternshipForm from "./InternshipForm";

// PUBLIC application page — the single link shared with candidates. Not in the
// middleware matcher, so it renders for anyone (no login). Mirrors the public
// rate-sheet shell (ink palette, sticky brand bar, editorial title block).

export const metadata = {
  title: "Internship Application — Aeros Packaging",
  description:
    "Apply for an internship at Aeros Packaging (Mumbai, India). Tracks in Supply Chain & Operations, Management, and E-commerce Sales. Submit your details and resume online.",
};

export const dynamic = "force-dynamic";

export default function InternshipApplyPage() {
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
            or E-commerce Sales. Fill in the form below and attach your resume — it takes a couple
            of minutes. We&apos;ll be in touch if there&apos;s a fit.
          </p>
        </div>

        <div className="mt-8">
          <InternshipForm />
        </div>
      </main>

      <footer className="border-t border-ink-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-5 md:px-6">
          <p className="text-sm text-ink-600">Aeros — Mumbai, India</p>
          <p className="font-mono text-xs text-ink-400">Aeros Packaging</p>
        </div>
      </footer>
    </div>
  );
}
