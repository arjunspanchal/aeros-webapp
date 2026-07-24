-- Vehicle Dispatch — the account manager who owns the consignment.
--
-- Picked from the existing users directory (factoryos_role = 'account_manager'),
-- never typed free-hand, so the manifest names a real person the dispatch team
-- can chase. The name is snapshotted alongside the FK for the same reason the
-- customer and transporter names are: a printed manifest must stay readable
-- after a user is renamed or deactivated.
--
-- Idempotent: safe to re-run.

alter table public.vehicle_dispatches
  add column if not exists account_manager_user_id uuid
    references public.users(id) on delete set null,
  add column if not exists account_manager_name text;

create index if not exists vehicle_dispatches_am_idx
  on public.vehicle_dispatches (account_manager_user_id)
  where deleted_at is null;
