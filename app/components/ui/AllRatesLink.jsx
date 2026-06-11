import Link from "next/link";

/**
 * Small header link back to the public rate-sheet hub (/ratecards). Sits next
 * to the Brand mark on every public rate sheet so visitors can hop between
 * product ranges without knowing the other URLs.
 */
export function AllRatesLink() {
  return (
    <Link
      href="/ratecards"
      className="rounded-md border border-ink-200 px-2.5 py-1 text-xs font-semibold text-ink-600 transition-colors hover:border-ink-400 hover:text-ink-900"
    >
      All rate sheets
    </Link>
  );
}
