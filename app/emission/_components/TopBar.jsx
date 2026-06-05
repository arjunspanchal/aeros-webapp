"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "./ui";
import { useAuth } from "./AuthProvider";

const TABS = [
  { href: "/emission/jobs", label: "JOB LIST", admin: false },
  { href: "/emission/intake", label: "INTAKE", admin: false },
  { href: "/emission/dashboard", label: "DASHBOARD", admin: true },
  { href: "/emission/products", label: "PRICE LIST", admin: true },
];

export default function TopBar() {
  const pathname = usePathname();
  const { session, logout } = useAuth();
  const isAdmin = session?.role === "admin";

  return (
    <header className="em-topbar">
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 }}>
          <Link href="/emission/jobs" style={{ textDecoration: "none" }}>
            <Wordmark />
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {session ? (
              <>
                <span className="em-eyebrow em-eyebrow--ondark" style={{ letterSpacing: "0.1em" }}>
                  {session.role}
                </span>
                <button onClick={logout} className="em-tab" style={{ background: "none", border: 0, cursor: "pointer" }}>
                  LOCK
                </button>
              </>
            ) : null}
          </div>
        </div>
        {session ? (
          <nav style={{ display: "flex", gap: 22, paddingBottom: 0 }}>
            {TABS.filter((t) => !t.admin || isAdmin).map((t) => {
              const on = pathname === t.href || pathname.startsWith(t.href + "/");
              return (
                <Link key={t.href} href={t.href} className={`em-tab ${on ? "em-tab--on" : ""}`} style={{ textDecoration: "none" }}>
                  {t.label}
                </Link>
              );
            })}
          </nav>
        ) : null}
      </div>
    </header>
  );
}
