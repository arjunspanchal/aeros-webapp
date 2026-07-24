-- Vehicle Dispatch — multiple invoices per vehicle (multi-drop).
--
-- One vehicle routinely carries 3–4 invoices, and they are not necessarily for
-- the same consignee: a trip may drop at more than one customer. The original
-- single `invoice_no` / `eway_bill_no` text pair on vehicle_dispatches couldn't
-- express that, so both move onto a child row per invoice.
--
-- Each invoice carries its OWN e-way bill because India issues one EWB per
-- invoice (a consolidated EWB-02 is a separate document covering them, not a
-- replacement). Each invoice also carries its own consignee, defaulting to the
-- dispatch's customer — that's what makes multi-drop work without forcing the
-- single-customer case to repeat itself.
--
-- vehicle_dispatches.client_id / customer_name stay put as the account that
-- owns the trip: the queue, the per-customer manifest history and the
-- "load last manifest" shortcut are all keyed off it.
--
-- Manifest lines gain `invoice_id` so each box type is attributable to the
-- invoice it ships under — the consignee reconciles boxes against their own
-- invoice at the gate, and the PDF prints a subtotal per invoice. ON DELETE
-- SET NULL rather than CASCADE: removing an invoice must not silently delete
-- the boxes, it should surface them as unassigned.
--
-- Safe to run on an empty table; the module had no rows when this landed, so
-- the dropped columns needed no backfill.

create extension if not exists pgcrypto;

drop view if exists public.v_vehicle_dispatch_manifests;

create table if not exists public.vehicle_dispatch_invoices (
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null references public.vehicle_dispatches(id) on delete cascade,

  -- Drop order down the lane, and the manifest's print order.
  seq integer not null default 1,

  invoice_no text not null,
  eway_bill_no text,

  -- Consignee for THIS invoice. Defaults to the dispatch's customer in the UI.
  client_id uuid references public.clients(id) on delete set null,
  customer_name text not null,
  drop_city text,

  invoice_value_inr numeric(14,2),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists vehicle_dispatch_invoices_dispatch_idx
  on public.vehicle_dispatch_invoices (dispatch_id, seq);
create index if not exists vehicle_dispatch_invoices_client_idx
  on public.vehicle_dispatch_invoices (client_id);

-- RLS enabled but no policies — service-role only, like the rest of the module.
alter table public.vehicle_dispatch_invoices enable row level security;

alter table public.vehicle_dispatch_lines
  add column if not exists invoice_id uuid
    references public.vehicle_dispatch_invoices(id) on delete set null;

create index if not exists vehicle_dispatch_lines_invoice_idx
  on public.vehicle_dispatch_lines (invoice_id);

-- Header fields superseded by the child table.
alter table public.vehicle_dispatches
  drop column if exists invoice_no,
  drop column if exists eway_bill_no;

-- Manifest history roll-up, now carrying the invoice summary. `unassigned_lines`
-- counts box types not yet tagged to an invoice, so the history can flag a
-- manifest that won't group cleanly on the PDF.
create view public.v_vehicle_dispatch_manifests
with (security_invoker = true) as
select
  d.id                        as dispatch_id,
  d.dispatch_no,
  d.dispatch_date,
  d.status,
  d.customer_name,
  d.client_id,
  d.account_manager_name,
  d.vehicle_size,
  d.vehicle_number,
  d.transporter_name,
  d.from_city,
  d.to_city,
  inv.invoice_count,
  inv.invoice_numbers,
  inv.consignees,
  count(l.id)                                                     as line_count,
  coalesce(sum(l.box_count), 0)                                   as total_boxes,
  coalesce(sum(l.box_count * coalesce(l.units_per_case, 0)), 0)   as total_pcs,
  round(coalesce(sum(l.box_count * l.kg_per_box), 0), 2)          as total_kg,
  round(coalesce(sum(l.box_count * l.cbm_per_box), 0), 3)         as total_cbm,
  count(*) filter (where l.kg_per_box is null and l.box_count > 0)  as missing_kg,
  count(*) filter (where l.cbm_per_box is null and l.box_count > 0) as missing_cbm,
  count(*) filter (where l.invoice_id is null and l.box_count > 0)  as unassigned_lines,
  max(l.created_at)                                               as last_edited_at
from public.vehicle_dispatches d
join public.vehicle_dispatch_lines l on l.dispatch_id = d.id
left join lateral (
  select count(*) as invoice_count,
         string_agg(i.invoice_no, ', ' order by i.seq)                as invoice_numbers,
         string_agg(distinct i.customer_name, ', ')                   as consignees
  from public.vehicle_dispatch_invoices i
  where i.dispatch_id = d.id
) inv on true
where d.deleted_at is null
group by d.id, inv.invoice_count, inv.invoice_numbers, inv.consignees;
