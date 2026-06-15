-- WarehouseOS — Vehicle Dispatch (outbound freight) module.
-- A log of finished-goods leaving the warehouse on full vehicles. The
-- invoice team raises a record per outbound invoice: invoice + e-way bill
-- numbers, the customer (pulled from the clients master), the transporter
-- (a vendor of type 'Transport' in the shared directory), vehicle size,
-- box count, gross weight, the lane (from/to city + approx kms) and the
-- lump-sum freight quote received from the transporter before dispatch.
--
-- ₹/box and ₹/kg are NOT stored — they're derived in the data layer from
-- freight ÷ boxes and freight ÷ weight so an edit can never leave a stale
-- computed value behind.
--
-- customer_name / transporter_name are snapshotted alongside the FKs so the
-- log stays readable even if a client or vendor row is later renamed or
-- soft-deleted. FKs are ON DELETE SET NULL for the same reason.
--
-- Idempotent: safe to re-run.

create extension if not exists pgcrypto;

create sequence if not exists vehicle_dispatch_seq start 1 increment 1;

create table if not exists public.vehicle_dispatches (
  id uuid primary key default gen_random_uuid(),
  dispatch_no text unique not null
    default ('VD-' || to_char(now(),'YY') || '-' || lpad(nextval('vehicle_dispatch_seq')::text, 5, '0')),
  dispatch_date date not null default current_date,

  -- Paperwork (invoice team)
  invoice_no text,
  eway_bill_no text,

  -- Customer (pulled from clients master; name snapshotted)
  client_id uuid references public.clients(id) on delete set null,
  customer_name text not null,

  -- Vehicle + transporter
  vehicle_size text,
  vehicle_number text,
  transporter_vendor_id uuid references public.vendors(id) on delete set null,
  transporter_name text,
  driver_name text,
  driver_phone text,

  -- Status workflow: pending → dispatched → delivered (cancelled is terminal).
  -- Timestamps stamped by the status buttons so the team can see how long a
  -- vehicle has been on the road.
  status text not null default 'pending'
    check (status in ('pending','dispatched','delivered','cancelled')),
  dispatched_at timestamptz,
  delivered_at timestamptz,

  -- Load
  box_count integer,
  total_weight_kg numeric(12,2),

  -- Lane
  from_city text,
  to_city text,
  approx_kms numeric(10,2),

  -- Freight (lump-sum quote received before dispatch)
  freight_lumpsum_inr numeric(12,2),

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  deleted_at timestamptz
);

create index if not exists vehicle_dispatches_date_idx
  on public.vehicle_dispatches (dispatch_date desc)
  where deleted_at is null;
create index if not exists vehicle_dispatches_status_idx
  on public.vehicle_dispatches (status, dispatch_date desc)
  where deleted_at is null;
create index if not exists vehicle_dispatches_client_idx
  on public.vehicle_dispatches (client_id)
  where deleted_at is null;
create index if not exists vehicle_dispatches_transporter_idx
  on public.vehicle_dispatches (transporter_vendor_id)
  where deleted_at is null;

create or replace function public.touch_vehicle_dispatch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end$$;

drop trigger if exists trg_vehicle_dispatch_updated_at on public.vehicle_dispatches;
create trigger trg_vehicle_dispatch_updated_at
before update on public.vehicle_dispatches
for each row execute function public.touch_vehicle_dispatch_updated_at();

-- RLS enabled but no policies — the server uses the service-role key (RLS
-- bypassed); the anon key has no business reading vehicle dispatches.
alter table public.vehicle_dispatches enable row level security;
