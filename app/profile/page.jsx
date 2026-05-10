import Link from "next/link";
import { redirect } from "next/navigation";
import AppHeader from "../components/AppHeader";
import { getSession, hasAnyAccess, ROLES } from "@/lib/auth/session";
import { findUserByEmail } from "@/lib/factoryos/repo";
import ProfileForm from "./ProfileForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Profile · Aeros",
};

// Top-level profile entry from the IdentityMenu dropdown.
// - FactoryOS customers already have a fully-featured editor at
//   /factoryos/customer/profile, so we hand them off there to avoid
//   duplicating UX.
// - Master-password admins (no email on the session) can't be looked up in
//   the user table, so they get a read-only account view.
// - Everyone else (staff, FactoryOS internal roles, AMs) gets the editor:
//   photo, name, designation, phone — saved through /api/factoryos/profile,
//   the same self-service endpoint customers use.
export default async function ProfilePage() {
  const session = getSession();
  if (!hasAnyAccess(session)) redirect("/login");
  if (session?.modules?.factoryos === ROLES.CUSTOMER) {
    redirect("/factoryos/customer/profile");
  }

  const editable = !!session?.email;
  const user = editable ? await findUserByEmail(session.email) : null;

  const fallbackName = session?.name || (session?.isAdmin ? "Admin" : session?.email) || "—";
  const email = session?.isAdmin ? null : session?.email;
  const modules = Object.entries(session?.modules || {}).filter(([, role]) => !!role);

  return (
    <div className="min-h-screen bg-ink-50">
      <AppHeader session={session} />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/hub" className="text-xs text-ink-500 hover:text-ink-900">
          ← Back to hub
        </Link>
        <h1 className="text-2xl font-bold text-ink-900 mt-4">Your profile</h1>
        <p className="text-sm text-ink-600 mt-1">
          {editable
            ? "Update your photo, name, designation, and phone."
            : "Account details for the Aeros web app."}
        </p>

        {editable && user ? (
          <ProfileForm initial={user} />
        ) : (
          <section className="mt-6 bg-white border border-ink-200 rounded-xl p-5 space-y-4">
            <Field label="Name" value={fallbackName} />
            {email && <Field label="Email" value={email} mono />}
            {session?.isAdmin && <Field label="Role" value="Admin (master password)" />}
            {modules.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wide text-ink-400 mb-1.5">Modules</p>
                <ul className="space-y-1">
                  {modules.map(([key, role]) => (
                    <li key={key} className="text-sm text-ink-800 flex items-center justify-between">
                      <span>{labelForModule(key)}</span>
                      <span className="text-xs font-mono text-ink-500">{role}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-ink-500">
              Master-password admins don&apos;t have a per-user record, so this page
              is read-only for them.
            </p>
          </section>
        )}

        <p className="mt-4 text-xs text-ink-500">
          Need to change your email or access level? Ping{" "}
          <a className="underline hover:text-ink-900" href="mailto:arjun@aeros-x.com">
            arjun@aeros-x.com
          </a>
          .
        </p>
      </main>
    </div>
  );
}

function Field({ label, value, mono = false }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-ink-400 mb-1">{label}</p>
      <p className={`text-sm text-ink-900 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function labelForModule(key) {
  switch (key) {
    case "calculator": return "Calculator";
    case "rate_cards": return "RFQs / Rate cards";
    case "factoryos":  return "FactoryOS";
    case "catalogue":  return "Catalogue";
    case "clearance":  return "WarehouseOS";
    default:           return key;
  }
}
