-- WarehouseOS — Sample Dispatch module.
-- CMs (e.g. Prerna) raise a sample-dispatch note for a customer; warehouse
-- staff (Sachin, Samar) work the queue, capture courier + AWB, and print
-- the dispatch note. Customer block is captured free-text on the dispatch
-- itself (no FK to clients) — sample customers churn faster than the
-- master and we don't want to bloat clients with one-off rows.

create extension if not exists pgcrypto;

create sequence if not exists sample_dispatch_seq start 1 increment 1;

create table if not exists public.sample_dispatches (
  id uuid primary key default gen_random_uuid(),
  dispatch_no text unique not null
    default ('SD-' || to_char(now(),'YY') || '-' || lpad(nextval('sample_dispatch_seq')::text, 5, '0')),
  dispatch_date date not null default current_date,
  managed_by text,
  managed_by_user_id uuid references public.users(id) on delete set null,
  customer_name text not null,
  customer_contact text,
  customer_billing_address text,
  customer_delivery_address text,
  customer_gstin text,
  status text not null default 'pending'
    check (status in ('pending','dispatched','cancelled')),
  courier text,
  awb text,
  dispatched_at timestamptz,
  dispatched_by_user_id uuid references public.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  deleted_at timestamptz
);

create index if not exists sample_dispatches_status_idx
  on public.sample_dispatches (status, dispatch_date desc)
  where deleted_at is null;
create index if not exists sample_dispatches_date_idx
  on public.sample_dispatches (dispatch_date desc)
  where deleted_at is null;

create table if not exists public.sample_dispatch_items (
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null references public.sample_dispatches(id) on delete cascade,
  sr_no integer not null,
  order_id text not null,
  description text not null,
  quantity numeric(12,2) not null default 1,
  price numeric(12,2) not null default 0,
  gst_pct numeric(5,2) not null default 0,
  master_product_id uuid references public.master_products(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (dispatch_id, sr_no)
);

create index if not exists sample_dispatch_items_dispatch_idx
  on public.sample_dispatch_items (dispatch_id);

create or replace function public.touch_sample_dispatch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end$$;

drop trigger if exists trg_sample_dispatch_updated_at on public.sample_dispatches;
create trigger trg_sample_dispatch_updated_at
before update on public.sample_dispatches
for each row execute function public.touch_sample_dispatch_updated_at();

-- RLS enabled but no policies — server uses the service-role key (RLS
-- bypassed); the anon key has no business reading sample dispatches.
alter table public.sample_dispatches enable row level security;
alter table public.sample_dispatch_items enable row level security;
