-- WarehouseOS rebuild (18-Nov-2026): the warehouse is its own unit inside
-- FactoryOS, with standalone Inward and Outward driven by Zoho Books.
--
--   Inward  = Zoho purchase orders (vendors) + jobs the factory hands over.
--             The factory is treated like any other sender, so the two can
--             sit on different sites later.
--   Outward = Zoho invoices (see 2026_11_18_zoho_invoice_dispatch.sql), then
--             "in transit" until delivery is confirmed.
--
-- Every record carries the warehouse (site) it happened at. Items are
-- industry-neutral: any unit, any category, an `industry` tag, and a
-- 'Traded' source for goods bought and sold as-is (bearings, screws, …).
-- No rates or amounts are stored.

alter table public.zoho_invoice_dispatches
  add column if not exists delivered_on       date,
  add column if not exists delivered_by_email text,
  add column if not exists delivered_note     text,
  add column if not exists zoho_ack_synced    boolean not null default false,
  add column if not exists zoho_ack_error     text,
  add column if not exists warehouse          text not null default 'Bhiwandi';

create table if not exists public.warehouse_receipts (
  id               uuid primary key default gen_random_uuid(),
  warehouse        text not null default 'Bhiwandi',
  source           text not null check (source in ('zoho_po', 'factory_job')),
  status           text not null check (status in ('received', 'not_to_warehouse')),
  zoho_po_id       text,
  po_number        text,
  po_date          date,
  vendor           text,
  job_id           uuid references public.jobs(id),
  received_on      date,
  challan_no       text,
  vehicle_no       text,
  cartons          integer,
  complete         boolean not null default false,
  reason           text,
  note             text,
  movement_id      uuid references public.inventory_movements(id),
  created_by_email text,
  created_at       timestamptz not null default now(),
  constraint warehouse_receipts_source_ref check (
    (source = 'zoho_po' and zoho_po_id is not null) or (source = 'factory_job' and job_id is not null)
  )
);
create index if not exists warehouse_receipts_po_idx on public.warehouse_receipts (zoho_po_id);
create index if not exists warehouse_receipts_job_idx on public.warehouse_receipts (job_id);
create index if not exists warehouse_receipts_created_idx on public.warehouse_receipts (created_at desc);

create table if not exists public.warehouse_receipt_lines (
  id                uuid primary key default gen_random_uuid(),
  receipt_id        uuid not null references public.warehouse_receipts(id) on delete cascade,
  zoho_line_id      text,
  zoho_item_id      text,
  name              text,
  unit              text,
  qty_ordered       numeric,
  qty_received      numeric not null default 0,
  qty_rejected      numeric not null default 0,
  inventory_item_id uuid references public.inventory_items(id),
  location_id       uuid references public.inventory_locations(id)
);
create index if not exists warehouse_receipt_lines_receipt_idx on public.warehouse_receipt_lines (receipt_id);

alter table public.warehouse_receipts enable row level security;
alter table public.warehouse_receipt_lines enable row level security;

-- Industry-neutral items.
alter table public.inventory_items add column if not exists industry text;
alter table public.inventory_items drop constraint if exists inventory_items_source_check;
alter table public.inventory_items add constraint inventory_items_source_check
  check (source = any (array['FG', 'RM', 'Traded', 'Clearance', 'Other']));

-- Zoho access tokens last an hour and Zoho allows only a handful of refreshes
-- every ten minutes. Each server function has its own memory, so the current
-- token is shared here. Server-only: RLS on, no policies.
create table if not exists public.zoho_token_cache (
  id           text primary key,
  access_token text not null,
  expires_at   timestamptz not null,
  updated_at   timestamptz not null default now()
);
alter table public.zoho_token_cache enable row level security;

-- Zoho reuses one generic item for different goods (item "CORRUGATED" carries
-- two box sizes on one PO, told apart only by the line name). So a remembered
-- link is per Zoho item AND line name, not per Zoho item alone.
alter table public.zoho_item_links add column if not exists name_key text not null default '';
alter table public.zoho_item_links drop constraint if exists zoho_item_links_pkey;
alter table public.zoho_item_links add primary key (zoho_item_id, name_key);
