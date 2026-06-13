// Single source of truth for role + module identifiers across calc,
// factoryos, rate-cards, and hub. Phase 1.1 of the auth-unification work —
// purely additive, no consumer is required to migrate yet.
//
// CALC_ADMIN / RATE_CARD_ADMIN intentionally share the string value "admin"
// with the hub's ADMIN, and CALC_CLIENT / RATE_CARD_CLIENT share "client".
// The duplicated keys exist so call-sites can express which role-space the
// literal belongs to without inviting accidental cross-space reuse — e.g.
// `ROLES.CALC_CLIENT` makes it obvious the value is the calc role, not the
// rate-card role, even though both happen to be the string "client" today.
//
// `lib/factoryos/constants.js` re-exports ROLES from this module so existing
// `import { ROLES } from "@/lib/factoryos/constants"` callers keep working.
// Going forward, new code should import from "@/lib/auth/roles" directly.

export const ROLES = {
  // FactoryOS roles. ADMIN doubles as the hub-level admin role, since the
  // hub session's `isAdmin` flag is what gates module-wide super-user access.
  ADMIN: "admin",
  FACTORY_MANAGER: "factory_manager",
  FACTORY_EXECUTIVE: "factory_executive",
  ACCOUNT_MANAGER: "account_manager",
  CUSTOMER: "customer",
  // External print/process vendor (e.g. Offset Print — Blueline). Sees only
  // jobs assigned to their vendor record; can update their completion date
  // and exchange artwork/proof files. Not an internal Aeros role.
  VENDOR: "vendor",

  // Payouts roles. Standalone access level on users.payouts_role — not tied
  // to the factoryos role. "admin" = full payouts access; "accountant" =
  // same operational access today (add/edit payouts, mark paid). Accountants
  // (e.g. Aarti, Kadambari) are the day-to-day users; hub admins and factory
  // managers get payouts access by derivation in resolveEntitlements().
  PAYOUTS_ADMIN: "admin",
  ACCOUNTANT: "accountant",

  // Calculator roles. Aliases — same string values as ADMIN / "client" but
  // namespaced so a check like `requireRole(s, MODULES.CALCULATOR, ROLES.CALC_ADMIN)`
  // reads cleanly.
  CALC_ADMIN: "admin",
  CALC_CLIENT: "client",

  // Rate-card roles. Same aliasing rationale as the calc pair.
  RATE_CARD_ADMIN: "admin",
  RATE_CARD_CLIENT: "client",
};

export const MODULES = {
  FACTORYOS: "factoryos",
  CALCULATOR: "calculator",
  RATE_CARDS: "rate_cards",
  // HR (employee roster, attendance, payroll) is its own top-level module with
  // an independent `users.hr_role` — not tied to the factoryos role. Single
  // access level today: "admin" = full HR access.
  HR: "hr",
  // Payouts (vendor payment tracker) — own top-level module gated by
  // users.payouts_role, with derived access for admins + factory managers.
  PAYOUTS: "payouts",
};
