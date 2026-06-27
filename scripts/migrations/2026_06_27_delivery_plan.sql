-- FactoryOS — Customer Delivery Plan module.
-- Customers send an open-PO list (PO#, SKU, ordered/received/balance, expected
-- dates); the team commits dispatch dates against each line — often splitting a
-- single line across multiple days, sometimes cancelling on a rate revision —
-- and the customer sees a live date-wise plan. The internal commitment plan and
-- the customer plan are two views of one dataset.
--
-- A `jobs` row already IS a PO line (client, sku, qty, order_date, po_number,
-- expected_dispatch_date, stage), so we extend jobs with the missing delivery
-- fields rather than create a parallel entity, and add a child table for the
-- split-dispatch schedule (one job -> many committed (date, qty) rows).
--
-- Balance is derived in code (qty - received_qty), not stored: both inputs are
-- mutable and a stored copy could go stale.
--
-- Idempotent: safe to re-run.

create extension if not exists pgcrypto;

-- ---- Jobs: delivery-plan fields -------------------------------------------
alter table public.jobs
  add column if not exists received_qty integer not null default 0,
  add column if not exists delivery_status text,        -- unscheduled | scheduled | in_progress | dispatched | cancelled (null = unscheduled)
  add column if not exists delivery_remarks text,        -- customer-facing note ("94% delivered", "Split delivery", re-quote note)
  add column if not exists order_rate numeric(12,4);     -- Rs/unit, for open-value / ageing reporting

-- Guard the status vocabulary without blocking nulls. Dropped-then-added so a
-- re-run picks up any future vocabulary change.
alter table public.jobs drop constraint if exists jobs_delivery_status_check;
alter table public.jobs add constraint jobs_delivery_status_check
  check (delivery_status is null or delivery_status in
    ('unscheduled','scheduled','in_progress','dispatched','cancelled'));

-- ---- Committed dispatch schedule (split dispatch) -------------------------
create table if not exists public.job_dispatch_schedule (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  dispatch_date date not null,
  qty integer not null,
  -- planned = committed but not yet shipped; dispatched = gone.
  status text not null default 'planned'
    check (status in ('planned','dispatched')),
  note text,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_dispatch_schedule_job_idx
  on public.job_dispatch_schedule (job_id);
create index if not exists job_dispatch_schedule_date_idx
  on public.job_dispatch_schedule (dispatch_date);

create or replace function public.touch_job_dispatch_schedule_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end$$;

drop trigger if exists trg_job_dispatch_schedule_updated_at on public.job_dispatch_schedule;
create trigger trg_job_dispatch_schedule_updated_at
before update on public.job_dispatch_schedule
for each row execute function public.touch_job_dispatch_schedule_updated_at();

-- RLS enabled, no policies — the server uses the service-role key (RLS
-- bypassed); the anon key has no business reading the dispatch schedule.
alter table public.job_dispatch_schedule enable row level security;
