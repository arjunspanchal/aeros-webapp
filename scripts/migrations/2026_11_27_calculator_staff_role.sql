-- Calculator roles (Arjun, 27-Nov-2026):
--   admin  = full working (cost, margin, rates)
--   staff  = our own team, selling prices only
--   client = the retired customer calculator; kept so old rows stay valid, opens nothing
alter table public.users drop constraint if exists users_calculator_role_chk;
alter table public.users add constraint users_calculator_role_chk
  check (calculator_role is null or calculator_role = any (array['admin'::text, 'staff'::text, 'client'::text]));
