// Who can do what in the Warehouse unit (18-Nov-2026 rebuild).
//
//   warehouse (Suleman, Samar) + admin : work everything — load, receive,
//                                        count, confirm delivery, edit items.
//   factory managers / executives      : read-only stock, inward and outward.
//   sales (account managers)           : read-only outward + in transit, and
//                                        may confirm a delivery.
//   admin only                         : undo a recorded invoice or receipt.
//
// Kept apart from the factory's own role checks on purpose: the warehouse may
// become a separate site, and its permissions should move with it.

import { ROLES } from "../factoryos/constants.js";

const roleOf = (session) => (session ? (session.isAdmin ? ROLES.ADMIN : session.modules?.factoryos || null) : null);

export function canWorkWarehouse(session) {
  const r = roleOf(session);
  return r === ROLES.ADMIN || r === ROLES.WAREHOUSE;
}

export function canViewWarehouse(session) {
  const r = roleOf(session);
  return [ROLES.ADMIN, ROLES.WAREHOUSE, ROLES.FACTORY_MANAGER, ROLES.FACTORY_EXECUTIVE, ROLES.ACCOUNT_MANAGER].includes(r);
}

export function canSeeStock(session) {
  const r = roleOf(session);
  return [ROLES.ADMIN, ROLES.WAREHOUSE, ROLES.FACTORY_MANAGER, ROLES.FACTORY_EXECUTIVE].includes(r);
}

export function canConfirmDelivery(session) {
  const r = roleOf(session);
  return [ROLES.ADMIN, ROLES.WAREHOUSE, ROLES.ACCOUNT_MANAGER].includes(r);
}

export function isWarehouseAdmin(session) {
  return roleOf(session) === ROLES.ADMIN;
}

// The site every record is stamped with until there is more than one.
export const DEFAULT_WAREHOUSE = "Bhiwandi";
