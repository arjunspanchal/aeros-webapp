import Link from "next/link";
import { Brand } from "@/app/components/ui/Brand";
import { listCollegeNamesSafe } from "@/lib/hr/colleges";
import { getKit } from "@/lib/hr/internshipKit";
import InternshipForm from "../InternshipForm";

// PUBLIC application form — reached from the /internship landing page's Apply
// buttons. Not in the middleware matcher, so it's open (no login). The program
// info lives on /internship; this page is just the form.

export const metadata = {
  title: "Apply — Aeros Internship Program",
  description:
    "Apply for an internship at Aeros (Mumbai, India). Pick your track — Supply Chain & Operations, Management or E-commerce Sales — and submit your details and resume.",
};

export const dynamic = "force-dynamic";

export default async function InternshipApplyPage() {
  const [collegeOptions, kit] = await Promise.all([listCollegeNamesSafe(), getKit()]);

  return (
    <div className="min-h-screen bg-ink-50 text-ink-800">
      <header className="sticky top-0 z-20 border-b border-ink-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4 md:px-6">
          <Brand size="md" href="/" />
          <Link href="/internship" className="text-sm text-ink-500 hover:text-ink-900">
            ← Internship details
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-10 md:px-6">
        <div className="max-w-xl">
          <p className="text-xs uppercase tracking-wide text-ink-400">Careers · Internships</p>
          <h1 className="mt-1 text-display-md font-bold text-ink-900">Apply for an Internship</h1>
          <p className="mt-3 text-ink-600">
            Fill in your details and attach your resume — it takes a couple of minutes. We&apos;ll be
            in touch if there&apos;s a fit.{" "}
            <Link href="/internship" className="font-medium text-royal-600 hover:underline">
              Read about the program
            </Link>
            .
          </p>

          {kit.highlights.length > 0 && (
            <ul className="mt-5 flex flex-wrap gap-2">
              {kit.highlights.map((h) => (
                <li key={h} className="rounded-full border border-ink-200 bg-white px-3 py-1 text-xs font-medium text-ink-700">
                  {h}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-8">
          <InternshipForm collegeOptions={collegeOptions} />
        </div>
      </main>

      <footer className="border-t border-ink-200 bg-white">
        <div className="mx-auto max-w-2xl px-4 py-6 md:px-6">
          {(kit.contactPhone || kit.contactEmail) && (
            <div className="mb-5 rounded-md border border-ink-200 bg-ink-50 p-4">
              <p className="text-sm font-medium text-ink-900">Questions before you apply?</p>
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
