-- WarehouseOS: dispatch driven by Zoho Books invoices (18-Nov-2026).
--
-- Arjun: "Dispatched = invoiced in Zoho". Every Zoho invoice dated from the
-- go-live date shows on /warehouse/invoices as "to load" until the warehouse
-- records it here, either as loaded (vehicle / LR / cartons, with an outward
-- stock movement for the lines that came off the racks) or as not from the
-- warehouse (direct from a vendor, a service line, etc.) with a reason.
--
-- zoho_item_links remembers, once per Zoho item, which WarehouseOS item it is
-- (or that it is not a stock item). Filled the first time the item appears on
-- an invoice the warehouse loads ("match on first use").
--
-- No rates or amounts are stored (no rates in FactoryOS, 17-Nov-2026).

create table if not exists public.zoho_item_links (
  zoho_item_id      text primary key,
  zoho_name         text,
  zoho_sku          text,
  inventory_item_id uuid references public.inventory_items(id),
  not_stock         boolean not null default false,
  linked_by_email   text,
  linked_at         timestamptz not null default now(),
  constraint zoho_item_links_target check (inventory_item_id is not null or not_stock)
);

create table if not exists public.zoho_invoice_dispatches (
  id                   uuid primary key default gen_random_uuid(),
  zoho_invoice_id      text not null unique,
  invoice_number       text not null,
  invoice_date         date,
  customer             text,
  zoho_customer_id     text,
  so_number            text,
  status               text not null check (status in ('loaded', 'not_from_warehouse')),
  dispatched_on        date,
  transport_mode       text,
  lr_or_vehicle_number text,
  driver_contact       text,
  eway_bill_no         text,
  cartons              integer,
  reason               text,
  note                 text,
  movement_id          uuid references public.inventory_movements(id),
  job_id               uuid references public.jobs(id),
  created_by_email     text,
  created_at           timestamptz not null default now()
);

create index if not exists zoho_invoice_dispatches_created_idx on public.zoho_invoice_dispatches (created_at desc);

-- Server-only tables (service role). RLS on, no policies, like job_dispatches.
alter table public.zoho_item_links enable row level security;
alter table public.zoho_invoice_dispatches enable row level security;
