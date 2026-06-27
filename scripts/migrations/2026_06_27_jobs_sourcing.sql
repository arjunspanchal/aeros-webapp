-- FactoryOS — traded (non-factory) jobs.
-- Some customer orders are bought-in and delivered, not manufactured here
-- (e.g. aluminium foils). `sourcing` distinguishes them: 'in_house' jobs run
-- the production pipeline (RM / printing / conversion); 'traded' jobs skip it
-- and show a simpler Confirmed → Procuring → Dispatched → Delivered flow.
-- One PO = one SKU = one job.
--
-- Idempotent: safe to re-run.

alter table public.jobs
  add column if not exists sourcing text not null default 'in_house';

alter table public.jobs drop constraint if exists jobs_sourcing_check;
alter table public.jobs add constraint jobs_sourcing_check
  check (sourcing in ('in_house','traded'));
