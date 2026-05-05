import { Brand } from "./ui/Brand";

/**
 * Editorial footer — single-line, brand left, copyright right. The shell
 * carries identity and navigation; the footer just closes the frame.
 *
 * Light-only (Shell prompt 2). Previous version had a WhatsApp CTA, an
 * email link, an optional `note` prop, and dark-variant utilities — all
 * removed. The wa.me / mailto affordances live in the customer-facing
 * surfaces that need them; the chrome footer no longer carries marketing.
 */
export default function Footer() {
  return (
    <footer className="h-16 bg-white border-t border-ink-200">
      <div className="max-w-7xl mx-auto px-4 md:px-6 h-full flex items-center justify-between">
        <Brand size="sm" />
        <p className="text-xs font-mono text-ink-400">© 2025 Aeros</p>
      </div>
    </footer>
  );
}
