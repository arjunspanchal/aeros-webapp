import './globals.css';

export const metadata = {
  title: 'Aeros Packaging',
  description: 'Browse our clearance packaging inventory and full product catalog. Inquire via WhatsApp or email.',
};

// Theme handling retired in Shell prompt 2 — the new editorial-utilitarian
// design language is light-only. The previous root layout read the
// `aeros_theme` cookie and ran a boot script for prefers-color-scheme; both
// removed. Legacy `dark:` Tailwind variants in unrewritten pages compile
// into the bundle as inert rules (`html.dark` is never set), so they have
// no visual effect — ~1–2 KB of dead CSS until cluster prompts replace
// those variants page-by-page.
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink-50 text-ink-800 antialiased">
        {children}
      </body>
    </html>
  );
}
